---
tags: [plan, playwright, testing]
---

# Plan — Playwright Suite Hardening

**Status: 🚧 In progress.** Written 2026-10-01 after a session that ran the full suite for
the first time in weeks, fixed several real bugs in the tests themselves, merged a form
field (requiring 10 spec-file updates), and had an independent subagent review confirm the
fixes but surface one structural gap and doc staleness. Full narrative: `vault/SessionLog.md`
2026-09-30/2026-10-01 entries. This plan exists because the suite still cannot be trusted as
a one-command "does the site work" gate, and Max asked for a working plan to close that gap,
to be executed by a subagent (not the session that wrote the plan) for bias hygiene — the
session that just spent hours on this has every incentive to declare victory early.

**Ground rule for whoever executes this:** reproduce every bug live before fixing it, and
verify every fix live after. Do not trust this plan's guesses about root cause — they are
starting hypotheses, not confirmed findings. Where this plan says "investigate," that means
the actual cause is not yet known. Update this file's checkboxes and add a Result note under
each chunk as you go, matching the convention of every other `Plan-*.md` in this vault.

**Git workflow (vault/ClaudeInstructions.md Rule 0, non-negotiable):** everything here is
`staging`-branch work. Commit and push to `staging` as you go. Do not merge to `master` —
that needs Max's explicit go-ahead, separately, after he's looked at `staging`.

---

**Execution note (2026-10-01, fresh session):** this session is the subagent executing the
plan, deliberately with no memory of the session that wrote it, per the ground rule above.
Working in an isolated git worktree based on the real `staging` tip (`6213146`, which the
writing session's own HEAD was — note `origin/staging` was 2 commits behind that at the time;
pushed from local `staging`, not `origin/staging`, to pick those up too).

## Chunk 0 — Close the tier5 safety gap (do this first, it's small and high-value)

`saas/playwright.config.ts` has no exclusion for `tests/tier5-payment-e2e/`. The suite's own
documented default command (`playwright/README.md`: `cd saas && npx playwright test`) will
currently sweep those 5 real-Flitt-payment specs in and run them against `localhost` — which
`playwright/ARCHITECTURE.md`'s own "Tier 5 runs against real staging" note says doesn't fail
cleanly, it hangs for ~25s per test waiting on a settlement callback `localhost` can never
receive. Nothing enforces the documented workaround (`--config=playwright.staging.config.ts`,
tier5 only) except a human remembering it.

- [x] Add a `testIgnore` (or equivalent) to the default `playwright.config.ts` excluding
      `tests/tier5-payment-e2e/**`.
- [x] Verify: `npx playwright test --list` from `saas/` no longer lists any tier5 spec.
- [x] Verify the existing documented tier5 invocation still works unchanged:
      `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/<file>.spec.ts --list`
      should still list that file's tests normally.
- [x] Confirm this doesn't silently break `npm run test` or any CI-adjacent script if one
      exists (grep `package.json` for a `test` script before assuming there isn't one).

**Resume point:** Done.

**Result (2026-10-01):** Added `testIgnore: ['tests/tier5-payment-e2e/**']` to
`saas/playwright.config.ts` (next to `testDir`), with a comment explaining why and pointing at
this plan. Verified: default `npx playwright test --list` went from 43 tests/23 files to 35
tests/17 files, 0 matches for `tier5` in the listing. The staging config
(`npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/payment-declined-settlement.spec.ts --list`)
still lists that file's one test normally — unaffected, since `testIgnore` is a property of
`playwright.config.ts` only, not shared by `playwright.staging.config.ts` (which has its own,
separate `testDir` scoped to tier5 already). `package.json` (`saas/package.json`) has no
`test` script at all — only `dev`, `build`, `start`, `lint`, `seed`, `set-admin`,
`create-super-admin-dev` — so nothing CI-adjacent references the old unscoped command.

One correction to this plan's own framing: tier5 is **6** spec files (`payment-admin-order`,
`payment-approved-settlement` [3 tests], `payment-book-later`, `payment-declined-settlement`,
`payment-edit-after-payment`, `payment-post-payment-extras`), 8 tests total — not "5 real-Flitt-
payment specs" as this plan's intro states. Doesn't change anything about the fix, just noting
the count was off when this was written.

---

## Chunk 1 — Root-cause and fix: wine-catalogue-order's "Restore without payment" click

**Symptom, reproduced twice already** (`playwright/KNOWN-ISSUES.md`, 2026-09-30 entry):
after `wine-catalogue-order.spec.ts` correctly finds its abandoned order on the Wine Orders
tab of `/admin/abandoned`, clicking its "Restore without payment" button times out —
Playwright's own trace shows `<div class="fixed inset-0 z-50 ...">` intercepting the click,
repeatedly, for the full 120s budget. Reproduced once mid-session and once again right after
a clean dev-server restart, which argues against pure load noise but was never confirmed
either way.

- [x] Reproduce live, by hand, in a browser: get a real wine order onto `/admin/abandoned`
      (either drive the real public checkout flow once, or use an existing abandoned row if
      one is already on Staging Winery), click "Restore without payment", and watch what
      actually happens. Does a modal/backdrop genuinely stay mounted after an action that
      should dismiss it? Does the click fire but something else (a toast, a re-render) throw
      an overlay back up a beat later? Check the DOM directly (`document.elementFromPoint()`
      at the button's own coordinates, same technique `KnownBugs.md` #62 used) rather than
      guessing from the error message alone.
- [x] Determine: is this a real app bug (a backdrop not clearing — in which case it's a
      `KnownBugs.md`-worthy finding, fix the app) or a test problem (the test's own locator
      resolving to something stale, or not waiting for an animation/transition to finish —
      in which case fix the spec, and say why in a comment, matching this file's existing
      style of documenting real findings inline).
- [x] Fix whichever it turns out to be.
- [x] Verify: rerun `wine-catalogue-order.spec.ts` in isolation, serial, **twice in a row**
      from a clean state (not back-to-back reusing debris from the first run — clean up
      between runs). Both must pass. A single green run is not enough given this already
      looked intermittently different across two attempts.
- [x] Update `playwright/KNOWN-ISSUES.md`: move this out of "not yet resolved" into either
      the standing-app-bugs section (if it was real) or the test note and commit history.

**Resume point:** Done.

**Result (2026-10-01):** This plan's own guess (an overlay intercepting the click) was wrong —
confirmed by reproducing live. First, ran the spec with `--trace=on` and inspected the raw trace
events directly (`0-trace.trace`, since Playwright's own trace-viewer UI couldn't load in this
session's browser pane — its service worker failed to register, likely a sandbox constraint):
the click's `before` event had no matching `after` for the full 120s budget, and critically
**zero repeated actionability-retry log lines** — real overlay-interception shows up as repeated
"element is outside of the viewport" / intercepted-click retries; this showed none, which is the
signature of a locator that never resolves to any element at all, not one that resolves but is
covered.

Reproduced the real mechanism live in a browser (manual checkout → abandoned order → direct DOM
query, `document.elementFromPoint`-equivalent): `AbandonedClient.tsx`'s `Row` renders the
business-name text and the two action buttons as **sibling** child divs of the row container, not
one nested in the other. The test's own locator, `page.locator('div').filter({ hasText:
BUSINESS_NAME }).last()`, matches every ancestor div containing that text (6 of them on a real
row, verified via `document.querySelectorAll`) and `.last()` resolves to the **deepest** one in
document order — the text-only child div, which has no button as a descendant. The chained
`.getByRole('button', { name: 'Restore without payment' })` therefore can never match anything,
and `.click()` polls silently forever. `.first()` would have been just as wrong the other way —
verified it resolves to `<div className="min-h-screen">`, the entire page body wrapper.

Fixed by adding an `abandonedRow()` helper pinned to the Row's actual class list (the same
pattern `wineCard()` already used in this file, just for a different page), replacing both
occurrences of the broken `.last()` pattern (test body + `afterEach`). This is a genuine test
locator bug, not an app bug — `AbandonedClient.tsx`'s structure is unremarkable.

**A second, previously-masked bug surfaced immediately once this one was fixed** (the exact
"fixing one bug reveals the next" shape this chunk's own text called out as a real risk, citing
`companies-crud.spec.ts`'s history as precedent): the test's cleanup step (mark the restored
order Cancelled) assumed a "Cancelled" button exists on whichever view `/admin/wine-orders`
defaults to. It doesn't — the default **Cards** view's `FlowLine` deliberately excludes
`CANCELLED` from its steps (`lib/statusFlow.ts`'s `flowSpine()`, own comment: "a real stage and
the dropdown needs it") — only the **Table**/Board views' status-pill dropdown (`menuSteps()`)
offers it. This was never caught before because the first bug blocked every prior run from ever
reaching this step. Fixed by switching to Table view first, then using the status-pill dropdown
(confirmed working manually in a live browser session before writing the spec fix). Also fixed a
stale final assertion in the same step: the test expected the business name to vanish entirely
after cancelling (`toHaveCount(0)`) — it doesn't, cancelling only dims the row
(`isInactiveOrder` opacity, not a list filter); there's no delete action at all, which is *why*
Wine Orders test debris accumulates (documented separately in `KNOWN-ISSUES.md`). Changed to
assert the status pill now reads "Cancelled ▾".

Verified: two isolated reruns from a clean shell, both green (47.0s and 47.1s — effectively
identical, no flakiness). Full detail and the exact trace evidence:
`playwright/KNOWN-ISSUES.md`'s "Real, confirmed test-locator bugs" section, entry 3.

Also cleaned up: 4 wine orders this session's own reproduction work left on the dev tenant
(1 manual repro + 3 from repeated spec runs while diagnosing) — all restored and marked
Cancelled via the live admin UI, not left as debris.

Changed files: `saas/tests/tier2-core-flows/wine-catalogue-order.spec.ts`,
`playwright/KNOWN-ISSUES.md`.

---

## Chunk 2 — Root-cause and fix: companies-crud's unexplained navigation

**Symptom** (`playwright/KNOWN-ISSUES.md`, 2026-09-30 entry): after the Edit panel opens on
`companies-crud.spec.ts`'s test company, the test hangs its full 120s waiting on a form
field inside that panel — but Playwright's own trace shows navigation between
`/admin/orders` and `/admin/companies` happening in that window, which should not be
possible once the Edit panel is already open and the test isn't calling `page.goto()` again.

- [x] Reproduce live: run the spec with tracing/video on (already configured — `video:
      'retain-on-failure'` in `playwright.config.ts`), or drive the exact same sequence by
      hand in a browser (create a test company, open its Edit panel, watch network/console).
      Look for: a client-side redirect firing from somewhere unexpected, a stale `router`
      reference from an earlier step in the test re-triggering, or a genuinely different
      bug than it first looks like (the two "real findings" pattern from today's session —
      companies-crud's `xpath` fix revealed a second problem once the first was out of the
      way; this could be the same shape).
- [x] Determine real vs. test cause, same bar as Chunk 1.
- [x] Fix whichever it is.
- [x] Verify: isolated rerun, twice in a row, clean state each time.
- [x] Update `playwright/KNOWN-ISSUES.md` to match.

**Resume point:** Done.

**Result (2026-10-01):** This plan's own framing of the symptom was real but misleading — the
"unexpected navigation between `/admin/orders` and `/admin/companies`" genuinely happened, just
not as part of the stuck step. Reproduced live with `--trace=on` and read the raw trace events
directly (same technique as Chunk 1, since the trace-viewer UI still wouldn't load in this
session's browser). The actual hang: `getByRole('textbox', { name: 'First and last name' })`
never resolves — one "waiting for..." log line, then nothing, for the rest of the test. That
accessible name doesn't exist anywhere on the page. It, `'+995 5XX XXX XXX'`, and
`'contact@company.ge'` were the **old company-level contact columns**, removed by
Plan-ContactRoles Chunk 1 (`MaintenanceNotes.md` §1) in favor of a People list per contact
role — this test was never updated to match, and has presumably been dead on this exact step
since that refactor landed.

The navigation was a separate, real event from a separate cause: once the outer
`test.setTimeout(120_000)` fired with the `fill()` still pending, `afterEach` ran its own
`ensureAdminLoggedIn()` and `deleteTestCompanyIfPresent()` — each does a real `page.goto()` — on
the *same* `page` object the stuck `fill()` was still waiting on. Playwright's trace (and its
own error-report text) attributes a frame's navigation events to whichever wait was open when
they fired, so the report reads as if the hang caused the navigation. Confirmed it didn't by
timestamp: the `fill()` started ~102s into the trace; the first `goto('/admin/orders')` doesn't
start until ~127s — a 25s gap matching `test.setTimeout`'s own budget, not anything the fill()
triggered. Worth remembering for future trace debugging in this suite: **a trace's "navigation"
log line attached to a stuck action is not proof the action caused it** — check the actual
timestamps against the test's own timeout budget before concluding they're related.

Confirmed live via the accessibility tree (not just reading the component source) that the
*current* "Add Contact Person" form's three fields (Name/Phone/Email) have no accessible name
at all — `SmallInput`'s `<label>` is a plain sibling, never `htmlFor`-linked to its `<input>`.
This is the exact same gap `playwright/notes/09-companies-crud.md`'s own "Fourth real finding"
already documented for the price-tier spinbuttons a few lines later in this same test — same
shared component, so the same workaround applies. Fixed by clicking "+ Add Contact Person" and
targeting its three fields positionally via `input[type="text"]:not([placeholder])` (the panel's
other three fields — Company name/ID/Address — all resolve a real accessible name from their own
`placeholder`, so this scopes cleanly without a fragile DOM-depth traversal, learning directly
from Chunk 1's `.last()` mistake rather than repeating its shape).

Verified: two isolated reruns from a clean shell, both green (1.6m and 1.7m — close to the 120s
test budget on a dev server under this session's cumulative load, including one single-route
cold-compile that alone took 44s, but comfortably inside it both times). One self-inflicted
false failure along the way, worth recording honestly: the *first* attempted verification run
failed on an unrelated booking-count assertion (`expected 10, received 9`) because this session
was deleting 4 unrelated leftover debris companies through the live admin UI *while* that run
was mid-flight on the same shared tenant — a real race this session caused, not a bug. Confirmed
by re-running in isolation with no concurrent interference immediately after; both reruns that
actually count are clean.

Also cleaned up: 4 `Playwright CRUD Test Co <timestamp>` companies left on the dev tenant from
the *original* investigation session (2026-09-30/10-01, before this plan existed) — all
pre-dated this session's own runs, deleted via the live admin UI.

Full detail: `playwright/KNOWN-ISSUES.md`'s "Real, confirmed test-locator bugs" section, entry 4.
Changed files: `saas/tests/tier3-admin-smoke/companies-crud.spec.ts`,
`playwright/KNOWN-ISSUES.md`.

---

## Chunk 3 — Repoint the last two fixture-broken specs

`playwright/KNOWN-ISSUES.md` #4 has documented this since 2026-09-19: `booking-enhanced.spec.ts`
and `company-nationality-tagging.spec.ts` still reference `Test Company # 1`, deleted from
Staging Winery weeks ago. Three sibling specs were already repointed at real seeded demo
companies (`Caucasus Vine Travel`, `Alazani Valley Tours`, `Silk Road Journeys`) rather than
recreating the deleted fixture, per Max's standing call on this — same approach applies here.

**A real constraint to resolve, not pre-decided by this plan:** of `lib/demoSeed.ts`'s 5
booking companies, 4 are already claimed by other specs (`Caucasus Vine Travel` →
payment-amount-integrity, `Alazani Valley Tours` → payment-label-precedence, `Silk Road
Journeys` → contact-role-picker, `Kakheti Wine Routes` → contact-orphan-safety — confirmed by
grep 2026-10-01). Only `Tbilisi Tour Collective` is free, and two specs need a company.

- [x] Read both `booking-enhanced.spec.ts` and `company-nationality-tagging.spec.ts` in full
      to confirm neither one mutates company-level data (guides, prices, access codes) in a
      way that would collide if they shared one company — they likely don't (both just
      submit a booking and clean up their own order), but confirm rather than assume, the
      same way `contact-orphan-safety.spec.ts`'s header comment explains *why* it needed a
      company with existing Guide/Contact Person rows specifically.
- [x] If sharing `Tbilisi Tour Collective` is safe: repoint both specs to it.
- [x] If not safe: add a 6th booking company to `lib/demoSeed.ts`'s `BOOKING_COMPANIES`
      (matching the existing entries' shape — name, contact, a contact_person row with a
      code) and apply it via `saas/scripts/backfill-test-fixtures.ts` the same additive way
      the 2026-09-19 session did (**not** a full reseed — that deletes every order on the
      tenant).
- [x] Update each spec's `COMPANY_NAME`/`COMPANY_CODE` constants and any hardcoded
      rate/tier numbers that were specific to the old `Test Company # 1` fixture (check for
      assertions on specific ₾ amounts tied to that company's old price tiers).
- [x] Verify: isolated rerun of both specs, clean state.
- [x] Update `playwright/KNOWN-ISSUES.md` #4's table — this closes the last two open rows.

**Resume point:** Done.

**Result (2026-10-01):** Confirmed sharing `Tbilisi Tour Collective` was safe by reading both
spec files in full — neither mutates company-level data, each only creates and deletes its own
`Order` row — so no 6th `BOOKING_COMPANIES` entry was needed.

Beyond the plain company-name swap, four further real findings surfaced, each confirmed live
before fixing:

1. **A stale comment describing dead code, not a company-specific difference.** Both specs'
   "the code auto-fills the contact profile" assumption cited `applyProfile()`, which does not
   exist anywhere in the current codebase (confirmed by grep). A company-level access code for a
   company with people on file now opens a `ContactPickerPopupView` once per role with people
   (Plan-ContactRoles Chunk 7, `KnownBugs.md` #55) — nothing auto-fills until a person is picked
   or the role explicitly skipped. This would have broken against *any* company with people on
   file; it surfaced only now because `Test Company # 1` apparently had none. Fixed with a small
   pick/skip loop in both specs (`booking-enhanced` picks the contact person by name, to confirm
   the Name field; `company-nationality-tagging` declines both roles, since it fills Name itself
   regardless of who's picked).
2. **The same `exact: true` gap `KNOWN-ISSUES.md` already documents for
   `payment-amount-integrity.spec.ts`.** Tbilisi Tour Collective has a guide on file, so un-exact
   `'Phone'`/`'Email'` matches resolved to both the contact-person and "Guide — ..." fields in
   both specs. Fixed the same way.
3. **Ad-hoc hot-dish/masterclass fixture data had drifted independently of this chunk** —
   `booking-enhanced.spec.ts`'s own pre-existing comment already warned its menu/masterclass
   item names were "pinned to today's exact live data, not curated names." Confirmed live on
   `/admin/menu-items` and `/admin/masterclass` that the specific items it referenced
   (`"აჯაფასნადალი"`, a `"khinkali10₾/pc"`-shaped item) no longer exist. Repointed at current
   rows (`Badrijani nigvzit`; `Khinkali folding class` at 35₾/pp) and recalculated the total
   (635₾, not 610₾ — the full breakdown is in `KNOWN-ISSUES.md`).
4. **`company-nationality-tagging.spec.ts`'s `test.setTimeout(120_000)` was genuinely too
   tight** for its own real step count (three page objects, two tenant-setting writes, a
   dozen-plus navigations) — reproduced identically three times in a row, always completing
   every real check (toggle, picker, tagging, confirm sheet, admin filter/column, print sheet,
   toggle off then back on) and running out of budget on the final cleanup line only. Bumped to
   150s, matching the order of magnitude this suite's other multi-round-trip tests already use
   (`wine-catalogue-order`, `companies-crud`).

Also hit mid-chunk, unrelated to the fix itself: a real `P2028` connection-pool exhaustion window
and, separately, a "dev server process bloat" slowdown serious enough to justify a `.next` wipe +
restart (both already-documented `KNOWN-ISSUES.md` patterns, recognized and recovered from rather
than guessed at or worked around) — Chunk 6's own instruction to verify pool health before the
final run exists for exactly this reason.

Verified: two isolated reruns of each spec from a clean shell, all four green
(`booking-enhanced`: 1.2m, 1.3m; `company-nationality-tagging`: 1.3m, 1.4m). Also cleaned up 4
pre-existing `Playwright CRUD Test Co <timestamp>` companies left on the tenant from the
*original* investigation session (predating this one, found incidentally while repointing) and
2 debris orders this session's own failed attempts left before the timeout fix landed.

Full detail: `playwright/KNOWN-ISSUES.md` #4's table and its "Chunk 3 close-out" note.
Changed files: `saas/tests/tier2-core-flows/booking-enhanced.spec.ts`,
`saas/tests/tier2-core-flows/company-nationality-tagging.spec.ts`, `playwright/KNOWN-ISSUES.md`.

---

## Chunk 4 — Refresh the stale docs

Confirmed stale by the independent review (2026-10-01): `playwright/README.md` and
`playwright/Progress.md` both last touched 2026-09-25, still describe "17 of 18 planned
tests" and don't mention `tier4-locale` being built or any of the 5 `tier5-payment-e2e`
specs existing at all. Actual current count: 23 spec files (confirm exact test count via
`npx playwright test --list` once Chunks 0–3 land, since that count will have moved).

- [x] Update `playwright/README.md`'s "Current status" section with the real, current test
      count and tier breakdown.
- [x] Prominently document Chunk 0's `testIgnore` fix in the README's "how to run" section —
      the whole point is that a reader should no longer need the tier5 warning to be
      something they remember; make it hard to miss anyway, in case the config is ever
      changed back.
- [x] Update `playwright/Progress.md`'s Phase tracker to reflect Phase 4 (locale) and the
      tier5 Flitt E2E work as actually complete, pointing at the existing chronological
      entries lower in that file rather than rewriting history.
- [x] Do **not** touch `playwright/ARCHITECTURE.md` or `playwright/KNOWN-ISSUES.md`'s
      existing content beyond what Chunks 1–3 already require — those were not flagged as
      stale.

**Resume point:** Done.

**Result (2026-10-01):** Confirmed the real current count live rather than trusting the plan's
own "23 spec files" figure blindly: `npx playwright test --list` → 35 tests / 17 files (default,
localhost config) + `npx playwright test --config=playwright.staging.config.ts --list` → 8 tests
/ 6 files (tier5, staging config) = **43 tests across 23 files** total, confirming the plan's
estimate was exactly right.

`README.md`: replaced the stale "17 of 18 planned tests... Phase 4 not started" line with the
real count and a tier-by-tier table (files + one-line description per tier). Added a visible
callout right under the tier5 run command stating the `testIgnore` fix is enforced, not just
documented, and what to check first if the symptom it fixed ever comes back.

`Progress.md`: Phase 4 (locale integrity) was **already** accurately marked "✅ COMPLETE" in its
own section (2026-08-12) — no change needed there, the plan's framing of it as entirely
undocumented wasn't quite right by the time this chunk ran, likely just not surfaced by
README.md's own separate staleness. What was genuinely missing, exactly as the plan predicted:
tier5 had no "Phase 5" structural heading at all — its own 2026-09-24 entry literally says
"Chunk 8 is where this file gets properly folded in with a real 'Phase 5' section," and that
never happened until now. Added a `## Phase 5` section with a summary table (6 specs, 8 tests,
one line each) and pointers to the existing 2026-09-24/2026-09-25 narrative entries below it —
no history rewritten, per this chunk's own instruction.

Did not touch `ARCHITECTURE.md` or add anything to `KNOWN-ISSUES.md` beyond what Chunks 1–3
already required.

Changed files: `playwright/README.md`, `playwright/Progress.md`.

---

## Chunk 5 — Push to staging, run tier5 for real

The 4 real-payment `tier5` specs were updated 2026-09-30 for the Contact Person Name-field
merge but have **never been run** since — they only run against the deployed staging site
(`playwright.staging.config.ts`), and nothing has been pushed there since the merge landed.

- [ ] Push the `staging` branch (current commit `d03b056` plus everything from Chunks 0–4).
- [ ] Confirm the Vercel preview deploy for `staging` succeeds and `staging.vineworks.ge`
      is serving the new code (check a page that changed — the public booking form's
      Contact Person section should show the merged single Name field).
- [ ] Run all 5 `tier5-payment-e2e` specs for real against the deployed staging site:
      `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e --workers=1`
- [ ] Any failure here is high-signal — these hit Flitt's real test merchant and real
      settlement logic. Investigate fully before concluding it's unrelated noise.
- [ ] Clean up all test/debug data created on Staging Winery's dev-DB-backed tenant
      afterward, per this suite's existing test-data policy (`playwright/README.md`).

**Resume point:** not started. Blocked on Chunks 0–4 landing first — pushing broken or
half-finished work to staging before then defeats the point of staging being the safe
preview branch.

---

## Chunk 6 — The real goal: one clean, full, end-to-end run

Everything above exists to make this possible. This session never achieved it — the last
two full-suite attempts both hit genuine dev-DB connection-pool exhaustion (`P2028`,
confirmed directly in the dev server's own error log, not assumed), not code problems.

- [ ] **Before running anything:** confirm the dev DB pool is actually healthy. Poll an
      ordinary `/admin/orders` page load 2–3 times, a minute or so apart, and confirm no
      `P1001`/`P2028` in the dev server's log. Do not proceed on a loaded pool — per
      `playwright/KNOWN-ISSUES.md`, a restart does not fix this, only reduced load and time
      do, and running the suite into an already-saturated pool just reproduces the same
      false failures this whole plan exists to get past.
- [ ] Reset the onboarding-wizard tenant first (manual SQL, documented in
      `playwright/notes/10-onboarding-wizard.md`) — a required precondition, not optional.
- [ ] Run the complete tier1–4 suite, serial, from a clean shell:
      `cd saas && PLAYWRIGHT_HTML_OPEN=never npx playwright test --workers=1 --reporter=list`
- [ ] Every failure gets investigated, not dismissed as "probably load" — that exact
      assumption is what let `companies-crud.spec.ts` stay silently broken for weeks
      earlier this year. If something fails and the cause is genuinely unclear, say so
      explicitly in this file rather than guessing.
- [ ] Once genuinely clean: this is the new baseline. Record the result (test count,
      duration, date) in `playwright/Progress.md`'s chronological log, matching its existing
      entries' style.
- [ ] Report back to Max with the real number — not "should be passing now," an actual
      fresh run's actual output.

**Resume point:** not started. This is the last chunk; everything before it exists to make
this one trustworthy.

---

## Explicitly out of scope for this plan

Noted so the executing subagent doesn't feel obliged to also do these:

- Automating the onboarding-wizard tenant's manual reset (`playwright/KNOWN-ISSUES.md`
  calls this accepted, not urgent).
- The Wine Orders test-debris accumulation (no delete action exists on that screen;
  accepted, periodic-manual-sweep territory per `playwright/KNOWN-ISSUES.md`).
- Re-examining `clickUntil()`'s retry budget across the whole suite (flagged as an open
  follow-up in `Progress.md`'s 2026-09-19 entry, real but separate work).
- Anything in `KnownBugs.md` not directly blocking this suite from running cleanly.
