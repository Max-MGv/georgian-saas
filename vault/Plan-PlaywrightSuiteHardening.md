---
tags: [plan, playwright, testing]
---

# Plan — Playwright Suite Hardening

**Status: 🚧 Not started.** Written 2026-10-01 after a session that ran the full suite for
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

## Chunk 0 — Close the tier5 safety gap (do this first, it's small and high-value)

`saas/playwright.config.ts` has no exclusion for `tests/tier5-payment-e2e/`. The suite's own
documented default command (`playwright/README.md`: `cd saas && npx playwright test`) will
currently sweep those 5 real-Flitt-payment specs in and run them against `localhost` — which
`playwright/ARCHITECTURE.md`'s own "Tier 5 runs against real staging" note says doesn't fail
cleanly, it hangs for ~25s per test waiting on a settlement callback `localhost` can never
receive. Nothing enforces the documented workaround (`--config=playwright.staging.config.ts`,
tier5 only) except a human remembering it.

- [ ] Add a `testIgnore` (or equivalent) to the default `playwright.config.ts` excluding
      `tests/tier5-payment-e2e/**`.
- [ ] Verify: `npx playwright test --list` from `saas/` no longer lists any tier5 spec.
- [ ] Verify the existing documented tier5 invocation still works unchanged:
      `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/<file>.spec.ts --list`
      should still list that file's tests normally.
- [ ] Confirm this doesn't silently break `npm run test` or any CI-adjacent script if one
      exists (grep `package.json` for a `test` script before assuming there isn't one).

**Resume point:** not started.

---

## Chunk 1 — Root-cause and fix: wine-catalogue-order's "Restore without payment" click

**Symptom, reproduced twice already** (`playwright/KNOWN-ISSUES.md`, 2026-09-30 entry):
after `wine-catalogue-order.spec.ts` correctly finds its abandoned order on the Wine Orders
tab of `/admin/abandoned`, clicking its "Restore without payment" button times out —
Playwright's own trace shows `<div class="fixed inset-0 z-50 ...">` intercepting the click,
repeatedly, for the full 120s budget. Reproduced once mid-session and once again right after
a clean dev-server restart, which argues against pure load noise but was never confirmed
either way.

- [ ] Reproduce live, by hand, in a browser: get a real wine order onto `/admin/abandoned`
      (either drive the real public checkout flow once, or use an existing abandoned row if
      one is already on Staging Winery), click "Restore without payment", and watch what
      actually happens. Does a modal/backdrop genuinely stay mounted after an action that
      should dismiss it? Does the click fire but something else (a toast, a re-render) throw
      an overlay back up a beat later? Check the DOM directly (`document.elementFromPoint()`
      at the button's own coordinates, same technique `KnownBugs.md` #62 used) rather than
      guessing from the error message alone.
- [ ] Determine: is this a real app bug (a backdrop not clearing — in which case it's a
      `KnownBugs.md`-worthy finding, fix the app) or a test problem (the test's own locator
      resolving to something stale, or not waiting for an animation/transition to finish —
      in which case fix the spec, and say why in a comment, matching this file's existing
      style of documenting real findings inline).
- [ ] Fix whichever it turns out to be.
- [ ] Verify: rerun `wine-catalogue-order.spec.ts` in isolation, serial, **twice in a row**
      from a clean state (not back-to-back reusing debris from the first run — clean up
      between runs). Both must pass. A single green run is not enough given this already
      looked intermittently different across two attempts.
- [ ] Update `playwright/KNOWN-ISSUES.md`: move this out of "not yet resolved" into either
      the standing-app-bugs section (if it was real) or the test note and commit history.

**Resume point:** not started.

---

## Chunk 2 — Root-cause and fix: companies-crud's unexplained navigation

**Symptom** (`playwright/KNOWN-ISSUES.md`, 2026-09-30 entry): after the Edit panel opens on
`companies-crud.spec.ts`'s test company, the test hangs its full 120s waiting on a form
field inside that panel — but Playwright's own trace shows navigation between
`/admin/orders` and `/admin/companies` happening in that window, which should not be
possible once the Edit panel is already open and the test isn't calling `page.goto()` again.

- [ ] Reproduce live: run the spec with tracing/video on (already configured — `video:
      'retain-on-failure'` in `playwright.config.ts`), or drive the exact same sequence by
      hand in a browser (create a test company, open its Edit panel, watch network/console).
      Look for: a client-side redirect firing from somewhere unexpected, a stale `router`
      reference from an earlier step in the test re-triggering, or a genuinely different
      bug than it first looks like (the two "real findings" pattern from today's session —
      companies-crud's `xpath` fix revealed a second problem once the first was out of the
      way; this could be the same shape).
- [ ] Determine real vs. test cause, same bar as Chunk 1.
- [ ] Fix whichever it is.
- [ ] Verify: isolated rerun, twice in a row, clean state each time.
- [ ] Update `playwright/KNOWN-ISSUES.md` to match.

**Resume point:** not started.

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

- [ ] Read both `booking-enhanced.spec.ts` and `company-nationality-tagging.spec.ts` in full
      to confirm neither one mutates company-level data (guides, prices, access codes) in a
      way that would collide if they shared one company — they likely don't (both just
      submit a booking and clean up their own order), but confirm rather than assume, the
      same way `contact-orphan-safety.spec.ts`'s header comment explains *why* it needed a
      company with existing Guide/Contact Person rows specifically.
- [ ] If sharing `Tbilisi Tour Collective` is safe: repoint both specs to it.
- [ ] If not safe: add a 6th booking company to `lib/demoSeed.ts`'s `BOOKING_COMPANIES`
      (matching the existing entries' shape — name, contact, a contact_person row with a
      code) and apply it via `saas/scripts/backfill-test-fixtures.ts` the same additive way
      the 2026-09-19 session did (**not** a full reseed — that deletes every order on the
      tenant).
- [ ] Update each spec's `COMPANY_NAME`/`COMPANY_CODE` constants and any hardcoded
      rate/tier numbers that were specific to the old `Test Company # 1` fixture (check for
      assertions on specific ₾ amounts tied to that company's old price tiers).
- [ ] Verify: isolated rerun of both specs, clean state.
- [ ] Update `playwright/KNOWN-ISSUES.md` #4's table — this closes the last two open rows.

**Resume point:** not started.

---

## Chunk 4 — Refresh the stale docs

Confirmed stale by the independent review (2026-10-01): `playwright/README.md` and
`playwright/Progress.md` both last touched 2026-09-25, still describe "17 of 18 planned
tests" and don't mention `tier4-locale` being built or any of the 5 `tier5-payment-e2e`
specs existing at all. Actual current count: 23 spec files (confirm exact test count via
`npx playwright test --list` once Chunks 0–3 land, since that count will have moved).

- [ ] Update `playwright/README.md`'s "Current status" section with the real, current test
      count and tier breakdown.
- [ ] Prominently document Chunk 0's `testIgnore` fix in the README's "how to run" section —
      the whole point is that a reader should no longer need the tier5 warning to be
      something they remember; make it hard to miss anyway, in case the config is ever
      changed back.
- [ ] Update `playwright/Progress.md`'s Phase tracker to reflect Phase 4 (locale) and the
      tier5 Flitt E2E work as actually complete, pointing at the existing chronological
      entries lower in that file rather than rewriting history.
- [ ] Do **not** touch `playwright/ARCHITECTURE.md` or `playwright/KNOWN-ISSUES.md`'s
      existing content beyond what Chunks 1–3 already require — those were not flagged as
      stale.

**Resume point:** not started.

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
