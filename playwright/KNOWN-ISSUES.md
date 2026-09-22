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

**✅ FIXED IN THE APP 2026-09-12** — `CompaniesClient.tsx` now closes the row-summary `<button>` before the `HelpHint`, matching the shape the Individuals row already used. Verified 2026-09-19: all five `HelpHint` sites in that file are clean. `vault/KnownBugs.md` #15 has the full writeup. (This section said "Not fixed in the app" for a week after the fix shipped — corrected 2026-09-19.)

**But the workaround is still in place, and that now cuts the other way.** `clickUntil(clickable, verify)` — the retry-with-verification helper introduced for this bug — is still applied to every meaningful click in `companies-crud.spec.ts` and `helpers/payments.ts`. It retries until the expected effect is observed, so with the root cause gone it will silently absorb a *real* regression: a click that genuinely stopped working looks exactly like a click that was slow. Don't strip it out reflexively (this UI can still be slow under a loaded dev DB), but a `clickUntil` that is observed retrying is now a signal worth investigating rather than the expected background noise it used to be. Full detail: `notes/09-companies-crud.md`.

### 3. Wine Orders admin has no delete action

Unlike regular Orders (`/admin/orders`, which has a real "Delete order" button), Wine Orders (`/admin/wine-orders`) only supports status transitions — "Mark as paid" / "Cancelled". There is no way to actually remove a row.

**Consequence for this suite:** `06-wine-catalogue-order.spec.ts`'s cleanup can only mark its test order `Cancelled`, never delete it — every run of that test leaves a permanent row in the real `WineOrder` table. This is not a one-off; it accumulates every time the test runs. See "Recurring cleanup this suite needs" below.

### 4. 🟡 PARTLY RESOLVED — the suite's fixture companies no longer exist on Staging Winery

**What happened:** five spec files depended on hand-made companies that were deleted from the
test tenant (`cmrxb85wo0000vlc0d964nzf8`, "Staging Winery") by the Feature 191 wipe on
2026-09-18. Three have since been repointed; **three have not** — see the table further down for
current state.

| Missing fixture | Depended on by |
|---|---|
| `Test Company # 1` | `payment-amount-integrity.spec.ts`, `payment-label-precedence.spec.ts`, `booking-enhanced.spec.ts`, `company-nationality-tagging.spec.ts` |
| `Wine Test Company` | `payment-amount-integrity.spec.ts` |
| `Cookie Company` | `company-guide-code.spec.ts` |

**Confirmed by direct DB query 2026-09-19.** The tenant now holds ten companies, all of them
`lib/demoSeed.ts` names (Alazani Valley Tours, Caucasus Vine Travel, Kakheti Wine Routes, Silk
Road Journeys, Tbilisi Tour Collective, Marani Import GmbH, Restaurant Kakhuri, Sighnaghi Wine
Bar, Vinoteka Batumi, plus the `Individuals` pricing container). A demo reset replaced the
fixtures at some point.

This was the single biggest hole in the suite — it took out *both* payment specs, i.e. exactly
the coverage that matters most. Not caused by the data-model migration itself: Chunk 3 deletes
six tables and `Company` is not one of them. The tenant was refilled from the demo seed by an
explicit one-off call afterwards, which is why it now holds demo-shaped companies.

**Previously recorded only in `vault/SessionLog.md`'s 2026-09-18 narrative**, where it named two
tests in one spec. The real blast radius is five spec files across two tiers. Surfaced here
2026-09-19 after `booking-enhanced.spec.ts` failed on it in a live run.

**Resolved for three specs, outstanding for three. Max's call (2026-09-19): repoint at the
seeded demo companies** rather than recreate the deleted hand-made ones. The seeded companies'
names, tiers and codes are constants in `lib/demoSeed.ts`, so if they are ever wiped again,
restoring them is one documented command instead of rebuilding a company from memory.

Access codes are now seeded too — `seedDemoTenant` sets them for a **non-demo slug only**, because
giving the public demo's companies codes would gate its booking form behind a code no prospect can
obtain, dead-ending the guided tour at its first stop.

| Spec | Company | State |
|---|---|---|
| `payment-amount-integrity` | Caucasus Vine Travel + Sighnaghi Wine Bar | ✅ repointed |
| `payment-label-precedence` | Alazani Valley Tours | ✅ repointed, green |
| `guide-picker` (new) | Silk Road Journeys | ✅ green, 4/4 |
| `booking-enhanced` | — | ⬜ still `Test Company # 1` |
| `company-nationality-tagging` | — | ⬜ still `Test Company # 1` |
| `company-guide-code` | — | ⬜ still `Cookie Company` |

**Applied additively** via `saas/scripts/backfill-test-fixtures.ts`, not by re-running the seed —
a re-seed deletes every order on the tenant. The script imports the specs from `demoSeed.ts`
rather than copying codes (so they cannot drift), refuses the demo tenant, is idempotent, and
converges rather than only adding: it will retract guides it wrongly created, scoped strictly to
seed-owned codes so a hand-created guide is never touched.

> ⚠️ **Before adding guides to another seeded company, read the warning on
> `BookingCompanySpec.guides`.** Until Feature 201 shipped, giving a company guides retired its
> access code, and seeding guides on all five broke four specs at once. Feature 201 removes that
> hazard — once it is on staging and master, the one-company restriction can be lifted and guides
> seeded everywhere for a more realistic demo.

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
