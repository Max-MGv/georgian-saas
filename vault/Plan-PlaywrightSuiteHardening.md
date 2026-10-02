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

- [x] Push the `staging` branch (current commit `d03b056` plus everything from Chunks 0–4).
- [x] Confirm the Vercel preview deploy for `staging` succeeds and `staging.vineworks.ge`
      is serving the new code (check a page that changed — the public booking form's
      Contact Person section should show the merged single Name field).
- [x] Run all 5 `tier5-payment-e2e` specs for real against the deployed staging site:
      `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e --workers=1`
- [x] Any failure here is high-signal — these hit Flitt's real test merchant and real
      settlement logic. Investigate fully before concluding it's unrelated noise.
- [x] Clean up all test/debug data created on Staging Winery's dev-DB-backed tenant
      afterward, per this suite's existing test-data policy (`playwright/README.md`).

**Resume point:** Done.

**Result (2026-10-01):** Each commit from Chunks 0–4 was pushed straight to `origin/staging`
as it landed (not batched at the end), so by the time this chunk started, staging already had
everything. Confirmed the deploy was current and correct two ways: `X-Vercel-Id` showed
`fra1::fra1::...` (the performance pin from `saas/vercel.json` is intact), and the public booking
form at `https://staging.vineworks.ge/` showed the single merged "Name" field, not separate
First/Last Name boxes — the real, pre-existing marker this chunk's own text named to check.

Note: it's actually **6** tier5 spec files / 8 tests, not "5," matching Chunk 0's own correction
of this plan's count.

Ran all 8 for real against the deployed site:
`npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e --workers=1`.
**6 passed clean on the first run (8.8m total)** — `payment-admin-order`, both other
`payment-approved-settlement` scenarios, `payment-declined-settlement`, and
`payment-post-payment-extras` all genuinely exercised a real Flitt settlement/decline and
verified every surface. **2 failed, investigated fully, neither dismissed as noise:**

1. **`payment-book-later.spec.ts` — real environmental drift, not a code bug.** Its very first
   assertion (`"Individual bookings toggle should be OFF at rest"`) failed: the toggle was `ON`.
   Traced this to genuine pre-existing state, not something this run caused: every OTHER tier5
   spec that touches this same toggle (`payment-approved-settlement`, `payment-declined-
   settlement`, `payment-edit-after-payment`, `payment-post-payment-extras`) reads its value
   first and restores that *same* value afterward in a `finally` — none of them can have flipped
   it to a NEW wrong state, they can only have perpetuated whatever was already there. Since
   nobody has run this tier against staging "since the merge landed" (this chunk's own opening
   line), the toggle had evidently been left `ON` by whatever ran last, weeks ago, and nothing
   since had reason to notice. Fixed by logging into `staging.vineworks.ge/admin/settings`
   directly and turning "Individual bookings" off, confirmed via a page reload (not just the
   optimistic UI flip). Re-ran `payment-book-later.spec.ts` alone afterward: **passed clean,
   33.6s.**
2. **`payment-edit-after-payment.spec.ts` — not a flake, a genuine structural conflict, left
   blocked rather than forced.** Timed out at its full 200s budget. A live DOM snapshot at the
   moment of failure showed why: its step 4 tries to edit a paid order's guest count through the
   Guest Breakdown panel, but every field in that panel — including Save — is now `[disabled]`
   ("This order is already paid..."). This spec exists to document `KnownBugs.md` #64 (editing a
   paid order silently reprices the total while `Payment.amount` stays frozen) — but
   `Plan-PostPaymentExtras` Chunk 1 **fixed** #64 by locking exactly these fields once paid,
   making the edit this spec performs permanently impossible now. The locked state is already
   correctly tested by `payment-post-payment-extras.spec.ts` (confirmed passing in the same run:
   `"Chunk 1 lock confirmed — fields disabled, edit attempt had no effect"`). Whether to retire
   this spec (fully redundant now) or rewrite it to assert the lock (duplicating the other spec)
   is a test-strategy call for Max, not something to decide unilaterally or paper over with a
   locator tweak — **left failing, documented in full in `KNOWN-ISSUES.md`, not fixed.**
   Side effect worth flagging: because the hang happens before its own `finally` block's first
   line can run (the page was already force-closed), its cleanup never fired either — a real
   Flitt-settled test order was left behind, found and deleted manually via the live admin UI.

Cleaned up afterward: the `payment-edit-after-payment` leftover order (above), confirmed no
other tier5-created debris remained (`payment-book-later`'s own successful rerun cleaned up
after itself normally). Did not touch unrelated, pre-existing debris on Staging Winery predating
this session (several `ZZPayment...`-named orders from September, out of scope for this chunk).

Changed files: `playwright/KNOWN-ISSUES.md`. (No spec files changed — both findings this chunk
produced are a live-environment state fix and a documented, deliberately-unresolved test-strategy
question, not code changes.)

---

## Chunk 6 — The real goal: one clean, full, end-to-end run

Everything above exists to make this possible. This session never achieved it — the last
two full-suite attempts both hit genuine dev-DB connection-pool exhaustion (`P2028`,
confirmed directly in the dev server's own error log, not assumed), not code problems.

- [x] **Before running anything:** confirm the dev DB pool is actually healthy. Poll an
      ordinary `/admin/orders` page load 2–3 times, a minute or so apart, and confirm no
      `P1001`/`P2028` in the dev server's log. Do not proceed on a loaded pool — per
      `playwright/KNOWN-ISSUES.md`, a restart does not fix this, only reduced load and time
      do, and running the suite into an already-saturated pool just reproduces the same
      false failures this whole plan exists to get past.
- [x] Reset the onboarding-wizard tenant first (manual SQL, documented in
      `playwright/notes/10-onboarding-wizard.md`) — a required precondition, not optional.
      Done once, earlier in this chunk's own history (2026-10-02, first pass). **Not redone**
      for the later full-suite confirmation runs in this same chunk's continuation — a safety
      check blocked writing the reset script this time (see Result). `onboarding-wizard.spec.ts`
      failed in every subsequent full run as a direct, expected consequence — needs Max to
      re-run the reset by hand before the next full run.
- [x] Run the complete tier1–4 suite, serial, from a clean shell:
      `cd saas && PLAYWRIGHT_HTML_OPEN=never npx playwright test --workers=1 --reporter=list`
- [x] Every failure gets investigated, not dismissed as "probably load" — done. All 5
      originally-handed-off failures plus 3 further real bugs found along the way each got a
      confirmed root cause, a fix, and at least one (most, two) clean isolated reruns. Full
      detail in the Result below.
- [~] Once genuinely clean: this is the new baseline. Every one of the 5 originally-handed-off
      specs, plus the further real bugs found along the way, now passes clean in isolation,
      verified twice each. **One exception, not yet at that bar:** `onboarding-wizard.spec.ts`
      — verified clean only **once** (1.2m), immediately after the reset button (below) was
      built, not rerun a second time. A single from-scratch full run showing literally 42/42
      has still **not** been done this session — every full run attempted had
      `onboarding-wizard.spec.ts` failing at its very first assertion the whole time (the
      reset blocker below wasn't resolved until after the last full run), so none of them
      represent a true all-green number. **Next session's job, see handoff note at the very
      bottom of this file.**
- [x] Report back to Max with the real number — not "should be passing now," an actual
      fresh run's actual output.

**Resume point:** Done. See the 2026-10-02 (continued) Result below for the full close-out —
every one of the 5 handed-off failures got a confirmed root cause and a verified fix, and two
further real bugs surfaced and got fixed along the way. The cold-compile theory this plan asked
to confirm or falsify was **falsified**: none of the 5 were cold-compile artifacts.

**Result (2026-10-02):** Pool-health check passed clean (two spaced `/admin/orders` loads,
no `P1001`/`P2028`). Onboarding tenant reset via the documented SQL. First full-suite attempt
after that (35 tests) came back in a much worse state than expected — nearly every test
timing out or hanging, no `P2028` in the server log ruling out pool exhaustion as the cause.
Investigated directly rather than assumed: a raw `curl` to `/admin/login` returned a genuine
**404**, same Turbopack dev-cache-corruption pattern documented in `KNOWN-ISSUES.md` and hit
twice already this week on two *different* routes — this is now a **third** confirmed
instance, on a third route, strongly suggesting this corruption is a real, recurring risk for
this dev setup rather than a one-off. Fixed the same way: `rm -rf .next` + restart, confirmed
live via `curl` that `/admin/login`'s real HTML (not a 404 shell) came back, then confirmed
the originally-failing test passed clean in isolation (34.2s) before re-running the full
suite.

**Second full-suite attempt, post-cache-fix: 29/35 passed, 5 failed, 1 did-not-run
(cascaded).** Real, measurable progress over the pre-fix attempt — both of Chunks 1–2's
fixed specs (`companies-crud`, and the first half of `wine-catalogue-order`'s flow) passed
clean this time, confirming those fixes hold under a genuine full-suite run, not just in
isolation. The 5 that still failed:
`payment-amount-integrity.spec.ts` (individual, line 140), `booking-simple.spec.ts`,
`contact-orphan-safety.spec.ts`, `wine-catalogue-order.spec.ts` (a **different**, later
assertion than Chunk 1 fixed — line 220's `.locator('../../..')`, not the `.last()` bug),
and `admin-orders.spec.ts`.

**Investigated, not just logged:** checked whether a hypothesis — that
`payment-amount-integrity`'s crash (`Test timeout of 120000ms exceeded`, "Target page,
context or browser has been closed" while mid-way through toggling a settings page) left
Staging Winery's payment settings in a dirty, non-default state that then broke the two
tests after it — held up. It didn't: queried the tenant's actual `Setting` rows directly,
and none of the three payment-toggle keys have a row at all (meaning they're on their
untouched defaults), ruling out state pollution as the shared cause. Also manually drove
`/admin/orders/new` live (login, load the form) to rule out a broad regression in order
creation — it rendered correctly, no console errors, no sign of a broken page. Checked
outbound network reachability to `pay.flitt.com` directly (`curl`, 0.45s round trip, no
connectivity problem) to rule out a sandboxed-environment network block as the cause of the
Flitt-redirect test's hang.

**Honest state at the handoff point: the specific cause of these 5 remaining failures was not
yet confirmed.** The leading hypothesis then was cold-compile-cost stacking. A fresh session
picked this up to settle it properly.

---

**Result, continued (2026-10-02, fresh session — the actual close-out):** Reran all 5 in
isolation against the already-warmed server. **2 of 5 passed clean immediately**
(`contact-orphan-safety.spec.ts`, `wine-catalogue-order.spec.ts`) — the cold-compile theory
held for exactly these two. **The other 3 failed again in isolation**, falsifying cold-compile
as a blanket explanation. Each got a real, live-reproduced root cause:

1. **`admin-orders.spec.ts`** — the Table view's re-render after switching away from Calendar
   genuinely takes ~5s on this dev setup (timed directly in a live browser, via real network
   requests, with no other load running) — right at the edge of the test's unqualified 5000ms
   `toBeVisible()` default. Not a bug in the transition itself (the data was always correct once
   it rendered) — fixed by giving that one assertion an explicit 15s budget, matching this file's
   own convention a few lines up, and bumping the test's own `test.setTimeout` 60s→90s to match.
   Verified: two clean isolated reruns.
2. **`payment-amount-integrity.spec.ts`'s Individual scenario** — a `--trace=on` rerun showed no
   single stuck step; every `page.goto()` in the real flow (login, settings, public form, admin
   verification) measured 2–9 seconds each, not milliseconds, and the cumulative total ran past
   the test's 120s budget with the test still correctly mid-flow. Bumped to 180s. A direct
   consequence, caught only by checking: because this test's own `finally` never got to run
   before the old 120s cutoff, it left the dev tenant's `paymentEnabledIndividuals` column stuck
   `false` — which is exactly what then broke `booking-simple.spec.ts` (see below). Verified:
   two clean isolated reruns (1.9m, 2.1m).
3. **`booking-simple.spec.ts`** — not a bug in its own code at all. It hardcodes an assumption
   that `paymentEnabledIndividuals` is `true` (never sets it itself), and the column had been
   left `false` by #2's interrupted `finally`. Fixed by restoring the toggle (confirmed via a
   direct `Tenant` table read, not just the admin UI, after a first attempt that looked like it
   saved but hadn't — see `KNOWN-ISSUES.md`'s new toggle-cascade section). Separately, a later
   clean rerun still timed out once with no stuck locator — the error snapshot showed the flow
   had already reached a genuine `pay.flitt.com` redirect, i.e. the mechanism itself worked; it
   just ran past its own 90s budget during admin cleanup. Bumped to 120s, same reasoning as the
   other two. Verified: two clean isolated reruns after both fixes (1.1m, and a prior 1.9m/1.3m
   pair).

**Two further real bugs surfaced investigating the above, neither part of the original 5, both
fixed and verified:**

4. **This session's own mistake, caught before it shipped:** assumed all three payment-section
   toggles should match the Prisma schema's `@default(true)` and flipped `paymentEnabledCompanies`
   to `true` alongside the real fix to `paymentEnabledIndividuals`. Wrong — Staging Winery has a
   **deliberate, documented override to `false`** on that one specifically
   (`booking-enhanced.spec.ts`'s own comment: "backfilled false by #148"), which the schema
   default doesn't capture. Caught because `booking-enhanced.spec.ts` and
   `company-nationality-tagging.spec.ts` (both depending on it reading `false`) failed
   immediately after. Reverted, confirmed via direct `Tenant` column reads this time rather than
   the admin UI alone. Full detail, including why this matters for anyone touching these toggles
   again: `KNOWN-ISSUES.md`'s new "Shared tenant payment-toggle state can cascade" section.
5. **`payment-amount-integrity.spec.ts`'s Company-booking scenario never handled the
   ContactPickerPopupView** that now appears for Caucasus Vine Travel (which has picked up a
   guide and a contact person since this spec was written) — the same gap Chunk 3 already found
   and fixed for a different company in `booking-enhanced.spec.ts`. Symptom looked different from
   Chunk 3's (a `fixed inset-0 z-50` overlay intercepting the final submit click, not a stuck
   `fill()`) because the picker here blocks only the click, not the preceding fills — fixed with
   the same decline-loop pattern. Full trace-level detail: `KNOWN-ISSUES.md` entry 5.

**A third, broader environmental finding, not a code bug:** a subsequent full-suite run (meant
to be the final clean confirmation) came back with a fresh wave of unrelated-looking failures —
`companies-crud.spec.ts`, `payment-label-precedence.spec.ts`, `locale-integrity.spec.ts`'s admin
cases, plus `net::ERR_ABORTED` at several routes. Investigated rather than assumed: this
session's own ~90 minutes of continuous heavy testing had re-bloated the dev server process to
**1.27–1.37GB resident** (confirmed via direct `Win32_Process` inspection, not guessed) — the
exact "dev server process bloat" pattern `KNOWN-ISSUES.md` already documents, just re-triggered
by this investigation's own load rather than a prior session's. Restarted fresh
(`Stop-Process` + `rm -rf .next` + `npm run dev`); every one of those specs passed clean on the
very next run with zero code changes, confirming the diagnosis. The same restart surfaced the
toggle-cascade issue above a second time (`payment-label-precedence.spec.ts`'s own interrupted
run, caught mid-bloat, left both toggles flipped) — fixed the same way, verified via direct
`Tenant` reads.

**Not done initially, then closed out the same session once Max asked:**
- The onboarding-wizard tenant reset (`playwright/notes/10-onboarding-wizard.md`'s documented
  SQL) could not be run directly — a safety check blocked writing a script with several
  `deleteMany` calls, even though it is the exact, already-approved, previously-run reset query
  from that note. `onboarding-wizard.spec.ts` failed in every full-suite run this session as a
  direct, expected consequence (the gate it checks was already satisfied from a prior run), not
  a new finding. **Resolved the same session:** Max asked whether a super-admin UI button
  existed for this (there wasn't one — checked, the existing "Reset demo now" button is
  hard-scoped to a different tenant and refuses anything else) and asked for one to be built.
  Added `lib/onboardingWizardReset.ts` + `app/actions/onboardingWizardReset.ts` +
  `app/super-admin/tenants/ResetOnboardingWizardCard.tsx`, mirroring the existing demo/staging
  reset cards exactly (slug-scoped, two-step confirm, refuses on the wrong database). Verified
  live: clicked it on `/super-admin/tenants`, got a real result
  ("deleted 1 price tiers, 1 companies, 1 wines and 6 settings"), then reran
  `onboarding-wizard.spec.ts` — passed clean. This is now the documented way to do this reset;
  the manual SQL stays in the notes file for reference only.
- Two unrelated, pre-existing uncommitted changes were found sitting in the working tree at
  session start (`OrdersFilters.tsx`/`page.tsx`, dated 2026-09-30, and `vault/max.md` /
  `vault/x note.md`, dated 2026-09-25) — left untouched and uncommitted, not part of this
  plan's work. Flagged to Max separately.
- `payment-edit-after-payment.spec.ts` (tier5) had been left deliberately failing since Chunk 5,
  pending a retire-or-rewrite call (see `KNOWN-ISSUES.md`'s entry on it). Max's answer: **retire
  it.** Spec file deleted; `playwright/notes/17-payment-edit-after-payment.md` kept with a
  retirement banner rather than deleted outright (it documents a real, since-fixed bug);
  `README.md`/`Progress.md` counts updated (43→42 tests, 23→22 files, tier5 6→5 files/8→7 tests).

**Changed files:** `saas/tests/tier3-admin-smoke/admin-orders.spec.ts`,
`saas/tests/tier1-regression/payment-amount-integrity.spec.ts`,
`saas/tests/tier2-core-flows/booking-simple.spec.ts`,
`saas/tests/tier1-regression/mobile-georgian-overflow.spec.ts` (the tight-30s-default finding
below), `playwright/KNOWN-ISSUES.md`, `playwright/README.md`, `playwright/Progress.md`,
`playwright/notes/17-payment-edit-after-payment.md`; deleted
`saas/tests/tier5-payment-e2e/payment-edit-after-payment.spec.ts`; new:
`saas/lib/onboardingWizardReset.ts`, `saas/app/actions/onboardingWizardReset.ts`,
`saas/app/super-admin/tenants/ResetOnboardingWizardCard.tsx`, with
`saas/app/super-admin/tenants/page.tsx` wired to render it.

**One more, independent finding caught during the final full-suite pass, same shape as the
above:** `mobile-georgian-overflow.spec.ts`'s two admin-page tests had no explicit
`test.setTimeout` at all, running on Playwright's bare 30s global default — far too tight for
their real sequence (login's own Supabase Auth round trip, a settings-page goto, a
language-toggle click + POST wait, and a final goto, each costing multiple seconds here).
Reproduced live, consistently, in isolation: the final `goto()` genuinely gets aborted
(`net::ERR_ABORTED`) when Playwright force-tears-down the page at the 30s deadline mid-flight.
Bumped both to 60s. Verified: two clean isolated reruns of the full file.

**Final state:** every one of the originally-handed-off 5 failures, plus 3 further real bugs
this investigation surfaced along the way, now has a confirmed root cause, a verified fix, and
at least one clean isolated rerun (most have two). The suite itself is sound. The onboarding-
wizard reset is now one click, not a manual query to go find, and `payment-edit-after-payment.spec.ts`
is retired, not a pending decision anymore.

**Two things genuinely still open, not done this session — see the handoff note immediately
below:** `onboarding-wizard.spec.ts` has only ever been run clean **once**, not the two this
plan's own ground rule calls for everywhere else; and a literal from-scratch full-suite run
showing every test green has never actually happened — every full run attempted this session
had this spec failing at its first assertion throughout, because the reset button didn't exist
yet when the last one ran.

---

## Handoff — next session's job (written 2026-10-02, after the reset button landed)

Everything above is done and pushed to `staging` (`e23c83a` and before). Two small, well-scoped
things are left, both just verification — no new investigation expected, no known unknowns:

1. **Rerun `onboarding-wizard.spec.ts` twice more, clean**, to bring it up to this plan's own
   bar (everything else in this chunk has two clean isolated reruns; this one only has one).
   Click "Reset onboarding wizard tenant" on `/super-admin/tenants` first each time (required
   precondition, not optional — the test's own first assertion depends on it). Then:
   `cd saas && npx playwright test --workers=1 --reporter=list tests/tier3-admin-smoke/onboarding-wizard.spec.ts`
2. **One genuine full-suite run with a literal all-green number.** Reset the onboarding tenant
   first (same button), confirm dev-server/pool health
   (`vault/ClaudeInstructions.md`/`KNOWN-ISSUES.md` have the checklist — a couple of spaced
   `/admin/orders` loads, no `P1001`/`P2028`), then:
   `cd saas && PLAYWRIGHT_HTML_OPEN=never npx playwright test --workers=1 --reporter=list`
   Expect **42/42**. If anything fails, don't assume it's environmental — this session hit real,
   confirmed bugs behind several failures that looked environmental at first glance (see
   `KNOWN-ISSUES.md`'s "Shared tenant payment-toggle state can cascade" section especially).
   Reproduce live before concluding it's just load or bloat.

Once both are clean: update this chunk's checklist (the `[~]` above → `[x]`), record the real
number in `playwright/Progress.md`'s chronological log matching its existing entries' style, and
this plan is genuinely, fully closed — not before.

## Explicitly out of scope for this plan

Noted so the executing subagent doesn't feel obliged to also do these:

- ~~Automating the onboarding-wizard tenant's manual reset~~ — done anyway, 2026-10-02,
  once a session got blocked trying to run the manual SQL directly and Max asked for a button.
  See Chunk 6's close-out below.
- The Wine Orders test-debris accumulation (no delete action exists on that screen;
  accepted, periodic-manual-sweep territory per `playwright/KNOWN-ISSUES.md`).
- Re-examining `clickUntil()`'s retry budget across the whole suite (flagged as an open
  follow-up in `Progress.md`'s 2026-09-19 entry, real but separate work).
- Anything in `KnownBugs.md` not directly blocking this suite from running cleanly.
