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

**Resolved for five specs, outstanding for one. Max's call (2026-09-19): repoint at the
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
| `booking-enhanced` | Tbilisi Tour Collective | ✅ repointed, green (Chunk 3, 2026-10-01) |
| `company-nationality-tagging` | Tbilisi Tour Collective | ✅ repointed, green (Chunk 3, 2026-10-01) |
| `company-guide-code` | — | ⬜ still `Cookie Company` — out of scope for
  Plan-PlaywrightSuiteHardening Chunk 3, which covered only the two specs named in its own text |

**Chunk 3 close-out (2026-10-01):** confirmed live (read both spec files in full first, per the
plan's own instruction) that neither mutates company-level data — each only creates and deletes
its own `Order` row — so sharing `Tbilisi Tour Collective` between them, as the plan allowed, was
safe. Three further real findings surfaced repointing these two, beyond the company-name swap
itself:
1. **A stale comment, not a company-specific difference.** Both specs' "the code auto-fills the
   contact profile" assumption referenced `applyProfile()`, which doesn't exist anywhere in the
   current codebase. A company-level access code for a company with people on file now opens a
   `ContactPickerPopupView` once per role that has people (Plan-ContactRoles Chunk 7,
   `KnownBugs.md` #55) — nothing auto-fills until a person is picked or the role explicitly
   skipped. This would have broken against *any* company with people on file, old or new; it
   surfaced now only because `Test Company # 1` apparently had none.
2. **Same `exact: true` gap already known for `payment-amount-integrity.spec.ts`.** Tbilisi Tour
   Collective has a guide on file, so un-exact `'Phone'`/`'Email'`/`'Name'` matches resolve to
   both the contact-person and the "Guide — ..." fields. Fixed the same way.
3. **Ad-hoc hot-dish/masterclass fixture data had moved on independently of this chunk.**
   `booking-enhanced.spec.ts`'s own comment already warned its menu/masterclass item names were
   "pinned to today's exact live data, not curated names" — confirmed live that the specific
   items it pinned (`"აჯაფასნადალი"`, `"khinkali10₾/pc"`) no longer exist on
   `/admin/menu-items`/`/admin/masterclass`; repointed at current rows (`Badrijani nigvzit`,
   `Khinkali folding class` at 35₾/pp) and recalculated the total (635₾, not 610₾).
4. **`company-nationality-tagging.spec.ts`'s `test.setTimeout(120_000)` was genuinely too tight**
   for its own real step count (three page objects, two tenant-setting writes, a dozen-plus
   navigations) — reproduced identically three times in a row, always completing every real
   check and running out of budget on the final cleanup line. Bumped to 150s, matching the order
   of magnitude this suite's other multi-round-trip tests already use.

Also hit, mid-chunk, and recovered from rather than worked around: a real `P2028` connection-pool
exhaustion window (see "Dev database connection pool exhaustion" below) and separately a
"dev server process bloat" slowdown (see below) serious enough that a `.next` wipe + restart was
the right call, not a guess — both are the documented, already-known patterns, not new findings.

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

**Reconfirmed 2026-09-30, a second real instance, different route:** after a ~90-minute session
running the full suite plus several isolated reruns, `/admin/orders/new` started returning a
genuine 404 — reproduced directly in a browser (not just in a test), confirmed live that no
`notFound()` call exists anywhere in that route's own code, then cleared immediately by the same
fix (`rm -rf .next` + restart). This one fix cleared 4 unrelated test failures in the same run
(`theme-colors`, `booking-simple`, `contact-orphan-safety`, `admin-orders`) — a useful shape to
recognize: several *seemingly unrelated* failures clearing together after one cache wipe is a
strong signal this pattern was the cause, not four separate regressions.

**Trade-off worth knowing:** running tests immediately after a fresh `rm -rf .next` is itself
slower for a while — every route's *first* Turbopack compile after the wipe costs several extra
seconds, and a test doing many sequential admin-page loads can stack that into a timeout that
looks like a new bug. If a test times out on something completely ordinary (a settings toggle,
a page load) right after a cache wipe, check whether it's just uncompiled-route latency before
concluding it's a real regression.

### Real, confirmed test-locator bugs found 2026-09-30 and 2026-10-01 (not app bugs)

Both found by getting a full run's failures to actually pass in isolation, then reading the
diff between the test's assumption and the app's current DOM/UI rather than accepting "still
red" as one bug.

1. **`payment-amount-integrity.spec.ts`'s company-booking scenario** used
   `getByRole('textbox', { name: 'Phone' })` / `'Email'` with no `exact: true`. The Contact
   Roles guide picker now renders a "Guide — Phone"/"Guide — Email" field on this scenario's
   company, so the un-exact match resolved to two elements. Real drift — this test predates
   the picker appearing on this company. Fixed with `exact: true` on both locators.
2. **`companies-crud.spec.ts`'s `companyRow()` helper** scoped one DOM level too shallow.
   `KnownBugs.md` #15's nested-button fix (2026-09-12) wrapped the row's name-button in its own
   wrapper div to pull the "needs details" `HelpHint` out from inside it; `xpath=..` used to
   land on the row's outer flex container (which holds Edit/Delete) but now stops one level
   short. Confirmed by direct DOM inspection before fixing (`parentElement` does not contain an
   Edit button, `parentElement.parentElement` does). Fixed with `xpath=../..`. This test has
   likely been silently broken since the #15 fix landed on 2026-09-12, with `clickUntil`'s
   20-second retry budget absorbing the failure as apparent slowness until this session.

Also fixed the same day, same root shape: **`wine-catalogue-order.spec.ts`** checked
`/admin/abandoned` for its test row without ever clicking the "Wine orders" tab
(`AbandonedClient.tsx` splits Bookings/Wine orders into two tabs, Bookings shown by default).
The wine order was written correctly the whole time (confirmed via direct DB read,
`abandonedAt` set ~2s after `createdAt`) — the test was looking at the wrong tab, not a missing
row.

3. **`wine-catalogue-order.spec.ts`'s "Restore without payment" click (Chunk 1,
   Plan-PlaywrightSuiteHardening, 2026-10-01).** The 2026-09-30 entry above guessed this was an
   overlay (`<div class="fixed inset-0 z-50 ...">`) intercepting the click for the full 120s
   budget. **That guess was wrong** — reproduced live with a fresh trace and confirmed via direct
   DOM query (`document.elementFromPoint`-equivalent checks in a real browser session) that no
   overlay exists at the time of the click. The real cause: `AbandonedClient.tsx`'s `Row`
   component renders the business-name text and the action buttons ("Restore without payment"/
   "They paid") as **sibling** divs, not one nested inside the other. The test's own locator —
   `page.locator('div').filter({ hasText: BUSINESS_NAME }).last()` — resolves to the *deepest*
   matching div in document order, which is the **text-only** child div; it never contains either
   button, so the chained `.getByRole('button', ...)` can never match anything and `.click()`
   polls forever with no error, matching the observed silent 120s hang exactly (confirmed via the
   trace's own event log: the click's `before` event has no matching `after`, and zero repeated
   actionability-retry log lines — consistent with a locator that never resolves to any element,
   not one that resolves but is covered). `.first()` would have been just as wrong the other way
   — the first matching div in document order is `<div className="min-h-screen">`, the entire
   page wrapper. Fixed by pinning to the Row's own class list instead (a new `abandonedRow()`
   helper in the spec file, the same pattern `wineCard()` already used in this file for a
   different page). Verified: isolated reruns, twice in a row, clean state, both green (47s each).
   **A second, previously-masked bug surfaced once this one was fixed** — exactly the shape
   flagged as a risk when this chunk was planned: the test's cleanup step (marking the order
   Cancelled) assumed a "Cancelled" button exists directly on whatever view `/admin/wine-orders`
   defaults to. It doesn't — `lib/statusFlow.ts`'s `flowSpine()` deliberately excludes `CANCELLED`
   from the Cards view's `FlowLine` ("a real stage and the dropdown needs it", its own comment);
   only the Table/Board views' status-pill dropdown (`menuSteps()`) offers it. This was never
   caught before because the first bug blocked every run from ever reaching this step. Fixed by
   switching to Table view before the cancel flow. Also fixed a stale assertion in the same step:
   the test expected the business name to disappear entirely after cancelling
   (`toHaveCount(0)`), but cancelling a wine order only dims it (`isInactiveOrder` opacity, not a
   filter) — there is no delete action at all (see "Recurring cleanup" below, this is *why* that
   debris accumulates). Changed to assert the row's status pill now reads "Cancelled ▾" instead.

4. **`companies-crud.spec.ts`'s step 8 (Chunk 2, Plan-PlaywrightSuiteHardening, 2026-10-01).**
   This plan's own text guessed the "navigation between `/admin/orders` and `/admin/companies`"
   Playwright's trace showed was a real, unexplained client-side navigation firing mid-edit.
   **That guess was wrong too, and for an interesting reason this time: the navigation was real,
   but unrelated to the hang.** Reproduced live with a fresh trace and read the raw before/after
   event stream directly: the `fill()` call on `getByRole('textbox', { name: 'First and last
   name' })` has exactly one "waiting for..." log line and never resolves — no overlay, no
   retries, nothing. It just polls forever, because **that accessible name doesn't exist
   anywhere on the page.** `'First and last name'`, `'+995 5XX XXX XXX'` and `'contact@company.ge'`
   (the three strings this step filled) were the **old company-level contact columns** —
   `MaintenanceNotes.md` §1 and `Plan-ContactRoles` Chunk 1 removed them in favor of a People
   list per contact role, and this test was never updated to match. Confirmed live via the
   accessibility tree that the current "Add Contact Person" form's three fields (Name/Phone/
   Email) have **no accessible name at all** — `SmallInput`'s `<label>` is a plain sibling,
   never `htmlFor`-linked to its `<input>` — the same already-documented gap as the price-tier
   spinbuttons a few lines later in this same test (entry 4's "Fourth real finding" in
   `notes/09-companies-crud.md`), and the same shared component underneath both.

   The navigation itself really did happen — just not as part of the stuck `fill()`. Once the
   outer `test.setTimeout(120_000)` fired with that `fill()` still pending, `afterEach` ran its
   own `ensureAdminLoggedIn()` (→ `page.goto('/admin/orders')`, a real navigation) and
   `deleteTestCompanyIfPresent()` (→ `page.goto('/admin/companies')`, another one) **on the same
   `page` object**. Playwright's trace attributes a frame's navigation events to whichever
   action's wait was still open when they fired, which is exactly `fill()`'s — so the error
   report's own "waiting for ... navigation to finish ... navigated to ..." text, read without
   the raw trace, looks exactly like the hang caused the navigation. It didn't; the two are
   independent, confirmed by their timestamps (the stuck `fill()` started at ~102s into the
   trace; the first `goto('/admin/orders')` doesn't start until ~127s, 25s later — matching
   `test.setTimeout`'s own budget, not anything downstream of the fill).

   Fixed by replacing the three stale fills with the real flow: click "+ Add Contact Person",
   then target its three unlabeled fields positionally via
   `input[type="text"]:not([placeholder])` (the three `field()`-based panel inputs above it all
   resolve a real accessible name from their own `placeholder`, so this scopes cleanly without
   needing a fragile DOM-depth traversal — the exact mistake entry 3 above just documented).
   Verified: two isolated reruns from a clean shell, both green (1.6m and 1.7m — both close to
   the 120s budget on a loaded dev server, see "Dev server process bloat" above, but comfortably
   inside it).

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
