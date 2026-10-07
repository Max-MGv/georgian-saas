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

### `wine-catalogue-order` fails because fixture wine "Rkatsiteli" is inactive (2026-10-07)

**Symptom:** the test can't find the wine "Rkatsiteli" in the public catalogue.
**Cause:** in the shared dev data the wine has `active:false`, so it is hidden from the catalogue. Not a code regression — proven by disabling the proxy change (still failed) and temporarily activating the wine (passed).
**Fix:** re-activate the wine on the Wines admin page (Max's data; left as found).

### First run after a dev-server start times out on cold-compiled routes (2026-10-07)

**Symptom:** a test's first navigation to a rarely-visited route (e.g. `/super-admin/tickets/[number]`) times out.
**Fix:** warm the route with one real visit first; the tickets spec uses 150 s timeouts for the same reason.

### `next build` fails with EPERM while a dev process is running (Windows, 2026-10-07)

**Symptom:** `prisma generate` / `next build` fails with EPERM on the Prisma query-engine DLL.
**Cause:** a stray `next dev` / node process still holds the engine file (ClaudeInstructions Rule 10).
**Fix:** stop the project's node processes, then rebuild.

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

**Reconfirmed again 2026-10-02, a third real instance, third different route:** during
[[Plan-PlaywrightSuiteHardening]] Chunk 6's full-suite run, `/admin/login` itself started
returning a genuine 404 — confirmed via a raw `curl` request (not just a test failure), fixed
the same way. Three confirmed instances in one week, three different routes
(`/admin/login` originally, `/admin/orders/new` on 2026-09-30, `/admin/login` again on
2026-10-02) — this is a real, recurring risk for this dev setup, not a one-off fluke. **Not
yet root-caused as to *why* it recurs this often** — worth a dedicated investigation if it
keeps happening, rather than continuing to treat each instance as an independent surprise.

**Trade-off worth knowing:** running tests immediately after a fresh `rm -rf .next` is itself
slower for a while — every route's *first* Turbopack compile after the wipe costs several extra
seconds, and a test doing many sequential admin-page loads can stack that into a timeout that
looks like a new bug. If a test times out on something completely ordinary (a settings toggle,
a page load) right after a cache wipe, check whether it's just uncompiled-route latency before
concluding it's a real regression.

**Reconfirmed again 2026-10-02 (same day as the third instance above), a different shape of the
same underlying pattern — slowness without cache corruption:** after the Chunk 6 cache-corruption
fix, this session kept the dev server running for well over an hour of continuous heavy testing
(a full 35-test suite run, plus a dozen isolated reruns investigating individual failures). A
subsequent full-suite run came back markedly worse — a fresh wave of failures
(`companies-crud`, `payment-label-precedence`, `locale-integrity`'s admin-companies case, plus
`net::ERR_ABORTED` at multiple different routes including `/admin/login` itself mid-login)
— **with no 404 this time**, ruling out the cache-corruption variant above. Confirmed directly
via process inspection rather than assumed: `Get-CimInstance Win32_Process` on the real
`next dev` server process (not the `npm`/`next` wrapper PIDs, which stay tiny) showed **1.27–1.37GB
resident**, consistent with this section's own "~1.8GB" prior observation. Fixed the same way
(`Stop-Process` the whole tree, `rm -rf .next`, restart) — confirmed live: every one of the
newly-failing specs (`companies-crud`, `payment-label-precedence`, all three
`locale-integrity` admin cases) passed clean on the very next run against the fresh server,
with zero code changes. **Lesson for next time this suite is used to investigate itself:** the
investigation's own heavy, repeated test traffic can re-trigger the exact degradation it's
trying to diagnose — if a long investigation session's failures start looking broad and
unrelated, check process memory before concluding the app regressed.

**Reconfirmed twice more 2026-10-02 (Chunk 6 close-out verification session), neither instance
actually the cause of the test failures under investigation at the time — both caught and ruled
out, not guessed past:**

- Mid-investigation into `payment-amount-integrity.spec.ts`'s Wine-orders scenario (entry 6
  above), the dev server climbed from a clean 154.7MB at session start to 525MB, then 617MB,
  over roughly 40 minutes of repeated isolated reruns. A login-flow timeout appeared at the same
  time, which looked at first like it might explain the test's own ongoing failures. Checked
  directly rather than assumed: a full restart + `.next` wipe cleared the login timeout, but the
  *test* failure persisted identically afterward (same timeout shape, same line) — proving the
  real cause was the race condition documented in entry 6c, not server degradation. Worth
  remembering: a server-health symptom appearing at the same time as a test failure is not proof
  it's the cause; check whether fixing the server actually clears the test failure before
  concluding that.
- Later, after a full 33.8-minute 35-test suite run plus two more isolated reruns, the server hit
  **1262.8MB** (confirmed via `Get-CimInstance Win32_Process`) — squarely past the ~1.3GB range
  this section's own prior instances were observed at. This one *was* the direct, confirmed cause
  of a real failure: a `booking-simple.spec.ts` isolated rerun timed out on login itself, same
  shape as every other instance in this section. Cleared by the standard fix.

### Shared tenant payment-toggle state can cascade into unrelated-looking failures

**Symptom:** a spec that never touches payment settings at all (`booking-simple.spec.ts`,
`booking-enhanced.spec.ts`) fails on a button-label mismatch — expecting `"Book & Pay"` and
finding `"Request Booking"`, or vice versa — with no code change anywhere near it.

**Cause:** several specs in this suite (`payment-amount-integrity.spec.ts`,
`payment-label-precedence.spec.ts`) read the *current* value of a tenant-wide payment toggle
(`Individual bookings` / `Company bookings`, both `Tenant` columns, not `Setting` rows) at the
start of a test, flip it through several states for their own scenarios, and restore the
original value in a `finally` block. **If that test gets interrupted before its `finally` can
run** — a timeout, a crash, or (as happened repeatedly this session) the server itself
degrading mid-test — the toggle is left at whatever intermediate value the test last set it
to, not its real original. Every *other* spec that assumes an ambient default then fails, often
in a completely different tier, for a reason that has nothing to do with its own code. This is
the same shape Chunk 5 already documented for `staging`'s tier5 suite (`payment-book-later`
found "Individual bookings" left ON there) — confirmed here to also affect the **dev** tenant,
and to cut in **both directions** depending which toggle:

- `paymentEnabledIndividuals` / `paymentEnabledWineOrders`: Prisma schema default `true`, and
  that's the tenant's real intended state too (no override on record) — `booking-simple.spec.ts`
  assumes this.
- `paymentEnabledCompanies`: schema default is also `true`, but Staging Winery has a **deliberate,
  documented override to `false`** — see `booking-enhanced.spec.ts`'s own comment
  ("backfilled false by #148"). **Do not "fix" this one back to the schema default** — that
  was this session's own mistake, caught only because `booking-enhanced.spec.ts` and
  `company-nationality-tagging.spec.ts` (which both depend on it reading `false`) failed
  immediately after. Confirmed correct values, 2026-10-02: Individuals **true**, Companies
  **false**, WineOrders **true**.

**Update 2026-10-02:** `payment-book-later.spec.ts` was the one tier 5 spec that asserted a resting
value (Individuals OFF) instead of setting what it needs. That conflicted with the correct resting value
(ON) and had only passed before because someone flipped the toggle by hand. It now sets OFF itself and
restores the original in `finally`, like its siblings — no tier 5 spec assumes a resting toggle state any more.

**If a spec using one of these toggles fails for any reason, check this tenant-state drift
before assuming a code or locator bug** — read the three `Tenant` columns directly (not the
`Setting` table, which is a different mechanism entirely despite the shared admin-UI look) and
compare against the values above. This session hit the drift three separate times investigating
Chunk 6 alone.

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

5. **`payment-amount-integrity.spec.ts`'s company-booking scenario never handled the
   ContactPickerPopupView at all (found 2026-10-02, Chunk 6).** Confirmed live: Caucasus Vine
   Travel now has people in both its guide role (two guides) and its contact_person role (one
   rep), so entering its access code opens the picker once per role — exactly the gap Chunk 3
   already found and fixed in `booking-enhanced.spec.ts`/`company-nationality-tagging.spec.ts`
   for a different company (Tbilisi Tour Collective). This spec predated that drift and never
   dismissed the popup at all. Its symptom looked different from Chunk 3's: not a stuck `fill()`,
   but the final submit button's `clickUntil` retrying for the full 20s with the trace showing a
   `fixed inset-0 z-50` overlay intercepting every attempt — the picker, left open the whole time,
   sitting on top of the form. The intervening fills (date, guests, Name/Phone/Email) all
   succeeded regardless, which is why the failure surfaced at the submit click specifically, not
   earlier — worth remembering if this shape (fills succeed, only the final click is blocked)
   shows up again. Fixed with the same loop pattern Chunk 3 used, always declining ("I am not on
   this list") since this scenario fills contact fields by hand regardless of who's offered.
   Verified: two isolated reruns, both green (the full 5-sub-scenario describe block, 7.9m and
   similar).

6. **`payment-amount-integrity.spec.ts`'s Wine-orders scenario — five real bugs stacked on top
   of each other, each masking the next (found 2026-10-02, Chunk 6 close-out verification).**
   This scenario had apparently never passed since Feature 191 and the ContactPickerPopupView
   both landed — it just hadn't been run in isolation since, so nothing surfaced until this
   session tried to get it to two clean reruns as a "small confirmation item." Each fix below
   unblocked the next failure; none were visible until the one before it was gone.

   a. **Checked `/admin/abandoned` without clicking the "Wine orders" tab** — the exact same gap
      entry 6 above (`wine-catalogue-order.spec.ts`) already found and fixed 2026-10-01, just
      never ported to this spec's own copy of the same check. Confirmed live: the row was really
      there, just on the tab this screen doesn't default to. Fixed the same way — click
      `/^Wine orders/` before asserting.
   b. **Never declined the ContactPickerPopupView at all**, same gap as entry 5 above, just for a
      different company: Sighnaghi Wine Bar has since picked up a contact person (Tamar
      Gogoladze). Confirmed live by reproducing the exact flow by hand in a browser — entering
      the company's access code opens "Who should we put on this booking?" Left undeclined, the
      popup silently intercepted the final submit click for the rest of the test's timeout
      budget, with no indicative error (the preceding `toBeVisible` check on that same button
      passes, since the popup only covers it, not removes it from the DOM). Fixed with the same
      decline-loop pattern as entry 5.
   c. **The decline-loop fix above had its own real bug: a race condition.** The working version
      (entry 5, and the Company-booking scenario earlier in this same file) has an
      `await expect(...).not.toBeVisible()` wait on the *previous* screen immediately before the
      `isVisible()` probe for the picker — acting as a sync point that gives the popup time to
      actually mount. This copy skipped straight from the "Confirm" click to the probe. Confirmed
      via `--trace=on` and reading the raw event stream directly: the probe's `before` event
      fired in the same instant as the Confirm click's `after` — zero gap — so it reliably saw
      nothing and broke the loop without declining, and the popup then appeared a moment later
      and blocked the submit click anyway. Not hypothetical: this one cost three full isolated
      reruns (each burning its full `test.setTimeout` — 300s, then 480s twice) before the missing
      sync line was found. Fixed by adding the same `not.toBeVisible()` wait the working copy has.
   d. **`test.setTimeout` was genuinely too tight once the scenario could actually run to
      completion** instead of failing early on (a)–(c). 300s (this file's own original estimate,
      "routinely takes close to 180s end to end") wasn't enough; bumped to 480s, matching the
      sibling Company-booking scenario's budget for a similarly-shaped 3-sub-scenario flow.
   e. **A missing required-field fill, only exposed once (b) and (c) stopped silently blocking
      the submit.** `WineCatalogueClient.tsx`'s `contactName` input has `required` — confirmed by
      reading the component source directly. This scenario filled only the phone field before
      clicking submit (the sibling "OFF, no company" scenario a few lines up fills both). Before
      the picker was being properly declined, the submit click never got far enough to matter;
      once it did, the click "succeeded" (a valid click on a real button) but native HTML5
      validation silently blocked the actual form submission, so the page never navigated and no
      error was thrown — it just looked like another stuck click until reproduced. Fixed by
      filling "Contact person full name" to match the sibling scenario.

   Verified: two clean isolated reruns after all five fixes (3.3m, 2.8m), then confirmed holding
   up in two genuine full-suite runs (2.1m and 2.1m as part of 34/35 and 35/35 totals
   respectively — see `Plan-PlaywrightSuiteHardening.md` Chunk 6's final Result for the complete
   run numbers).

7. **`booking-simple.spec.ts`'s order-detail-page navigation timeout, bumped again (2026-10-02,
   Chunk 6 close-out verification).** A variant of the "Dev server process bloat" section's own
   documented cold-compile trade-off below, just hit on a route/test this file hadn't needed to
   bump before. The 15s timeout this line already carries (itself a 2026-0x fix for the same
   general shape) wasn't enough against a server that had just been `rm -rf .next`-wiped and
   restarted immediately before a full-suite run: confirmed directly in the dev server's own log
   — `GET /admin/orders/[id] 200 in 21.7s (next.js: 17.5s, ..., application-code: 4.0s)` — the
   route's first-ever compile on that fresh process cost more than this comment's earlier
   8–10s estimate. Bumped to 30s (and the test's own overall `test.setTimeout` 120s→150s to keep
   headroom). Practical lesson for next time a run follows a cache wipe: warming only *static*
   routes beforehand isn't enough — a dynamic route like `/admin/orders/[id]` needs an actual
   click-through on a real row to pre-compile; the first verification attempt after this fix
   failed differently (a login timeout, see "Dev server process bloat" below) specifically
   because only static routes had been warmed. Verified: two clean isolated reruns after warming
   the dynamic route properly (1.3m, 1.1m), then held clean in the final 35/35 full-suite run.

### `payment-edit-after-payment.spec.ts` — retired 2026-10-02 (found obsolete 2026-10-01, Chunk 5)

**🪦 Retired, not just left failing.** Max's call, once the decision below was surfaced: retire
rather than rewrite. The spec file is deleted; `playwright/notes/17-payment-edit-after-payment.md`
is kept as history with a retirement banner, and `README.md`/`Progress.md`'s counts (now 5 tier5
files / 7 tests, 42 total) reflect the removal. The section below is kept as-written, unedited,
for the full original finding.

**Not a bug in the test's locators or timing — its entire premise was closed off by a later,
deliberate fix.** Running the full `tier5-payment-e2e` suite for real against
`staging.vineworks.ge` (Plan-PlaywrightSuiteHardening Chunk 5), this spec hung its full 200s
budget and died inside its own `finally` block with `page.goto: Target page, context or browser
has been closed`.

The real hang is earlier: step 4 tries to raise a card-paid order's guest count through the
**Guest Breakdown** panel and save — but a live DOM snapshot taken at the moment of failure shows
every field in that panel is `[disabled]` ("This order is already paid. Guest counts, the
tasting/lunch split, rates, and food details are locked..."), including the Save button itself.
`.fill()` on a disabled input waits forever for it to become editable, with no error until the
outer test timeout fires. This spec was written to document `KnownBugs.md` #64 (editing a paid
order silently reprices `Order.totalPrice` while `Payment.amount` stays frozen) — but
**`Plan-PostPaymentExtras` Chunk 1 fixed #64 by locking exactly these fields once `paidAt` is
set**, deliberately making the edit this spec performs impossible. The locked-state behavior is
already correctly tested by `payment-post-payment-extras.spec.ts` (`"4: Chunk 1 lock confirmed —
fields disabled, edit attempt had no effect"`, confirmed passing in the same run).

**This needed a decision, not a locator fix:** retire this spec (its coverage is now fully
redundant with `payment-post-payment-extras.spec.ts`), or rewrite it to assert the lock itself
(which would just duplicate that same spec), or something else — a test-strategy call, not
something to force a passing assertion onto. Left failing/blocked rather than silently patched
until Max decided: **retire it** (2026-10-02).

**A second-order effect worth knowing:** because the hang happens *inside* the `try` block and
the first line of `finally` (`setPaymentSectionToggle`, a `page.goto()`) throws immediately once
Playwright force-closes the page on timeout, **nothing else in that `finally` block runs either**
— `deleteTestOrderOnAdminPage` and `disconnectOrderMoneyDb` are silently skipped. A real Flitt-
settled test order is left on Staging Winery every time this spec times out this way. Cleaned up
manually via the live admin UI 2026-10-01; if this spec is run again before being retired or
rewritten, expect to do the same.

### A silently stale `DEFAULT_TENANT_ID`

**Symptom:** every test in the suite quietly runs against the wrong tenant — no errors, just wrong data, wrong assumptions, everything "passing" against a tenant nobody meant to test.

**Cause:** `saas/.env`'s `DEFAULT_TENANT_ID` is what `localhost:3000` resolves to (see `ARCHITECTURE.md`'s "two-tenant strategy"). A past session temporarily pointed it at a different tenant to inspect something manually, and never reverted it — it stayed wrong for hours before being caught by accident.

**Prevention, not fix:** never change `DEFAULT_TENANT_ID` to solve a "need a different tenant" problem — see `ARCHITECTURE.md` for the actual supported pattern (domain-based routing, scoped to one spec file via `test.use()`). If you ever do need to change it for a real reason, treat reverting it as the single most important step of that session, and confirm the revert live before considering the work done — this exact mistake has already cost hours once.

## Recurring cleanup this suite needs (accepted limitations, not bugs)

### Onboarding-wizard tenant needs a reset before every run

`10-onboarding-wizard.spec.ts` runs against a second tenant ("Test Onboarding Wizard", `cmsioproi000avl9czd60ua5h`) and does **not** reset it back to zero-state afterward — nothing else in this suite depends on that tenant staying pristine between runs, so it wasn't built to self-clean. Running the full suite without resetting first will correctly fail this one test at its very first assertion (the Individuals-pricing gate will already be satisfied from the previous run).

**Since 2026-10-02, this is a button, not a query someone has to go find.** `/super-admin/tenants` has a "Reset onboarding wizard tenant" card (`app/super-admin/tenants/ResetOnboardingWizardCard.tsx`, mirroring the existing demo/staging reset cards) — click it, confirm, done. It runs the exact same operation the manual SQL did (`lib/onboardingWizardReset.ts`), resolved by tenant slug (`test-onboarding-wizard`) so it refuses to run against the wrong database. Built because a session trying to run the old manual-SQL reset got blocked by a safety check on bulk-delete scripts and couldn't complete it — the button has no such friction since it's ordinary app code behind `requireSuperAdmin()`, not an ad-hoc script. The original SQL is still in `notes/10-onboarding-wizard.md` for reference, but the button is now the documented way to do this.

### Wine Orders test debris needs a periodic manual sweep

Because of standing bug #3 above, every run of `06-wine-catalogue-order.spec.ts` leaves one more permanently `Cancelled` row in the real `WineOrder` table (business name pattern: `Playwright Wine Test <timestamp>`). This was already cleaned up once (14 accumulated rows deleted via direct SQL, scoped to that exact business-name pattern — see `notes/06-wine-catalogue-order.md`) but **will recur** every time the test runs again. There's no way around this without either the app gaining a real delete action on Wine Orders, or the test switching its own cleanup to a direct DB delete instead of "Cancelled" (a bigger change than seemed worth making when the test was first built). If this suite starts running much more frequently (e.g. in CI), revisit this — either fix is straightforward, it just wasn't urgent yet.

## The one process lesson worth calling out explicitly

Most of the real findings above were caught by **independently re-verifying every "done" claim** — re-running the full suite from a clean shell and spot-checking real data via direct SQL, rather than trusting a summary (including this suite's own earlier self-reports, which overclaimed completion twice before a background run had actually finished). If you're extending this suite or reviewing someone else's addition to it: don't skip this step. It found a premature "14/14 passing" claim that was actually 5 failures, an accidental edit to live production-adjacent data, and 14 rows of accumulated test debris — none of which would have surfaced from reading a summary alone.
