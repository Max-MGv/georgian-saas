---
tags: [playwright, tracking]
---

# Playwright Regression Suite — Progress

Source proposal: chat session 2026-08-10. Test env: **localhost:3000** (dev DB, resolves to Staging Winery via `DEFAULT_TENANT_ID`). Never targets `master`/production, per [[ClaudeInstructions]] Rule 0.

Status values match `FeatureLog.md` convention: ✅ Done / 🚧 In progress / ❌ Broken / ⬜ Not started.

This file is the chronological record — what was built, when, and what was found along the way. For the *current-state* reference views instead: shared helpers and conventions live in `ARCHITECTURE.md`; standing app bugs, environmental failure patterns, and recurring manual steps live in `KNOWN-ISSUES.md` (most of the "real findings" narrative below is also indexed there, organized by symptom rather than by when it happened).

---

## Phase 0 — Setup

| Item | Status |
|---|---|
| `playwright/` folder scaffolded (notes/) | ✅ |
| Playwright bootstrapped in `saas/` (`@playwright/test`, config, chromium browser) | ✅ |
| `playwright.config.ts` — `testDir: './tests'` (`saas/tests/`, required for Node module resolution — see README), `outputDir`/`reporter` redirected to `playwright/` | ✅ |
| Seed test (`saas/tests/seed.spec.ts`) — navigates to `/`, confirms it loads | ✅ — `1 passed` |
| **Found + fixed:** `saas/.env`'s `DEFAULT_TENANT_ID` was still pointed at the "Test Onboarding Wizard" tenant from the 2026-08-07 session (left un-reverted). Switched back to Staging Winery (`cmrxb85wo0000vlc0d964nzf8`) per `MigrationNotes.md`, confirmed live (`Nikalas Marani (Staging)` title renders). | ✅ |

## Phase 1 — Tier 1: Regression suite (recurring bug shapes) — ✅ COMPLETE (8/8 tests passing)

| # | Test | Note | Status |
|---|---|---|---|
| 1 | Mobile + Georgian overflow (parametrized) | [01-mobile-georgian-overflow.md](notes/01-mobile-georgian-overflow.md) | ✅ — 4/4 passing |
| 2 | Popover/dropdown clipping | [02-popover-clipping.md](notes/02-popover-clipping.md) | ✅ — 2/2 passing |
| 3 | Theme-aware status colors | [03-theme-colors.md](notes/03-theme-colors.md) | ✅ — 2/2 passing (scope changed — see note: found a real 5-minute tenant-cache staleness gap in `proxy.ts`, documented in `MigrationNotes.md`) |

**Shared infrastructure built during test 1** (reused by all later tests, see `saas/tests/helpers/`):
- `helpers/credentials.ts` — reads `credentials.txt` directly at runtime, never copies secrets into any other file (per the `credentials` skill's explicit rule). Two accessors: `getTenantAdminCredentials()`, `getSuperAdminCredentials()`.
- `helpers/auth.ts` — `loginAsTenantAdmin(page)` / `loginAsSuperAdmin(page)`.
- `helpers/locale.ts` — `setSiteLanguage(page, lang)` (public nav, mobile-menu-aware), `setAdminPanelLanguage(page, lang)` (waits for the actual `POST /admin/settings` to resolve, not just the click — see finding below).
- `helpers/theme.ts` — `setTenantTheme(page, presetName)` (super-admin tenant theme editor, one login reused per test — see finding #3 below for why), `gotoWithFreshTheme(page, url)`.

**Three real bugs/gaps found in the app and test infrastructure, all fixed or documented:**
1. **`saas/.env`'s `DEFAULT_TENANT_ID` was stale** — still pointed at "Test Onboarding Wizard" from the 2026-08-07 session instead of Staging Winery. Fixed (see Phase 0 row above). Would have made every test in this suite run against the wrong tenant silently.
2. **Admin-language toggle race condition** — clicking the en/ka toggle updates the button's `[active]` state optimistically before the underlying `POST /admin/settings` resolves. A cleanup click in `afterEach` right before a test ends can get cancelled mid-flight, leaving Staging Winery's *real* admin panel language stuck on Georgian for whoever loads it next. Fixed by having `setAdminPanelLanguage()` wait for the actual response, not just the click. Confirmed live: without the fix, a failed test's cleanup left the tenant genuinely stuck in Georgian.
3. **`saas/proxy.ts`'s tenant cache is wider and staler than documented** — caches the entire resolved tenant record (theme, module flags, logo, etc.), not just `domain → tenantId`, with a 5-minute TTL that a super-admin save does not invalidate. A tenant's theme change via super-admin genuinely doesn't show on the public site for up to 5 minutes. Not a test bug — a real, previously-undocumented app behavior, now written up in `MigrationNotes.md`'s "In-memory cache" section. Full story in `playwright/notes/03-theme-colors.md`. Also caused a live incident during testing: a run that timed out mid-cycle left Staging Winery's real theme stuck on a dark preset, caught and fixed manually each time it happened.

**Later update (during Phase 2 work):** `helpers/auth.ts`'s post-login `toHaveURL` timeout — built here as 15s — needed bumping to 25s after a Phase 1 test (`mobile-georgian-overflow.spec.ts`'s admin-orders case) failed on it under sustained DB load. Full incident writeup in the Phase 2 section below, since that's where it was diagnosed.

## Phase 2 — Tier 2: Core customer flows — ✅ COMPLETE (3/3 tests passing, full suite reconfirmed 14/14 green)

| # | Test | Note | Status |
|---|---|---|---|
| 4 | Booking form — simple variant | [04-booking-simple.md](notes/04-booking-simple.md) | ✅ — 1/1 passing |
| 5 | Booking form — enhanced/company variant | [05-booking-enhanced.md](notes/05-booking-enhanced.md) | ✅ — 1/1 passing |
| 6 | Wine catalogue → order | [06-wine-catalogue-order.md](notes/06-wine-catalogue-order.md) | ✅ — 1/1 passing |

**Real findings, all written up in their own notes:** individual bookings and wine orders redirect to the real Flitt payment gateway rather than showing an inline confirmation (order is created server-side before the redirect, so verification never needs to touch the payment form); company bookings never take online payment and show an inline "Booking received!" instead; the enhanced booking form's "no rate for this guest count" alert doesn't exist at all (by design — `findTier()` always falls back to the highest-priced tier); Wine Orders admin has no delete action, only status transitions; the admin Companies list's Edit-button click has a real intermittent timing race (mitigated with a bounded retry in the test, worth a closer look separately).

**Correction to an earlier version of this entry:** a first full-suite run was reported here as "14/14, zero regressions" before that run had actually been checked against real output — it hadn't finished. A second, independently-run full suite then genuinely came back 12/14, exposing two real issues (both since fixed and reconfirmed green in a third full run, 14/14):
1. **A real bug in `booking-simple.spec.ts` itself** (not infra): the past-hour time-slot check assumed at least one bookable slot always remains "today" and ran `parseInt()` on every option unconditionally. Once the clock passes the last slot (18:00), `BookingForm.tsx` shows a single "No slots available today" option instead — `parseInt()` on that is `NaN`, and `expect(NaN).toBeGreaterThan(x)` is unconditionally `false`, failing for a time-of-day reason unrelated to any real regression. Fixed to branch explicitly on both states. Full writeup: `notes/04-booking-simple.md`.
2. **A missed timeout bump, also in `booking-simple.spec.ts`:** the order-detail-page navigation check was left on the 5s default while every other navigation check in the same file had already been bumped to 15s for cold-compile reasons — a plain oversight (that route's first compile in a fresh dev server takes 8–10s on its own). Fixed to match.
3. **`saas/tests/helpers/auth.ts`'s 15s post-login timeout also needed bumping to 25s** — under load, landing after login is a two-hop redirect (`LoginForm.tsx`'s client-side `router.push('/admin')`, then `app/admin/(panel)/page.tsx`'s server-side `redirect('/admin/orders')`), and 15s wasn't always enough. This is shared infra used by every phase, not Phase-2-specific — a `mobile-georgian-overflow.spec.ts` (Phase 1) run failed on exactly this before the fix.

**Session-level infra incident (not a test bug, not fully "fixed," just recovered from):** sustained heavy Playwright usage across this whole session — combined test volume from more than one session running against the same local dev DB — degraded the Supabase dev project's connection pool badly enough that a *brand-new* dev-server process immediately threw `PrismaClientKnownRequestError P1001` ("Can't reach database server") and `P2028` ("Transaction already closed" / "Unable to start a transaction in the given time") straight from the pooler, on ordinary `/admin/*` page loads. This is `KnownBugs.md` #4's exact failure shape, just triggered by test-run volume instead of hot-reload churn — the fix isn't code, it's load: recovery only happened after several minutes of genuinely reduced traffic (confirmed by polling `/admin/orders` response health and `pg_stat_activity`'s idle-connection count every 30s until two consecutive clean reads, not by restarting the server alone — a restart while the pool was still saturated reproduced the same errors immediately on the first request). Separately, a `Stop-Process -Force` kill of the dev server once corrupted the `.next` Turbopack dev cache (`/admin/login` started returning 404 until `.next` was deleted and the server restarted clean). If a future suite run starts seeing `P1001`/`P2028` or admin-page hangs: stop running tests, wait for the pool to drain (there's no way to force-terminate connections from a test session — `pg_terminate_backend` is correctly blocked as a destructive action), and confirm recovery with a real page load before resuming, not just a server restart.

## Phase 3 — Tier 3: Admin panel smoke — ✅ COMPLETE (4/4 tests passing, full suite reconfirmed 17/17 green)

| # | Test | Note | Status |
|---|---|---|---|
| 7 | Admin login | [07-admin-login.md](notes/07-admin-login.md) | ✅ — 2/2 passing (built ahead of schedule, as shared login infra for Phase 1) |
| 8 | Orders admin (filters, view toggle) | [08-admin-orders.md](notes/08-admin-orders.md) | ✅ — 1/1 passing |
| 9 | Companies CRUD | [09-companies-crud.md](notes/09-companies-crud.md) | ✅ — 1/1 passing |
| 10 | Onboarding wizard walkthrough | [10-onboarding-wizard.md](notes/10-onboarding-wizard.md) | ✅ — 1/1 passing. Runs against a second tenant ("Test Onboarding Wizard") via its own domain, not `DEFAULT_TENANT_ID` — needs a manual tenant reset before each run (see its note); does not clean up after itself. |

**Real findings, full detail in each test's own note:**
- **08-admin-orders:** a date-range filter debounce race lost the first field's value when filled back-to-back with no wait; the order-creation date field could be silently reset by a hydration commit that completed *after* the fill on a freshly-compiled route (fixed by re-filling it last, right before submit); Calendar view always opens on the real current month regardless of the active date filter.
- **09-companies-crud:** the big one — a real, standing app bug on `/admin/companies`. `CompaniesClient.tsx` nests a `<button>` (the `HelpHint` "?" trigger) inside another `<button>` (the row summary button), which is invalid HTML and causes a hydration mismatch on every page load. This made React periodically discard/rebuild DOM subtrees client-side, which cost three separate clicks their effect across repeated runs (row expand, tab toggle, and the "+ Add Booking Company" button itself) — not one flaky element, a property of the page. Fixed in the test with a `clickUntil()` retry-with-verification helper applied to every meaningful click. While diagnosing this manually via `playwright-cli`, a cached element reference from before one such rebuild pointed at the wrong row after it, and briefly overwrote real shared-tenant data on "Cookie Company" (caught via the actual POST body, reverted via direct SQL, confirmed restored — full incident in the note). Also found: the "⚠ Needs details" badge needs ID code *and* contact info *and* a price tier together, not just the ID code as originally assumed; the price-tier spinbuttons have no accessible name (positional targeting only); and the page's "N booking · M wine orders" header count is server-rendered and lags the row list's instant client-state update, so it must be polled rather than read once. The nested-button bug itself is flagged as a real app bug worth a dedicated fix, separate from this test suite.
- **10-onboarding-wizard:** the only test in the suite that talks to a tenant other than Staging Winery. Investigated a super-admin "view as tenant" mechanism first (per the task's own instruction) — none exists; a super-admin bypasses the tenant-lock *auth* redirect on `/admin/*` but the tenant whose *data* renders is still resolved purely from the request's Host header. Used a real mechanism the app already has instead: `proxy.ts` resolves any non-localhost Host by its `domain` column, and the "Test Onboarding Wizard" tenant already has `test-onboarding-wizard.invalid` set. The spec file scopes a Chromium `--host-resolver-rules` flag and a custom `baseURL` to just itself via `test.use()` — no OS hosts-file edit, no env var, no `DEFAULT_TENANT_ID` touch, no dev-server restart for that part, zero effect on any other test. One real app-config change *was* needed and did need a restart: Next.js's dev-server cross-origin protection (`allowedDevOrigins`) was silently blocking the post-login redirect on the custom domain, which looked exactly like an auth failure until traced to a blocked-HMR log line; fixed with a small dev-only addition to `next.config.ts`. The tenant itself was found already fully onboarded from a past session (not zero-state) — reset via direct SQL rather than creating a new tenant, since it's an explicitly disposable fixture. Real findings in the test itself: a contact-field autosave race lost 2 of 3 fields when filled back-to-back (same shape as 08's date-filter race); `furthestIndex` (which StepNav tabs a user can jump to) resets on every full page load and doesn't survive a `goto()`, requiring the wizard's own `?step=` URL override to resume; every step component the wizard has ever mounted stays alive in the DOM (hidden, not unmounted), so positional locators need `:visible` scoping; Review's "Done"/"Not done yet" text lives in a `title` attribute, not visible page text; and launching again is **not** timestamp-idempotent (each click writes a fresh timestamp) despite this note's original assumption — the UI supports it deliberately as a "re-publish," not a true no-op.

**Session-level infra incidents, same shape as Phase 2's:**
- A full-suite run mid-session saw 2 unrelated failures (`theme-colors.spec.ts` timing out waiting for a super-admin button, `admin-orders.spec.ts` hitting `net::ERR_ABORTED` on `page.goto`) that turned out to be caused by the dev server itself, not the tests or app — after many hours and dozens of test runs in this one session, the `next dev` process had grown to ~1.8GB resident. A clean restart (`Stop-Process` + `rm -rf .next` + fresh `npm run dev`) immediately produced a fully clean 16/16 run. Noted in `08-admin-orders.md` as a pattern to recognize (an otherwise-fast page failing to load, or an unrelated test timing out) rather than assume is a regression.
- A full-suite run without first resetting the onboarding tenant correctly failed test 10 at its very first assertion (Individuals-pricing gate already satisfied from the previous run) — not a flake, the expected and documented consequence of test 10's tenant needing a manual reset before each run.

**Independently reconfirmed (2026-08-10):** reset the onboarding tenant via the documented SQL, then ran the full 17-test suite myself from a clean shell — genuinely **17/17 passed (7.9m)**, matching the agent's report. Also spot-checked Staging Winery's real data directly via SQL: 8 companies (all pre-existing, none from today), 4 real orders — clean, no leftover test companies or orders. **One real accumulation finding caught this pass:** 14 "Playwright Wine Test ..." rows had built up in the real `WineOrder` table over the session's many test runs (Wine Orders admin has no delete action, so every run's cleanup leaves a permanent `Cancelled` row instead of removing it — one was even stuck mid-`pending_payment` from an interrupted run). Deleted via direct SQL, scoped to the unambiguous `businessName LIKE 'Playwright Wine Test %'` pattern — real orders untouched. This **will recur** on every future run of `06-wine-catalogue-order.spec.ts` since there's no delete action to give it; worth a periodic manual sweep, or revisiting the test's cleanup approach (direct DB delete instead of "Cancelled") if this suite runs much more often going forward. Full note: `notes/06-wine-catalogue-order.md`.

## Phase 4 — Tier 4: Locale integrity — ✅ BUILT, standalone-verified (full-suite reconfirmation blocked by a live infra incident — see below)

| # | Test | Note | Status |
|---|---|---|---|
| 11 | Locale toggle (EN↔KA, leaked keys, console errors) — parametrized across `/`, `/wines`, `/admin/orders`, `/admin/settings`, `/admin/companies` | [11-locale-integrity.md](notes/11-locale-integrity.md) | ✅ — 5/5 passing standalone (`--workers=1`, 3.3m), reconfirmed a second time as an admin-only subset (3/3, 2.9m). See note below on why a clean *full-suite* run couldn't be captured this session. |

**Raw-key regex, resolved:** the spec note's open question (snake_case vs. dot-namespaced keys) turned out to have a single answer — every real key in `lib/t.ts` and `lib/adminT.ts`, confirmed by reading both dictionaries directly, is one or more segments joined by `.` or `_` (`nav.orders`, `settings.adminLanguage.sectionTitle`, `form.first_name`, `form_first_name`). One regex (`/^[a-zA-Z]+(?:[._][a-zA-Z0-9]+)+$/`) covers both conventions; applied only to whitespace-free text nodes so real prose can't false-positive. Live-verified against all 5 pages in Georgian: fully translated, zero raw-key matches.

**Real findings while building this test:**
1. **A genuine, unrelated app bug hit immediately:** `/admin/companies` throws a real React hydration-mismatch console error on *every* page load, any locale — this is `KNOWN-ISSUES.md` #2 (`CompaniesClient.tsx`'s nested `<button>`s), not a locale issue. The spec's "zero console errors" check filters this one known, named error out (`isKnownCompaniesHydrationError()`) so it still catches anything genuinely new.
2. **A separate, real translation gap, out of this test's scope:** `/wines`'s "Grid view"/"List view" toggle buttons are hardcoded English literals with zero `t()` key backing — they never translate, in any locale. Different failure shape than the #131 regression this test guards (a hardcoded literal, not a missing-key fallback), so it doesn't trip this test's assertions. Flagged as a follow-up (chip `task_c0ea7d95`), not fixed here.
3. **A `.next` Turbopack cache corruption**, matching `KNOWN-ISSUES.md`'s dev-server-bloat pattern exactly: the dev server had to be started fresh for this session, and its first boot served a literal 404 for every route (including `/admin/login`) despite `x-resolved-tenant` resolving correctly. Fixed by the documented recovery: stop, `rm -rf .next`, restart clean.
4. **A severe, sustained `KnownBugs.md`/`KNOWN-ISSUES.md`-pattern DB pool exhaustion (`P1001`/`P2028`) blocked full-suite reconfirmation this session.** The new test passes cleanly and repeatably in isolation, but every attempt to run the complete 22-test suite — 2 attempts at the default parallel workers, 2 attempts fully serial (`--workers=1`) — came back with widespread failures (8-15 tests failing per run) hitting tests with **no relation to this change** (`popover-clipping`, `booking-simple`/`booking-enhanced`, `companies-crud`, `admin-login`, `onboarding-wizard` — all previously-green Phase 1-3 tests). Real recovery attempts were made between runs, following the documented protocol exactly: genuine idle waits, polling an ordinary page load every 30-60s for consecutive clean reads before retrying (confirmed clean 2-4 times across attempts), not just a fixed sleep or a bare restart. Each time, the pool exhausted again within seconds of resuming test traffic, and even single isolated health-check requests occasionally errored during otherwise-idle wait windows — evidence this was likely external load on the shared `georgian-saas-dev` project (per `KNOWN-ISSUES.md`: "combined test volume from more than one session"), not something this session's own test traffic alone was causing or something more local waiting would fix. **Not treated as a regression** — verified live via `playwright-cli` that Staging Winery's admin panel language is correctly `en` (not stuck in Georgian from the interrupted runs). Full-suite reconfirmation is a follow-up step for whenever the shared dev DB isn't under heavy contention — see `notes/11-locale-integrity.md`.

---

## Deliberately out of scope for v1

- Visual/screenshot diffing — proposed as a v2 addition once the functional suite is stable.
- Performance regression guard (`X-Vercel-Id` region check) — stays a manual `curl` per `MaintenanceNotes.md` §8.
- Cross-tenant RLS testing — already covered by `saas/scripts/test-payment-rls.ts`.

## How to run

```bash
cd saas
PLAYWRIGHT_HTML_OPEN=never npx playwright test
```

Dev server must be running (`npm run dev` from `saas/`) before running the suite — see [README.md](README.md).
