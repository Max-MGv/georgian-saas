---
tags: [playwright, meta]
---

# Playwright Regression Suite

Automated regression tests for the Georgian SaaS site, run after changes to verify the site still works before merging `staging` → `master`. Built with `@playwright/test` + `playwright-cli` (the CLI's plan → generate → heal workflow — see `C:\Users\Max\.claude\skills\playwright-cli\references\test-generation.md`).

## Start here

- **New to this suite?** Read this file, then `ARCHITECTURE.md`.
- **Non-technical, just want to see what a run did (report, video, sanity checks)?** `HOW-TO-CHECK-A-TEST.md`.
- **Debugging a failing test?** Check `KNOWN-ISSUES.md` first — most failures so far have matched a known, already-diagnosed pattern rather than a new regression.
- **Adding a test?** `ARCHITECTURE.md`'s "Conventions for adding a new test" section.
- **Want current status?** `Progress.md`.
- **Want the detail on one specific test?** `notes/`.

## Layout

```
playwright/
  README.md          <- this file — start here
  ARCHITECTURE.md     <- shared helpers, tenant strategy, credential policy, conventions
  KNOWN-ISSUES.md      <- standing app bugs, environmental failure patterns, accepted manual steps
  Progress.md         <- phase tracker, current pass/fail status per test
  notes/               <- one .md per test: what it checks, why, exact steps + assertions, real findings

saas/
  playwright.config.ts
  tests/               <- actual Playwright .spec.ts files, one per note in playwright/notes/
```

The actual `.spec.ts` files live in `saas/tests/`, not here — Node's module resolution needs `import { test } from '@playwright/test'` to sit somewhere under `saas/node_modules`, so a test file living outside the `saas/` tree can't resolve the import (confirmed the hard way: moving `seed.spec.ts` to a repo-root `playwright/tests/` broke `require`). Each test file's *documentation* — what it checks, why, the concrete assertions, and everything non-obvious found while building it — lives here in `playwright/notes/` instead, named to match (`saas/tests/seed.spec.ts` ↔ no note needed, it's just the shared seed; `saas/tests/tier1-regression/mobile-georgian-overflow.spec.ts` ↔ `playwright/notes/01-mobile-georgian-overflow.md`).

Test **output** (HTML report, trace files) is still redirected here via `playwright.config.ts`'s `outputDir`/`reporter` options — that's just a file path, not a module import, so it isn't subject to the same resolution constraint.

## Current status

**42 tests across 22 spec files, all tiers complete** (Phases 0–5 — regression, core flows, admin
smoke, locale integrity, and real Flitt payment E2E — confirmed current via
`npx playwright test --list` + `npx playwright test --config=playwright.staging.config.ts --list`,
2026-10-02). Every "done" state here has been independently re-verified (full-suite reruns from a
clean shell, plus direct SQL spot-checks of real tenant data), not just taken from a single run's
output. Full breakdown: `Progress.md`.

| Tier | Files | What |
|---|---|---|
| 1 — regression | 5 | recurring bug shapes (mobile/locale overflow, popover clipping, theme colors, payment-label precedence) |
| 2 — core flows | 6 | booking (simple/enhanced), wine catalogue, contact roles/nationality |
| 3 — admin smoke | 4 | login, orders, companies CRUD, onboarding wizard |
| 4 — locale integrity | 1 | EN/KA parity across 5 pages |
| 5 — real Flitt payment E2E | 5 | settlement, decline, book-later, admin-created orders, post-payment extras — **staging only, see below** |

(Plus `tests/seed.spec.ts`, a standalone smoke check not tied to a tier.)

> `tier5-payment-e2e/payment-edit-after-payment.spec.ts` was **retired 2026-10-02**
> (Plan-PlaywrightSuiteHardening Chunk 6) — its entire premise (editing a paid order's guest
> count silently repricing the total) was closed off by a later fix that locks those fields once
> paid, making the edit it tries to perform permanently impossible. Its coverage is fully
> superseded by `payment-post-payment-extras.spec.ts`'s own lock assertion. See
> `KNOWN-ISSUES.md` for the full story, kept as history rather than deleted.

## Target environment

**Localhost (`http://localhost:3000`), against the dev database.** On localhost, tenant resolution falls back to `DEFAULT_TENANT_ID`, which is Staging Winery — see `MaintenanceNotes.md` §4. This suite never runs against `master`/production or real tenant data, per `ClaudeInstructions.md` Rule 0.

Before running the suite:
1. `cd saas && npm run dev` (leave running)
2. In another terminal: `cd saas && PLAYWRIGHT_HTML_OPEN=never npx playwright test`

**One exception: `saas/tests/tier5-payment-e2e/`.** These specs run against the real deployed `https://staging.vineworks.ge` (still the dev database, never production) via a **separate config file**, `saas/playwright.staging.config.ts` — not the default `playwright.config.ts` above, and not `localhost`. Real Flitt settlements need a publicly reachable callback URL, which `localhost` can never be; running a tier5 spec with the default (localhost) config doesn't error cleanly, it hangs mid-checkout instead (see `ARCHITECTURE.md`'s "Tier 5 runs against real staging" note for the exact failure shape this produces if you get it wrong). Run tier5 specs with:
```
npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/<file>.spec.ts --workers=1
```

> ⚠️ **This is enforced, not just documented.** `playwright.config.ts` has had a `testIgnore`
> for `tests/tier5-payment-e2e/**` since Plan-PlaywrightSuiteHardening Chunk 0 (2026-10-01) —
> the default `npx playwright test` command above genuinely cannot sweep tier5 in by accident
> anymore. If a future change to that config ever drops this exclusion, the symptom comes back
> exactly as described above (a ~25s hang per tier5 test against localhost) — check
> `testIgnore` first if that happens, don't re-diagnose it from scratch.

## Test data policy (short version)

Any test that creates data cleans it up afterward, regardless of pass/fail. Tests never touch Staging Winery's pre-existing real data. There's one confirmed exception (Wine Orders has no delete action, so its test's cleanup can only mark "Cancelled") and one deliberate one (the onboarding-wizard tenant needs a reset before each run, not after — a one-click "Reset onboarding wizard tenant" button on `/super-admin/tenants` since 2026-10-02, replacing the manual SQL this note used to point at) — both explained in full in `KNOWN-ISSUES.md`, not repeated here.

## Conventions (short version)

One `.spec.ts` file per scenario, matching a `notes/NN-name.md` note. Full conventions, including how to add a new test, live in `ARCHITECTURE.md` — this file stays a map, not a rulebook.
