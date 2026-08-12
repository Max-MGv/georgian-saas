---
tags: [playwright, meta]
---

# Playwright Regression Suite

Automated regression tests for the Georgian SaaS site, run after changes to verify the site still works before merging `staging` → `master`. Built with `@playwright/test` + `playwright-cli` (the CLI's plan → generate → heal workflow — see `C:\Users\Max\.claude\skills\playwright-cli\references\test-generation.md`).

## Start here

- **New to this suite?** Read this file, then `ARCHITECTURE.md`.
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

**17 of 18 planned tests built and passing** (Phases 0–3 complete; Phase 4 — locale integrity, 1 test — not started). Every "done" state here has been independently re-verified (full-suite reruns from a clean shell, plus direct SQL spot-checks of real tenant data), not just taken from a single run's output. Full breakdown: `Progress.md`.

## Target environment

**Localhost (`http://localhost:3000`), against the dev database.** On localhost, tenant resolution falls back to `DEFAULT_TENANT_ID`, which is Staging Winery — see `MaintenanceNotes.md` §4. This suite never runs against `master`/production or real tenant data, per `ClaudeInstructions.md` Rule 0.

Before running the suite:
1. `cd saas && npm run dev` (leave running)
2. In another terminal: `cd saas && PLAYWRIGHT_HTML_OPEN=never npx playwright test`

## Test data policy (short version)

Any test that creates data cleans it up afterward, regardless of pass/fail. Tests never touch Staging Winery's pre-existing real data. There's one confirmed exception (Wine Orders has no delete action, so its test's cleanup can only mark "Cancelled") and one deliberate one (the onboarding-wizard tenant needs a manual reset before each run, not after) — both explained in full in `KNOWN-ISSUES.md`, not repeated here.

## Conventions (short version)

One `.spec.ts` file per scenario, matching a `notes/NN-name.md` note. Full conventions, including how to add a new test, live in `ARCHITECTURE.md` — this file stays a map, not a rulebook.
