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

## Phase 2 — Tier 2: Core customer flows — 🚧 (2 of 3 broke later; 1 fixed + verified 2026-09-19, 1 blocked on fixtures)

> ⚠️ **The "3/3 passing" below was true when written and stopped being true on 2026-09-14.**
> Feature 184 inserted the "Review your visit" confirm sheet between the booking form's submit
> button and `createBooking()`. Tests 4 and 5 predated it, kept clicking submit and waiting for
> an outcome that could no longer happen, and failed on a **timeout** — a failure shape that
> reads like a slow DB rather than a stale assertion, which is why it went unnoticed for five
> days. Found and fixed 2026-09-19 (see the drift-audit entry at the bottom of this file); both now
> share `helpers/bookingForm.ts`'s `openReviewSheet()` with the payment spec.

| # | Test | Note | Status |
|---|---|---|---|
| 4 | Booking form — simple variant | [04-booking-simple.md](notes/04-booking-simple.md) | ✅ — re-verified green 2026-09-19 (55.5s), after a *second* stale bug was found and fixed (see below) |
| 5 | Booking form — enhanced/company variant | [05-booking-enhanced.md](notes/05-booking-enhanced.md) | ❌ **BLOCKED** — confirm-sheet fix is in, but the spec cannot reach it: fixture company `Test Company # 1` no longer exists (KNOWN-ISSUES #4) |
| 6 | Wine catalogue → order | [06-wine-catalogue-order.md](notes/06-wine-catalogue-order.md) | ✅ — 1/1 passing (wine orders were not changed by #184) |

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

## Phase 4 — Tier 4: Locale integrity — ✅ COMPLETE, full suite reconfirmed 22/22 (2026-08-12)

| # | Test | Note | Status |
|---|---|---|---|
| 11 | Locale toggle (EN↔KA, leaked keys, console errors) — parametrized across `/`, `/wines`, `/admin/orders`, `/admin/settings`, `/admin/companies` | [11-locale-integrity.md](notes/11-locale-integrity.md) | ✅ — 5/5 passing standalone (`--workers=1`, 3.3m), reconfirmed a second time as an admin-only subset (3/3, 2.9m). See note below on why a clean *full-suite* run couldn't be captured this session. |

**Raw-key regex, resolved:** the spec note's open question (snake_case vs. dot-namespaced keys) turned out to have a single answer — every real key in `lib/t.ts` and `lib/adminT.ts`, confirmed by reading both dictionaries directly, is one or more segments joined by `.` or `_` (`nav.orders`, `settings.adminLanguage.sectionTitle`, `form.first_name`, `form_first_name`). One regex (`/^[a-zA-Z]+(?:[._][a-zA-Z0-9]+)+$/`) covers both conventions; applied only to whitespace-free text nodes so real prose can't false-positive. Live-verified against all 5 pages in Georgian: fully translated, zero raw-key matches.

**Real findings while building this test:**
1. **A genuine, unrelated app bug hit immediately:** `/admin/companies` throws a real React hydration-mismatch console error on *every* page load, any locale — this is `KNOWN-ISSUES.md` #2 (`CompaniesClient.tsx`'s nested `<button>`s), not a locale issue. The spec's "zero console errors" check filters this one known, named error out (`isKnownCompaniesHydrationError()`) so it still catches anything genuinely new.
2. **A separate, real translation gap, out of this test's scope:** `/wines`'s "Grid view"/"List view" toggle buttons are hardcoded English literals with zero `t()` key backing — they never translate, in any locale. Different failure shape than the #131 regression this test guards (a hardcoded literal, not a missing-key fallback), so it doesn't trip this test's assertions. Flagged as a follow-up (chip `task_c0ea7d95`), not fixed here.
3. **A `.next` Turbopack cache corruption**, matching `KNOWN-ISSUES.md`'s dev-server-bloat pattern exactly: the dev server had to be started fresh for this session, and its first boot served a literal 404 for every route (including `/admin/login`) despite `x-resolved-tenant` resolving correctly. Fixed by the documented recovery: stop, `rm -rf .next`, restart clean.
4. **A severe, sustained `KnownBugs.md`/`KNOWN-ISSUES.md`-pattern DB pool exhaustion (`P1001`/`P2028`) blocked full-suite reconfirmation in the original build session.** The new test passed cleanly and repeatably in isolation, but every attempt to run the complete 22-test suite that session — 2 attempts at the default parallel workers, 2 attempts fully serial (`--workers=1`) — came back with widespread failures (8-15 tests failing per run) hitting tests with **no relation to this change** (`popover-clipping`, `booking-simple`/`booking-enhanced`, `companies-crud`, `admin-login`, `onboarding-wizard` — all previously-green Phase 1-3 tests). Real recovery attempts were made between runs, following the documented protocol exactly: genuine idle waits, polling an ordinary page load every 30-60s for consecutive clean reads before retrying (confirmed clean 2-4 times across attempts), not just a fixed sleep or a bare restart. Each time, the pool exhausted again within seconds of resuming test traffic, and even single isolated health-check requests occasionally errored during otherwise-idle wait windows — evidence this was likely external load on the shared `georgian-saas-dev` project (per `KNOWN-ISSUES.md`: "combined test volume from more than one session"), not something this session's own test traffic alone was causing or something more local waiting would fix. **Not treated as a regression** — verified live via `playwright-cli` that Staging Winery's admin panel language is correctly `en` (not stuck in Georgian from the interrupted runs).

### 2026-08-12 — full-suite reconfirmation, clean 22/22

Ran once the dev DB was no longer under contention (`pg_stat_activity`: 21 idle / 29 total connections, no `P1001`/`P2028`). First `--workers=1` run came back **19/22** — a real, unrelated bug caught, not pool exhaustion recurring:

- **`booking-enhanced.spec.ts` — real test bug, not app or infra.** Waited for a "Book & Pay" button that never renders for a company booking on Staging Winery (`paymentEnabledCompanies = false`, confirmed via direct SQL — backfilled by Feature #148, which shipped 2026-08-11, a day after this test was written). Correct label is "Request Booking". Hung the full 90s timeout rather than failing cleanly (waiting on a button that doesn't exist), which is why it initially looked like it could be infra flakiness — two isolated reruns failed identically, ruling that out. Fixed (one-line locator change) and reconfirmed passing. Full writeup: `notes/05-booking-enhanced.md`.
- **`booking-simple.spec.ts`** — failed once in the full run (order-row click landed on a hover-preview overlay instead of navigating), passed clean on an isolated rerun (2.3m). Genuine full-suite-load flakiness, not a bug.
- **`onboarding-wizard.spec.ts`** — failed at its very first assertion because its fixture tenant wasn't reset first. Exactly the documented, expected failure mode (see `notes/10-onboarding-wizard.md`) — ran the standing reset SQL, reran, passed.

Second full run, after the fix and the tenant reset: **22/22 passed clean, 8.9m, `--workers=1`.** Spot-checked Staging Winery's real `Order`/`WineOrder`/`Company` tables directly via SQL afterward — the only Playwright-tagged rows present all predate this session (2026-08-11), confirming today's runs cleaned up after themselves correctly.

## Additional coverage — 2026-08-12, payment button-label precedence (#148)

Max asked a direct follow-up after the `booking-enhanced.spec.ts` fix above: the booking form has several possible payment-label states (individual/company × on/off × per-company override) — how do the tests account for that? They didn't. `booking-simple.spec.ts` and `booking-enhanced.spec.ts` each hardcoded exactly one label matching whatever Staging Winery's settings happened to be when written — the precise fragility that just caused the bug above. Feature #148's own build notes verified the full precedence once with a throwaway spot-check script, never added to the permanent suite.

Built `tests/tier1-regression/payment-label-precedence.spec.ts` (2 tests, 6 real states — individual on/off, company section-default on/off, and a per-company override beating the section default in both directions) plus a new `tests/helpers/payments.ts` for driving `/admin/settings` section toggles and `/admin/companies`' 3-way override through the real UI, matching how every other test in this suite changes state. Both tests read the tenant's real starting values first and restore them in a `finally` block rather than assuming a baseline.

**Real finding while building it, in the test helper itself, not the app:** the first version of the override-detection logic string-matched `getAttribute('style')` against a literal hex color — which never matches, since the browser's CSSOM normalizes authored hex to `rgb(...)` on reflection, for either state. It silently fell through to always reporting the first option ("Default") regardless of what was actually clicked, and looked exactly like the page's known lost-click bug (identical 20s timeout, twice) before being traced to this. Fixed by comparing computed `backgroundColor` across the three buttons instead of matching a literal string. Full writeup: `notes/12-payment-label-precedence.md`.

Suite is now 24 tests. Full suite run after adding this: 23/24 passed; the one failure was the already-documented `onboarding-wizard.spec.ts` fixture-reset requirement (its disposable tenant needed the standing reset SQL run again, consumed by an earlier successful run this session) — reset, reran, **24/24 confirmed** (23 in the full run + this one reconfirmed standalone in 54s).

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

Before running `onboarding-wizard.spec.ts` (directly or as part of a full run), its fixture tenant needs a manual reset — see `notes/10-onboarding-wizard.md` for the SQL. Skipping it fails that one test at its first assertion; it isn't a real regression.

Dev server must be running (`npm run dev` from `saas/`) before running the suite — see [README.md](README.md).

---

## 2026-09-19 — Drift audit: two broken specs, one harmful filter, three stale docs

Not a new phase — an audit of the existing suite, triggered by Max asking to scale up to
"tests for all possible scenarios, starting with payments/bookings." Checked the suite's
trustworthiness before adding to it. **No new tests written.**

**Two specs were broken and silently had been since 2026-09-14** (Feature 184's confirm
sheet): `booking-simple.spec.ts` and `booking-enhanced.spec.ts`. See the warning box in
Phase 2 above for the full shape. Fixed by extracting `openReviewSheet()` from
`payment-amount-integrity.spec.ts` — the one spec that had been kept current — into a new
shared `saas/tests/helpers/bookingForm.ts`. `company-guide-code.spec.ts` was checked and is
unaffected (it never submits the form).

**`locale-integrity.spec.ts`'s hydration filter removed.** `isKnownCompaniesHydrationError()`
existed for KNOWN-ISSUES #2, which was **fixed in the app on 2026-09-12**. It was applied to
all five tests — including the public home page, wine catalogue, admin orders and admin
settings, none of which render `CompaniesClient` — and its second pattern matched React's
*generic* "Hydration failed…" message. Any new hydration mismatch introduced anywhere in the
app would have passed those five tests silently. They now assert on every console error.
**If this surfaces a failure on the next run, it is a real one** — check it before re-adding
any suppression.

**Open follow-up: re-examine `clickUntil()`.** It was introduced to work around KNOWN-ISSUES
#2's click loss. With that bug fixed, a retry that actually fires is now a signal rather than
expected noise — and the helper will happily absorb a genuine regression, since a click that
truly stopped working looks identical to a slow one. Not stripped out here: this UI can still
be slow against a loaded dev DB, so it needs a deliberate pass, not a reflex.

### Run results, 2026-09-19 (live, warmed dev server, `--workers=1`)

**5 passed / 2 failed**, then booking-simple fixed and re-verified green.

- ✅ `locale-integrity.spec.ts` **5/5**, including admin companies (37.5s). **Removing the
  hydration filter surfaced nothing** — those five assertions are now genuinely unconditional
  rather than nominally so.
- ✅ `booking-simple.spec.ts` — green at **55.5s** after two fixes, not one (below).
- ❌ `booking-enhanced.spec.ts` — the confirm-sheet fix is correct but unreachable; the spec
  dies in setup on the missing fixture company. See KNOWN-ISSUES #4.

**A second stale bug in `booking-simple.spec.ts`, found only by running it.** After the
confirm-sheet fix the test reached the Flitt gateway with the right amount (280 GEL, visible in
the failure's own page snapshot) and then hung in *cleanup*. This was **first misdiagnosed as a
too-small test timeout**; raising 60s → 120s reproduced the identical failure, which is what
ruled that out. The real cause: Feature 191 (2026-09-18) moved abandoned orders to their own
screen, and this spec's port of that change used
`locator('div').filter({ hasText: marker }).last()` — which resolves to the *innermost* div
holding the email text, containing no buttons. Asserting it visible passes; asking for a button
inside it hangs forever. `payment-amount-integrity.spec.ts` had the correct `has:`-filtered
version all along. Now shared as `abandonedRow()` in `helpers/bookingForm.ts`. Timeout left at
90s, justified on round-trip count alone rather than as the fix.

**The pattern worth naming:** three separate times now, one spec got a careful update for an app
change and its sibling got a sloppy one or none at all — Feature 184 (two specs missed), Feature
191 (one spec's locator), KnownBugs #15 (three docs). Shared helpers are the structural answer,
which is why both fixes this session became helpers rather than local patches.

---

## 2026-09-19 (later the same day) — fixtures repointed, payment specs green, guide-picker spec added

**Max's call on the fixture hole (KNOWN-ISSUES #4): point the specs at the seeded demo
companies** rather than recreate the deleted hand-made ones. Reasoning, which turned out to be
better founded than the version first offered: the seeded companies' names, tiers and codes are
constants in `lib/demoSeed.ts`, so if they are ever wiped again, restoring them is one documented
command instead of rebuilding a company from memory.

Applied additively via a new `saas/scripts/backfill-test-fixtures.ts` rather than by re-running
the seed, which would have deleted Staging Winery's orders. The script imports
`BOOKING_COMPANIES`/`WINE_COMPANIES` from the seed rather than copying codes, so the two cannot
drift; it refuses the demo tenant; it is idempotent; and it **converges** rather than only adding
(it retracted six guides it had wrongly created, scoped strictly to seed-owned codes so a
hand-created guide can never be deleted).

### Fixture mapping now in force

| Spec | Company | Notes |
|---|---|---|
| `payment-amount-integrity` | Caucasus Vine Travel + Sighnaghi Wine Bar | booking + wine |
| `payment-label-precedence` | Alazani Valley Tours | its own, so override flips cannot collide |
| `guide-picker` | Silk Road Journeys | the only company seeded WITH guides |
| `booking-enhanced` | ⬜ not repointed | still `Test Company # 1` |
| `company-nationality-tagging` | ⬜ not repointed | still `Test Company # 1` |
| `company-guide-code` | ⬜ not repointed | still `Cookie Company` |

### Three more bugs in `payment-amount-integrity`, each hidden behind the last

That file needed **four** independent fixes in total, and none was visible until the one before it
was cleared. It reported "1 failed" four times running, each time for a different reason:

1. Fixture companies deleted → failed in setup
2. The **company** test's `verifyAndCleanup` looked for gateway-bound orders on `/admin/orders`;
   Feature 191 moved them to the Incomplete screen, and it asserted on an "Awaiting Payment"
   control Feature 191 deleted
3. Scenario markers were fixed literals (`DefaultOn`), typed into the Last Name field — so every
   failed run left debris that broke the *next* run, one run later than the run that caused it.
   Now suffixed with a per-run id
4. The **wine-order** test had the same Feature 191 problem as #2, on a different screen. Also
   removed `cancelWineOrderOnAdminPage`, now dead and itself stale

**A test that fails early tells you nothing about what is behind the failure.** Worth remembering
before reading a single red result as "one thing is broken".

### New spec

`tests/tier2-core-flows/guide-picker.spec.ts` — **4/4 passing, 26.6s.** Covers Feature 201
(company code opens the picker, guide selection, the "not on this list" fallback, a guide's own
code skipping the picker, a wrong code still rejected). Read-only: touches no tenant settings and
creates no orders, which is why it is fast and leaves nothing behind.

### Environmental

The dev DB pool was exhausted mid-session by the day's run volume (`P2028`, transactions timing
out at ~21s against a 15s limit). One company-test "regression" was **purely this**, not a code
fault — it had passed on the previous run. Recovery was by waiting and confirming with real page
loads, per KNOWN-ISSUES; a server restart does not help.

**Status:** `tsc --noEmit` clean, i18n parity clean. Green and verified: `booking-simple`,
`locale-integrity` (5/5), `payment-label-precedence`, `guide-picker` (4/4), and both booking tests
in `payment-amount-integrity`. `payment-amount-integrity`'s wine test fixed but **not re-run since
the fix**. Three specs still unrepointed (table above). Nothing committed, nothing pushed.

---

## 2026-09-24 — Tier 5 (real Flitt payment E2E) starts — Chunk 3, two specs added

Not a new numbered Phase here — `vault/Plan-PaymentE2ETesting.md` is Tier 5's own tracker
(Chunks 0–8), and its own Chunk 8 is where this file gets properly folded in with a real
"Phase 5" section, run instructions, and the two-config split documented in `ARCHITECTURE.md`.
This is a short pointer entry only, so this file doesn't go stale in the meantime.

Chunk 3 added the first two specs under `tests/tier5-payment-e2e/` (own config,
`playwright.staging.config.ts`, targets `https://staging.vineworks.ge` — the real deployed
staging site, not localhost, since Flitt's callback needs a publicly reachable host):

- `payment-approved-settlement.spec.ts` — 3/3 passing (individual booking, full 5-surface
  check; company booking and a wine order, lighter checks). Real finding: the settlement
  email never reaches Resend at all (`KnownBugs.md` #53, root cause suspected — a
  fire-and-forget send with no `waitUntil()`), independently confirmed via Resend's own send
  log across every run. Full writeup: [[13-payment-approved-settlement]].
- `payment-declined-settlement.spec.ts` — 1/1 passing. Real finding: the non-3DS decline test
  card never redirects back to the site at all — Flitt shows an inline "Declined" dialog with
  no way back to the merchant, fixed in `helpers/flittPayment.ts` (`payAtFlittCheckout` now
  returns `outcome: 'redirected' | 'declined-inline'`) rather than worked around locally, since
  later chunks (7, forged/duplicate callbacks) will also drive declines. Full writeup:
  [[14-payment-declined-settlement]].

Both independently re-verified against the dev DB directly (`Payment`/`Order`/`OrderEvent`),
not just trusted on a green Playwright run — see each note's own "Independent verification"
section. All test data swept to zero afterward, including via direct SQL for the wine-order
scenario (Wine Orders admin still has no delete action — same accepted debris shape the rest
of this suite already lives with there).

## 2026-09-24 (continued) — Chunk 4, one spec added, a real app bug found and fixed

`payment-book-later.spec.ts` — 1/1 passing. Covers the "book & pay later" loop: reservation-only
booking → invoice email → manual bank-transfer payment, full cross-view check. Confirmed this is
genuinely not a resumed Flitt checkout (§2b of the plan) — nothing in the scenario ever reaches
`pay.flitt.com`.

Building the manual-payment step reproduced a real, standing app bug, independent of this
testing plan: the admin "Paid" status option's Bank Transfer/Cash picker closed itself the
instant it opened, on both `/admin/orders` and an order's own detail page. Root cause (confirmed
live, not just read from the code): Next's App Router hydrates React at `document`, so the
"close menu on outside click" listener and React's own delegated click listener are two
independent listeners on the same node — clicking "Paid" mounts the picker and React flushes
that swap synchronously *before* the outside-click listener's turn, so by the time it runs, the
clicked button is already detached and a plain containment check on it fails. Fixed by moving
the outside-click listener to the capture phase in both `OrderDetail.tsx` and `OrdersTable.tsx`
(commits `b58e9cc`/`ac47541`, `staging`) — full story in
[[15-payment-book-later]].

A second, unrelated bug was found live-testing the fix on the mobile card list (a status
dropdown clipped by its own card's `overflow-hidden`) and flagged as its own follow-up rather
than fixed here.

Independently re-verified against the dev DB directly (a second manual pass through the UI,
since the automated spec deletes its own row before cleanup could be inspected mid-flight):
`Order.paidAt`/`invoiceSentAt` both set and independent, `Payment` row with
`provider='manual'`, `method='BANK_TRANSFER'`, `settledAt` set, correct amount. All test data
swept to zero afterward; the "Individual bookings" toggle confirmed back at its resting value
(off) both via the spec's own restore and a separate live DOM read.

## 2026-09-24 (continued) — Chunk 5, one spec added, no app divergence found — two real test bugs found instead

`payment-admin-order.spec.ts` — 1/1 passing. Covers the admin-created-order gap: an order typed
directly into `/admin/orders/new` (never `startCheckout()`, per the plan's §2d) checked for
parity with a guest-created one across every §4 surface, then paid via the same manual
bank-transfer path Chunk 4 proved works. **No real parity divergence found** — same
`OrdersTable`/`OrderDetail`/CSV code paths a guest order renders through, confirmed
value-for-value and format-for-format against what Chunk 4 established for a guest order in
the same paid+invoiced end state. Full writeup: [[16-payment-admin-order]].

Two real bugs surfaced while *building* this spec, both in the test itself, not the app:
1. A URL-match regex (`/\/admin\/orders\/[a-zA-Z0-9]+$/`) also matched its own starting page
   (`/admin/orders/new` — "new" is alphanumeric), so the post-creation redirect check passed
   instantly without ever waiting for the real navigation, silently capturing the wrong URL for
   every later "detail page" check. Looked exactly like a data bug at first (the same order,
   opened directly, rendered its correct total) until an HTML dump of the failing page showed
   it was still the blank New Order form. Fixed with a negative lookahead excluding that one
   literal segment.
2. A small, systematic clock-skew between this machine and Resend's send pipeline (~380ms)
   made an unbuffered `>=` timestamp comparison fail consistently, not intermittently — no
   amount of polling fixes a systematic bias. Fixed with a 10-second safety margin on the
   comparison's start time.

Independently re-verified against the dev DB directly (cleanup temporarily disabled for one
run to inspect the final state before deleting via the normal admin UI): `Order.paidAt`/
`invoiceSentAt` both set and independent, `abandonedAt` null throughout, `Payment` row with
`provider='manual'`, `method='BANK_TRANSFER'`, `settledAt` set, correct amount, and
`OrderEvent(CREATED).actorType='ADMIN'` (vs. `'GUEST'` for a guest order — the one difference,
invisible to every UI surface checked, exactly as designed). All test/debug data swept to zero
afterward. This spec never touches the "Individual bookings" toggle at all — `createOrderAdmin`
doesn't consult it — so no restore step was needed.
