---
tags: [playwright, meta]
---

# Known Issues

Things a future maintainer needs to know before debugging a failing test or extending this suite — standing app bugs this suite exposed, environmental failure patterns to recognize, and per-test manual steps that are accepted limitations, not bugs. If a test fails in a way that matches something here, it's very likely not a real regression — check this first.

## Standing app bugs (found by this suite, not fixed by it)

These are real bugs in the application itself, discovered while building tests. Each is either fixed in the app already, or flagged as its own follow-up — none are "test bugs."

### 1. `proxy.ts`'s tenant cache is wider and staler than its own name suggests

`saas/proxy.ts` caches the **entire resolved tenant record** — theme/`presetId`, module flags, logo, favicon, `displayName`, not just `domain → tenantId` — in a module-level `Map`, with a **5-minute TTL**. A super-admin save does not invalidate it.

**Consequence:** switching a tenant's theme (or any other cached field) via `/super-admin/tenants/<id>` genuinely does not show up on the public site for up to 5 minutes. The super-admin editor itself reads fresh (direct Prisma query), so its own preview updates instantly — only the *public* site, which reads via the `x-tenant-theme` request header `proxy.ts` populates from this cache, stays stale. This nearly derailed `03-theme-colors.spec.ts` entirely (4 separate attempts at a live before/after color comparison all read identical values, because the "before" and "after" were both hitting the same 5-minute-old cache entry) before the root cause was found by reading `proxy.ts` directly. Full detail: `notes/03-theme-colors.md`. Documented in `vault/MigrationNotes.md`'s "In-memory cache" section — that's also where to look if a *domain* change seems slow to take effect, since it's the same cache/mechanism.

**If you're writing a test that changes tenant-level config and checks it on the public site:** don't. Verify persistence via a fresh read on an admin/super-admin page instead (unaffected by this cache), same as `03-theme-colors.spec.ts` does.

### 2. Invalid nested `<button>` on `/admin/companies` causes real, random click loss

`CompaniesClient.tsx`'s per-row summary `<button>` renders a `HelpHint` "?" trigger — itself a `<button>` — nested inside it. This is invalid HTML (buttons can't nest), so the server-rendered HTML and React's hydrated DOM disagree, throwing a hydration-mismatch error on every page load. In practice, React periodically discards and rebuilds the affected subtree client-side, which showed up as **three distinct real click-loss symptoms** during testing: the row's own expand/collapse button, the "Bookings"/"Wine Orders" tab toggle, and even "+ Add Booking Company" itself have all been observed to silently not respond to a click.

**Worse than a flaky test:** while manually diagnosing this live, a stale cached element reference (from before one such DOM rebuild) ended up pointing at a different row after the rebuild, and a save action edited a real, unrelated company ("Cookie Company") instead of the intended one. Caught via the actual request body, reverted via direct SQL, confirmed restored — but this is a real risk for actual admin users on this page too, not just test tooling.

**Not fixed in the app** — flagged as its own follow-up task (chip `task_b2b8da79`). Worked around in `companies-crud.spec.ts` with a `clickUntil(clickable, verify)` retry-with-verification helper applied to every meaningful click on that page. Full detail: `notes/09-companies-crud.md`.

### 3. Wine Orders admin has no delete action

Unlike regular Orders (`/admin/orders`, which has a real "Delete order" button), Wine Orders (`/admin/wine-orders`) only supports status transitions — "Mark as paid" / "Cancelled". There is no way to actually remove a row.

**Consequence for this suite:** `06-wine-catalogue-order.spec.ts`'s cleanup can only mark its test order `Cancelled`, never delete it — every run of that test leaves a permanent row in the real `WineOrder` table. This is not a one-off; it accumulates every time the test runs. See "Recurring cleanup this suite needs" below.

## Environmental failure patterns

These come from running this suite (or the app in general) hard, not from any single test being wrong. Recognize the shape before assuming a regression.

### Dev database connection pool exhaustion

**Symptom:** `PrismaClientKnownRequestError` with code `P1001` ("Can't reach database server") or `P2028` ("Transaction already closed" / "Unable to start a transaction in the given time"), appearing even on ordinary `/admin/*` page loads — including immediately on a *freshly restarted* dev server.

**Cause:** sustained heavy test-run volume against the shared dev Supabase project (`georgian-saas-dev`) exhausts its connection pool. This is `vault/KnownBugs.md` #4's exact failure shape, just triggered by test volume instead of hot-reload churn.

**Fix:** there isn't a fast one. A restart of the local `next dev` process does **not** help — the pool exhaustion is on the database/pooler side, not the app process. Recovery requires the pool to actually drain, which means genuinely reducing load and waiting — confirmed via polling an ordinary page load (or `pg_stat_activity`'s idle-connection count) every 30–60s until it's clean, not just waiting an arbitrary amount of time or assuming a restart fixed it. `pg_terminate_backend` to force-close connections is correctly off-limits (a destructive action against shared infrastructure).

### Dev server process bloat over a long session

**Symptom:** pages that are normally fast start hanging or timing out; `page.goto()` occasionally aborts with `net::ERR_ABORTED`; an otherwise-unrelated test times out mid-suite.

**Cause:** after many hours and dozens of test runs in one session, the `next dev` process itself can grow very large (observed once at ~1.8GB resident) and degrade.

**Fix:** `Stop-Process` the dev server, `rm -rf .next` (Turbopack's dev cache — a forceful `-Force` kill has corrupted this once, manifesting as `/admin/login` returning a stale 404), then `npm run dev` fresh. Cheap and reliably fixes this specific pattern — distinguish it from the DB pool issue above (that one a restart does *not* fix).

### A silently stale `DEFAULT_TENANT_ID`

**Symptom:** every test in the suite quietly runs against the wrong tenant — no errors, just wrong data, wrong assumptions, everything "passing" against a tenant nobody meant to test.

**Cause:** `saas/.env`'s `DEFAULT_TENANT_ID` is what `localhost:3000` resolves to (see `ARCHITECTURE.md`'s "two-tenant strategy"). A past session temporarily pointed it at a different tenant to inspect something manually, and never reverted it — it stayed wrong for hours before being caught by accident.

**Prevention, not fix:** never change `DEFAULT_TENANT_ID` to solve a "need a different tenant" problem — see `ARCHITECTURE.md` for the actual supported pattern (domain-based routing, scoped to one spec file via `test.use()`). If you ever do need to change it for a real reason, treat reverting it as the single most important step of that session, and confirm the revert live before considering the work done — this exact mistake has already cost hours once.

## Recurring cleanup this suite needs (accepted limitations, not bugs)

### Onboarding-wizard tenant needs a manual reset before every run

`10-onboarding-wizard.spec.ts` runs against a second tenant ("Test Onboarding Wizard", `cmsioproi000avl9czd60ua5h`) and does **not** reset it back to zero-state afterward — nothing else in this suite depends on that tenant staying pristine between runs, so it wasn't built to self-clean. Running the full suite without resetting first will correctly fail this one test at its very first assertion (the Individuals-pricing gate will already be satisfied from the previous run). The reset SQL is documented in `notes/10-onboarding-wizard.md` — run it before this test's next run, every time.

### Wine Orders test debris needs a periodic manual sweep

Because of standing bug #3 above, every run of `06-wine-catalogue-order.spec.ts` leaves one more permanently `Cancelled` row in the real `WineOrder` table (business name pattern: `Playwright Wine Test <timestamp>`). This was already cleaned up once (14 accumulated rows deleted via direct SQL, scoped to that exact business-name pattern — see `notes/06-wine-catalogue-order.md`) but **will recur** every time the test runs again. There's no way around this without either the app gaining a real delete action on Wine Orders, or the test switching its own cleanup to a direct DB delete instead of "Cancelled" (a bigger change than seemed worth making when the test was first built). If this suite starts running much more frequently (e.g. in CI), revisit this — either fix is straightforward, it just wasn't urgent yet.

## The one process lesson worth calling out explicitly

Most of the real findings above were caught by **independently re-verifying every "done" claim** — re-running the full suite from a clean shell and spot-checking real data via direct SQL, rather than trusting a summary (including this suite's own earlier self-reports, which overclaimed completion twice before a background run had actually finished). If you're extending this suite or reviewing someone else's addition to it: don't skip this step. It found a premature "14/14 passing" claim that was actually 5 failures, an accidental edit to live production-adjacent data, and 14 rows of accumulated test debris — none of which would have surfaced from reading a summary alone.
