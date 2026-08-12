---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-08-12 (latest, part 4) — Four independent low-risk fixes from [[Plan-I18nIntegrity]] / [[ArchitectureReview-2026-08-12]]

Four independent, low-risk tasks, verified with `npx tsc --noEmit` clean after each before moving to the next.

**1. `KnownBugs.md` Bug #16 fixed** — `/wines` Grid/List toggle was hardcoded English (`title="Grid view"`/`title="List view"`, no `t()` call at all). Added `wines.view.grid`/`wines.view.list` keys to `lib/t.ts` (en: "Grid view"/"List view", ka: "ბადის ხედი"/"სიის ხედი"), swapped the two literals for `t(locale, ...)` calls in `WineCatalogueClient.tsx`. Verified the keys actually resolve in both locales via a standalone script import (browser preview navigation wasn't available in this session, so used a direct code check instead).

**2. Cache-staleness note added to super-admin Edit Tenant UI** — `proxy.ts`'s 5-minute tenant cache means a saved Modules or Theme change can take up to 5 minutes to show on the live site, with nothing telling a super-admin that. Added "Changes may take up to 5 minutes to appear on the live site." near both the Modules checkboxes and the Theme preset picker in `app/super-admin/tenants/TenantFormClient.tsx`. Confirmed `app/super-admin/` uses no i18n system at all (no `t`/`adminT` imports anywhere under it — plain hardcoded English, unlike the tenant-facing `/admin`), so matched that convention rather than introducing translation keys for a Max-only interface.

**3. Built `scripts/check-i18n-parity.ts`** (Plan-I18nIntegrity part B1) — parses `lib/t.ts` and `lib/adminT.ts` as text (brace-depth + quote/comment-aware, since the `en`/`ka` consts aren't exported) and diffs the key sets. **Ran it: both dictionaries are in full parity** — `t.ts` 119/119, `adminT.ts` 890/890 (matches the one-off manual count mentioned in the plan doc from #148's build) — zero mismatches found, nothing needed fixing. Kept as a permanent, rerunnable script (`npx tsx scripts/check-i18n-parity.ts`).

**4. Extended the two-tenant RLS test pattern to the 3 remaining JOIN-only tables** — `scripts/test-orderextra-rls.ts`, `scripts/test-ordermasterclass-rls.ts`, `scripts/test-wineorderitem-rls.ts`, each modeled on today's `scripts/test-price-rls.ts` (itself modeled on `scripts/test-payment-rls.ts`): two throwaway tenants, a parent record under each (`Order`/`Order`/`WineOrder` respectively — `OrderMasterclass` also needed a per-tenant `MasterclassItem`), a child row under each, then asserting the JOIN-based RLS policy blocks cross-tenant read/update/delete/insert in both directions, with full cleanup. **All three pass: 8/8 checks each, 24/24 total.** Kept as permanent scripts, same status as `test-price-rls.ts`.

**Not touched this pass (explicitly out of scope):** Plan-I18nIntegrity's part B2 (`SiteContent` seed-parity script), B3 (raw-literal lint check), and part A item 2 (transactional email locale-awareness, which needs an `Order.locale` schema decision first) — still 📋 Planned. FeatureLog rows #150/#152/#153/#154 also untouched.

**Verification:** `npx tsc --noEmit` clean after all four tasks. All new/changed scripts run successfully against the dev database.

**Status:** committed to `staging` only, per Rule 0 — not merged to `master`. Ready for Max's review on the staging preview.

---

## 2026-08-12 (latest, part 3) — Committed + pushed #148 and the Playwright suite to `staging`

Both had been sitting uncommitted across recent sessions (#148 Granular Payment Controls, built 2026-08-11; the Playwright regression suite, #147, built across several prior sessions). Max asked directly to commit and push everything. Reviewed the full diff first — `.gitignore` changes only *added* ignore rules (notably `saas/.env.test`, tightening rather than loosening secret protection), `next.config.ts`'s `allowedDevOrigins` addition is a documented dev-only test-tenant accommodation, and `saas/tests/helpers/credentials.ts` (checked closely purely because of its filename) reads `credentials.txt` at runtime rather than embedding any secret. One commit (`3bf742d`, 60 files), pushed to `staging` only — confirmed current branch first, `master` untouched. Production unaffected either way (#148's migration only ever ran against dev; the Playwright suite runs against dev/staging only by design).

**Status:** on `staging`, ready for Max to review on the staging preview. `vault/MyToDo.md`'s #148 entry updated to reflect the commit.

---

## 2026-08-12 (latest, part 2) — Fixed `prices.ts` tenant-isolation bug found in the architecture review

Follow-on to the same-day architecture review below, with Max's explicit go-ahead to implement the one real security finding it surfaced (task chip `task_262c73ba`).

**Fix:** `app/actions/prices.ts` — `createPrice`, `updatePrice`, `deletePrice` now run inside `withTenantDb(tenantId, ...)` instead of calling the raw `db` client directly, closing the gap where a tenant-A admin could pass a cross-tenant `companyId`/`priceId` and write/delete another tenant's pricing data (RLS was bypassed because raw `db` connects as the `postgres` superuser role). Each function also does an explicit ownership check before touching anything, mirroring the pattern `setDisplayPrice` already used, so a cross-tenant attempt returns a friendly `{ error: 'Not found.' }` instead of a thrown Postgres RLS exception. `validateTier()` (the overlap-check helper) now takes the transaction client so its overlap read is tenant-scoped too, not just the create/update/delete itself.

**`FORCE ROW LEVEL SECURITY` investigation:** the review's adversarial pass had flagged `setup-rls.ts` as only ever running `ENABLE ROW LEVEL SECURITY`, never `FORCE`, as a second theoretical bypass route (owner-role exemption). Queried `pg_roles` directly against the **dev** database: `postgres` has `rolbypassrls = true`. A role with `rolbypassrls = true` ignores RLS regardless of `FORCE` (`FORCE` only removes the owner-exemption, not genuine `BYPASSRLS`/superuser status) — so `FORCE ROW LEVEL SECURITY` would change nothing for this connection today. **Not added.** This confirms and closes the review doc's speculation rather than acting on it as written.

**Verification:** `npx tsc --noEmit` clean. `npx tsx scripts/check-rls.ts` — all 14 tenanted tables unchanged, RLS on, policies intact. New `scripts/test-price-rls.ts` (two-tenant pattern per `MaintenanceNotes.md` §10, modeled on `scripts/test-payment-rls.ts` since `Price` has no direct `tenantId` column and the general `test-rls.ts` suite doesn't reliably exercise a JOIN-based policy) — 10/10 checks pass: raw RLS policy blocks cross-tenant read/write/insert directly, and the fixed action functions' explicit checks return a friendly error rather than throwing. Kept as a permanent script. Also ran the full `scripts/test-rls.ts` suite (21/21 pass, unaffected).

Full write-up: `KnownBugs.md` Bug #17 (now 🟢 Resolved). `ArchitectureReview-2026-08-12.md` section 1 updated with a "FIXED 2026-08-12" note and the FORCE finding.

**Status:** committed and pushed to `staging` only, per Rule 0 — **not merged to `master`/production**. Staging deploys against the dev database; awaiting Max's review there before the master merge, which needs his separate explicit go-ahead.

---

## 2026-08-12 — Full architecture/flow review (no code changes)

Max asked for a comprehensive review of the whole site's architecture and flow — not a bug hunt, specifically framed around "as this project expands there's more chance of conflicting design decisions." Read all vault architecture docs (`RLS-Architecture`, `MultiTenantSiteContent`, `MaintenanceNotes`, `KnownBugs`, `Plan-Performance`, `MigrationNotes`, `Roadmap`, `MyToDo`) plus a dedicated Explore-agent pass over the live `saas/` codebase (schema, all 19 `app/actions/*.ts` files, admin routes, `components/`, API routes vs server actions, `proxy.ts`, test coverage) to find drift not yet documented anywhere.

**One real finding, not just a maintenance note:** `app/actions/prices.ts`'s `createPrice`/`updatePrice`/`deletePrice` skip `withTenantDb` entirely — raw `db.price.*` calls guarded only by `requireAdmin()`, which checks the caller's own tenant but never checks that the `companyId`/`priceId` *argument* belongs to that tenant. Since raw `db` connects as the RLS-bypassing superuser role, a tenant-A admin passing a tenant-B ID would currently succeed in writing/deleting that tenant's pricing data. Only `setDisplayPrice` in the same file guards correctly. Flagged as task chip `task_262c73ba` (not fixed this session — Rule 8, and it's exactly the kind of change that needs Max's explicit go-ahead first).

**Everything else** is structural drift-risk, not a live bug: no shared Dialog/Table UI primitives (every admin page hand-rolls its own, which is how Bug #15's nested-button hydration issue happened); no CI and no unit tests (11 Playwright specs exist but nothing sets `CI`, so they only run when someone remembers); unpaginated cross-tenant super-admin queries (fine at 2 tenants, breaks around the same ~25-tenant mark `MigrationNotes.md` already flags for Supabase sharding); the in-memory `proxy.ts` tenant cache's 5-min staleness applies to *all* cached fields including module flags, not just theme/domain as previously documented; the two parallel i18n systems (`SiteContent` DB rows vs `lib/t.ts`) and `EditableText`/`EditableLongText` duplication are recurring bug sources with no structural fix, not one-offs; `test-rls.ts`'s cross-tenant section silently no-ops on the 1-tenant dev DB, so its green checkmark isn't proof of anything; and the NM-own-domain-migration decision (`MyToDo.md`'s pre-onboarding cleanup section) is still unresolved ahead of "Next target: Winery — Prospect" in the Client Pipeline.

Full detail, severity table, and file/line citations for every finding: [[ArchitectureReview-2026-08-12]].

**Status:** review only, nothing committed or changed in code. Task chip `task_262c73ba` pending Max's decision to spin it off.

---

## 2026-08-11 — #148 Granular Payment Controls: built, migrated to dev, backfilled, verified

Implemented Feature 148 per the already-approved design ([[Feature 148 - Granular Payment Controls]]). Three new independent per-section payment toggles on `/admin/settings` (Individuals / Companies / Wine Orders) plus a per-company three-way override (`skipPayment`: null/true/false) on `/admin/companies`, both layered under `shouldTakePayment()`'s existing hard blocks (module off, credentials missing, price null/≤0, price hidden) per the doc's precedence table.

**Schema + migration:** `Tenant.paymentEnabledIndividuals/Companies/WineOrders` (`Boolean @default(true)`), `Company.skipPayment` (`Boolean?`). Dev server (PID 14428) stopped first per Rule 10; `prisma migrate dev` applied cleanly against the **dev** database (`jpbkkngpgtvqmsocitjx`, confirmed distinct from prod's `dshsfkffcsgerdqinqst`) — migration `20260811113100_add_granular_payment_controls`.

**Backfill:** `saas/scripts/backfill-payment-section-defaults.ts` (throwaway, deleted after running) set `paymentEnabledCompanies` per existing tenant from their `show_company_price_after_booking` Setting value at cutover. Dev has one real-data tenant — **Staging Winery**, displayed as "Nikalas Marani (Staging)" (same tenant, `cmrxb85wo0000vlc0d964nzf8`) — which had `show_company_price_after_booking = 'false'`, landing on `paymentEnabledCompanies = false`, reproducing its live behavior exactly. Production was not touched (dev-only, per explicit scope).

**Logic:** `shouldTakePayment()` extended with `section: 'INDIVIDUAL' | 'COMPANY' | 'WINE_ORDER'` and `companyId?`; company override checked after the existing hard blocks, before the section-toggle default, exactly per the doc's precedence table. `isPaymentConfigured()` got the same optional params for future use, but its three existing callers (`app/(site)/page.tsx`, `wines/page.tsx`, `PaymentSetupBanner.tsx`) were deliberately left unchanged — not in the design doc's file list, and the fallback is safe-by-construction (can only make a button label optimistic, never wrong in the direction that would actually charge someone). Flagged as a follow-up in the feature note. `createBooking.ts`/`submitWineOrder.ts` now pass `section`/`companyId` through; `priceShown` computation in `createBooking.ts` untouched, per decision #5 in the doc. Confirmed `show_company_price_after_booking` is referenced nowhere in the new runtime logic — only in the (now-deleted) one-time backfill script and in UI hint copy, per Max's explicit instruction.

**UI + actions:** three toggles added to Settings' existing Card Payments card (`paymentCredentials.ts` gained `updatePaymentSectionToggles`, same `requireAdmin()` guard as every other write action in the file); a 3-way Default/Always-skip/Always-require control added to the Companies edit panel in the same spot/pattern as the existing Wine Discount section, gated on the tenant's online-payment module being on. New EN+KA `adminT.ts` keys — parity-checked (890/890 keys both languages, 0 missing either direction). `npx tsc --noEmit` run clean after every meaningful step, not just at the end.

**Verification, deliberately lighter than usual per the dev DB's earlier connection-pool contention (documented in `playwright/KNOWN-ISSUES.md`) — no full Playwright run:**
- Dev server restarted after migration, confirmed `localhost:3000` responding (200).
- Settings toggles and Companies 3-way control verified live via `playwright-cli` (not the Claude Code browser tool — its click dispatch didn't reach React's handlers in this environment even for a pre-existing, unrelated toggle, confirmed as a tooling limitation, not a bug): toggled, reloaded, confirmed persisted in the DB, reverted.
- `shouldTakePayment()`'s full precedence table spot-checked directly via a throwaway script (`next/headers` mocked, since it only resolves inside a real request scope) — 8 constructed cases (module-off, price-hidden-beats-override, override-beats-section-off, override-beats-section-on, null-falls-through both ways, INDIVIDUAL default, totalPrice=0) all matched the doc's table exactly.
- All test data (Setting value, Tenant toggles, `Company.skipPayment` on "Test Company # 1") reverted to original state afterward, confirmed via direct query.
- Mid-session: the harness's stall watchdog killed an in-progress manual browser click-through (filling out a real booking form) after 600s with no progress — re-verified all state from scratch afterward (git diff, migration status, DB values, dev server health, fresh `tsc --noEmit`) before continuing; nothing was lost, no stray order had been created by the interrupted flow.

**Not built now, flagged for later:** real Playwright coverage for this feature (once the dev DB is further from the earlier contention). ~~`isPaymentConfigured()` section-awareness in the three UI display callers noted above~~ — closed later the same session, see below.

**Status:** `staging` branch, uncommitted (matches this session's established pattern — waiting on Max's review). Dev server left running, healthy. FeatureLog #148 flipped to ✅ Done / Claude tested ✅ Yes / User tested ❌ No.

---

## 2026-08-11 — #148 follow-up: `isPaymentConfigured()` callers closed (2 of 3 fixed, 1 confirmed correctly out of scope)

Max reviewed the three flagged call sites himself and asked to close the follow-up, with an explicit condition: verify no actual behavior changes anywhere, same discipline as keeping `showCompanyPrice` out of the new logic.

**`PaymentSetupBanner.tsx` — left unchanged, by design.** It's a tenant-wide setup-completeness check ("is Flitt configured at all"), not a per-section one — no section applies to a whole-tenant banner. Added a one-line comment explaining this so it doesn't get "fixed" again later.

**`app/(site)/wines/page.tsx` + `WineCatalogueClient.tsx` — fixed.** Now calls `isPaymentConfigured(tenantId, { section: 'WINE_ORDER' })`; `Company.skipPayment` added to the companies query's `select` and threaded through so the checkout button label reflects a selected company's override.

**`app/(site)/page.tsx` + `components/BookingForm.tsx` — fixed.** Label is now computed client-side in `BookingForm.tsx` from `bookingType` and the selected company's `skipPayment`, mirroring `shouldTakePayment()`'s precedence.

**One correction to the brief's suggested shape, caught during implementation:** using only the two section-scoped `isPaymentConfigured()` calls (INDIVIDUAL/COMPANY) as the sole inputs has a gap — both collapse "module/credentials off" and "section merely off" into the same `false`, so a company set to "always require" could wrongly flip the label to "pay" when the module was actually off. Fixed by fetching a third, separate `isPaymentConfigured(tenantId)` call with no section (the original unscoped check, unchanged) and gating the whole label on it first, exactly mirroring where `shouldTakePayment()` checks its hard blocks before any override. Verified with a throwaway script that re-implements both components' label expressions and runs them against 5 cases — including this exact edge case — cross-checked against the real `shouldTakePayment()`/`isPaymentConfigured()`. All 5 matched; the "before" shape would have failed the edge case, the shipped shape doesn't.

**Confirmed unchanged:** `shouldTakePayment()` itself — not touched. `showCompanyPrice`/`show_company_price_after_booking` — grepped across every touched file, absent from all new logic (the pre-existing, unrelated usages in `(site)/page.tsx`/`BookingForm.tsx` for price *visibility* are untouched). Checkout redirect logic in both client components — still driven purely by the server's returned `checkoutUrl`, independent of the label. `npx tsc --noEmit` clean. Light non-interactive `playwright-cli` load of `/` and `/wines` — both render with zero console errors; homepage's default INDIVIDUAL button correctly shows "Book & Pay".

Feature 148's build-time notes updated with the full resolution. Still uncommitted on `staging`, same as everything else this session.

---

## 2026-08-11 — #147 Playwright regression suite: Phase 4 (locale integrity) built, standalone-verified 5/5; full-suite reconfirmation blocked by dev DB contention; two real bugs found

Earlier the same day, before starting Feature 148. Built the last remaining test from the original 4-tier plan: `tests/tier4-locale/locale-integrity.spec.ts`, parametrized across 5 pages (`/`, `/wines`, `/admin/orders`, `/admin/settings`, `/admin/companies`) — toggles EN↔KA on each, asserts zero raw i18n-key leaks (regex `/^[a-zA-Z]+(?:[._][a-zA-Z0-9]+)+$/`, covers both this codebase's `.`-namespaced and `_`-snake-case key conventions, resolved by reading `lib/t.ts`/`lib/adminT.ts` directly rather than guessing), zero new console errors during the toggle, and that 2-3 spot-checked labels per page revert correctly on toggling back to `en`. Regression guard for `KnownBugs.md` #131's failure shape (a key silently missing for months, not crashing).

**5/5 passing standalone** (`--workers=1`, 3.3m), reconfirmed a second time as a 3/3 admin-only subset.

**Two real findings, one already known, one new:**
1. `/admin/companies` throws a genuine hydration-mismatch console error on every load, any locale (`CompaniesClient.tsx` nests `HelpHint`'s "?" `<button>` inside the row-summary `<button>`) — already flagged this session as task chip `task_b2b8da79` while building Phase 3's companies-CRUD test; not a locale bug, filtered out of this test's console-error assertion by exact known text so it still catches anything genuinely new.
2. **New:** `/wines`'s "Grid view"/"List view" toggle buttons (`WineCatalogueClient.tsx`) are hardcoded English (`title="Grid view"`/`title="List view"`, no `t()` call at all) — never translate in any locale. Different failure shape than #131 (a literal, not a missing dictionary entry), so it doesn't trip this test's assertions. Flagged as task chip `task_c0ea7d95`; not yet a numbered `KnownBugs.md` entry.

**Full-suite (22 tests) reconfirmation blocked by a severe dev-DB pool-exhaustion incident, not a code problem.** Four attempts (2 default-parallel, 2 fully serial `--workers=1`), each with genuine documented-protocol recovery waits between (polling an ordinary page load every 30-60s for 2-4 consecutive clean reads before retrying) — every attempt still came back with 8-15 of 22 tests failing, all previously-green Phase 1-3 tests with zero relation to this change (`popover-clipping`, `booking-simple`/`-enhanced`, `companies-crud`, `admin-login`, `onboarding-wizard`). Even isolated health-check requests during idle waits occasionally errored — the strongest signal this was load from outside this session, not something more local waiting would fix. Not treated as a regression; verified live that Staging Winery's admin panel language was correctly `en`, not stuck from an interrupted run. Follow-up: re-run the full suite once the shared `georgian-saas-dev` project isn't under heavy contention. Full detail: `playwright/Progress.md` Phase 4 section, `playwright/notes/11-locale-integrity.md`.

**Session-to-date total: 22 tests built across Phases 0-4** (17 previously + this session's 5). Still not committed to git.

---

## 2026-08-10 (latest, continued) — #147 Playwright regression suite: Phase 1 complete (8/8 passing), Phase 2 delegated to a background agent, a real 5-minute tenant-cache staleness gap found and documented

Continuation of the same day. Max said to proceed and use sub-agents where it made sense — delegated Phase 2 (booking simple/enhanced, wine catalogue → order) to a background `general-purpose` agent with a fully-specified prompt (existing helpers, real selectors already confirmed live, credential-handling rule, cleanup discipline), reserving the main thread for test 3 (theme colors) since it touches the same shared tenant settings the Phase 2 agent might not, keeping the two workstreams' live-data footprints separate.

**Test 3 turned into the session's real find.** The original plan (switch tenant theme via super-admin, compare a real rendered status color on the public booking form between light/dark) failed identically across 4 separate attempts — light and dark reads kept returning the exact same color, even with an active 15s polling wait for the background CSS variable to change. Root cause, found by reading `saas/proxy.ts` directly rather than continuing to guess at timing fixes: it caches the *entire* resolved tenant record (theme included, not just `domain → tenantId` as `MigrationNotes.md` previously documented) with a **5-minute TTL**, and a super-admin theme save never invalidates it. The super-admin edit page itself reads fresh (direct Prisma query) so its own preview updates instantly — only the public site, which reads theme from a request header `proxy.ts` populates from that cache, stays stale. **Real-world consequence:** a theme change Max makes for a client via super-admin would not visibly apply for up to 5 minutes, which could easily look like "the save didn't work" if checked immediately. Updated [[MigrationNotes]]'s existing "In-memory cache" section to document the actual scope.

Rebuilt test 3 around what's reliably testable without a 5-minute wait: (1) persistence, verified via the super-admin page's own fresh-reading swatch display across a switch/revert cycle; (2) a static check that `BookingForm.tsx`/`WineCatalogueClient.tsx` still define status colors via `color-mix()` rather than a reverted hardcoded hex — the actual shape KnownBugs #14 fixed. Both pass. The live-render comparison was manually confirmed once, by coincidence of enough wall-clock time passing for the cache to expire — real proof the mechanism works, just not something this suite can assert on every run.

**Also found, mid-debugging:** the theme-switch helper originally logged into super-admin fresh on every call (including from `afterEach`) — a 2-preset-switch test needed 3 full logins and blew past even a 90s timeout. Worse, hitting that timeout **twice left Staging Winery's real theme stuck on the dark preset** for other users/sessions until manually caught and reverted (screenshot-confirmed both times). Fixed by logging in once per test and reusing the session throughout.

**Phase 1 now complete: 8/8 tests passing** (4 overflow + 2 popover + 2 theme). Full run together showed one flaky `ERR_ABORTED`/timeout on the admin-orders overflow test, traced to dev-server resource contention with the concurrently-running Phase 2 agent (both hitting the same single dev-server process) rather than a real bug — deferred re-verification until the agent finishes rather than fight false flakiness.

**Session paused here at Max's request (resume later).** Phase 2 was delegated to a background agent (`af23c20d308c38038`) which hit two transient network errors, was resumed both times, and was mid-verification when the session paused — all 3 spec files exist (`saas/tests/tier2-core-flows/{booking-simple,booking-enhanced,wine-catalogue-order}.spec.ts`) but their pass/fail state is unconfirmed, and it hadn't yet updated `playwright/notes/04-06.md`/`Progress.md`. Full resume instructions in `playwright/Progress.md`'s "RESUME NOTE." Phase 3 (orders filters, companies CRUD, onboarding wizard) and Phase 4 (locale integrity) not started. **Not committed to git.**

**Resumed later the same day — Phase 2 and Phase 3 both completed, entirely via the same background agent, with independent re-verification after every single "done" claim.** This became the session's central discipline: the agent overclaimed completion twice (once reporting "14/14 passing, zero regressions" before a background run had actually finished — caught by an independent rerun that found 5 real failures; once similarly for Phase 3's full-suite claim), and separately fell into a repeating pattern of ending its turn on a "still running in the background, I'll pick up once it completes" assumption rather than actually blocking on real output — happened 5+ times before being told explicitly to stop backgrounding runs under ~5 minutes and just call Bash in the foreground with a generous timeout, which fixed it. Every "done" claim from the agent from that point on was independently re-run and cross-checked (full suite + direct SQL spot-checks of Staging Winery's real row counts) before being accepted — this caught real issues every single time it was applied.

**Phase 2 (booking simple/enhanced, wine catalogue → order): 3/3 built, independently reconfirmed 14/14 clean.** Real bugs found and fixed along the way: `booking-simple.spec.ts`'s time-slot check crashed (`parseInt("No slots available today")` → `NaN`) once the clock passed the last bookable slot of the day — a genuine time-of-day edge case, not a regression; a missed timeout bump in the same file; and `helpers/auth.ts`'s post-login timeout needed bumping from 15s to 25s under sustained load (a two-hop redirect), which was also intermittently breaking an unrelated Phase 1 test. Root infra cause behind the flakiness that triggered all this: the shared dev Supabase database's connection pool was genuinely exhausted from the day's sustained heavy test volume — confirmed by a *brand-new* dev-server process immediately throwing `P1001`/`P2028` straight from the pooler, recovery required actually waiting (confirmed via polling, not just a restart).

**Phase 3 (orders filters, companies CRUD, onboarding wizard): 4/4 built (test 7 already existed), independently reconfirmed 17/17 clean.** Two more real, standing app bugs found:
- **`CompaniesClient.tsx` has an invalid nested `<button>`** (`HelpHint`'s "?" trigger rendered inside the row summary button) causing a hydration mismatch on every `/admin/companies` load, which cost clicks their effect unpredictably across the page (row expand, tab toggle, even "+ Add Booking Company" itself). Worked around in the test with a click-and-verify retry helper — while manually diagnosing it live, a stale cached element reference briefly caused a real accidental edit to **Cookie Company**'s live data, caught via the actual POST body and reverted via direct SQL, confirmed restored. Spun off as its own task chip (`task_b2b8da79`) for a proper source fix, separate from the test suite.
- **Onboarding wizard (test 10) needed a second tenant**, which doesn't work the same way on localhost (every request resolves to whichever tenant `DEFAULT_TENANT_ID` points to — the exact env var a *previous* session left un-reverted for hours). Investigated a super-admin "view as tenant" mechanism first, per instruction — none exists. Used a real mechanism the app already has instead: the "Test Onboarding Wizard" tenant's own `domain` column, scoped to just that one spec file via Playwright's `test.use({ baseURL, launchOptions })` — no env var touched. One genuine, small, dev-only app-config addition was still needed (`allowedDevOrigins` in `next.config.ts` — Next's dev-server cross-origin protection was silently blocking the post-login redirect on the custom domain). The tenant itself was found already onboarded from a past session; reset via direct SQL rather than creating a new one. This test does not self-clean afterward — needs the same SQL reset before its next run, documented in its note.

**Final independent verification pass caught one more real thing:** direct SQL spot-check of Staging Winery's real data found 14 accumulated "Playwright Wine Test ..." rows in the live `WineOrder` table (Wine Orders admin has no delete action, so every test run's cleanup can only mark `Cancelled`, never actually remove the row — confirmed as a real, permanent, recurring cost of running this one test repeatedly, not a one-off). Deleted via direct SQL scoped to the unambiguous test-data business-name pattern; real data (8 companies, 4 orders, 1 genuine wine order) confirmed untouched throughout.

**Session total: 17/17 tests across Phases 0–3, all independently verified, not just agent-reported.** Only Phase 4 (locale integrity, 1 test) remains. Full detail throughout: `playwright/Progress.md` and each test's own note. Still not committed to git.

---

## 2026-08-10 (part 1) — #147 Playwright regression suite: scaffolded, Phase 0 + part of Phase 1 built and passing, two real bugs found along the way

Max asked for a Playwright-based regression suite to run after changes instead of manually re-verifying each session — a `playwright` folder with `.md` notes documenting each test, split into phases with tracked progress. Proposed 11 tests across 4 tiers first (regression suite for recurring bug shapes, core customer flows, admin smoke, locale integrity), then — at Max's request — expanded the proposal into concrete steps-and-assertions per test before building anything, per [[ClaudeInstructions]] Rule 8.

**Built:** `playwright/` at repo root (`Progress.md` phase tracker, `README.md`, `notes/01`–`11` with concrete assertions tied to specific `KnownBugs.md` entries). `@playwright/cli` + `@playwright/test` installed globally/in `saas/`; `saas/playwright.config.ts` points `testDir` at `saas/tests/` (not the repo-root `playwright/` folder — Node module resolution needs `@playwright/test` reachable from the test file's own `node_modules` tree, confirmed the hard way when a repo-root `playwright/tests/seed.spec.ts` failed to resolve the import) with `outputDir`/`reporter` redirected to `playwright/test-results`/`playwright/playwright-report`.

**Two real bugs found and fixed, neither part of the original ask:**
1. **`saas/.env`'s `DEFAULT_TENANT_ID` was stale** — still pointed at the blank "Test Onboarding Wizard" tenant from the 2026-08-07 session (which had an explicit revert comment that was never acted on) instead of Staging Winery. Confirmed via the seed test's first run (home page title showed the wrong tenant). Switched back to `cmrxb85wo0000vlc0d964nzf8` per [[MigrationNotes]], confirmed live.
2. **Admin-language-toggle race condition** — the en/ka toggle on `/admin/settings` updates its `[active]` state optimistically before the underlying `POST /admin/settings` resolves. A cleanup click in a test's `afterEach`, right before the browser context tears down, can get cancelled mid-flight — confirmed live: a failing test's cleanup left Staging Winery's *real* admin panel language stuck on Georgian for the next person to load it. Fixed by having the test helper (`saas/tests/helpers/locale.ts`) wait for the actual response, not just the click.

**Credential handling, confirmed with Max before building:** tests read `credentials.txt` directly at runtime (`saas/tests/helpers/credentials.ts`, `fs.readFileSync`) rather than copying any password into a fixture/`.env.test` file, per the `credentials` skill's explicit rule against copying secrets into other files. `maxb2bsaas@gmail.com` (tenant-locked) for standard admin tests, `super-admin-dev@nikalasmarani.test` reserved for tests needing cross-tenant access (theme preset switching, future onboarding-wizard test).

**Tests built and passing (9 total, run together clean):** the shared seed test; Tier 1's mobile+Georgian-overflow (4 sub-tests: home, wines, admin orders, admin companies — direct regression checks for `KnownBugs` #3/#8/#9/#131) and popover-clipping (2 sub-tests: the Orders "?" HelpHint and the per-row status dropdown — regression check for #7); and admin-login (2 sub-tests, built ahead of its Phase 3 slot since Phase 1 needed the login fixture anyway). Test 3 (theme-aware status colors) has its mechanism confirmed live (found the super-admin tenant-theme-editor flow, swatch buttons are `getByRole('button', { name: '<preset name>' })`) but isn't written yet — blocked on finding or seeding a company with an access code and a discounted wine, tracked as an open item in `playwright/notes/03-theme-colors.md`.

**Incidental finding, not a bug:** a status-dropdown wrapper `<div>` (absolutely positioned inside a `<td>`) returned an all-zero `getBoundingClientRect()` via raw page evaluation despite rendering correctly (confirmed via screenshot) — a Chromium table-cell/absolute-positioning measurement quirk, not a real clipping bug. Worked around by asserting on the individual option buttons instead of the wrapper; noted in `playwright/notes/02-popover-clipping.md` in case it recurs.

**Not committed to git.** Remaining work tracked in `playwright/Progress.md`: finish test 3, then Phase 2 (booking/wine-order flows), Phase 3 (companies CRUD, onboarding wizard — needs a dedicated test tenant), Phase 4 (locale integrity).

---

## 2026-08-07 (part 12) — #127 Onboarding: real bugs found hands-on by Max on a fresh test tenant, all fixed; public-site theming double-checked

> Full detail retained (within the "most recent 2 sessions" window per this file's header).

Same day, continuation of part 11. Set up a genuinely blank test tenant ("Test Onboarding Wizard," all 5 modules on) so Max could inspect the full wizard from a true zero state — created via the real super-admin flow, then pointed local dev's `DEFAULT_TENANT_ID` at it (no new Supabase Auth account created; reused the existing `super-admin-dev` login, which can access any tenant regardless of domain lock — kept within the standing rule of not creating credentials on Max's behalf).

**Max found two real bugs by actually using it**, not from spec review: (1) adding a company in the wizard gave no way to mark it as a booking company, wine-order company, or both — turned out `createOnboardingCompany()` never passed module flags to `createCompany()` at all, silently defaulting every wizard-created company to booking-only regardless of the tenant's actual modules. (2) the real `/admin/companies` list page gives no at-a-glance indication of which companies are missing details — the exact thing deliberately deferred earlier this session (see [[Plan-OnboardingFlow]] Phase 3) once the full scope became clear.

**Fixed both, plus one bug found while fixing #1:** `createOnboardingCompany()` now takes explicit module flags; `CompaniesStep.tsx` asks via a small pill selector, but only when the tenant has both Bookings and Wine Orders on (asking when there's only one possible answer would just be extra clicking). Fixing this exposed that `getFinishDetailsStatus()`'s "needs pricing" check applied to ALL companies including wine-order-only ones, which never use price tiers at all — would have permanently flagged them as incomplete with no way to satisfy it. Fixed the same way in both the banner logic and a new per-row badge on the real Companies page (`missingDetails()` in `CompaniesClient.tsx`, reusing the click-reveal `HelpHint` component, not a new hover-only tooltip). All three logged as [[KnownBugs]] #11–13.

**Also asked, and double-checked rather than assumed: does the site actually respect all 10+ custom super-admin themes?** Delegated a line-by-line audit (subagent) of every public-facing page against the theme CSS variables — verified two of its highest-severity claims directly before reporting back. Result: yes, the *structural* theming (backgrounds, borders, text, brand color) is solid everywhere checked, matching what Max believed. The real, narrower gap: the two most recently built customer flows (enhanced company booking, wine catalogue's company/discount UI) hardcode green/red status-badge colors that were copy-pasted between `BookingForm.tsx` and `WineCatalogueClient.tsx` and never hooked up to theme tokens — would look visibly wrong on a dark preset. Confirmed the admin panel's own hardcoded-chrome pattern (only the brand accent color is theme-aware there, same as every other admin page, not a wizard-specific issue) is a separate, pre-existing, much larger design question — not conflated with this narrower public-site finding. Logged as [[KnownBugs]] #14; Max said fix it now.

**Fixed same session:** rather than hand-author success/error colors for all 16 presets, both files now blend the semantic hue into the theme's own surface/border/text via CSS `color-mix()` (e.g. `color-mix(in srgb, #16a34a 12%, var(--site-surface))`), so status colors stay recognizably green/red while automatically adapting to any preset's actual tone. Verified the mechanism directly against real computed CSS on both the light default and a dark preset — switched the test tenant to "Midnight cellar" via super-admin specifically to check, confirmed the mix correctly produces a dark-green-tinted box with bright readable text instead of a pasted-in light mint box, then reverted the tenant back to its original theme. `tsc --noEmit` clean. Full detail: [[KnownBugs]] #14.

Verified all fixes live on the fresh test tenant: a company added with both module pills selected shows "Both modules" on the real Companies page exactly as manual creation would; the new "⚠ Needs details" badge correctly click-reveals "Still missing: ID code, contact info" for a real company missing both; Georgian + mobile (375px) clean on both; status colors confirmed adaptive on both a light and dark theme. `tsc --noEmit` clean throughout. Not committed to git.

---

## 2026-08-07 (part 11) — #127 Onboarding: wizard philosophy reversed, 5 → 7 steps, real store bug found and fixed

Same-day continuation of part 10. Testing the freshly-built Phase 3 nudge live surfaced two real problems Max raised directly: clicking through to Companies gave no visual cue about *which* companies needed what, and the banner living only on `/admin/orders` would leave any tenant without the booking module completely blind to it. Asked for a subagent-driven first-principles audit of the whole admin panel's setup surface rather than patching the visible symptom.

**Audit findings, independently spot-verified against the real code (not trusted at face value):** confirmed the real module set (`modulesBooking`/`modulesWineOrders`/`modulesPublicSite`/`modulesLegalPages`/`modulesOnlinePayment` on `Tenant`, plus the Setting-level `enable_enhanced_company_booking`) directly from schema/proxy. Confirmed live that `sendInvoiceEmail` reads IBAN/bank fields unconditionally (not gated by the payment module) and that `PaymentSetupBanner`'s existing check is Flitt-credentials-only. The real headline finding: the wizard's Contact step had been writing to the wrong database table this entire time — `SiteContent` (feeds only `/contact`) instead of `Setting` (feeds the sitewide footer/nav and every invoice's return address) — now [[KnownBugs]] #10.

**Max reversed the wizard's founding principle.** The original plan (2026-08-04) was explicitly "essentials now, full details later" — minimal wizard, defer everything else to a post-launch nudge. Today: *"I want each section to include EVERYTHING it needs to operate. Users can skip it but it must be part of the flow so they understand it's highly recommended."* That's not a tweak, it's the opposite premise. Put three concrete decisions to him directly rather than assuming: Flitt stays non-blocking even though it moves into the wizard; Menu/Masterclass become a qualifying-question step (checked `BookingForm.tsx` directly first — confirmed both add-on sections already guard on having real items, so this was never a guest-facing bug, just missing coverage); Payment Info becomes a genuine `readyToLaunch` condition, gated on IBAN specifically.

**Delegated the build in two passes** (Plan agent for the concrete structure, then a build subagent from a fully-specified prompt) — wizard grew from 5 to 7 steps (added Booking Details, Payment Info; Contact renamed to Contact & Site Info with the store fix + Maps embed field), `getFinishDetailsStatus()` rebuilt from a 2-dimension combinatorial model (13 keys, doesn't scale) to a flat priority-ordered condition list.

**Independently re-verified the build against the real diff, not the subagent's summary — caught a real gap of my own making.** I'd told the *planning* pass that moving the banner into the shared layout was "already decided," but never actually carried that as an instruction into the *build* prompt. The subagent built everything else correctly and left both banners on `/admin/orders` only, silently reproducing the exact blind-spot this whole rework was meant to fix. Caught by checking where the components actually render, fixed directly: `OnboardingBanner`/`FinishDetailsBanner` now live in `app/admin/(panel)/layout.tsx`. Also found and fixed two hardcoded `/admin/orders` links (wizard "Finish for now" + header back-link, now `/admin/companies`) and a stale "this is the first one" footer string left over from the original 1-step wizard.

**Verified live on Staging Winery:** added and deleted a real test dish via the new Booking Details step (confirmed as a genuine independently-editable `/admin/menu-items` row, not optimistic UI); Payment Info and Contact & Site Info both correctly pre-fill real data (the latter previously would have shown blank — concrete proof of the store fix, not just a code-read inference); Review correctly shows Payment as required/done and Booking Details as optional/incomplete; `FinishDetailsBanner` confirmed actually rendering on `/admin/menu-items` and `/admin/settings`. Georgian + mobile (375px) clean throughout. `tsc --noEmit` clean after every fix. Full detail: [[Plan-OnboardingFlow]]. Not committed to git — still two sessions' worth of work sitting on the `staging` working tree.

---

## 2026-08-07 (part 10) — #127 Onboarding: Phase 3 "finish full details" nudge built, one unrelated bug fixed

Picked up the one remaining piece of the original #127 plan that hadn't been touched since 2026-08-04: the post-launch nudge that surfaces which wizard-created (or old-way-created) Company/Wine records are still minimally filled in. Started by reviewing a draft handoff prompt Max had written for a fresh session — checked its claims against the real repo (file paths, the #127 FeatureLog row, git status, branch) rather than taking it at face value; it held up, with two small gaps flagged (unrelated #139 changes also sitting uncommitted in the tree, and whether the new banner should go through the project's usual mockup-first pass for visual/UX changes).

**Research before building, per the plan's own field table needing a re-check:** read `companies.ts`, `wines.ts`, and `prisma/schema.prisma` directly rather than trusting `Plan-OnboardingFlow.md`'s original field breakdown, which predates #146's VINTAGE-mode default. Confirmed live on Staging Winery (VINTAGE mode) that wine-level `wineType`/`sweetness` are non-nullable with defaults — undetectable as "unset" — so the real per-record trigger fields ended up narrower than the plan doc originally listed: `identificationCode`/contact fields/pricing for companies, `nameKa`/`description`/`imagePath`/per-vintage characteristics for wines. Put the "one central banner vs. per-row badges" surfacing question to Max directly rather than assuming — he picked the central banner, matching Phase 3's own spec wording.

**Built via a delegated subagent** (`claude` type, fully-specified prompt with exact trigger rules, function signatures, and file list — the kind of task well-suited to delegation since nothing in it needed back-and-forth clarification): `getFinishDetailsStatus()` in `app/actions/onboarding.ts` (new function, not an extension of `getOnboardingStatus()`, since it runs heavier per-record queries), new `FinishDetailsBanner.tsx` mirroring `OnboardingBanner.tsx`'s shape, wired into `/admin/orders` alongside it, 13 new `finishDetails.*` EN/KA keys in `adminT.ts`. Independently re-verified the actual diff against the spec afterward rather than trusting the subagent's own summary (its key-count claim was off by 2, harmless, caught by counting) — confirmed the DB write path (`WinesClient.tsx`'s `handleSaveProduct`) genuinely nulls `nameKa` on clear rather than leaving stale data that would fool the check.

**Bug found and fixed as a byproduct, not part of this feature:** verifying the banner at 375px in Georgian surfaced a real overflow on `/admin/orders` — but tracing it (element-by-element inspection, comparison against `/admin/wines` at the same width) showed it was the page's own pre-existing header row (title + view toggle + "+ New Order" button, no `flex-wrap`), unrelated to the new banner. Same bug class as #131/the Companies-step fix. Fixed with `flex-wrap` + `gap-y-2`, re-verified clean. Logged as [[KnownBugs]] #9.

**Verified live on Staging Winery:** banner shows correct real counts ("N companies and M wines still need full details") against genuinely partial real data, correct EN singular/plural, correct Georgian with working interpolation (not independently native-checked — flagged to Max), correct link priority (companies → wines → content), mobile clean after the header fix, `OnboardingBanner` stays hidden with zero changes to it, `tsc --noEmit` clean throughout. Not click-tested: the banner's own "disappears once nothing's outstanding" path — would have meant overwriting real Staging Winery test data just to empty the trigger set.

Two items remain open from the original #127 plan, neither blocking: Supabase login auto-provisioning (Phase 0, only needed for a future self-serve signup flow) and `ReviewStep.tsx`'s still-hover-only `StatusIcon` (cosmetic). Full detail: [[Plan-OnboardingFlow]]. Not committed to git.

---

## 2026-08-04 (part 9) — #127 Onboarding: Companies step visual redesign, mockup-approved then shipped

Same-day continuation — of the three open threads (redesign, post-launch nudge, Supabase provisioning), Max picked the redesign, the one flagged as blocking real confidence in the wizard.

Researched SaaS onboarding UI patterns before proposing anything (labeled step indicators beat icon-only past ~4 steps; "confidence before completeness" as a design principle), combined with the unresolved items from the original live review that day (hover-only `StatusIcon`, wordy copy naming internal routes, badge crowding). **Built one interactive annotated mockup as an Artifact before touching real code** — same pattern already proven in this project for the Wines panel redesign — using the real app's actual brand tokens, 5 numbered changes each with a click-to-highlight link to the corresponding mockup element. Max approved the direction immediately, no revision round.

**Implemented directly, same session:** `StepNav.tsx` gained always-visible short labels under each icon (connector line repositioned via absolute placement to stay centered on the icons). `StatusIcon`'s hover-only badges on the Companies list replaced with `HelpHint` — direct reuse of the component already shipped for #139, not a new one — collapsing 3 always-visible badges per company row down to 1 (the actionable pricing warning) + 1 combined-status hint. Pricing summaries now show an amount ("2 tiers from 45₾/person"), not just a count, on both the company list and Individuals pricing. Trimmed `priceHint`/`detailedHint`/`addHint`/`skippedBody`/`doneBody` to one clause each, removing "...from the Companies page"-style internal references.

**Bug found and fixed live:** the new StepNav labels crowded together in Georgian — a classic flexbox gap where children don't shrink below their content's natural width by default, so Georgian's longer words overflowed each step's column into the next one's space. Fixed with `min-width: 0` + `break-words` so long labels wrap inside their own column instead. Re-verified clean at 375px in both languages.

Verified live end-to-end on Staging Winery: desktop + mobile + Georgian on the redesigned Companies step, including the exact "x" company row the original review flagged as over-cluttered — now shows one clean badge instead of three crammed next to a one-letter name. `tsc --noEmit` clean throughout. Admin language restored to `en` after testing. Deliberately not touched: `ReviewStep.tsx`'s own `StatusIcon` usage (same gap, lower priority, flagged as a follow-on) and the rest of the admin panel's visual language (this was "fit the panel better," not a re-skin). Full record: [[Plan-OnboardingFlow]]. Not committed.

Two threads remain open from the original #127 plan: the post-launch "finish full details" nudge, and Supabase login auto-provisioning.

---

## 2026-08-04 (part 8) — #139 Guide Mode: expanded to 5 more admin pages

Same-day continuation. Asked what was next across the two open plans (#139's remaining pages, #127's Supabase-provisioning/post-launch-nudge leftovers, the deferred visual redesign) — Max chose to keep expanding guide mode.

Delegated a survey of the 6 remaining admin pages (Orders, Wine Orders, Statistics, Content, Menu Items, Masterclass) to an Explore agent, with the same discipline already established: only flag fields genuinely unexplained anywhere in the UI, skip anything already covered by inline hint text. Found real gaps in 5 of 6 — Menu Items needed nothing (its existing intro text + a `title` tooltip already cover its one non-obvious field).

**Added hints:** Orders — "Print Sheet" vs. the per-row invoice-print icon (a confusable pair, same shape as the earlier Admin-Language/Site-Language one). Wine Orders — the Pack-mode toggle's silent pre-selection rule (Confirmed/Paid checked automatically on entering Pack mode, Pending left unchecked, invisible anywhere else). Content — the Booking-Form Simple/Detailed preview toggle, another confusable pair (it only changes the preview here; production behavior is the separate `enable_enhanced_company_booking` setting on the Settings page). Statistics — the Historical/All-Time totals include cancelled orders; **verified this directly in `page.tsx` before writing the copy** (`tx.order.findMany` has no status filter) rather than trusting the research agent's claim as-is. Masterclass — the sort-order `#` field had no explanation anywhere, unlike Menu Items' equivalent.

No changes needed to `HelpHint`/`AdminHintsContext` themselves — confirms the architecture from part 7 was right: adding a hint anywhere is a one-line component + an adminT pair, zero new wiring. Verified live on Staging Winery: all 5 new hints render and open correctly; Georgian + mobile spot-checked on the Masterclass one (clean wrap, no overflow, matching the earlier pages' results). `tsc --noEmit` clean. Admin language restored to `en` after testing. Full record updated in [[Feature 139 - Guide Mode]]. Not committed. Coverage now 7 of 8 panel pages from the original scope list; only Wines (not originally in scope) untouched.

---

## 2026-08-04 (part 7) — #139 Guide Mode: researched, planned, built, verified live

Max asked for #139 (contextual admin hints) but wanted real-product research before building, not the old `Plan-OnboardingFlow.md` sketch executed as-is. Researched industry patterns (Tooltips/hotspots vs. Tours vs. Checklists terminology from Appcues/Pendo/Userpilot/Chameleon; WordPress admin Help tabs; Salesforce in-app guidance) and found the original sketch's "activatable toggle, hidden until turned on" framing has no real precedent — every established pattern is visible-by-default with an opt-out, since gating help behind an opt-in switch defeats its purpose for the confused first-time admin who wouldn't know to look for it. Also found the original "zero duplicate content-writing" claim only covered onboarding's own fields, not the rest of the panel. Put both findings to Max as explicit questions rather than silently deciding — confirmed: default-on hints with an off switch, and start with wizard-adjacent pages (Companies, Settings) rather than the whole panel at once.

**Built:** `show_admin_hints` tenant Setting (default `'true'`) + a "Guide Hints" toggle row on `/admin/settings` (reused the existing `Toggle` + pill-switcher patterns, no new UI primitives there); `components/AdminHintsContext.tsx` (React Context, fetched once in `app/admin/(panel)/layout.tsx` so every admin page inherits hint visibility automatically, no per-page wiring); `components/HelpHint.tsx` — a click-to-reveal "?" icon, deliberately not hover-only (this codebase's only prior tooltip mechanism, `StatusIcon`'s native `title` attribute, was already flagged as an accessibility gap in an earlier review — this fixes that pattern going forward rather than repeating it). Wired into `CompaniesClient.tsx` (Modules checkboxes, the Individuals/public-pricing concept) and `SettingsClient.tsx` (Admin Panel Language vs. Default Site Language distinction) — deliberately skipped fields that already had inline explanatory text, to avoid clutter.

**Bug found and fixed live, same session:** the first version's popover was a plain nested `position: absolute` div — got silently clipped by the Individuals row's `overflow-hidden` container, invisible except for a one-pixel sliver. Recognized this as the same clipping-by-ancestor problem `OrdersTable.tsx` already solved for its status dropdown (#140) and applied the identical fix: `createPortal` into `document.body`, `position: fixed`, computed from the trigger's `getBoundingClientRect()`. Re-verified live — popover renders fully, correctly clamped within the viewport on both desktop and mobile.

**Verified live on Staging Winery:** hints visible by default, toggle off → gone on next page load, toggle back on; keyboard reachable (native `<button>`) and Escape-dismissible; outside-click dismiss; mobile (375px) — popover stays on-screen; Georgian — text wraps cleanly in the fixed-width popover, no overflow (checked given the mobile/Georgian overflow bug class already found once in #127). `tsc --noEmit` clean. Admin language setting restored to `en` after testing. Full design record: [[Feature 139 - Guide Mode]]. Not committed. Remaining panel pages (Orders, Wine Orders, Statistics, Content editor, Menu Items, Masterclass) intentionally not covered yet — next candidates per the confirmed "start small" scope.

---

## 2026-08-04 (part 6) — #127 Onboarding: skeleton built for all remaining steps, verified live

Same-day continuation of part 5's approved plan. Before building, resolved two gaps found by checking the plan against this file's own earlier decisions (see [[Plan-OnboardingFlow]] for full reasoning): **navigation** — the original Phase 1 spec said "Linear, progress-bar," but the first skeleton draft had gone non-linear (jump to any step); reasoned through both options and picked **linear-forward with backward-only review** (a real consumer-app onboarding is strictly forward with zero navigational decisions — closer to "as little reading as possible" than a free-jump stepper). **Wine fields** — the original minimal-field table deferred `color`/`sparkling`; the first draft had added a picker/toggle for both anyway since `createWine()` requires values. Resolved to stay deferred: `sparkling` always `false`, `color` silently derived from the `wineType` already being asked (an internal lookup, not a new field) — avoids a white wine defaulting to a red swatch at zero added UI.

**Built:** the wizard shell (`OnboardingWizard.tsx`, `steps/StepNav.tsx`, `steps/shared.tsx`) replacing the single-step page; `steps/CompaniesStep.tsx` (today's step relocated verbatim — **and, as a byproduct of touching this code, fixed the confirmed mobile/Georgian horizontal-overflow bug** from the earlier review by adding the missing `flex-wrap`); `steps/WineStep.tsx` (module-conditional, mode-aware — PRODUCT mode asks type/sweetness via colored chips, VINTAGE mode just name/year/price); `steps/ContactInfoStep.tsx` (3 icon-prefixed fields, autosave on blur, reusing `saveContent()` against the existing SiteContent contact keys); `steps/ContentPhotosStep.tsx` (logo + home hero upload, drag-drop, large previews, reusing `uploadTenantLogo`/`uploadBgImage` unmodified); `steps/ReviewStep.tsx` (visual checklist + Launch button, persists `onboarding_launched_at` as a record, not a gate). `getOnboardingStatus()` extended with `wineStepDone`/`contactInfoStepDone`/`contentPhotosStepDone`/`readyToLaunch`/`launched`/`launchedAt` — `stepDone` now equals `readyToLaunch`, so `OnboardingBanner.tsx` needed zero code changes, confirming the live-recompute design holds under extension. `createWine()` gained a return value (purely additive, matches `createCompany()`'s existing shape).

**Verified live on Staging Winery** (a real, already-fully-onboarded tenant from earlier sessions — resumed straight to Review as expected, all steps showing done from real existing data): clicked back through every step via `StepNav` and confirmed each renders real data correctly (existing companies, 6 real wines, real contact info, real hero photo, logo fallback since none is set); added a genuine test wine end-to-end (`createOnboardingWine` → confirmed as a real, independently editable row on `/admin/wines` → deleted after); clicked Launch, got "Launched Aug 4, 2026," clicked Launch again, both worked; confirmed the Orders banner stays correctly hidden. Mobile (375px) + Georgian spot-checked on the Companies and Wines steps specifically — `scrollWidth === clientWidth`, confirming the earlier bug is actually fixed, not just theoretically addressed. `tsc --noEmit` clean throughout.

**Not click-tested, disclosed rather than assumed:** the Photos step's actual file-upload interaction and the Contact step's autosave actually firing — both display real existing data correctly, but exercising the write path would have meant overwriting Staging Winery's real logo/hero image or contact info. Both reuse already-proven, unmodified server actions, so risk is low but not zero — same tradeoff already made for Individuals pricing's empty state in part 4.

**Deliberately still a skeleton** — visual design (colors, spacing, copy density) matches the rest of the admin panel's existing inline-hex convention but isn't the polish pass Max deferred; that's still owed for the whole wizard, including revisiting the Companies step's reviewed issues (part 5). Not committed — sitting in the working tree pending Max's review, per [[ClaudeInstructions]] Rule 0/8. Tracked in detail, resumable, in [[Plan-OnboardingFlow]].

---

## 2026-08-04 (part 5) — #127 Onboarding: UI/UX review + skeleton plan for remaining steps (nothing built)

Continuation of the same day's work. Two distinct pieces, both delegated to context via research rather than assumption.

**UI/UX review of the built Companies step**, against the plan's stated goal ("consumer-app, streamlined, confidence-building") — read [[Plan-OnboardingFlow]] + all of part 4's decisions first, then tested live on Staging Winery at desktop, mobile (375px), and both locales rather than reviewing from code alone. Findings, prioritized: **(1) a confirmed, reproducible bug** — Georgian copy overflows the viewport horizontally on mobile (`scrollWidth: 399` vs `clientWidth: 375`, verified via script, not just eyeballed), clipping the "Add company" button off-screen; root cause is `OnboardingClient.tsx`'s Simple-mode row missing `flex-wrap` (its Detailed-mode sibling has it, English text just happened to fit so this never showed up before). **(2)** the `StatusIcon` hover-only `title`-tooltip badges are a new pattern that diverges from the real Companies page's own convention (visible text pills, e.g. "✓ Code set") and breaks entirely on touch/mobile with no keyboard fallback. **(3)** "Step 1 of 1 · Companies" contradicts the page's own footer copy about more steps coming. **(4)** hint-paragraph copy repeatedly names internal admin page routes ("refine it later from the Companies page"), undercutting the consumer-app framing. Full findings delivered in-session; not duplicated into the vault since this review is a point-in-time artifact, not a standing architecture doc — the one confirmed bug and the "hover-only badges diverge from established pattern" finding are the two worth remembering, now recorded in [[Plan-OnboardingFlow]] for whoever eventually touches this step's visual design.

**Skeleton plan for the remaining wizard steps** — Max, after the review, said he isn't sold on the current step's design but wants to keep moving: build the rest as a skeleton now, revisit visual design later, but bake in one new non-negotiable principle from the start — *"seamless, as little reading as possible, as visual as possible."* Researched via an Explore agent (wine/contact-info/content-photos step field sources, all traced to real files, no invented fields) then a Plan agent (concrete file-by-file implementation design), both independently spot-verified against the actual code afterward (confirmed `createWine`/`createVintage` return shapes, `getContentMap`, the wine-orders module header pattern, `BackgroundsTab.tsx` defaults, and that `lucide-react` is an already-installed-but-unused dependency with the exact icon set needed). Four real open decisions were surfaced to Max rather than assumed and all four recommended defaults were confirmed: skip per-vintage detail fields in the wizard's wine step even in VINTAGE mode; Launch persists a timestamp `Setting` as a record (not a gate); logo alt text defaults silently to the tenant name; contact-info step counts as done once any one of phone/email/address is set.

Full plan (wizard shell split, wine/contact/photos/review steps, `getOnboardingStatus()` extension, exact function signatures) went through the plan-mode approval flow and was approved by Max — then recorded into [[Plan-OnboardingFlow]] rather than left only in the transient plan-mode file, per the standing "plans belong in the vault" rule. **Nothing built yet** — Max asked to pause right after approval and pick this back up later. Resume point and build order are written in [[Plan-OnboardingFlow]]'s new section.

---

## 2026-08-04 (part 4) — #127 Onboarding flow: first vertical slice built (Companies step)

Resumed #127 now that #146 shipped and unblocked the wine step. Plan's open sequencing question ("full Phase 0 foundations first, or a thin vertical slice") was put to Max directly — he chose **vertical slice**: just enough of Phase 0 for one entity (Companies, the simpler of the two) plus the wizard shell (Phase 1) plus the Companies step (Phase 2), so there's a real clickable wizard fast rather than weeks of foundation work with nothing to react to.

**Drift found while grounding the plan in actual code, before writing anything:** [[Plan-OnboardingFlow]]'s Phase 0 assumed a `CompanyForm`/`WineForm` component to "refactor into minimal mode." Neither exists — company editing is an inline `EditPanel` inside `CompaniesClient.tsx`, wine editing is inline in `WinesClient.tsx` (already reshaped by #146's tab redesign). Adjusted: "minimal mode" reuses `createCompany(name, modules)` directly (it already matched the minimal field set) rather than extracting any new form component.

**Built:** `getOnboardingStatus()` in new `app/actions/onboarding.ts` — computed live from a plain `Setting` row (`onboarding_works_with_companies`, no schema migration) + real company count, same `requireModule.ts`-style pattern as the rest of the plan calls for. `createCompany()` extended to return the created row (id/name/accessCode) so the wizard can show the access code immediately without a page reload — additive, doesn't break existing callers. New standalone route `app/admin/onboarding/` (own minimal header, no full nav — `OnboardingClient.tsx` renders the qualifying question → either "no companies needed" or a minimal add-company form with a running list). New `OnboardingBanner.tsx` (mirrors `PaymentSetupBanner`'s shape) added to `/admin/orders`, showing a persistent "finish setup" nudge until the Companies step is done, gone once it is — never a stored flag. `onboarding.*` keys added to `adminT.ts` (en/ka).

**Verified live on Staging Winery (localhost, logged in as super-admin):** qualifying question → "Yes" branch → added a real test company, access code appeared instantly with no reload, company also showed correctly on the real `/admin/companies` page and in the Orders company filter. "No" branch renders its own explanation copy correctly. Banner-visibility logic double-checked by temporarily clearing the Setting row via a throwaway script — banner reappeared on Orders as expected, then restored. Test company deleted after, temp scripts removed. `npx tsc --noEmit` clean.

**Follow-up same session — pricing gap Max caught reviewing it live:** he asked whether a wizard-created company gets "default pricing," worried about guests being charged the wrong rate. Checked the real code rather than assuming: `createBooking.ts` already had this gap before today — a company with zero `Price` tiers isn't rejected or zeroed, it silently falls through to billing at the tenant's Individuals/walk-in rate (`company?.prices.length` check simply skips the company-tier branch). Pre-existing app behavior, not something this feature introduced, but the wizard would make it easy to create companies fast without ever hitting the Companies page's pricing UI, so more likely to bite in practice. Offered three options (fix the fallback itself app-wide, warn inside the wizard only, or require a starting price at creation time); Max chose **require a starting price**. Built `createOnboardingCompany()` in `app/actions/onboarding.ts` — atomic company + one flat per-person `Price` tier (1–999 guests, tasting and tasting+lunch both set to the entered rate), rolling back (deleting the company) if the price write fails, so the wizard can never leave a company unpriced. The "Added so far" list now also shows a price summary or a "⚠ No pricing set" badge for every company on the tenant, not just ones added this session — surfaces the same gap for companies created the old way too. Verified live: empty-price submission is blocked client-side with a clear message; a real submission creates a genuine, independently editable `Price` row confirmed on the actual Companies page ("1–999 guests · Tasting: 55₾/pp · +Lunch: 55₾/pp"); pre-existing test companies with no tiers correctly show the warning badge. `tsc --noEmit` clean. Test data cleaned up after, onboarding-answered state reset to unanswered so Max sees the flow fresh.

**Second follow-up — Simple/Detailed pricing toggle:** Max, watching the flat-rate-only field, worried admins might never realize tasting/lunch can be priced separately or tiered by group size at all. Agreed to scope a toggle to pricing only (not the deferred contact/ID fields — reusing those in the wizard would just rebuild the Companies page's whole form a second time, the exact duplication the plan avoided). `createOnboardingCompany(name, tier)` generalized from a bare number to a full `OnboardingTier` object, so Simple mode (builds a 1–999-guest flat tier client-side) and Detailed mode (real min/max guests, tasting rate, tasting+lunch rate, flat fee — same fields and `companies.priceForm.*` copy as the real page) share one path. Companies already in the list also gained a **"+ Add another tier"** inline affordance (reuses `createPrice` directly, no wrapper needed since the company already exists), so a Detailed-mode user can build out a full multi-tier schedule without ever leaving the wizard. Separately, Max asked to communicate the still-deferred fields more clearly — extended the existing pricing-badge pattern (which he'd already seen and liked) rather than only relying on hint-text copy: every company in the list now also shows a neutral **"ℹ No contact info yet"** note (distinct styling from the amber pricing warning, since this one's expected-deferred, not a risk) whenever none of contactName/contactPhone/contactEmail/address/identificationCode are set. `page.tsx` now fetches those fields plus the full `prices` array (price-summary formatting moved client-side so it can react live to tiers added after creation, not just at load). Verified live: Detailed mode created a company with independent tasting (45₾) and tasting+lunch (65₾) rates, confirmed on the real Companies page; "+ Add another tier" on an existing company correctly flipped its summary from "45₾/person" to "2 tiers" without a reload. `tsc --noEmit` clean. Test company deleted after — left Max's own manually-created test companies ("wizard test", "registration form test") untouched, they're his, not verification noise.

**Third follow-up — UI feedback from a screenshot review:** Max sent a screenshot of the list and flagged three things. (1) The Simple-mode price field's placeholder text ("Price per person (₾)") was clipped inside a too-narrow `w-40` input — replaced with the same labeled `SmallField` pattern the Detailed fields already use (label above, full-width input) rather than trying to just widen it, so it can't clip regardless of locale/copy length. (2) The raw access code was printed straight into the list (`Code: GVIN04250`) — swapped for the same green "✓ Code set" pill the real Companies page already uses for this exact purpose (reused the existing `companies.codeSet` key rather than inventing a new one), so the wizard never displays codes it doesn't need to display. (3) "+ Add another tier" was showing on every company regardless of mode, cluttering Simple mode with a Detailed-only concept — now conditional on `mode === 'detailed'`. Removed the now-unused `onboarding.companies.accessCode` key from `adminT.ts` (en/ka) since nothing reads it anymore. Verified live: label displays in full, every company shows the green pill instead of a raw code, and the tier-add link only appears after switching to Detailed. `tsc --noEmit` clean.

**Fourth follow-up — Individuals/walk-in pricing was completely outside this flow:** Max asked directly whether individual-rate pricing gets prompted for at all. It didn't — the wizard only ever touched the `Company` (isIndividual: false) side; the "Individuals" synthetic company and its own `Price` tiers (what the real Companies page's "Public pricing" card edits) were never referenced. Worse than a missing nice-to-have: answering **"No, individuals only"** closed the step with zero pricing prompted for the one thing that tenant actually needs, and a "Yes" tenant almost certainly takes individual bookings too. Given the effort already spent making sure company bookings can't go out unpriced, this undercut that. Offered to add it to this step (unconditional, regardless of the companies answer), split it into its own later step, or leave the gap for now — Max chose **add it here, unconditionally**.

Built: `OnboardingStatus` gained `individualsPricingSet` and a combined `stepDone` (both the companies condition AND individuals pricing must be true) — `OnboardingBanner.tsx` now checks `stepDone` instead of just `companiesStepDone`, so the nudge stays up until both are handled. New `addIndividualsPriceTier()` in `app/actions/onboarding.ts` writes to the tenant's existing Individuals company (created via the same `ensureIndividualsCompany()` the real Companies page already relies on — now also called from `onboarding/page.tsx`) — and, specifically for the *first* tier only, also calls the existing `setDisplayPrice()` action, because without that the public site's #125 neutral-fallback behavior would keep showing no price even after the wizard "set" one (display price is otherwise a separate manual toggle admins have to remember). Refactored the Simple/Detailed tier-building logic (previously inline in the Companies form's `handleAdd`) out into a shared `buildTierFromFields()` so the new `IndividualsPricingSection` component reuses the exact same validated logic rather than a second copy. That section renders unconditionally above the companies question — collapses to a green "✓ Pricing set" summary once tiers exist (reusing the existing `AddTierInline` component for adding further tiers, same as companies), or the same Simple/Detailed form when empty.

Verified live on Staging Winery: the section correctly read its 3 already-seeded Individuals tiers on load and showed "✓ Pricing set"; clicking "+ Add another tier" opened the real, reused inline form against the correct company id (cancelled without saving — didn't want to touch real seeded pricing data just to see an empty state); confirmed the Orders banner now stays hidden only because *both* conditions are satisfied, by checking it reads empty page text (no banner) with page text confirming both a company and Individuals pricing exist. **Not click-tested live:** the empty/not-yet-set form path and the first-tier auto-display-price branch specifically, since forcing that would have meant deleting Staging Winery's real Individuals pricing rows first — flagged this honestly rather than claim full coverage; the code reuses already-proven pieces (`buildTierFromFields`, `createPrice`, `setDisplayPrice`) so risk is low but not zero. `tsc --noEmit` clean, no test data left behind.

**Fifth follow-up — gating + icon badges:** Max asked (1) for the Individuals section to be filled in *first*, with the rest of the step greyed out/disabled until it is ("however popular apps would handle a similar flow" — progressive disclosure, not hidden, just visibly next-up and inert), and (2) to replace the "No contact info yet"/"No pricing set"/"Code set" text badges with icons that reveal the text on hover, since the per-company row was getting crowded.

Built: lifted the Individuals `prices` state up from `IndividualsPricingSection` into the parent (was component-local) so the parent can compute `individualsSet` and gate on it — the whole companies block (qualifying question through the added-companies list) is now wrapped in a container that goes `opacity-40 pointer-events-none select-none` plus a small "Set your Individuals pricing above to continue" note whenever it isn't set yet, and returns to normal the instant it is. New `StatusIcon` component (small circular badge, native `title` attribute for the hover tooltip — no extra library) replaces the three text badges in the company list row: green ✓ for Code set, amber ⚠ for No pricing set, grey ℹ for No contact info yet. Stripped the now-redundant leading emoji from the `onboarding.companies.noPricingSet`/`noContactInfo` adminT values (en/ka) since the glyph now lives in the icon itself, not the tooltip text. Left the Individuals section's own "✓ Pricing set" summary as visible text, not icon-only — it's a single prominent status, not a crowded row, so hiding it behind a hover didn't seem worth it.

Verified live: confirmed via `document.querySelectorAll('[title]')` that all three tooltips carry clean text with no duplicated glyphs. Reset Staging Winery's onboarding state again to check the actual gated view (backed up the real Individuals tiers first, same as the earlier check) — screenshotted the dimmed companies section with the gate note showing, then **clicked "Yes, we work with companies" directly and confirmed nothing happened** (still on the qualifying question), proving the gate genuinely blocks interaction rather than just looking disabled. `tsc --noEmit` clean.

**Handoff note:** left Staging Winery's onboarding state reset to fully fresh (both the qualifying question and Individuals pricing cleared) per Max's ask, specifically so he can go through the whole flow himself from a clean start — the real Individuals pricing that was there is backed up (two backup files now, from two reset rounds this session, both in the session scratchpad) and will be restored on request, or skipped if Max sets his own pricing through the form instead.

**Sixth follow-up — inconsistent price display:** Max noticed some companies showed a price ("30₾/person") and others showed a tier count ("2 tiers") — that was `priceSummary()`'s deliberate single-tier-vs-multi-tier branch, but it read as an inconsistency rather than a feature. Changed both `priceSummary()` and the Individuals section's summary to always show a tier count, singular-aware ("1 tier" / "2 tiers") via a new shared `tierCountLabel()` helper — removed the now-unused `onboarding.companies.perPerson` adminT key (en/ka) since nothing reads it anymore. Verified live: every company and the Individuals section now read "N tier(s)" uniformly. `tsc --noEmit` clean.

**Not built yet, still per the plan:** Wine step (needs its own minimal-mode form now that #146 makes it vintage-aware by default), business-basics/content-photos/review steps, the completeness-driven "launch" state, `createTenant()` Supabase login provisioning, #139's guide-mode toggle. Also still open: whether the pre-existing zero-tier fallback-to-Individual-rate behavior should be fixed app-wide (Max picked the wizard-side fix for now, not that one — see above).

**Not committed** — sitting in the `staging` working tree pending Max's review before staging push (per [[ClaudeInstructions]] Rule 0).

---

## 2026-08-04 (part 3) — #146 Per-vintage wine details: reviewed, built, verified end-to-end

Same-day continuation: Max asked for a review of the plan doc before building. Review caught one real gap the plan had missed — `WineCatalogueClient.tsx` was claimed to need "no changes," but reading the actual file showed `wineMeta()` combined `wine.wineType`/`wine.sweetness` into one always-present string with no null handling, and the filter-pill option sets (`availableTypes`/`availableSweetness`) were built the same way. Since `VINTAGE` mode makes both fields nullable per-vintage, shipping as originally planned would have shown a literal `"undefined"` on the public catalogue for any unfilled vintage — the exact "guess presented as fact" bug this feature exists to fix, just relocated to a different file. Also resolved the plan's open Statistics question (checked `app/admin/(panel)/statistics/` directly: no `wineType`/`sweetness`/`sparkling`/`alcoholLevel` reference anywhere, so no mode-aware resolution needed there). Both corrections written into [[Plan-WineVintageDetails]] before build started.

**Built, in order:** schema (`WineDetailLevel` enum, `Tenant.wineDetailLevel @default(PRODUCT)`, 4 nullable columns on `WineVintage`) → `prisma migrate dev` against dev DB (dev server was already stopped, migration applied + client regenerated cleanly, migration SQL confirmed purely additive) → super-admin (`TenantFormClient.tsx` new field, pre-fills `VINTAGE` on create; `createTenant()`/`updateTenant()`/`getTenant()` in `superAdmin.ts`) → `wines.ts` (`createVintage`/`updateVintage` gain the 4 optional fields) → `WinesClient.tsx` (mode-aware: `PRODUCT` unchanged, `VINTAGE` hides the wine-level characteristic fields entirely and gives each vintage independent fields defaulting to "not specified" — tri-state select for `sparkling` so "unset" and "explicitly still" stay distinguishable) → `app/(site)/wines/page.tsx` (now fetches `tenant.wineDetailLevel` via a direct `db.tenant.findUnique`, same pattern as `createBooking.ts`/`orders.ts`; flatten step resolves `wine.X` or `vintage.X` with no fallback) → `WineCatalogueClient.tsx` (the corrected piece: nullable `DbWine` type, `wineMeta()` now builds the type/sweetness phrase from whichever pieces are actually set and can return `''`, filter-pill sets filter out `null` instead of offering it as an option) → translation keys added to `adminT.ts` (en/ka) for the admin-side "not specified"/"still"/hint copy — Georgian text is a best-effort translation, not yet natively reviewed (same caveat as the original legal-content seed, see [[Plan-LegalPages]]).

**Verified live on `localhost` (Staging Winery tenant) as both super-admin and tenant-admin:** `npx tsc --noEmit` clean. In the browser: confirmed `PRODUCT` mode renders identically to before (no regression); switched Staging Winery to `VINTAGE` via super-admin and confirmed the admin wine list drops the wine-level badges, an untouched vintage shows "Not specified," filling in Saperavi 2022's vintage (Red/Dry/13.5%, sparkling explicitly set to "Still") saves and displays correctly; on the public `/wines` page confirmed vintages with nothing set render with **no** stray "undefined" text (meta line silently empty, exactly per spec) and the filter pills only ever offer values that are actually set, then unhid Saperavi 2022 and confirmed its populated meta line reads "RED DRY · 13.5%" with the Type/Style pills correctly showing only "Red"/"Dry" as options. **Left Staging Winery in `VINTAGE` mode with Saperavi 2022's vintage fields populated as a live example** — deliberate, not reverted, since it's dev/staging-only data and doubles as a working reference for future testing of this exact feature.

**Not yet done:** #127's wine wizard step is now unblocked in principle but still not started.

**Follow-up same session:** Max spotted the Type/Style filter pills had vanished on the public `/wines` page and asked why. Not a bug — direct consequence of the verification above: Staging Winery was left in `VINTAGE` mode with only one (hidden) wine's vintage populated, so none of the 5 visible wines had anything to filter by. Confirmed via a direct DB read, then — per Max's choice — filled in vintage-level type/sweetness/sparkling for all 5 visible wines via a one-off script, correcting the leftover wine-level `RED` defaults that never matched these varieties (Rkatsiteli/Mtsvane/Kisi are white grapes) rather than copying them forward, and keeping `sparkling: true` only where the product's own bottle image is labeled PET NAT (Rkatsiteli Amber, Rosé). Alcohol % left blank for all 5 — no real source for those numbers existed anywhere, and inventing one would reproduce the exact guessed-data problem this feature exists to prevent. Verified live: filters and meta lines both correct. Dev-DB-only data entry, no code change, nothing to commit.

**Second follow-up:** Max asked to add a Year filter alongside Type/Style — sensible since `WineVintage.year` is a plain required field, unaffected by `wineDetailLevel` either way. Added a third pill row to `WineCatalogueClient.tsx` (`YEAR` label, options = distinct years present, most recent first); widened the filter-row array's shared type to a `FilterValue` union (`TypeFilter | StyleFilter | YearFilter`) so all three rows share one render loop. Verified live in both `PRODUCT` and `VINTAGE` mode on Staging Winery (temporarily flipped the tenant to `PRODUCT` to check, then back to `VINTAGE`) — filter correctly narrows to the selected year in both. `tsc --noEmit` clean (a batch of `.next/dev/types` errors seen mid-session was a stale build-cache artifact, unrelated to this change — resolved by clearing `.next`).

**Third follow-up — admin Wines UI redesign:** Max asked for a UX review of the admin Wines panel ("once you open a few tabs you kind of get lost"). Reproduced live: the wine list is a single accordion (only one wine open at a time, confirmed), so the actual problem was depth within one expanded wine — the wine-details edit form and a vintage's edit form stacked with identical visual weight, generic "Save" buttons on both, no indentation or color cue tying the vintage form to its row. Recommended a scoped visual fix over a bigger structural rework; built an interactive before/after HTML mockup (published as an Artifact) with inline annotations explaining each change, so Max could compare without guessing from static screenshots. Max asked for real clickable tabs specifically ("so users can know they are collapsible") and to build directly on localhost rather than mock up again.

Implemented in `WinesClient.tsx`: replaced the old `editingProductId` toggle with an `activeTab: 'details' | 'vintages'` state and a `selectTab(wine, tab)` entry point — two pill tabs ("Wine Details" / "Vintages (N)") inside the expanded panel, mutually exclusive, Vintages as the default landing tab. The row-level pencil icon now jumps straight to the Details tab. The per-vintage inline edit form got the nested treatment from the mockup: `#fbf1ee` tinted background, 3px left accent border in the brand color, and an "Editing vintage · {year}" breadcrumb (new `wines.editingVintage` key, `{year}` interpolation via `adminT`'s existing `vars` support). Buttons renamed via new keys `wines.saveWineDetails`/`wines.saveVintage` (en/ka both added). Verified live end-to-end: tab switching, mutual exclusivity, nested vintage-edit styling, and — since the tab structure is orthogonal to `wineDetailLevel` — spot-checked both `PRODUCT` and `VINTAGE` mode render correctly (temporarily flipped Staging Winery to `PRODUCT` and back, same pattern as the Year-filter check earlier). `tsc --noEmit` clean. Max reviewed live on localhost and approved.

Pushed to `staging` (`0a726df`).

**Shipped to production, same session.** Max reviewed and approved. Before merging, ran a read-only `prisma migrate status` against prod and confirmed `20260804100252_add_wine_detail_level` was the one pending migration — then ran `prisma migrate deploy` against prod as its own explicit step (flagged to Max first per [[ClaudeInstructions]] Rule 0, since the code on `master` reads `Tenant.wineDetailLevel` and would break every request if deployed before the column existed — same ordering hazard as the #145 payment migration). Verified post-migration: Nikalas Marani backfilled to `PRODUCT` (zero visual change, as designed), wine/vintage row counts unchanged (6 wines, 7 vintages). Merged `staging` → `master` (fast-forward, no conflicts, `429a16e` → `0a726df`), pushed, switched back to `staging` immediately after per Rule 0.

---

## 2026-08-04 (part 2) — #146 Per-vintage wine details: plan written, nothing built

Continuation of the same planning session, prompted by Max flagging that #127's wine step depends on a change he wants: natural wineries often have type/sweetness/sparkling/alcohol level vary year to year for the same wine (everything but the name), and there's currently no way to store that — `WineVintage` has no columns for these, only `Wine` does. Plan: [[Plan-WineVintageDetails]] (new), linked from [[FeatureLog]] #146.

**Design went through two corrections worth recording, both from Max catching real flaws in the first draft:**
1. First draft proposed a per-*wine* toggle. Max corrected: this needs to be tenant-wide — a winery makes this decision once for their whole catalogue, not wine by wine. Landed on a `Tenant.wineDetailLevel` (`PRODUCT`/`VINTAGE`) field.
2. First draft also proposed inherit-with-fallback (an unset vintage field silently shows the wine's value, same pattern as the existing `imagePath`/name overrides). **Max caught that this is wrong**: once a wine is in vintage-tracking mode specifically because values vary, silently substituting the product default presents a guess as if it were verified data for that vintage — worse than showing nothing. Corrected to: no fallback at all in `VINTAGE` mode. Unset shows "not specified," full stop, no copy-forward when switching modes either. This also simplified the design (no resolver/fallback chain needed).

**Other decisions:** the setting lives in super-admin only, not `/admin/settings` — a deliberate "lifetime commitment" kept out of the tenant admin's hands (same access level as the existing `modulesX` flags, not code-locked, just not client-editable). New tenants default to `VINTAGE`; existing tenants migrate as `PRODUCT` with zero visual change (additive nullable columns, safe). Public catalogue (`WineCatalogueClient.tsx`) needs no changes at all — confirmed by reading it that it already renders one card per vintage and never assumed type/sweetness were wine-level; the only real touch point is `app/(site)/wines/page.tsx`'s flatten step.

**Effect on #127:** since new tenants default to `VINTAGE` mode, the onboarding wizard's wine step (planned as product-level minimal fields) needs to be vintage-level-aware instead — updated the note in [[Plan-OnboardingFlow]] accordingly. The wizard's wine step still can't be built until this ships.

**Next:** no build work started on either #127 or #146. Whichever gets scheduled first, the other's wine-specific piece waits on it.

---

## 2026-08-04 (part 1) — #127 Onboarding flow: full plan written, nothing built

Pure planning/brainstorm session, no code touched. Started from Max's ask that a new client's setup should feel like registering on a consumer app — streamlined, covering companies/images/settings/wines. Worked through business flow and architecture in rounds, landed on a full plan: [[Plan-OnboardingFlow]] (new), linked from [[FeatureLog]] #127.

**Key decisions, in the order they were made:**
- **Wizard location split by concern** — super-admin keeps owning technical/platform fields (domain, modules, theme, logo) exactly as today; a new `/admin` wizard owns business data (companies, wines, content, settings). Chosen over "everything in super-admin" specifically because that option would have been a dead end for the stated goal of designing this to be self-service-ready later — a self-serve client would never see super-admin at all.
- **Skippable wizard with a persistent "finish setup" nudge**, not a forced/blocking flow.
- **Launch bar:** ≥1 wine if the wine-orders module is on; ≥1 company only if the client answers a wizard qualifying question ("do you work with tour companies?") — individual bookings work with zero companies, so this isn't unconditional.
- **Shared components in "minimal mode," not separate wizard-only forms** — the wizard renders the same `CompanyForm`/`WineForm` used on the real admin pages (reduced field set) through the same server actions, explicitly to avoid the drift class of bug this codebase already hit once (a status enum that didn't propagate everywhere it needed to). Exact minimal-vs-deferred field breakdown for Company/Wine is in the plan doc.
- **"Essentials now, full details later"** — Max's own refinement once he saw the reduced field set: wizard-created records are intentionally minimal, but a post-launch nudge tracks which ones (e.g. missing `nameKa`) still need their full details filled in later, so nothing silently stays half-done. Directly aimed at avoiding another instance of the "Georgian toggle does nothing because the row was never seeded" bug shape already seen in #131/#138.
- **Completeness computed live, never stored as a flag** — both step-completion and record-completeness are derived from current module flags + current data on every read (same shape as `requireModule.ts`), so toggling a module post-launch can't leave a stale "all done" state.
- **Self-service-readiness folded into Phase 0 now** — `createTenant()` gets extended to also provision the tenant-admin's Supabase login (currently manual), closing the one real gap between today's Max-driven onboarding and an eventual self-serve signup. Actual self-service (billing, domain automation) stays its own unscheduled future project.
- **Relationship to #139 clarified** — #139 was originally scoped as static tooltips; Max wants both a first-time tour and an always-available toggle eventually. Sequencing: #127 produces the EN/KA explanatory copy as a byproduct of building each step, #139 becomes the immediate follow-on (a toggle that surfaces that same copy inline, zero duplicate writing), and a full scripted DOM-anchored tour is deliberately deferred — flagged as a much bigger, more fragile build (per the existing `MaintenanceNotes.md` precedent on coupled components) to revisit only if the cheaper version isn't enough.

**Open, unresolved:** Max flagged an upcoming wine-hierarchy revision (currently `wineType`/`sweetness`/`alcoholLevel` etc. live on `Wine`, shared across vintages; the plan is to make these fully per-`WineVintage` configurable) — not yet its own tracked vault plan. This directly changes `WineForm`'s shape, so Phase 0's wine-minimal-mode refactor and Phase 2's wine step are sequenced to start only after that change ships; everything else in the plan (companies, wizard shell, business-basics/content/review steps, the nudge system, self-service provisioning, the #139 toggle) is untouched by it and can proceed independently. Whether to do the whole plan strictly after the wine-hierarchy change (simpler) or split tracks (faster overall, more coordination) is Max's call once that change has its own scoped plan — recorded as an open question in [[Plan-OnboardingFlow]] rather than decided here.

**Next:** no build work started. Resume point is the sequencing question above — once that's answered (or the wine-hierarchy plan exists), Phase 0 can start.

---

## 2026-07-29 — Flitt payment shipped to production, module off; 3 items remain

Max walked the module-on path on staging himself (both checkouts to Flitt's real page, secret-masking confirmed, an abandoned wine checkout's "Awaiting Payment" state and "Mark as paid" recovery confirmed working), found and had fixed a real bug (wine orders had no UI at all for the new payment-limbo status — see below), then said to run the production migration and merge, reasoning that since the module ships off, any remaining bug can be fixed on staging without customer impact. Agreed and executed.

**Bug found via Max's own staging testing, fixed same session:** `WineOrdersClient.tsx` never learned about `pending_payment` — his real abandoned order fell back to `pending`'s colours, matched no stepper stage (a card with no visible status), and had no filter tab, so it vanished under any filter. Same class of gap the phase-6 agent had already fixed on the *bookings* side; the wine side was missed. Max proposed a "Failed Orders" tab; built two statuses instead (Awaiting Payment vs Payment Failed) since most abandonments are people closing a tab, not declines, and calling them all failures would invite writing off live business. Added a "Mark as paid" recovery action — without it, a customer who abandons card payment and pays by transfer instead would be stuck in limbo permanently. `settle.ts` now maps Flitt `declined`/`expired` → `payment_failed`. Flow tests 16 → 18. Commit `ed7d52c`.

**Production migration + RLS, verified before and after (full detail: [[Plan-OnlinePayment]] §1a):** confirmed via a read-only check that prod genuinely needed it (Nikalas Marani, 61 real orders, migration pending) before running anything. Order mattered — `proxy.ts` selects all `Tenant` columns on every request, so deploying the code before the migration would have failed every request on the live site, not degraded it. Migration applied, then `setup-rls.ts` (a new table starts with zero grants — `app_user` could not have touched `Payment` until this ran), then `check-rls.ts` confirmed all 17 tables green. Post-state: 61 orders untouched, `Payment` isolated, `modulesOnlinePayment = false` for the live tenant.

**Merged `staging` → `master`, pushed (`429a16e`).** Fast-forward, no conflicts — production is now running this code. Switched back to `staging` immediately after, per [[ClaudeInstructions]] Rule 0.

**Nothing customer-visible has changed.** The module is off for every tenant. [[Plan-OnlinePayment]] §9a is now the single current list of what's left: (1) verify the Resend sending domain — hard blocker, a paying customer gets no receipt until this is done; (2) one real payment completed and refunded on staging, since no genuine inbound Flitt callback has ever round-tripped; (3) only then, switch the module on for Nikalas Marani for real.

---

## 2026-07-29 (earlier) — Flitt payment integration BUILT, phases 1–7 on `staging`

Max approved the four behaviour defaults and said to build, using subagents to preserve context. Seven commits `4b07b28`…`a24e070`, pushed to `staging`. Phase tracker, decisions and remaining steps live in [[Plan-OnlinePayment]] §7a — **that file is the resume point**, not this entry.

**Nothing is live.** `modulesOnlinePayment` defaults false, so every existing tenant is untouched. Production has not had the migration applied and `master` has not been merged.

**Mid-session disruption worth knowing about:** a background agent building the wine trigger died on a credits error having written zero files, and the session task list was lost. The vault plan tracker was the only surviving record and it worked — but it had drifted (claimed phase 5 in progress when nothing existed, phase 6 not started when work was staged). Lesson: the tracker is only as good as the discipline of updating it *before* delegating, not after.

**Things found by reading the real code that the planning pass had missed or got wrong:**
- The proxy would have eaten Flitt's callback — `!modulesPublicSite` → `/coming-soon` and no-tenant → `/welcome` both match an `/api` path, turning the inbound POST into a 307. Card charged, order unpaid forever. Fixed with an early `/api/payments/` bypass.
- The plan's recommendation to store the merchant secret in `Setting` was **reversed** — `getAllSettings()` returns that whole map ([[MaintenanceNotes]] §9). Credentials went on `Tenant` instead, where the leak is structurally impossible.
- Flitt's docs flagged a signing gotcha the plan missed: a param valued `0` must not be dropped from the hash. A truthiness filter breaks it; a string-length test (matching PHP's `strlen`) is correct.
- Surfacing `PENDING_PAYMENT` exposed **four pre-existing omissions** where a new enum value renders wrong rather than absent — `OrdersFilters`, `CalendarView`, `OrderDetail`, super-admin `OrdersActivityClient`.
- `test-rls.ts` silently skips its cross-tenant section on a one-tenant DB, which is the dev database's normal state — so a new table's isolation goes unverified exactly where it matters. Recorded as [[MaintenanceNotes]] §10, with `test-payment-rls.ts` as the pattern to copy.
- **Go-live blocker, unrelated to this work but exposed by it:** email has been in Resend sandbox mode all along (`isDomainVerified = false`), routing every customer email to Max. Tolerable for booking requests, not once cards are charged. Plan §8a.

**Verification: 62 automated tests green** (16 flow, 9 Payment RLS, 37 signature), module-off regression confirmed live in the browser for both forms, subagent output independently re-checked rather than taken on trust (lint compared against a stashed baseline, adminT EN/KA parity across all 734 keys, every `flittSecretKey` reference audited).

**Next:** Plan §7a phase 8 — admin UI visual check, Resend domain verification, production `migrate deploy`, `staging`→`master`, then one real payment and refund.

---

## 2026-07-29 — Flitt payment integration: trigger decided, build plan written (nothing built)

Max asked whether the old site's Flitt integration gave us everything needed to implement payments on the new site, then made the outstanding trigger decision and asked for a full plan. **No code written** — plan only, in [[Plan-OnlinePayment.md]] (new).

**Decision made (was the blocking open question since 2026-07-28):** the pay trigger is not a separate screen or an admin-sent link — **the existing submit buttons become purchase buttons** (booking "Confirm", wine "Place Reservation"). Gated by a new per-tenant `modulesOnlinePayment` flag, so tenants without online payment keep today's behaviour exactly: reservation placed, winery contacts the customer to settle payment themselves.

**Answered Max's question:** for Nikala's Marani specifically, nothing further is needed from Flitt. The old `nikalaIntegral/app/Flitt.php` carries the endpoint, merchant_id `4056054`, the password, and the full signature algorithm — and since it's the same merchant on the same `.ge` domain (which Max is migrating), no re-registration applies. Corrected one premise: the old integration is **not currently active** — `OrderController.php:194-201` has the `redirect('pay/'.$app_id)` commented out, so every order saves unpaid and Flitt is never invoked. Consequence: the merchant account may have gone dormant, and that's the one thing files can't answer. Verifying it is Phase 0 of the plan.

**Blockers found by reading the current code (all in the plan, §3):**
- **`proxy.ts` will eat the callback.** Its matcher covers `/api/*`, and both the `modulesPublicSite=false` → `/coming-soon` redirect (line 182) and the no-tenant → `/welcome` redirect (line 168) would turn Flitt's inbound POST into a 307. Payment succeeds at the bank, order stays unpaid forever. Needs an early `/api/payments/` bypass.
- Neither `createBooking()` nor `submitWineOrder()` returns the created row's id — Flitt's checkout needs `order_id`.
- `createBooking.ts:170-195` sends the confirmation email immediately, which would tell an unpaid customer their booking is confirmed.
- `totalPrice` is legitimately `0` for tenants with no pricing configured — can't send a 0 GEL checkout, so the payment path needs a runtime fallback to reservation-only.
- `WineOrder` has no email column, so wine-order payments have nowhere to send a receipt.
- **Revised the earlier recommendation to store the merchant secret in `Setting`** — [[MaintenanceNotes]] §9 documents that `getAllSettings()` returns the whole map including bank details and must never reach a client component. Putting a payment secret there makes the highest-value credential one careless prop from public HTML. Plan puts it on `Tenant` instead, structurally unreachable from that map.
- Also corrected the earlier assumption that `x-tenant-id` would be unavailable on the callback — `proxy.ts` does set it for API routes. It's still secondary to the `Payment` row lookup, which survives a domain change mid-payment.

**Security gaps in the old code the plan deliberately fixes rather than ports:** no callback signature verification at all (anyone with a `payment_id` could forge `order_status=approved`), no amount verification (a tampered checkout could settle for 1 tetri), and the "mark paid + email" logic duplicated across the redirect and webhook handlers, already drifted apart.

**Next:** Phase 0 (verify the merchant account is live), then Phases 1–4 are buildable without further input from Max. Phases 5/7 need his answers to the four questions in the plan's §7.

---

## 2026-07-29 — Performance: root cause was the server region, not the queries (shipped)

Max reported the site felt slow and asked for industry-standard testing plus a report on the cause. Ran Google Lighthouse 12.8.2 + `curl` timing against **live production**, read-only. Baseline frozen in [[Perf-Baseline-2026-07-29]] (new); plan, chunks, decisions and progress log in [[Plan-Performance]] (new).

**Two causes found, both now fixed and live in production.**

**1. `/wines` images.** 6 product photos in `public/images/products/` were camera-resolution originals (2991×2990px, 2.1–2.2MB each) rendered into a 362×176px thumbnail — Lighthouse measured 98% wasted bytes and a 15.5s LCP on that page vs 3.2s on Home. They predated the `sharp` compression pipeline built for background images (#92) and were never revisited. Resized to 750px max dimension (covers 2× retina at the largest real display context) with max PNG compression, alpha preserved; same filenames and paths, so zero code or DB changes were needed (`Wine.imagePath`/`WineVintage.imagePath` rows and `WinesClient.tsx`'s hardcoded `PRODUCT_IMAGES` list all still resolve). **7.5MB → 1.06MB (86% smaller).** Shipped `31f4d62`.

**2. The real one: the Vercel functions were running on the wrong continent from the database.** `X-Vercel-Id: fra1::iad1::…` on both prod and staging — requests entered Vercel's edge in Frankfurt but the *function executed in `iad1`, Washington DC*, while both Supabase projects live in `eu-central-1` (Frankfurt). No region was pinned anywhere (no `vercel.json`, nothing in `next.config.ts`), so Vercel's US-East default applied and **every database round trip crossed the Atlantic**. Fixed with a 4-line `saas/vercel.json`: `{"regions": ["fra1"]}`. Shipped `d1e97a4`.

**File location was a real trap:** it must be `saas/vercel.json`, not repo root. This repo is `saas/` + `dashboard/` + `vault/` with no root `package.json`, so Vercel's Root Directory is `saas` and `vercel.json` is read relative to it — at the repo root it would have been silently ignored and we'd have concluded the region fix "didn't work."

**Result** (production measured in the same minute as a control, still on `iad1`, so attribution is clean):

| | Before (`iad1`) | After (`fra1`) |
|---|---|---|
| Home TTFB | 2.93s | **0.40s** (7×) |
| Home full load | 5.8s | **0.49s** (10×) |
| Lighthouse Home | 81 | **96** |
| Lighthouse `/wines` | 64 | **84** |
| `/wines` LCP | 15.5s | **3.1s** |

### The wrong turn — worth recording

The first diagnosis was that ~24 per-request DB transactions caused the delay: every public page is `force-dynamic`, and `getSetting()` opens its own transaction per key (14 calls on Home, 6 more in the layout). A plan was written and approved to batch them and then add `unstable_cache`, including reading the Next 16 caching docs and finding a real constraint (`headers()`/`cookies()` can't be touched inside a cache scope, so `getTenantId()` had to be refactored out of the data functions).

**The batching refactor was built — and measurably did nothing**: 1,581ms → ~1,620ms of `application-code` time, despite going from ~24 transactions to ~8. Those queries already ran in parallel via `Promise.all`, so cutting their *count* cut database load but not wall-clock.

Measuring directly is what redirected it: a real 36-row `findMany` cost **666ms** while an *empty* transaction cost **680ms** — i.e. ~100% latency, ~0% database work. That pointed at distance, not query design. (Also measured: the RLS handshake doubles every transaction, 345ms → 680ms, because `set_config` and `SET LOCAL ROLE` are two extra sequential round trips — cheap against a 2ms database, expensive against a 90ms one. Deliberately not "optimized", it's the tenant-isolation boundary.)

**Consequence: the planned caching work (Plan-Performance chunks 2–3) was dropped.** It was scoped to remove a ~3s wait that no longer exists, and would have added staleness risk plus a cross-tenant cache-key risk for nothing. Revisit only if traffic ever makes DB *load* (not latency) the constraint.

### Still open
- **The batching refactor is uncommitted** — `lib/settings.ts` (new), `getAllSettings()`/`getAllContent()`, and rewired `(site)/layout.tsx` + `(site)/page.tsx`. `tsc` clean, behavior-neutral, cuts DB load 3×. Needs a keep-or-revert call from Max; it's cleanup now, not a fix.
- Lighthouse still suggests ~790KB more available on `/wines` by moving the product photos to WebP. Kept as PNG deliberately (transparent backgrounds); worth revisiting if `/wines` ever needs more.
- `/wines` Total Blocking Time rose 210ms → 400ms in the after-run. Single sample, likely noise, but worth a second look if it persists.

### Files changed
- `saas/public/images/products/*.png` — 6 files resized (`31f4d62`, on `master`)
- `saas/vercel.json` — NEW, region pin (`d1e97a4`, on `master`)
- Uncommitted: `saas/lib/settings.ts` (new), `saas/app/actions/settings.ts`, `saas/app/actions/siteContent.ts`, `saas/app/(site)/layout.tsx`, `saas/app/(site)/page.tsx`
- Vault: `Plan-Performance.md` (NEW), `Perf-Baseline-2026-07-29.md` (NEW), `FeatureLog.md` (#144), `SessionLog.md` (this entry)

---

## 2026-07-28 (session 4) — Payment integration + historical data migration: researched, not yet decided

Two related assessments for the missing-payment-system work, both parked pending Max's decisions — nothing built, no vault-external state changed except read-only DB queries via phpMyAdmin (SELECTs only). Full technical detail in [[MigrationNotes.md]]; this entry is the summary.

**Flitt payment integration**: reviewed the old `nikalaIntegral` Laravel app's Flitt/Fondy integration in depth (checkout params, signature scheme, the never-verified callback signature, hardcoded secrets) and cross-checked Flitt's public API docs. Assessed shared-platform-account vs. per-tenant-account architecture with Max — landed on **per-tenant Flitt accounts** (matches the existing `payment_recipient_name`/IBAN bank-transfer precedent, avoids the platform becoming a payment facilitator). Mapped what's needed: per-tenant `merchant_id` + secret key (first real per-tenant secret this codebase would ever store — currently only the plaintext, non-secret `Setting` table exists as a mechanism), a new Route Handler for the inbound callback (first one in a repo that's 100% Server Actions today), and a fix for the old code's signature-verification gap. Also flagged: client-side dependencies before any of this works (Flitt's own business KYC/approval, "same day to a week"), and an unconfirmed question — whether Flitt permits alcohol sales as a category — that needs asking their support directly, not assumed.

**Historical order data migration**: went beyond code into the actual databases via DirectAdmin's phpMyAdmin (read-only). Corrected an earlier wrong claim — `TBC.php` isn't dead code, `transactions_tbc_old` has 201 real rows, it was the live gateway before Flitt. Found the `booking/laravelCore` app's data (`nalige_booking` DB) is pure dev-test data (4 rows, one person, 14-minute window) — not worth migrating. Found `nikalaIntegral`'s `nalige_db` has **52 real bookings spanning 2022-2026** — genuinely worth migrating, with zero real wine-orders in the mix (that side of the old site had no real usage). Had an agent confirm the admin orders/statistics UI already has legacy-shaped-row fallback rendering built in (not something we'd need to build), then laid out the actual challenges: pricing must be carried over as-is rather than recomputed, company names need deduplication into real records, and — the one requiring Max's input — there's no clean automatic mapping from old `pay_status`/`status` onto the new `OrderStatus` lifecycle enum.

Max's call: "record this for now, I'll get back to it later." Both threads are fully written up in MigrationNotes.md, ready to resume without re-research whenever he's ready.

---

## 2026-07-28 (session 3) — Explored old hosting panel for pre-migration site

Max got access to the old host's DirectAdmin control panel (`nikalasmarani.ge:2222/evo/`) and asked what it was, read-only ("prohibited from making any edits"). Browsed the File Manager to confirm: it's a shared-hosting account (`nalige`) with the full legacy codebase sitting in `domains/nikalasmarani.ge/public_html` — legacy procedural PHP at the root, a `booking/` folder with its own Laravel core + SQL dump, and a standalone Laravel app (`adminIntegral/`) that's almost certainly the real admin/booking/payment backend. No files opened, no edits made. Full structure and reasoning logged in [[MigrationNotes.md]] under "Old site source (pre-migration) — hosting panel access" — that's the file to check before designing the new payment system, since `adminIntegral` likely shows what payment gateway the old site actually used.

---

## 2026-07-28 (session 2) — #128 Legal pages: shipped `staging` → `master` (production)

Handoff session: Max reviewed and approved the staging build (previous entry below) and said to push to master. Followed the staging-first git workflow (Rule 0): merged `staging` (`06c81aa`, fast-forward, no conflicts) into `master` locally first, confirmed the migration SQL was purely additive (`ALTER TABLE "Tenant" ADD COLUMN "modulesLegalPages" BOOLEAN NOT NULL DEFAULT true`), then ran the two production-database steps *before* pushing — order matters, since pushing first would have deployed code expecting a column that didn't exist yet. Paused for Max's explicit confirmation before touching the prod DB, per the standing production-safety rule.

Ran against production (`dshsfkffcsgerdqinqst`, via inline env vars scoped to each command — `saas/.env` untouched): `prisma migrate deploy` applied `20260728094729_add_modules_legal_pages` cleanly, then `scripts/seed-legal-content.ts` created 6 rows (3 pages × 2 locales) for the "Nikalas Marani" tenant, 0 already existed — confirmed this was the prod tenant (not dev's "Staging Winery") from the script's own console output. Pushed `master` (`b7367d9..06c81aa`), Vercel auto-deployed to production (`dpl_FTQSbzAf5SksLXF5JSGDpDtT1A3h`, verified READY via the Vercel MCP), switched back to `staging` per the standard end-of-deploy rule.

Live verification on `nikalasmarani.vercel.app`: `/terms`, `/privacy`, `/returns` all render correctly in both EN and KA (cookie-forced locale switch), footer shows the three links, admin panel's new "Legal" (იურიდიული) tab shows the seeded text in editable textareas. Found one stale credential along the way: `credentials.txt`'s stored NM admin email (`Nikalasmarani@email.com`) was wrong — Max corrected it to `Nikalasmarani@email.ge`, updated in the file. Super-admin "Legal pages" checkbox on the Nikalas Marani tenant checked and confirmed working by Max directly (no prod super-admin credentials exist in `credentials.txt` — dev-only account is explicitly marked not to be recreated against prod).

One discrepancy caught before merging: the handoff prompt described `staging` HEAD as `37deb14`, but it had moved one commit further to `06c81aa` (docs-only — vault Feature note, MaintenanceNotes, MyToDo entries, per Rule 9) since the prompt was written. Flagged to Max before proceeding; harmless, included in the merge as part of `staging`.

No code follow-ups from this deploy — the known follow-ups (native Georgian legal review, "your visit" wine-delivery wording, no effective-date stamp, generic page `<title>`) are unchanged from [[Plan-LegalPages]] and remain non-blocking.

---

## 2026-07-28 — #128 Legal pages: researched, drafted, reviewed, and built (staging)

Full arc in one session. Started as familiarization on issue #128 ("Legal sections review") — read the FeatureLog entry, browsed the 3 reference legal pages on the old pre-migration nikalasmarani.ge site (not `/ka/text/N` as the FeatureLog links suggest — the real paths are `/text/N`), read `MultiTenantSiteContent.md`/`SuperAdmin-Architecture.md`/`MaintenanceNotes.md`, and had an Explore agent map the Site Content editor and public route structure. Found the existing `EditableText`/`FieldsPanel` pattern is built for short labels, not full documents — new territory needed. Wrote [[Plan-LegalPages]] and got Max's scope call: Georgia-only, reasonable per-tenant customizability, module-toggleable from super-admin like the other 3 module booleans.

Built an HTML mockup (admin "Legal" tab + public `/terms` page, real brand tokens from `globals.css`) for Max to sign off on the design before writing any real text. Two content-drafting rounds followed, both delegated to background subagents with full context handed off explicitly (not "based on the plan, draft it"):
- **Round 1**: derived Terms/Privacy/Returns from NM's actual live pages, with two source-quality bugs found and fixed — NM's own pages reference an unrelated company (`bagi.ge`) four times (a copy-paste leftover never cleaned up), and describe an account/card-payment system this platform doesn't have.
- **Comparison round**: a second agent built a section-by-section draft-vs-original report so Max could review every removal explicitly, not just trust the rewrite. Max corrected several assumptions: online payment via bank redirect *is* real (unscheduled Roadmap item, not fictional), the company access-code system (#98–101, both bookings and wine orders) counts as a "soft account" and should be reflected in the text, and several removed clauses (§2.2 termination right, §4.3 indemnity, §4.4 accuracy duty) should be restored.
- **Round 2**: incorporated every correction with conditional payment wording (accurate whether or not a given tenant has the feature live yet), full Georgian translation parity (round 1's KA had silently dropped a few operative sentences — fixed), and Terms §1.2 rewritten to point at the *existing* `payment_recipient_name`/`payment_personal_number` settings (Feature #31) instead of inventing a new field.

Max approved round 2 ("good enough for now, proceed") and the build went straight to `staging` (confirmed branch before starting, confirmed no local dev server was running before `prisma migrate dev`). Implemented: `modulesLegalPages` schema field + migration, `x-tenant-modules-legal` proxy header, `EditableLongText` component (textarea-based sibling to `EditableText`, for long-form content), `lib/legalContent.ts` as the single source of truth for the seed text (reused by the admin fallback, the `/super-admin` module checkbox path, `createTenant()` — new tenants now get both locales seeded automatically instead of relying on the English code-fallback pattern everywhere else — and a standalone `scripts/seed-legal-content.ts` backfill for existing tenants), 3 new routes (`/terms`, `/privacy`, `/returns`) sharing a `LegalPageLayout` component, and a super-admin "Legal pages" checkbox (on by default, per Max's call that this is a legal expectation not an opt-in feature).

**One deviation from the written plan, caught before committing to it**: the plan and my own mockup both said nav *and* footer links; on closer look, the actual approved mockup only ever showed a footer row, and NM's reference site keeps legal links footer-only too — added them to `SiteNav.tsx` first, then reverted and cleaned up the now-unused `FIELDS.nav`/`adminT` entries rather than shipping nav clutter nobody asked for.

QA: `tsc --noEmit` clean. Browser-verified end-to-end on the dev DB (Staging Winery, only tenant in dev) — all 3 pages render correctly in EN and KA (confirmed via cookie-forced locale switch), footer links present with the module on and absent with it off, admin Legal tab shows/edits/reset-works for both locales, super-admin checkbox persists and the public site actually respects it (had to restart the dev server between toggle and check — `proxy.ts` caches tenant module flags 5 min in-memory, same gotcha documented for the #136 theme work). Backfill script run against dev DB (6 rows, Staging Winery). **Not yet run against production** — prod has NM's real tenant plus others; per the dev/staging workflow this needs to run again as its own deliberate step when this ships to `master`. Nothing pushed yet — sitting on `staging` pending Max's review, same as the #136 theming work.

---

## 2026-07-27 (session 4) — #136 theming: built and QA'd (not yet pushed)

Max said "go ahead" on the Phase 2 technical plan from session 3. Built the whole thing in one pass: `lib/themePresets.ts` (4 presets, `resolveTenantTheme`/`parseTenantTheme`, HSL-based brand-hover derivation), extended `proxy.ts`/`layout.tsx` to carry all 8 tokens via a single `x-tenant-theme` header, swapped all 12 public-site/component files plus the 2 admin preview surfaces from hardcoded hex to `var(--site-*)`, themed both guest-facing emails, rebuilt the superadmin form with a 4-card preset picker + brand-override toggle, wrote a backfill script, and QA'd on the dev DB.

**Corrections made while building, not just following the written plan:**
- Cream & wine's hex values were approximations from the chat mockup (`#FBF3EA`/`#FFFDF9`) — ground-truthed against the actual live code and corrected to the real values (`#F5EFE6`/`#FFF9F3`) so migrating the existing tenant is a true zero-diff. Confirmed via browser screenshot: identical to pre-change.
- Brand-hover: the written plan said "darken ~12-15%". Reverse-engineered the app's actual existing default (`#7c1d23 → #9b2429`) and found it's a **lighten**, not a darken (HSL lightness +0.075, hue/saturation unchanged) — the old UI copy calling it "darker" was simply wrong. Implemented the derivation to match the real behavior, verified it reproduces `#9b2429` almost exactly (`#9b242c`).
- The hero's dark overlay/gradient/logo-pill and its white text are **intentionally not tokenized** — they must stay dark-with-white-text for every preset (including Midnight cellar, whose `--site-text` is light), or the dark preset's hero would invert and become illegible. Left fixed on purpose, documented in code comments so a future pass doesn't "fix" it into a bug.
- Found and fixed a pre-existing gap while touching the hero: the "Book a visit" button and a few form-state colors (visit-type selection tint, disabled-submit color) were hardcoded to the *original* default brand red regardless of a tenant's actual brand override — they never actually followed the existing single-color picker either. Now genuinely brand-reactive via `color-mix()`.
- `BackgroundsTab.tsx` ended up fully themed, not just its hero-preview mockup as scoped — it already mirrored the site's cream palette rather than the admin panel's own neutral tokens, so a partial swap would have left a visually inconsistent hybrid.

QA: `tsc --noEmit` clean. Browser-verified all 4 presets live on the dev tenant (Home/About/Contact/Wines/booking form) by temporarily writing each preset to the DB and restarting the dev server (proxy's 5-min cache otherwise hides changes) — all four coherent, restored to `cream` after. Ran the backfill script against the dev DB (1 tenant migrated cleanly). Sent both themed transactional emails for real via a standalone script (Resend sandbox → Max's own inbox) under Midnight cellar — **Max should check max.mghvdliashvili@gmail.com to confirm the dark email actually renders right**, since inbox rendering can't be checked from the browser.

**Follow-up same session**: Max checked the two test emails and confirmed the Midnight cellar theme renders correctly in his real Gmail inbox — but spotted the contact email showing as Gmail's default blue link instead of the themed muted-gray (Gmail's data-detector auto-linkifying bare email/phone text, overriding inline color — a pre-existing gap unrelated to theming, not something the color-token work introduced). Fixed by wrapping phone/email in explicit `<a>` tags with forced `color`/`-webkit-text-fill-color` in `bookingConfirmation.ts`, and locking the same property on `invoiceEmail.ts`'s personal-number/bank-code/IBAN cells (same auto-detection risk class already flagged in `InvoicePrint.tsx`). Re-sent both emails, Max confirmed the fix worked.

Nothing committed — sitting as uncommitted changes on `staging` per the standard workflow, pending Max's go-ahead to commit/push. Full step-by-step detail in [[Themes/Plan-Themes]].

---

## 2026-07-27 (session 3) — #136 theming: Phase 1 locked, Phase 2 scoped

Max reacted well to the full booking-page mockup comparison from session 2 ("i like them, nice job") — locked Phase 1: 8-token tier, all 4 families (Cream & wine, Sage & stone, Terracotta & clay, Midnight cellar) ship in v1. Asked to proceed to Phase 2 technical scoping with one instruction: "make sure you dont miss out any dependencies."

Did a second, deeper dependency sweep across the whole `saas/` tree before writing the plan (not just the public-site files already catalogued) and found 4 things the first pass missed: (1) the home hero's no-image gradient fallback hardcodes its dark stop to `#1c1008` even though it already uses `var(--color-brand)` for the light stop — looks themed, isn't; (2) ~14 call sites of `rgba(28,16,8,...)`/`rgba(10,5,2,...)` overlay tints across the hero/about/contact pages and the admin `BackgroundsTab.tsx` preview, which are literally the text color at reduced opacity, baked in as literals; (3) admin-panel *operational* chrome (`OrdersTable.tsx` modals, `SearchableSelect.tsx` dropdown shadow, `BookingFormEditOverlay.tsx`) reuses the same color literals but is internal staff UI, not public brand; (4) transactional emails (`lib/emails/bookingConfirmation.ts`, `invoiceEmail.ts`) and print documents (`InvoicePrint.tsx`, `BookingSheetPrint.tsx`) are a fully separate rendering path — CSS variables don't resolve in email clients, so these are 100% hardcoded hex today and don't even receive the *existing* single brand-color picker.

Wrote up the full findings in [[Themes/Presets-Proposal]] and the technical plan in [[Themes/Plan-Themes]]: `color-mix(in srgb, var(--site-text) 32%, transparent)` for the overlay tints (modern CSS, no extra token needed), a single `x-tenant-theme` JSON proxy header instead of 8+ separate headers, brand-hover derived by darkening brand rather than authored per-preset (keeps it at exactly 8 tokens), and a recommended v1 scope boundary excluding admin chrome/print/email from theming (matches the existing `AdminBar.tsx` exclusion and `Plan-DynamicBranding.md`'s precedent of excluding invoices from the logo rollout) — flagged to Max as a default call rather than deciding it unilaterally.

**Follow-up same session:** Max overrode the email exclusion — confirmed guest-facing emails should carry the theme. Asked back whether that meant just booking confirmation or the invoice email too (real ambiguity worth confirming rather than guessing); Max chose both. Checked both send-sites (`createBooking.ts:179`, `orders.ts:265`) — both already fetch the tenant row immediately before sending, so adding `theme: true` to the existing `select` and running it through `resolveTenantTheme()` is a small addition, not new plumbing. Print documents (`InvoicePrint.tsx`/`BookingSheetPrint.tsx`) stay excluded — no request was made for those. Plan docs updated accordingly; still no code touched.

---

## 2026-07-27 (session 2) — #136 theming kicked off as a two-phase engagement

Max wants full per-tenant visual themes (not just the existing single brand-color picker), but suspects it's a bigger project — asked to treat it like client work: business/design phase first, technical scoping second, with room to cut anything not worth the implementation cost. Set up `vault/Themes/` for ongoing notes ([[Themes/Themes]] hub note, linked from `FeatureLog.md` row 136).

Did the dependency review first: today's theming is one CSS-var pair (`--color-brand`/`--color-brand-hover`) piped through `proxy.ts` headers into `app/layout.tsx`'s injected `<style>` block — but everything else on the public site (background, text, borders, secondary tones) is hardcoded hex, repeated across 12 files (`app/(site)/*`, `components/EditableText.tsx`/`BookingForm.tsx`/`DateInput.tsx`/`LocaleSwitcher.tsx`, plus two admin preview surfaces that mimic the public look). Full inventory in [[Themes/Presets-Proposal]].

Decisions locked for Phase 1: presets defined in code (`lib/themePresets.ts`), not database-editable (ups/downs written up in [[Themes/Presets-Proposal]] per Max's ask); per-tenant override of just the brand color allowed on top of a chosen preset; existing tenants migrate forward onto a default preset with no visual change. Token richness (how many color variables per preset) deliberately left open — proposed 4 candidate color families (Cream & wine / Sage & stone / Terracotta & clay / Midnight cellar) each shown to Max at 3 levels of richness (3/6/8 tokens) as an in-chat visual comparison, so the schema gets derived from what actually looks good rather than decided in the abstract. Awaiting Max's reaction before locking the tier and which families ship in v1 — no code touched yet, Phase 2 (technical plan) doesn't start until Phase 1 is settled.

---

## 2026-07-27 — #138 review and close-out

Re-verified #138 items 1 and 2 against current code (not just git log): `LocaleSwitcher.tsx` still has the pill toggle + pending feedback, and `wine.filter.*`/`wine.orderSubtitle`/`wine.bottle.*`/`wine.perBottle` keys are present in `lib/t.ts` (EN+KA) and wired into `WineCatalogueClient.tsx`. Both confirmed still fixed. Asked Max about item 3's cut-off note ("Order Wine section -") — he no longer recalls what it was flagging, so dropped it as stale. #138 is now fully closed. Updated `FeatureLog.md` (row 138 → ✅ Done) and `known bugs and comment.md` (item 3 struck through).

---

## 2026-07-26 (session 2) — Orders admin bug review: #140/#141/#142 fixed, #138 items 1-2 fixed, #139 scoped (full detail)

### Completed

**Reviewed 5 backlog items Max flagged** (#138-142 in FeatureLog.md / [[known bugs and comment]]). For each: investigated root cause in code before proposing a fix, per usual practice.

**#140 — status dropdown clipped** (screenshot showed only "New" visible). Root cause: the dropdown lived inside a `position: sticky` `<td>` within the Orders table's bounded-scroll wrapper (`overflow-auto max-h-[70vh]`, added by #133/#134 on 2026-07-23) — the exact kind of sticky/overflow interaction that session's notes already flagged as fragile, resurfacing in the vertical direction this time. Fixed by rendering the dropdown via `createPortal` into `document.body` as a `position: fixed` overlay, positioned from the trigger's `getBoundingClientRect()` with viewport-edge flipping (opens above the button if it would overflow the bottom of the screen) and a scroll-close guard (fixed-position menu can't track the button while the table scrolls under it). Same escape hatch already used in `OrdersTable.tsx` for the hover-preview card and invoice print.

**#142 — Columns picker closed itself on every checkbox toggle.** The panel relied on `stopPropagation()` inside its own `onClick` to shield itself from a document-level outside-click listener; replaced with a ref-based containment check (`!containerRef.current.contains(e.target)`), which can't misfire regardless of event-propagation timing.

**#138 — Georgian translation gaps + locale switcher UX.** Two of three sub-items fixed: (1) `LocaleSwitcher.tsx` rebuilt as a real pill toggle (bordered container, solid brand-colored active state) with visible dimming + `cursor: wait` while the `setLocale`+`router.refresh()` round-trip is pending — previously it was plain colored text with zero pending-state feedback, explaining "unclear if it's clickable" and "feels like it didn't work." (2) Confirmed via code read that 6 strings on `/wines` were still hardcoded English even after #143 (which only fixed the type/sweetness *values*, not the surrounding chrome): filter group labels ("Type"/"Style"/"All"), the "Order Wine" eyebrow, the subtitle, and the "bottle"/"bottles"/"/ bottle" unit text. Added `wine.filter.*`/`wine.orderSubtitle`/`wine.bottle.*`/`wine.perBottle` keys to `lib/t.ts` (EN+KA) and wired them through. Item 3 ("Order Wine section -") is a cut-off note in Max's own file — flagged back to him rather than guessing.

**#141 — corrected mid-session.** Originally logged as a Wine Orders CSV-export-preview request; Max clarified it was actually about the **bookings Orders page**, which already has CSV export (with no preview — the original complaint) but no print export. Built a full booking-sheet print feature: new "Print Sheet" button next to Export CSV opens a preview modal, then prints a landscape-A4 table (`BookingSheetPrint.tsx`) — date/time, tasting/lunch/extra guest counts, hot dish veg/meat, food notes, notes, company, contact name/phone — matching the reference screenshot Max shared, sorted chronologically (kitchen/staff use, unlike the admin table's newest-first order), scoped to whatever filters are active. `OrdersFilters` (which has the button, no order data) signals `OrdersTable` (which has the filtered data) via the same cross-component `CustomEvent` pattern already used for column visibility. Print isolation reuses the existing `#invoice-portal` `@media print` mechanism, given its own CSS named page (`page: booking-sheet` / `@page booking-sheet { size: A4 landscape }`) so it doesn't fight the portrait invoice layout. Also completes the long-open Roadmap item **"Printable daily booking sheet."**

**#139 — scoped, not built.** Reviewed as a design question (per-page info/help tooltips for non-technical admins); recommended a small pilot (~8-10 genuinely non-obvious settings) rather than building it everywhere at once, mirroring how the Georgian admin layer was phased. Max hasn't greenlit a build yet.

### Testing (why this entry has more verification detail than usual)

Max asked to "check your work, test it" before shipping. Live-tested all four fixes end-to-end against the local dev server (not just code review): opened the Columns picker, toggled a checkbox, confirmed it stayed open and the state updated; opened a status dropdown, confirmed via `getBoundingClientRect()` that the portal renders as a direct `document.body` child with real (non-zero) fixed-position coordinates outside the table's scroll/sticky DOM, selected a new status, confirmed the menu closed and the badge updated, then reverted the test change; opened the Print Sheet preview, confirmed the modal + underlying print portal both render with the correct headers and are correctly `display:none` on screen. Confirmed EN+KA translation output via `curl` (this project's documented reliable check — the review browser's backgrounded tab intermittently freezes layout/compositing and throttles React's scheduler, a known issue already noted in `Plan-DevProdEnvironments.md`). `npm run build` and `npx tsc --noEmit` both clean.

**Found, not fixed (pre-existing, unrelated):** toggling a column checkbox triggers a React dev-mode warning — "Cannot update a component (`OrdersTable`) while rendering a different component (`OrdersFilters`)" — caused by `toggleCol`'s `window.dispatchEvent(...)` call sitting inside the `setVisibleCols` functional updater instead of after it. Confirmed via `git diff` this code predates this session. Doesn't appear in production builds (React strips this dev-only check), so it didn't block shipping. Flagged as a separate background task rather than fixed inline, since it's unrelated to what was asked this session.

**Shipped to `staging` then `master` per Rule 0**, both with Max's explicit go-ahead ("if all correct push to staging and master"). Re-verified the exact same suite (Columns picker, status dropdown portal, Print Sheet preview, EN/KA translations) against the live `staging` URL before merging — all matched local results, zero console errors (production build strips the dev warning above). After merging to `master`, verified read-only via `curl` against `nikalasmarani.vercel.app` (deliberately did **not** click through the real admin panel on production — that's live customer data) — EN/KA translations and the new `LocaleSwitcher` markup both confirmed live.

### Vault
`FeatureLog.md` (#138 → 🚧 In progress detail, #140/#141/#142 → ✅ Done/Claude tested), `Roadmap.md` ("Printable daily booking sheet" → checked off), `known bugs and comment.md` (items 1-2 marked fixed, item 3 flagged back to Max), `SessionLog.md` (this entry).

### Files changed
- `saas/app/admin/(panel)/orders/OrdersTable.tsx` — status dropdown → portal + fixed positioning; booking-sheet preview modal + print portal; listens for `ordersPrintRequested`
- `saas/app/admin/(panel)/orders/OrdersFilters.tsx` — Columns picker ref-based outside-click fix; new "Print Sheet" button
- `saas/app/admin/(panel)/orders/BookingSheetPrint.tsx` — NEW, the print-formatted table component
- `saas/app/globals.css` — `#booking-sheet-portal` print isolation + named landscape page
- `saas/components/LocaleSwitcher.tsx` — rebuilt as pill toggle with pending-state feedback
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — 6 remaining hardcoded strings → `t()`
- `saas/lib/t.ts` — `wine.filter.*`, `wine.orderSubtitle`, `wine.bottle.*`, `wine.perBottle` (en+ka)
- `saas/lib/adminT.ts` — `orders.filters.printSheet`, `orders.sheet.*` (en+ka)

### What's next
- Max: user-test all four fixes for real (Claude-tested only, per FeatureLog convention) — Columns picker, status dropdown on a genuinely wide/scrolled table, Print Sheet on a real multi-day range, EN/KA switcher feel.
- `known bugs and comment.md` item 3 — needs Max's input, note cuts off mid-sentence.
- #139 (info tooltips) — needs a go-ahead on the pilot-scope approach before building.
- Spawned background task to fix the pre-existing `toggleCol` cross-component setState warning (not urgent, dev-mode-only).

---

## 2026-07-26 — Bilingual wine name (#143 built) + recovered stuck #79 vault docs (full detail)

### Completed

**Investigated how EN/KA translation currently works for wines**, at Max's request. Confirmed: wine type/sweetness (`WineType`/`Sweetness` enums) are stored as a single value and already correctly translate in the admin panel via `adminT()` — but the public `/wines` ordering page never fetches the tenant's `default_locale` at all and has its own separate, hardcoded-English copy of those labels, so a Georgian-language tenant's wine catalogue still showed "Dry"/"Sweet"/"Red" in English regardless of site language. Missed by the earlier "front-facing = complete" translation audit (2026-07-23), which covered Nav/Home/About/Contact/Booking Form but not Wines. Separately confirmed `Wine.name` (e.g. "Rkatsiteli") is a single required field with no locale variant — admin's understanding was correct, that's by design today.

**Max proposed adding an optional Georgian wine name** (e.g. "რქაწითელი"), entered via a toggle, falling back to English if blank — reasoned it's a real translation (different script) unlike a pure proper noun, and helps SEO for Georgian-script search queries. Agreed, and bundled in the type/sweetness label fix since it's the same underlying gap (site language never reaching the wines page).

**Full plan written and approved** before any edits: `Plan-BilingualWineName.md`. An `Explore` subagent first mapped every place `Wine.name`/`WineOrderItem.wineNameSnapshot` are read or written (admin editor, public catalogue, order submission, packing view, statistics, seed/clone scripts) to scope the change correctly — confirmed the order snapshot and downstream admin views (packing sheets, statistics aggregation) need zero changes, since they just display whatever string was already resolved upstream.

**Repo detour before building:** switching from `master` to `staging` surfaced a real merge conflict — `FeatureLog.md`/`MyToDo.md`/`Plan-DevProdEnvironments.md`/`workspace.json` had a newer, uncommitted, post-#79-completion version stuck on `master` (never made it to `staging`) that collided with `staging`'s own older, pre-completion version of the same files. Showed Max the actual diffs rather than guessing; confirmed via git log timestamps that the stuck master version was written *after* the staging version, so it was the correct one to keep. Resolved in its favor, committed separately (`b716557`) before starting the feature.

**Built #143** exactly per the plan: `Wine.nameKa String?` (migration `20260726093339_add_wine_name_ka`, applied to **dev** DB only, dev server was already stopped); `lib/wineName.ts` (`wineDisplayName(wine, locale)`, fallback computed at read time, nothing copied into the DB); admin `WinesClient.tsx` gained an EN/KA toggle on the Name field (separate toggle state for the add-form and inline edit-form, since both can be open independently) with a fallback hint when the Georgian field is empty; `lib/t.ts` gained `wine.type.*`/`wine.sweetness.*`/`wine.sparkling` keys (the public-site counterpart to the admin dictionary's existing wine enum labels); public `app/(site)/wines/page.tsx` now fetches `default_locale` (+ `site_locale` cookie override, matching Home/About/Contact's exact resolution order) and resolves each wine's name server-side before handing data to the client component, which now takes a `locale` prop instead of hardcoding English labels. Deliberately left out (per plan scope): the rest of the wines page's chrome (headings, filter labels, form placeholders) is still English-only — a separate, larger gap, not this pass.

**Browser-verified on staging tenant (Staging Winery) via localhost, logged in as `maxb2bsaas@gmail.com`:** toggled Rkatsiteli's Name field to Georgian in `/admin/wines`, saw the empty-state fallback hint, entered "რქაწითელი", saved. Public `/wines` with no locale cookie still showed "Rkatsiteli" (English) — baseline unchanged. With `site_locale=ka` cookie set: showed "რქაწითელი" for the one wine with a Georgian name, and correct English fallback for the other 5 (no Georgian name yet); type/sweetness/sparkling filter pills and badges all switched to Georgian. Confirmed the resolved name also reaches the cart/order-summary line (traced in code that this is exactly what becomes `wineNameSnapshot` on submit — didn't submit a live test order). TypeScript: 0 errors throughout. Noted one stale doc found along the way, not fixed: `MaintenanceNotes.md` §4 still says `DEFAULT_TENANT_ID` points at Nikalas Marani's real tenant, but it currently resolves to Staging Winery (observed directly this session) — worth a quick correction next time that section is touched.

**Vault:** `FeatureLog.md` (#143 → ✅ Done, Claude tested), `MaintenanceNotes.md` (new §5 — resolve wine names through `wineDisplayName()`, don't read `wine.name` directly on customer-facing surfaces), `Plan-BilingualWineName.md` (updated with what was actually built + verification results), `SessionLog.md` (this entry).

### Files changed
- `saas/prisma/schema.prisma` — `Wine.nameKa String?`
- `saas/prisma/migrations/20260726093339_add_wine_name_ka/` — NEW
- `saas/lib/wineName.ts` — NEW
- `saas/lib/adminT.ts` — `wines.nameKaPh`, `wines.nameKaFallbackHint` (en+ka)
- `saas/lib/t.ts` — `wine.type.*`, `wine.sweetness.*`, `wine.sparkling` (en+ka)
- `saas/app/actions/wines.ts` — `createWine`/`updateWine`/`getWinesWithVintages` extended for `nameKa`
- `saas/app/admin/(panel)/wines/WinesClient.tsx` — EN/KA name toggle (add + edit forms)
- `saas/app/(site)/wines/page.tsx` — fetches `default_locale`, resolves names server-side
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — `locale` prop, `t()`-driven type/sweetness/sparkling labels
- Vault: `Plan-BilingualWineName.md` (NEW), `FeatureLog.md`, `MaintenanceNotes.md`, `SessionLog.md` (this entry)
- Also recovered onto `staging` (separate commit `b716557`): `FeatureLog.md`, `MyToDo.md`, `Plan-DevProdEnvironments.md`, `ClaudeInstructions.md`, `workspace.json`, `SessionLog.md` — the stuck #79 wrap-up docs described above

### What's next
- Push this work to `staging`, verify on the staging preview URL, then `prisma migrate deploy` to **production** + merge to `master` once Max confirms staging looks right (per Rule 0).
- Max: add Georgian names for the other 5 wines when convenient — data entry, not code.
- Flagged, not done: rest of the wines page chrome is still English-only (same shape of gap, separate scope); `MaintenanceNotes.md` §4's stale `DEFAULT_TENANT_ID` description.

---

## 2026-07-23 (session 3) — Feature #79 BUILT: dev/prod environments live + strict staging-first rule recorded (full detail)

### Completed

**Executed the full 7-step #79 plan** approved earlier the same day (see session 2 entry below). All infra built via Supabase + Vercel MCP, verified in browser, nothing done to prod except the two intentional cleanup writes (Test Winery removal, already-approved).

1. **Dev Supabase project created** (`georgian-saas-dev`, `jpbkkngpgtvqmsocitjx`, eu-central-1, $0/month confirmed via `get_cost`+`confirm_cost`).
2. **Migration baseline established on both DBs.** Generated a squashed baseline from current `schema.prisma`, verified drift-free against prod first (`migrate diff` came back empty), deleted the stale `20260517121307_init` migration, replaced with `20260723000000_baseline`, marked `--applied` on dev and prod via `prisma migrate resolve`. `migrate status` clean on both afterward. Also ran the RLS setup (app_user role + 14 tenant_isolation policies + the same Tenant/PlatformConfig lockdown from earlier today) against dev via MCP so dev's security posture matches prod exactly.
3. **Test Winery removed from production** — verified first via SQL that it had zero rows in every data table (booking/company/wine/etc. all 0) before deleting; also removed its orphaned `testwinery@email.ge` auth user. Prod now has exactly one tenant.
4. **Staging tenant built** — wrote `scripts/clone-nm-to-staging.ts`, cloned NM's 36 settings + 64 SiteContent rows + 6 companies with price tiers + 6 wines with vintages + menu/masterclass items into a new "Staging Winery" tenant in the dev DB (displayName suffixed "(Staging)" so browser tabs are distinguishable).
5. **Environments wired** — `saas/.env` repointed to dev (prod backed up to `.env.prod.backup`, gitignored); Max split Vercel's env vars (Production→prod DB, Preview→dev DB) by hand since the Vercel MCP has no env-var tools; all values recorded in `credentials.txt` including the dev `service_role` key Max retrieved from the dashboard.
6. **Staging branch + URL stood up** — pushed `staging` and `master` (permission-gated, Max ran both `git push` commands); Vercel auto-built the Preview at `georgian-saas-git-staging-mg-productions-projects.vercel.app`; set that as the Staging Winery `Tenant.domain`; Max disabled Vercel's "Deployment Protection" (Vercel Authentication) so the URL is reachable without a Vercel login.
7. **Vault documentation** — this entry, plus `Plan-DevProdEnvironments.md` (new), `Roadmap.md`, `FeatureLog.md` (#79 → ✅ Done, Claude tested), `MyToDo.md`.

**Bug found and fixed during verification: connection pool exhaustion on the new dev DB.** First browser check of both the staging URL and localhost showed the page shell/nav loading but the main content never appearing — looked like a broken deploy. Investigated properly rather than guessing: Vercel runtime logs showed nothing (error surfaced client-side via streaming, not as a clean 500 in most cases); reproduced locally via the dev server's own logs, which showed the real error — `PrismaClientKnownRequestError: Timed out fetching a new connection from the connection pool (connection_limit: 9)`. Wrote two small throwaway repro scripts (deleted after) to isolate it: confirmed `withTenantDb`'s `SET LOCAL ROLE` + RLS mechanism itself worked fine (identical to prod), then fired 30 parallel tenant transactions and got `EMAXCONNSESSION: max clients reached in session mode — pool_size: 15` — the home page fires ~26 parallel `withTenantDb` transactions per render (existing app behavior, same on prod), and the new dev project's session-mode pooler (port 5432) has a lower default cap (15) than what that many parallel session-mode connections need. Fix: switched local `DATABASE_URL` to the **transaction pooler** (port 6543, `pgbouncer=true`) with explicit `connection_limit=20&pool_timeout=30` — matches how prod's `.env` was already configured (verified against the existing prod file, wasn't a new pattern). Re-tested: staging and localhost both render fully. Root cause was purely a new-project default, not a bug in the app or the #79 setup design.

**Second issue: `<main>` looking permanently empty during agent-side verification even after the pool fix — turned out to be a false alarm in my own tooling, not the app.** Server logs showed clean 200 responses and `curl` confirmently returned full real content ("Wine Tasting", real prices) at ~59KB, but my in-pane page reads kept showing only the loading skeleton. Root cause (confirmed via Max pointing it out and reproducing after making the pane visible): **a hidden/backgrounded browser pane freezes React's streaming hydration mid-render** — the page was correctly finishing server-side the whole time, my checks were just reading a frozen client. Logged as a gotcha in `Plan-DevProdEnvironments.md` so future verification isn't fooled by the same thing.

**Staging admin login wired and fixed.** Max created `maxb2bsaas@gmail.com` in the dev Supabase auth; ran `npm run set-admin -- --email maxb2bsaas@gmail.com --tenantId cmrxb85wo0000vlc0d964nzf8` to lock it to Staging Winery. First login attempt failed ("Incorrect email or password") despite the account looking correct in the DB (confirmed, has_password, email_confirmed_at set, not banned) — rather than guess at the cause, force-reset the password via Supabase's Admin API to the exact value recorded in `credentials.txt`, eliminating any copy/paste mismatch. Second attempt succeeded — landed in Orders, correctly showing only the `STAGING TEST-79` booking (200₾), confirming tenant scoping end-to-end.

**Recorded the strict workflow rule, at Max's explicit request.** Added a new **Rule 0** at the very top of `ClaudeInstructions.md` (read before all other rules): every code change goes to `staging` first, never straight to `master`; `master` is production and only gets updated after Max confirms what's on staging; schema changes follow the same shape (`migrate dev` on dev → verify → `migrate deploy` on prod as its own deliberate step); local dev always points at the dev DB. Added matching practical guardrails (check current branch before committing, switch back to `staging` after every master merge, never force-push). Mirrored the same flow, as a diagram, at the top of `Plan-DevProdEnvironments.md` so both the strict rule and the full operational detail live in sync.

### Files changed
- `saas/prisma/migrations/` — deleted `20260517121307_init`, added `20260723000000_baseline`
- `saas/scripts/clone-nm-to-staging.ts` — NEW (one-off NM→staging snapshot tool)
- `saas/.env` — repointed to dev DB (transaction pooler, explicit connection_limit); `saas/.env.prod.backup` NEW (prod values preserved, gitignored)
- `credentials.txt` (repo root, gitignored) — DEV/STAGING section added: DB password, both pooler URLs, anon key, service_role key, staging tenant ID/domain, admin login, environment mapping table
- Vault: `Plan-DevProdEnvironments.md` (NEW, then restructured to lead with the flow diagram), `ClaudeInstructions.md` (new Rule 0), `Roadmap.md`, `FeatureLog.md`, `MyToDo.md`, `SessionLog.md` (this entry)

### What's next
- Optional, not blocking: raise dev pooler `pool_size` 15→30 in the Supabase dashboard (current explicit connection_limit workaround is sufficient); a friendlier staging domain alias; decide whether to keep or delete the `STAGING TEST-79` test booking.
- Max to actually try the new flow once on a real small change, to build the staging-first habit muscle memory.
- FeatureLog #79 "User tested" column still ❌ — all testing so far was Claude via MCP/browser; worth a real pass from Max at some point, low urgency since the mechanics are fully verified.

---

## 2026-07-23 (session 2) — Feature #79 dev/prod plan approved + Supabase/Vercel MCP capability audit (full detail)

### Completed

**#79 plan finalized and recorded** in `Plan-DevProdEnvironments.md` — 7 steps: dev Supabase project → prisma migrate baseline → remove Test Winery from prod → staging tenant cloned from NM → env wiring (local+Preview→dev, Production→prod) → stable `staging` branch URL with a dev-DB Tenant row → staging-first workflow. Decisions: single stable staging URL (not per-branch), staging tenant = NM clone, switch `db push` → `prisma migrate`. Nothing built yet.

**Max connected the official Supabase + Vercel MCP servers; audited them read-only.** Verified working against the real accounts:
- Supabase: org `ttkkmvhlzffxttfpddhk` ("Max-MGv's Org"), one project `dshsfkffcsgerdqinqst` ("Nikalas Marani", eu-central-1, PG 17, healthy). New project cost confirmed **$0/month** via `get_cost`. Tools include create_project, execute_sql, apply_migration, list_tables, logs, advisors.
- Vercel: team `team_YoGrXMcjXga0y919jXsSV82z` ("MG_Productions' projects"), one project `prj_6r0Ge02yFdu3y6XfPPTB42LIOg8I` (georgian-saas). Tools include deployments, build/runtime logs, deploy trigger, docs search. **No env-var management tools** — Vercel Preview env vars stay a manual dashboard step for Max.
- Remaining manual gap on Supabase side: MCP never exposes the Postgres **database password**, so after Claude creates the dev project, Max must copy the DB password from the dashboard for local `.env` (Claude can fetch project URL + anon key via MCP).

**⚠️→✅ Security advisory: RESOLVED same session (Max approved).** `Tenant` and `PlatformConfig` had RLS disabled AND `anon`/`authenticated` (the public PostgREST API roles) held **full privileges** (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) — anyone with the public anon key could have read, rewritten, or deleted tenant rows (domains, branding, module flags) via Supabase's auto-generated REST API. Verified safe to fix before touching anything: (1) codebase grep — the Supabase JS client is used ONLY for Storage (logos/backgrounds/wine photos), zero PostgREST DB calls; (2) all `db.tenant`/`db.platformConfig` queries use the plain Prisma client as `postgres`, which **owns** both tables (owner bypasses RLS; `relforcerowsecurity` confirmed false); (3) no `withTenantDb`/`app_user` path or relation-include reaches either table. Fix applied via MCP `apply_migration` (`lock_platform_tables_rls`): `ENABLE ROW LEVEL SECURITY` on both + `REVOKE ALL ... FROM anon, authenticated` on both. Verified after: pg_class shows RLS on, grants table shows zero anon/authenticated privileges, `get_advisors` critical warning cleared (only expected INFO "RLS enabled no policy" notices remain — deny-all is the intended state), and live regression passed: `nikalasmarani.vercel.app` renders fully (tenant resolution = heaviest Tenant path) and `/admin/login` renders ("Admin Panel" + form; PlatformConfig empty so text fallback is correct). Rollback if ever needed: `DISABLE ROW LEVEL SECURITY` + re-grant.

**Remaining advisor findings (non-critical, not acted on):** (1) `anon`/`authenticated` still hold full grants on the 12 tenant-scoped tables — protected today by `tenant_isolation` policies, but revoking them entirely would be cleaner (backlog: "revoke PostgREST grants schema-wide"); (2) WARN: Supabase Auth "leaked password protection" (HaveIBeenPwned check) is disabled — one-toggle fix in the Supabase dashboard under Auth settings, Max's call.

**Also noticed:** prod has a `_prisma_migrations` table with 1 row (some early `prisma migrate` use before the `db push` era) — relevant to how the step-2 baseline gets marked; check its contents before running `migrate resolve`.

### Files changed
- Vault: `Plan-DevProdEnvironments.md` (NEW), `SessionLog.md` (this entry)

### Same day: #79 EXECUTED IN FULL — dev/prod environments live

All 7 chunks built and verified in one sitting (Max approved "lets do it"). `Plan-DevProdEnvironments.md` rewritten as the living reference (two-lane table, daily workflow, gotchas). Highlights and things future sessions must know:

- **Dev project** `jpbkkngpgtvqmsocitjx` (georgian-saas-dev, eu-central-1, $0). Pooler host is `aws-0` (prod is `aws-1`); pooler took minutes to provision after creation; direct db host is IPv6-only from Max's network. Dev DB password = same as prod (Max's choice), recorded in credentials.txt with all dev keys/URLs.
- **Migration baseline (squash)**: old lone `20260517121307_init` (from day 1; everything since was `db push`) deleted — file + prod bookkeeping row (row deleted by Max in SQL editor; the auto-mode classifier blocked Claude's DELETE on prod). New `20260723000000_baseline` generated via `migrate diff --from-empty`, **verified drift-free against prod first** (`migrate diff --from-schema-datasource` → empty), applied to dev via MCP, marked `--applied` on both DBs. `migrate status` clean on both. Rule 10 updated: `prisma migrate dev` replaces `db push` in the workflow.
- **Dev got full security parity** via MCP migration `rls_setup_and_platform_lock` (app_user role, 14 policies, platform lock) + 3 public storage buckets created by SQL insert into storage.buckets.
- **Test Winery deleted from prod** (tenant row + testwinery@email.ge auth user; it owned ZERO data rows). Its slug had drifted from the vault's record (`winery2` → `test-winery`) — MigrationNotes tenant table corrected + now carries a Database column.
- **Staging Winery** `cmrxb85wo0000vlc0d964nzf8` in dev = clone of NM content via NEW `scripts/clone-nm-to-staging.ts` (36 settings / 64 content / 6 companies+tiers / 6 wines+vintages / 6+5 items; no orders). displayName "Nikalas Marani (Staging)" for tab distinguishability.
- **Env wiring**: local `.env` → dev (prod backup `.env.prod.backup`); Vercel Production vars restricted to Production-only, Preview-scoped dev vars added by Max (walkthrough incl. exact values; service_role key hunt needed the "Legacy API keys" tab). `DEFAULT_TENANT_ID` (localhost-only fallback) → staging tenant.
- **Staging URL live**: commit `b1b5624` pushed to new `staging` branch + master (pushes run by Max — classifier blocked Claude's push). Vercel Deployment Protection had to be disabled by Max (preview URLs default to a Vercel login wall). Staging domain row set in dev DB → site resolves.
- **The scare and its resolution**: staging/local pages initially appeared as an empty shell + shimmer skeleton. Root-cause chain: (1) REAL local errors — P2024/P2028 pool starvation: home page = ~26 parallel `withTenantDb` txs (18 in page.tsx Promise.all + layout), dev pooler `pool_size=15`, session mode capped (`EMAXCONNSESSION`), amplified by the Claude preview pane's HEAD pinger re-rendering the force-dynamic page every ~2s. Fixed locally: DATABASE_URL → transaction pooler 6543 + `connection_limit=20&pool_timeout=30`. (2) The REMAINING "empty page" was an artifact: curl proved both staging AND prod stream complete HTML (~6s warm, identical perf — prod measured 1.28s/tx, dev 0.58s/tx, dev is FASTER); the hidden Claude browser pane freezes pages mid-stream so suspense content never swapped in. Once the pane was displayed: full renders, screenshots taken (localhost + staging). Max confirmed prod renders normally in his own Chrome.
- **E2E isolation proof**: booking submitted on the staging URL → "Booking received!", order `STAGING TEST-79` (4 guests, 200₾) exists in DEV under the staging tenant; prod Order count still exactly 60.
- **Perf note for the backlog**: ~6s warm page render is the app's normal on BOTH environments (force-dynamic + many sequential txs per render) — candidate for a future optimization pass (fewer/batched txs, ISR path per MultiTenantSiteContent.md).

### Files changed (execution)
- `saas/prisma/migrations/` — init deleted, `20260723000000_baseline/` NEW (committed `b1b5624`)
- `saas/scripts/clone-nm-to-staging.ts` — NEW
- `saas/.env` — now DEV; `saas/.env.prod.backup` NEW (both gitignored)
- `credentials.txt` — dev section added (URLs, keys, staging tenant, env mapping)
- DB prod: Test Winery tenant + auth user deleted; `_prisma_migrations` = baseline only
- DB dev: full schema + RLS + buckets + staging tenant + 1 test order
- Vault: `Plan-DevProdEnvironments.md` (rewritten as reference), `FeatureLog.md` (#79 ✅), `Roadmap.md` (backlog tick), `MigrationNotes.md` (tenant table), `ClaudeInstructions.md` (Rule 10), `MyToDo.md` (#79 checklist), `SessionLog.md` (this)

### What's next
- Max: try the workflow (checklist in MyToDo #79); create a dev auth user so staging `/admin` login works; optional pool_size raise + leaked-password toggle
- Backlog candidates spawned today: page-render perf pass; revoke PostgREST grants schema-wide; friendlier staging alias domain

---

## 2026-07-23 — #131 built and browser-verified (Booking Form editor: Georgian seed + Detailed variant) (full detail)

### Completed

**Planned, then built, both parts of #131 in one pass.** Re-verified the 2026-07-22 diagnosis against current code (unchanged): `seed-ka.ts` had zero `form_*` rows; `BookingFormVisualPanel.tsx` only mirrored the simple variant; the 3 detailed-variant section headers (`form.guest_counts`/`form.hot_dish`/`form.masterclass`) were hardcoded in `lib/t.ts`, not in `FIELDS.form`/`SiteContent`. Found the exact wiring needed: `BookingForm.tsx:48` already has an `fc(key, tKey)` fallback helper (`formContent[key] || t(locale, tKey)`) used for all 20 existing editable fields — the 3 new headers just needed the same substitution at lines 608/652/681/769.

**Decisions confirmed via AskUserQuestion:** combine both parts into one pass; add a Simple/Detailed toggle to the admin Booking Form tab (mirrors the invoice toggle, #41), independent of the tenant's actual setting; new editable scope is **headers only** (`form_guest_counts_header`/`form_hot_dish_header`/`form_masterclass_header`) — sub-labels, dropdown chrome, and rate messages deliberately left non-editable since they're tied to or populated by other admin-managed data (`MenuItem`/`MasterclassItem` records, computed numbers). Full plan captured in `Plan-BookingFormContentEditor.md` before writing any code.

**Built exactly per plan**, plus one accuracy fix discovered along the way: `BookingFormVisualPanel.tsx` was always showing Food Notes regardless of variant, but the real `BookingForm.tsx` only renders Food Notes inside the `isEnhanced` (company + enhanced-setting) branch — never in the simple/individual form. Moved Food Notes to render Detailed-only so the preview stops lying about the simple variant. Per Max's explicit reminder this session, kept/added dependency comments in the code itself (not just the vault) at every coupling point: `FIELDS.form` in `ContentClient.tsx` already had a MAINTENANCE comment pointing at `BookingForm.tsx` + `MaintenanceNotes.md` §1 — extended it for the 3 new keys; `BookingFormVisualPanel.tsx`'s existing MAINTENANCE header comment expanded to explain the simple/detailed split and exactly which parts are/aren't tenant-editable and why; `BookingForm.tsx`'s own MAINTENANCE comment was already generic enough to not need changes. `MaintenanceNotes.md` §1 (the doc all of those comments point to) rewritten to match — now documents the `fc()` helper pattern, the two-variant split, and the "fixed label vs. backed by other admin data" test for deciding what's editable.

**Browser-verified in `/admin/content` → Booking Form tab:**
- Simple/Detailed toggle switches between the two layouts correctly (Detailed shows Guest Counts split Tasting/Lunch/Free-Guide, Hot Dish Selection, Masterclass Add-ons, then Food Notes; Simple shows none of those).
- EN/KA content-locale toggle now switches all 23 `form_*` fields correctly in both variants (previously a no-op for every one of them).
- Live public site regression check: with `enable_enhanced_company_booking` already ON for Nikalas Marani, selected a company on the real booking form — "Guest Counts" and "Masterclass Add-ons" headers render correctly (Masterclass showing real `MasterclassItem` rows from the DB), "Hot Dish Selection" correctly stays hidden for Wine Tasting visit type (only shows for Tasting + Lunch, matching real conditional logic) — confirms the `fc()` swaps didn't break the live form.
- TypeScript: 0 errors throughout.

### Files changed
- `saas/lib/adminT.ts` — 3 new `content.field.form_*` entries + 2 new `content.formVariant.*` toggle labels (en + ka)
- `saas/app/admin/(panel)/content/ContentClient.tsx` — 3 new `FIELDS.form` entries; `formVariant` state + Simple/Detailed toggle UI for the Booking Form tab
- `saas/app/admin/(panel)/content/BookingFormVisualPanel.tsx` — new `variant` prop; Detailed-only Guest Counts split / Hot Dish Selection / Masterclass Add-ons sections; Food Notes moved to Detailed-only (accuracy fix); expanded MAINTENANCE comment
- `saas/components/BookingForm.tsx` — 4 call sites (lines 608/652/681/769) switched from `t()` to `fc()` for the 3 new keys
- `saas/scripts/seed-ka.ts` — 23 new `form_*` Georgian rows (20 previously-missing + 3 new)
- Vault: `Plan-BookingFormContentEditor.md` (NEW, plan), `MaintenanceNotes.md` §1 (rewritten to match), `FeatureLog.md` (#131 → ✅ Done), `SessionLog.md` (this entry)

### What's next
- Max to do a wording review of the 23 newly-seeded Georgian strings (same "batch review" bucket as the rest of the Georgian admin layer work, still pending from prior sessions).
- Add to `MyToDo.md`: spot-check the Detailed variant preview + Georgian toggle live.

### Same-day follow-up: "are we done translating, front and back?" audit

Max asked directly whether the whole site (public + admin) is now fully translated. Rather than answer from memory, audited it: wrote a one-off script querying `SiteContent` directly for `ka` row coverage against every `FIELDS.*` key across all 5 Site Content sections, then read the actual page components (`app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `SiteNav.tsx`) to check *how* missing keys are handled.

**Finding: the public site is fully bilingual regardless of SiteContent gaps.** Nav/Home/About/Contact/Booking Form all pass `t(locale, key)` — not a static English string — as the fallback into `EditableText`/`ET`, so even fields with zero `ka` `SiteContent` rows (most of About/Contact, 2 of Home) already render correct Georgian to visitors via `lib/t.ts`. `SiteContent` `ka` rows are a per-tenant *override* layer on top of an already-bilingual default, not a requirement for correctness. Confirmed this is real by checking each component's `fb={t(locale, '...')}` call directly, not just assuming from the DB query.

**Found one genuine remaining gap: the Site Content editor's own Navigation tab.** Unlike Home/About/Contact (previewed via a live iframe of the real page — inherently locale-aware), Nav and Form are previewed through static components (`FieldsPanel` / `BookingFormVisualPanel`) that only show Georgian if a `SiteContent` `ka` row exists. Nav had zero — same exact symptom Max originally reported for Booking Form, just never caught for Nav since Max's original report was Booking-Form-specific. Fixed the same way: seeded the 5 `nav_*` keys (`mtavari`/`chven shesakheb`/etc., matching `SiteNav.tsx`'s own `t.ts` fallback text exactly) via `seed-ka.ts`. Browser-verified the Navigation tab now shows Georgian on toggle. No live-site behavior changed — `SiteNav.tsx` was already correct; this only fixes the admin editor's own preview.

**Answer given to Max:** front-facing = complete (verified, not assumed); admin panel chrome = complete (#130 + #131); the one thing that wasn't complete (Nav tab preview) is now fixed too. Deliberately out of scope, not gaps: `/super-admin` (English-only by design) and printed invoices (hardcoded Georgian-only, never was a toggle). Still outstanding: Max's wording/quality review of the Georgian text — a QA pass, not a completeness gap.

### Files changed (this addendum)
- `saas/scripts/seed-ka.ts` — 5 new `nav_*` Georgian rows
- Vault: `FeatureLog.md` (#131 entry extended), `SessionLog.md` (this entry)

---

## 2026-07-22 — Georgian admin layer Phase 3 (done, #130 fully complete), #131 diagnosed (full detail)

### Completed

**Georgian layer Phase 3 — Site Content editor chrome. #130 is now fully done (all 4 phases).** Scoped precisely by reading the actual files rather than assuming the plan doc's file list was complete:
- `ContentClient.tsx` — page title/subtitle (3 variants), Visual/Backgrounds mode switcher, locale-toggle labels, all 5 section tabs, and all 66 `FIELDS` descriptor labels (Nav/Home/Booking Form/About/Contact — the small uppercase captions telling the admin which piece of content each box edits) — new `content.*` keys.
- `BackgroundsTab.tsx` — intro text, page hero labels, Desktop/Mobile toggle, Choose/Upload image, preview caption (with `{viewport}`/`{vw}` interpolation), slider labels, mobile hint, unsaved-changes banner, Save button states — new `backgrounds.*` keys. Reused existing `wines.uploadFailed`/`wines.unknownError` for the upload-error alert instead of duplicating.
- `BookingFormVisualPanel.tsx` — turned out to need **no new chrome strings at all**: every visible label in this file is itself mirrored form content (already covered by the existing content-locale EN/KA toggle), not admin chrome. Only needed to thread the new `adminLocale` prop through to its `EditableText` calls.
- **`components/EditableText.tsx`** — found during investigation, not in the original Phase 3 file list. This shared component has real hardcoded chrome (Save/Cancel/✓ Saved/↺ Reset to default/reset tooltip/Edit-title) and is used in 6 places: the 2 admin-direct callers above, plus 3 **public-site** pages (`app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx`) via their iframe-embedded edit mode. Added an optional `adminLocale?: string` prop defaulting to `'en'` so only the 2 admin callers pass the real tenant setting — the 3 public-site call sites are untouched, correctly keeping the public site's own i18n system separate per the plan's explicit scope note.
- **Naming decision:** `ContentClient.tsx` already used `locale` for the *content* language being edited (which language's text you're viewing/editing — en/ka toggle). The chrome-language prop threaded through this session is a separate, deliberately differently-named `adminLocale` everywhere, to avoid confusing the two concepts in this one file where both exist side by side.
- ~140 new keys added to `lib/adminT.ts` (both `en` and `ka`), bringing the dictionary to ~700 keys total.
- Browser-verified end to end: toggled Settings → Admin Panel Language to Georgian, confirmed Site Content's title/subtitle/tabs/field labels/Backgrounds tab all switch; opened a field into edit mode and confirmed Save/Cancel render as "შენახვა"/"გაუქმება"; confirmed the content-locale EN/KA toggle and actual field content were unaffected (still shows English content correctly, since content-locale was still set to EN). Reverted Settings to English — Site Content reverted cleanly, no regressions. TypeScript: 0 errors throughout.

**#131 (Site Content editor review) investigated and split into two distinct problems, not yet fixed:**
1. **"Georgian button does nothing" for the Booking Form tab** — root cause confirmed by inspection: `scripts/seed-ka.ts` seeds Georgian content for Home/About/Contact but has **zero rows for any `form_*` key**. The content-locale switcher itself works correctly (same code path as the other sections) — there's simply no Georgian text saved yet to switch *to*, so toggling shows the same English fallback either way. Cheap fix (~18 strings to translate + seed), no design decisions needed.
2. **Missing "detailed" (enhanced company) form variant** — bigger. The real setting is `enable_enhanced_company_booking` (Settings → Booking → "Enhanced company booking form"); when on, the live `BookingForm.tsx` shows split guest counts, hot dish selection, and masterclass add-ons for company bookings — but those strings live hardcoded in `lib/t.ts`, never wired into `SiteContent`/`FIELDS.form`, so the admin can't edit them and the Site Content editor's Booking Form tab has no way to preview that variant. Needs a design decision (which strings become tenant-editable) + a second mock variant in `BookingFormVisualPanel.tsx`, and touches the live public form per `MaintenanceNotes.md` §1 — deliberately deferred to its own planning pass rather than folded in here.

Recommended (and agreed) order: #130 Phase 3 (done above) → #131 part 1 (cheap, no design work) → #131 part 2 (separate plan).

### Files changed
- `saas/lib/adminT.ts` — added `content.*`, `backgrounds.*`, `editable.*` blocks (en + ka), ~140 new keys
- `saas/app/admin/(panel)/content/page.tsx` — fetches `admin_language`, passes `adminLocale` to `ContentClient`
- `saas/app/admin/(panel)/content/ContentClient.tsx` — chrome translated, `adminLocale` threaded to `FieldsPanel`/`BackgroundsTab`/`BookingFormVisualPanel`/`EditableText`
- `saas/app/admin/(panel)/content/BackgroundsTab.tsx` — chrome translated, `adminLocale` threaded through `PageBgEditor`/`ImagePicker`/`BgPreview`
- `saas/app/admin/(panel)/content/BookingFormVisualPanel.tsx` — `adminLocale` prop added, passed to `EditableText` only
- `saas/components/EditableText.tsx` — new optional `adminLocale` prop (default `'en'`), chrome strings translated
- Vault: `Plan-AdminGeorgian.md` (Phase 3 + overall status → done), `FeatureLog.md` (#130 → ✅ Done), `SessionLog.md` (this entry)

### What's next
- Confirm with Max whether to proceed with #131 part 1 (seed Georgian translations for the ~18 `form_*` keys) in a follow-up.
- #131 part 2 (enhanced/detailed booking form variant) needs its own plan — touches live `BookingForm.tsx`, not just admin chrome.
- Max still owes a batch review of all the Georgian wording written across Phases 0-3 (flagged previously, still pending).

---

## 2026-07-21 — Wine Orders Pack cleanup, backlog audit, Georgian admin layer Phases 0-2 (full detail)

### Completed

**Wine Orders Pack view: layout A only.** Max preferred layout A (right-side split panel summary) of the 3 packing-view layouts; removed B (sticky bottom bar) and C (top collapsible) entirely from `PackingView.tsx` along with the now-unused A/B/C toggle and `PackingLayoutType`. `WineOrdersClient.tsx` simplified to match (dropped `packingLayout` state/props).

**Explained the "every wine shows 2026" question.** Root cause: `scripts/migrate-wine-hierarchy.ts` (the one-off #116 Wine Hierarchy migration) hardcoded `year: 2026` when converting old flat `Wine` rows (no vintage concept) into the new `WineVintage` model, since there was no real vintage year to migrate from. Not a display bug — every wine's vintage year defaults to 2026 until someone edits it in `/admin/wines`. Wines Max has already corrected (Saperavi 2022, Rkatsiteli 2023, etc.) show correctly.

**Backlog audit** — Max reported 4 backlog items as done; verified each against the actual code before touching the vault (per Rule 1, vault must stay accurate):
- ✅ Google Maps embed (`maps_embed_url` setting) — confirmed
- ✅ Editable social/contact links (`contact_facebook`/`contact_instagram`/etc. settings) — confirmed
- ✅ Feature flags (`modulesBooking`/`modulesWineOrders`/`modulesPublicSite` from #120) — confirmed, though granularity is per-module not per-section
- ❌ Forgot password — **not found** in code (no `resetPasswordForEmail`, no reset route anywhere). Flagged to Max; he confirmed it was super-admin's manual "Set password" override (#126) he was thinking of, not a self-service `/admin/login` flow — that's still genuinely unbuilt. `Roadmap.md` updated to reflect the distinction precisely instead of marking it done.

**Georgian layer for admin panel — planned, Phase 0 built.** Max wants the client-facing `/admin` panel translatable to Georgian, set once from Settings (no in-panel runtime switcher — per-tenant, not per-session). Asked clarifying questions first (scope/phasing, translation authorship, super-admin inclusion) via AskUserQuestion. Decisions: `/admin` only (not `/super-admin`); Claude drafts Georgian text, Max reviews per phase; phased rollout rather than one 40-file pass, because one giant diff has no review checkpoint and mixes daily-use pages with rarely-touched ones. Full plan + living progress tracker: `Plan-AdminGeorgian.md`.

**Architecture** (discovered mid-plan, better than the original Context-based design): the codebase already has this exact pattern for the public site's EN/KA content — `lib/t.ts` exports `t(locale, key, vars?)` reading from a flat `{en, ka}` dictionary, and pages fetch `default_locale` server-side and pass it down as a prop, no Context. Copied that pattern exactly instead of introducing a new provider abstraction: new `lib/adminT.ts` (`adminT(locale, key)`), new `Setting` key `admin_language` (reuses the existing generic `Setting` model, default `'en'`, `getSetting`/`updateSetting` unchanged apart from also revalidating `/admin` layout-wide on save).

**Phase 0 built and browser-verified**: Settings gained an "Admin Panel Language" section (mirrors the existing "Default site language" section's styling) with an EN/KA toggle; `(panel)/layout.tsx` fetches the setting and translates all nav labels, the "Admin" tag, "Platform" link, and Sign out button. Verified live: flipping to KA instantly updates the section itself and the nav (via `revalidatePath('/admin', 'layout')`, no manual refresh needed on the next navigation); flipping back to EN reverts cleanly. TypeScript: 0 errors.

**Phase 1 — Core daily-use pages, built same session on "proceed, will batch check later."** Covered the rest of Settings (Booking toggles, Payment Details, Emails, Booking Rules, Contact Page/map, Branding, Contact Info, Closed Days), all of Orders (table/filters/view-toggle/calendar incl. month+day names and hover popover, `columnDefs.ts` labels converted to `labelKey`s), Order Detail (1120 lines) + New Order (678 lines — reuses most of Order Detail's keys since the forms are nearly identical), Wine Orders (`WineOrdersClient.tsx` cards/table/pack modes + vertical stepper; `PackingView.tsx` box-mode picker + print sheet), and Companies (733 lines — edit slide-over, price tiers, tab toggle). ~400 new dictionary entries added to `lib/adminT.ts` across the session, mostly reusing shared keys (`orders.status.*`, `orders.col.*`) across files that show the same concepts (e.g. New Order form's masterclass/extras sections are byte-identical in English to Order Detail's, so they just call the same `orderDetail.masterclass.*` keys rather than duplicating).

**One deliberate non-generalization**: the wine packing box-count sentences (e.g. "6 full + 1 partial (4) — 7 boxes of 6") don't map word-for-word into Georgian grammar, so rather than building a generic pluralization/interpolation system, `calcBoxes()` in `PackingView.tsx` now branches on `locale` and constructs the whole sentence per-language directly. Simpler than the alternative for ~5 sentences.

Every page browser-verified in both languages, including nested modals (send-invoice-by-email, edit slide-overs, price-tier add/edit forms) and the hover preview card. Toggling back to EN after all of Phase 1 reverts every page cleanly with no regressions (spot-checked Orders list). TypeScript: 0 errors throughout.

**Phase 2 — Secondary pages, built in a follow-up continuation of the same day.** Wines (`WinesClient.tsx`, 842 lines) — product fields, vintage sub-list, image picker, add-wine form; also translated the wine type (Red/White/Amber/Rosé) and sweetness (Dry/Semi-dry/Semi-sweet/Sweet) enum labels, which is an upgrade over the raw `RED`/`SEMI_DRY` badges the English UI showed before (matches the human-readable labels the public catalogue already uses). Statistics (`StatisticsClient.tsx`, `StatisticsV2.tsx`, `WineStatistics.tsx`, `SearchableSelect.tsx`) — mode switcher, summary cards, filters, chart titles/tooltips/axis labels, historical breakdown, wine bar/trend charts, top companies/customers; month abbreviations (`statistics.month.*`) and reused `orders.calendar.*` weekday abbreviations used to build the localized "Next Order" date string instead of `toLocaleDateString('en-GB', …)`. Menu Items and Masterclass (smaller files) — section/column headers, item rows, edit/delete sub-states, add forms.

**Caught one hardcoded fallback via browser testing, not code review**: `StatisticsV2.tsx`'s `revenueByCompany` computation had a bare `?? 'Individual'` fallback baked into chart *data* (not JSX), so it slipped past the first editing pass — only surfaced because the Georgian revenue-by-company chart bar showed "Individual" in English while everything around it was Georgian. Fixed by routing it through `at('orders.type.individual')` and adding `locale` to the `useMemo` dependency array (the fallback wouldn't have picked up a locale change otherwise, since `at` isn't memoized itself).

**One deliberate non-translation for consistency**: `MasterclassClient.tsx` uses shared `UNIT_LABELS`/`UNIT_DESCRIPTIONS` constants from `lib/masterclass.ts` (e.g. "per person", "per piece") that are also displayed, untranslated, in Phase 1's `OrderDetail.tsx`. Left them in English here too rather than translating only on the Masterclass admin page — translating just one of two pages showing the same data field would have created a language mismatch between them, which is worse than being consistently English until both get done together in a later pass.

All of Phase 2 browser-verified in both languages, including nested states (Wines vintage edit forms, Statistics historical breakdown + wine trend mode + `SearchableSelect` dropdown, Menu Items/Masterclass edit and delete-confirm rows). Spot-checked Orders list after Phase 2 changes — no regressions. TypeScript: 0 errors throughout.

**Locked the Status column on the booking Orders table (unrelated to Georgian layer work — separate ask).** Max wanted Status pinned right next to the print/email/edit/delete action icons — same "stays visible while scrolling" behavior as those buttons already have — regardless of which optional columns (Order ID, Company, Additional, etc.) are toggled on via the column picker. Two parts: (1) moved `status` to always be last in `COLUMN_DEFS` (after `additional`), so it's always the last data column before the actions column no matter the toggle state; (2) made Status `position: sticky` with `right: ACTIONS_COL_WIDTH` (190px constant, sized to fit the actions column in both its normal icon-row state and its wider delete-confirmation state), mirroring the existing sticky-actions pattern. Added a matching `.sticky-status` hover-sync rule in `globals.css` (same trick as `.sticky-actions`, since sticky cells need an opaque background painted per-cell to visually sync with `tr:hover`). Browser-verified: toggled on Order ID + Additional columns to force horizontal overflow, scrolled the table — Status and the action icons both stayed pinned at the right edge while Time/Contact/Type/etc. scrolled underneath; status dropdown still opens correctly from the pinned position.

**Follow-up bug Max caught right after: the Orders table's horizontal scrollbar was unreachable without scrolling the whole page down.** Root cause — the table wrapper (`overflow-x-auto`, no height cap) grew to fit all 60 rows, so its horizontal scrollbar sat at the actual bottom of the table, far down the page. Standard fix applied: capped the wrapper at `max-h-[70vh]` with `overflow-auto` (both axes) so the table is now a bounded, spreadsheet-style scroll panel — horizontal scrollbar always reachable just below the visible rows, no page scrolling needed. Made the header row sticky (`top: 0`) so it stays visible while scrolling vertically inside the panel; the two corner header cells (Status, Actions) are sticky on **both** axes (`top: 0` + `right: …`) so they stay put no matter which direction you scroll — a "frozen corner." Getting the stacking order right took care: header cells got explicit positive `z-index` (20 for plain sticky-top cells, 30 for the sticky-corner ones) so they paint above scrolling body rows; deliberately did **not** add `z-index` to the body's sticky Status/Actions `<td>`s, since per CSS stacking rules an explicit z-index there would trap the status dropdown's own `z-30` inside that cell's new stacking context, causing it to be covered by subsequent rows' sticky cells instead of floating above them as it does today. Browser-verified: scrolled the panel both vertically and horizontally (via direct `scrollTop`/`scrollLeft`) — header and the Status/Actions corner stayed pinned correctly together, and the status dropdown still renders above the rows below it, not underneath.

### Files changed
- `saas/app/admin/(panel)/wine-orders/PackingView.tsx` — removed layouts B/C, `PackingLayoutType`; later fully translated (box-mode picker, print sheet, per-locale box-count sentences)
- `saas/app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — dropped `packingLayout` state/props; later fully translated
- `saas/app/actions/settings.ts` — `admin_language` default + revalidate `/admin` layout
- `saas/lib/adminT.ts` — NEW, grew to ~400 keys across the session (nav, settings.*, orders.*, orderDetail.*, newOrder.*, packing.*, wineOrders.*, companies.*)
- `saas/app/admin/(panel)/layout.tsx` — nav translated
- `saas/app/admin/(panel)/LogoutButton.tsx` — takes `label` prop
- `saas/app/admin/(panel)/settings/page.tsx`, `SettingsClient.tsx` — fully translated
- `saas/app/admin/(panel)/orders/page.tsx`, `OrdersTable.tsx`, `OrdersFilters.tsx`, `ViewToggle.tsx`, `CalendarView.tsx`, `columnDefs.ts` — fully translated
- `saas/app/admin/(panel)/orders/[id]/page.tsx`, `OrderDetail.tsx` — fully translated
- `saas/app/admin/(panel)/orders/new/page.tsx`, `NewOrderForm.tsx` — fully translated
- `saas/app/admin/(panel)/wine-orders/page.tsx` — fully translated
- `saas/app/admin/(panel)/companies/page.tsx`, `CompaniesClient.tsx` — fully translated
- `saas/app/admin/(panel)/wines/page.tsx`, `WinesClient.tsx` — fully translated (Phase 2), incl. wine type/sweetness enum labels
- `saas/app/admin/(panel)/statistics/page.tsx`, `StatisticsClient.tsx`, `StatisticsV2.tsx`, `WineStatistics.tsx`, `SearchableSelect.tsx` — fully translated (Phase 2); `StatisticsV2.tsx` also fixed a hardcoded `'Individual'` fallback found during verification
- `saas/app/admin/(panel)/menu-items/page.tsx`, `MenuItemsClient.tsx` — fully translated (Phase 2)
- `saas/app/admin/(panel)/masterclass/page.tsx`, `MasterclassClient.tsx` — fully translated (Phase 2); unit-type labels deliberately left English for consistency with Order Detail
- `saas/lib/adminT.ts` — grew to ~550 keys across the full session (added `wines.*`, `statistics.*`, `menuItems.*`, `masterclass.*` blocks in this continuation)
- `saas/app/admin/(panel)/orders/columnDefs.ts` — reordered `status` to always render last (after `additional`)
- `saas/app/admin/(panel)/orders/OrdersTable.tsx` — Status `<th>`/`<td>` moved after Additional and made sticky (`ACTIONS_COL_WIDTH` const); actions column given a fixed width to match; table wrapper capped at `max-h-[70vh]` with dual-axis `overflow-auto`; header row made sticky-top with explicit `z-index` (20 plain / 30 corner cells)
- `saas/app/globals.css` — `.sticky-status` added alongside `.sticky-actions` in the hover-sync rule
- Vault: `Plan-AdminGeorgian.md` (Phases 0-2 marked done), `Roadmap.md` (backlog corrections), `FeatureLog.md` (#130, Status column lock), `SessionLog.md` (this entry)

### What's next
- **Phase 3** of the Georgian layer: Site Content editor's own chrome (`ContentClient.tsx`, `BackgroundsTab.tsx`, `BookingFormVisualPanel.tsx`) — deliberately last since it's architecturally distinct (an editor for the public site's own EN/KA content). See `Plan-AdminGeorgian.md` progress tracker.
- Max should batch-review all the Georgian wording written this session (Settings, Orders, Order Detail, New Order, Wine Orders, Companies, Wines, Statistics, Menu Items, Masterclass) — flagged as pending per his "will batch check later."
- Vintage-year cleanup (2026 default) in `/admin/wines` is a data-entry task for Max, not code — not tracked as a bug.
- Once Phase 3 lands, consider a follow-up pass to translate `UNIT_LABELS`/`UNIT_DESCRIPTIONS` (`lib/masterclass.ts`) consistently across both `OrderDetail.tsx` and `MasterclassClient.tsx` together, since both were deliberately left English for consistency with each other rather than translated ad hoc.

---

## 2026-07-18 — Push #116–#122, no-tenant state + domain migration (#123) (full detail)

### Completed

**Pushed the backlog of uncommitted work.** 8 unpushed commits plus ~48 files of uncommitted changes (#115–#122 sessions) committed as `8a07888` and pushed. Production build verified clean first (0 TS errors; initial `EPERM` build failure was just the dev server holding the Prisma DLL lock — killed it, rebuilt, fine).

**Bug found by Max after deploy: wine orders section missing on the live site.** Root cause turned out to be a pre-existing split-brain in `resolveTenant()` (`saas/proxy.ts`): `tenantId` fell back to `DEFAULT_TENANT_ID` (NM's ID) for *any* unknown domain, but every other `TenantInfo` field (displayName, brand colors, module flags) fell back to generic hardcoded defaults. `georgian-saas.vercel.app` has never been a `Tenant.domain` row, so it served NM's real data under the name "Your Winery" with default module flags — invisible until #120 made `modulesWineOrders` (default **false**) actually hide things. Brand color matched by pure coincidence (default hex = NM's seeded hex).

**#123 — True no-tenant state + `/welcome` placeholder + NM domain migration** (plan approved by Max before any edits):
- `proxy.ts`: `DEFAULT_TENANT_ID` fallback now scoped to localhost dev only; unknown domains → `tenantId: null`
- No-tenant routing: public routes → redirect to new `/welcome`; `/super-admin` + `/admin/login` keep working (platform domain = HQ, Max's choice); tenant `/admin` → redirects to login (or `/super-admin` for super_admin); `/welcome` on a *real* tenant domain redirects to `/`
- `saas/app/welcome/page.tsx` — NEW: static KA+EN pitch page ("ეს შეიძლება იყოს თქვენი მარნის საიტი / This could be your winery's website"), 3 feature cards (bookings / wine orders / admin panel), contact email; dark platform style; reads only the `x-platform-logo` header, no DB
- DB: NM `Tenant.domain` → `nikalasmarani.vercel.app` (one-off script, deleted after; Max had already added the domain in Vercel). Per `MigrationNotes.md` the domain is only a lookup key — nothing else needed; admin auth keyed to tenant ID
- Hardcoded-reference sweep: no live refs to `nikalasmarani.ge` in runtime code — only one-off seed scripts (fail loudly if rerun, acceptable), email comments, UI placeholder text

**Verified live in browser after deploy** (`d7cf205`): `georgian-saas.vercel.app` → `/welcome` placeholder renders; `/super-admin` → login form. `nikalasmarani.vercel.app` → full NM site, correct title, **Order Wine restored in nav + hero**, `/wines` renders. Localhost still resolves NM via the (now localhost-only) `DEFAULT_TENANT_ID`.

**Also this session:** clarified two backlog items in `Roadmap.md` — "printable wine packing sheet" is actually **per-bottle/case stickers** (wine + ordering company), distinct from the existing Pack-mode print; "printable daily booking sheet" is an **A4 staff printout**. Neither started.

**#125 — Neutral fallbacks.** After Max assigned `testwinery.vercel.app` to Test Winery via the new UI flow, the blank tenant rendered as a half-branded NM clone: every hardcoded fallback was NM's real content (hero/about text, the fallback logo file is NM's actual logo, hero photos are NM's winery, 50₾/100₾ default prices). Audit findings: `t.ts` and settings DEFAULTS were already neutral — the NM content lived in inline page fallbacks; **NM had zero English SiteContent rows** (its whole EN site rendered from those fallbacks); NM's EN contact page values were empty (only ka rows existed). Max's decisions: display-name-as-text logo fallback, brand-gradient hero fallback, hidden price line, NM content must live in DB. Built in safety order: (1) `scripts/seed-nm-content-en.ts` — verbatim, create-only, 17 rows incl. the contact fix and a ka row for `home_location_eyebrow` (KA site was showing the EN fallback); (2) neutralized all fallbacks (page.tsx/about/contact/SiteNav/layout/wines catalogue), dead social icons and empty footer segments hidden, icon fill `#9b090c` → brand var. Verified NM home/about/contact byte-identical locally from DB rows. Full plan: `Plan-NeutralFallbacks.md`. Commit `e5c2bdb`.

**#125 follow-up caught during live verification:** the deployed Test Winery homepage was neutral *except* the booking form — visit-type cards showed "50₾ / person" and the estimate computed 200₾ from hardcoded rates in `BookingForm.tsx` (line 239 + visit-type card array), and worse, `createBooking.ts` **stored** invented 50/100-based totals server-side for tenants with no individual pricing tiers. Fixed (commit `47897c4`): display prices flow from the tenant's display tier as nullable props; when unset the form shows "Price will be confirmed after submission" (existing `t()` key), the success screen hides a 0 total, and the server stores 0 instead of a fabricated amount. NM unaffected (display tier + tiers exist). **Behavior edge change:** an individual booking with a guest count outside NM's tier ranges now stores 0 (price to be confirmed manually) instead of silently falling back to 50/100 — more honest, but worth knowing when reading order totals.

**#126 — Set password in super-admin Users page.** Max asked why client passwords aren't visible/resettable from super-admin. Explained the security model (Supabase stores one-way hashes — *viewing* a password is impossible everywhere, by design; resetting is the only flow) and built the reset: `setUserPassword` server action (Supabase Admin API, min 6 chars) + inline "Set password" panel on every user row including his own account. The new password input is deliberately plain text so Max can copy it and hand it to the client. Commit `3a8ec6e`. **Max to test:** Users page → Set password on a test account. Self-serve "Forgot password" email flow deliberately deferred until Resend domain verification (in backlog). Also: Max added a planned **#127 Onboarding flow** row to FeatureLog (guided module-driven initial setup — detailed flow to be designed together).

**Ops mishap logged for honesty:** a PowerShell line-swap on `FeatureLog.md` mojibake-corrupted the whole file's non-ASCII chars (committed in `1c12110`); restored from the prior commit and re-applied rows #124/#125 with proper encoding. Lesson: don't use PowerShell 5.1 `Get-Content`/`Set-Content` on UTF-8 vault files — use the Edit tool.

**#124 — Domain check tool in super-admin tenant form.** Max asked for a UI tool to assign a tenant to a domain — turned out the Domain field in the tenant edit form already does the assignment (it's the same `Tenant.domain` write the #123 migration script performed); what was missing was *feedback*. Clarified the two-layer model for Max (Vercel dashboard = "domain reaches our app at all"; our DB = "which tenant the domain belongs to" — Vercel never knows about tenants). Built: `proxy.ts` stamps `x-resolved-tenant` (slug or `none`) on every response; `checkTenantDomain` server action (super-admin gated, HEAD fetch, 8s timeout) interprets it; **Check** button next to the Domain field shows 5 states (this tenant ✓ / different tenant / platform-but-unassigned / not-our-app → "is it in Vercel?" / unreachable); hint text documents the Vercel-first two-step + 5-min cache. Full Vercel-API auto-add (one-click domain attach) considered and deliberately deferred — not worth it until client onboarding is frequent. Verified `x-resolved-tenant: nikalasmarani` on localhost; commit `959c554`. **Max still needs to test the Check button itself** (requires super-admin login).

### Files changed
- `saas/proxy.ts` — localhost-only fallback + no-tenant routing block
- `saas/app/welcome/page.tsx` — NEW
- DB: NM tenant domain updated (no schema change)
- Vault: `FeatureLog.md` (#123), `Roadmap.md` (#123 row + backlog clarifications), `MigrationNotes.md` (tenant table, no-tenant section), `MaintenanceNotes.md` (§4 wording), `SessionLog.md` (this entry)

### What's next / for Max
- **Tell the Nikalas Marani family**: public site + admin login both live at `nikalasmarani.vercel.app` now; credentials unchanged; old `georgian-saas.vercel.app` shows the platform placeholder
- Minor cosmetic: the login page on the platform domain still titles the tab "Your Winery — Book a Visit" (root layout metadata default) — worth a small tidy sometime
- When Max gains `nikalasmarani.ge`: swap domains via `MigrationNotes.md` Steps 1–2
- Next features queued: printable daily booking sheet (A4) + wine packing stickers — scope notes in Roadmap backlog

---

## 2026-07-17 (session 3) — Features #120–122 Module toggles, super-admin login, cross-tenant orders view (compressed)

#120 Per-tenant module toggles: 3 booleans on `Tenant` (booking/wineOrders/publicSite), enforced 3 layers deep (`proxy.ts` headers + redirect, admin nav filter, `lib/requireModule.ts` page guards); Public Website is a hard kill-switch to `/coming-soon`. Caught pre-ship that `modulesWineOrders` defaulting `false` would've silently hidden NM's live wine-orders feature — fixed before deploy. #121 super_admin login now defaults to `/super-admin` instead of `/admin`. #122 new read-only `/super-admin/orders` cross-tenant activity view (Bookings/Wine Orders tabs, click-through to each tenant's real admin — no cross-tenant write actions, that fights the RLS architecture). Full notes: `Plan-TenantModules.md`, `Plan-SuperAdminOrdersView.md`.

---

## 2026-07-17 (session 2) — Feature #119 Super-admin panel quick wins (compressed)

#119 Six super-admin quick wins (wine order count on tenant cards; deleteTenant blocks on wine data; Open ↗ links; Tenant ID + Copy in edit form; friendly P2002 duplicate-domain error; Remove-access inline confirm) + real bug fix: role changes were silently no-ops because `{ role: undefined }` is dropped by JSON.stringify and Supabase metadata updates shallow-merge — fixed with explicit `null`. Browser-verified. Max's checklist in `MyToDo.md` (#119, item 5 matters most).

---

## 2026-07-17 — Feature #116 Wine hierarchy: WineProduct + WineVintage + WineOrderItem (compressed)

#116 Wine hierarchy (biggest refactor): `WineType`/`Sweetness` enums; Wine → product with `vintages`; new `WineVintage` + `WineOrderItem` (price/name/year snapshots); data migration 6 wines→6 vintages, 8 orders→16 line items (1:1 verified); RLS on both new tables; admin two-level expandable UI; public catalogue = vintage cards + Type/Style filters. TypeScript 0 errors, public flow E2E verified; admin UI needed Max's test. Full notes: `features/Feature 116 - Wine Hierarchy.md`.

---

## 2026-07-16 (session 3) — Feature #115 company wine % discount (full detail)

### Completed

**#115 — Company wine % discount**
- **Schema**: `wineDiscountPercent Float?` on Company; `discountPercent Float?` on WineOrder (snapshot).
- **Admin — company edit slide-over**: "Wine discount" section appears only when `isWineOrderCompany` is checked; single number field "X% off all wines" → saves `wineDiscountPercent`. Wine Orders expanded view shows `−X% wine discount` green badge when set.
- **Server actions**: `verifyCompanyCode` and `findCompanyByCode` now return `wineDiscountPercent`. `updateCompany` accepts and saves it. `submitWineOrder` reads `discountPercent` from form, applies to subtotal (`total * (1 − percent/100)`, rounded to 2dp), stores both the discounted `totalAmount` and `discountPercent` on WineOrder.
- **Public `/wines` — drawer**: after code verification (popup or direct code), `discountPercent` state is set. Order summary panel shows: struck-through original total + `−X%` green badge + discounted total in wine red. Hint text (*"Company discounts…"*) is hidden when a discount is already active.
- **Admin wine orders**: cards and table view show `−X%` green badge next to the amount when `discountPercent` is set on the order.
- TypeScript: 0 errors.

### Files changed
- `saas/prisma/schema.prisma` — 2 new fields
- `saas/app/actions/companies.ts` — wineDiscountPercent in CompanyProfile/updateCompany/verifyCompanyCode/findCompanyByCode
- `saas/app/actions/submitWineOrder.ts` — discount applied + stored
- `saas/app/admin/(panel)/companies/page.tsx` — wineDiscountPercent passed to client
- `saas/app/admin/(panel)/companies/CompaniesClient.tsx` — discount field in EditPanel; badge in Wine Orders panel
- `saas/app/(site)/wines/page.tsx` — wineDiscountPercent in select
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — discountPercent state; struck-through drawer total; hidden field
- `saas/app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — discountPercent type; −X% badge in cards + table
- `saas/app/admin/(panel)/wine-orders/page.tsx` — discountPercent passed through

### What's next
#116 — Wine hierarchy (WineProduct + WineVintage) — biggest refactor, do last.

---

## 2026-07-16 (session 2) — Feature #118 wine catalogue UX (compressed)

#118 Wine catalogue UX overhaul: drawer checkout (sticky bottom bar → right-side drawer, catalogue stays visible); order summary panel + success state inside drawer; `+` only at zero / `− n +` stepper when selected; typed qty inputs without spinners; z-[60] fix so popups sit above drawer. `WineCatalogueClient.tsx` full rewrite. Commits e950e6f, d6a5e30, 9208644, d2b72b0, 51f0763. Browser-verified E2E.

---

## 2026-07-16 — Feature #117 + commit of #112–114 (compressed)

#117 Company module system: `isBookingCompany`/`isWineOrderCompany` on Company; `WineOrder.companyId` FK; Companies admin Bookings/Wine Orders tab toggle; module checkboxes in edit slide-over; `findCompanyByCode` filters by module; `submitWineOrder` saves companyId; public pages filter by module. Wine Test Company created (Q8VBA6QY). All E2E tests passed. 10 files changed + `prisma db push`.

---

## 2026-07-01 — Features #111, #112, #113, #114 (compressed)

#111 Bug fix: wine orders profile auto-fill — removed "Remember device" checkbox; profile saved to localStorage on code success, restored on `hasValidAuth()`. #112 Guest price label — person silhouette SVG + "X ან მეტი სტუმარი" on home page package cards. #113+#114 Hide company dropdown + New Company request — `hide_company_dropdown` setting (Booking section, default OFF); when ON both forms show code input + "New Company?" popup; popup sends Resend email to winery; "Request received!" confirmation. 11 files changed.

---

## 2026-07-01 — Platform logo, login page fix, dev/prod brainstorm (full detail)

### Completed

**Security fixes #5–7 — verified already resolved**
- #5 (`hasDbValue` false-negative on empty string): `children != null` check already correct
- #6 (missing `revalidatePath` in `saveContent`/`deleteContent`): both already call `revalidatePath('/', 'layout')`
- #7 (EditableText `<div>` wrapper on inline elements): already uses `inlineTags` set to pick `span` vs `div`

**Neutral fallback defaults — verified already resolved**
- All rendering components (SiteNav, admin layout, InvoicePrint, WineCatalogueClient, email templates) already cleaned of NM-specific hardcoded strings
- Only remaining NM references are: form placeholder text in super-admin UI ("e.g. Nikalas Marani"), comments in email files about Resend domain verification, and seed scripts — all appropriate

**Platform logo system (Feature #109)**
- `PlatformConfig` DB model added to Prisma (singleton, `id = 'platform'`); `prisma db push` done
- Proxy fetches platform config in parallel with tenant resolution; forwards `x-platform-logo` + `x-platform-logo-alt` headers (5-min TTL cache)
- `/admin/login` now reads `x-platform-logo` — no NM logo fallback; renders no image at all when header is absent (neutral "Admin Panel" text only)
- `app/actions/platform.ts` NEW: `getPlatformConfig`, `uploadPlatformLogo`, `savePlatformLogoAlt`, `removePlatformLogo` server actions
- `/super-admin/settings` NEW page + nav link: upload/replace/remove platform logo, set alt text, previewed on cream background

**Admin login page layout fix**
- Root cause: Next.js App Router always nests child layouts inside parent ones — the old `login/layout.tsx` pass-through had no effect; admin nav always rendered around the login form
- Fix: all admin pages moved into `app/admin/(panel)/` route group; `(panel)/layout.tsx` has the nav; root `app/admin/layout.tsx` is a pass-through; `login/` stays outside the group
- URLs unchanged (`/admin/orders`, `/admin/login`, etc. — route group name invisible to router)
- TypeScript: 0 errors

**Dev/prod environments brainstorm**
- Options documented in `MyToDo.md`: Option A (separate Supabase dev project), Option B (Vercel preview deployments + staging DB), Option C (local-only, not recommended)
- Recommendation: A + B together; ~30 min setup; free on both platforms

### Key files changed
- `saas/prisma/schema.prisma` — PlatformConfig model added
- `saas/proxy.ts` — `resolvePlatform()` + `x-platform-logo` header forwarding
- `saas/app/admin/login/page.tsx` — uses `x-platform-logo`, no fallback
- `saas/app/admin/layout.tsx` — now a pass-through (nav layout moved to `(panel)`)
- `saas/app/admin/(panel)/layout.tsx` — NEW: nav layout (moved from root admin layout)
- `saas/app/admin/(panel)/` — all 9 admin page directories moved here
- `saas/app/admin/login/layout.tsx` — DELETED (no longer needed)
- `saas/app/actions/platform.ts` — NEW: platform config server actions
- `saas/app/super-admin/settings/page.tsx` — NEW
- `saas/app/super-admin/settings/PlatformSettingsClient.tsx` — NEW
- `saas/app/super-admin/layout.tsx` — Settings nav link added
- `vault/MyToDo.md` — security fixes + neutral fallbacks marked done; dev/prod + data migration items added with full brainstorm

### What's still needed (user testing)
1. Deploy to Vercel → go to `/admin/login` → verify no logo shows (neutral "Admin Panel" text only)
2. Go to `/super-admin/settings` → upload a logo → verify preview appears → check `/admin/login` after cache clears (≤5 min)

---

## 2026-06-27 — Wine Orders overhaul: table view, packing mode, inline status confirm (full detail)

### Completed

**Mode toggle — Cards | Table | 📦 Pack**
- All three modes added to `WineOrdersClient.tsx` via a `Mode` state
- Page widened from `max-w-3xl` to `max-w-5xl` to accommodate table + split packing layout

**Shared filter bar (all modes)**
- Status pills (All / Pending / Confirmed / Paid / Delivered / Cancelled)
- Company name search (text input, case-insensitive)
- Date range: From → To (native `<input type="date">`)
- "Clear" button appears when search/date filters are active
- Same filter state applies to cards, table, and packing mode

**Table view**
- Compact table: Company (name + wine tags), Amount, Date, Status (stepper)
- Same `VerticalStepper` used in cards — inline confirm works here too
- Color-coded left border per status; inactive orders (delivered/cancelled) faded

**Pack mode — `PackingView.tsx` (new file)**
- On entering Pack mode: auto-selects all confirmed+paid orders (pre-checked)
- Packing table: checkbox per row, Company/Wines, Bottles count, Status pill, Date
- Click anywhere on a row to toggle check; header checkbox toggles all visible (with indeterminate state)
- Filters apply to what's visible — selection is independent (checked orders drive the summary)

**Packing summary — 3 layouts (A/B/C toggle)**
- **A — Right panel**: table 60% left, sticky 300px summary panel on right; scrollable
- **B — Sticky bottom bar** (default): bar pinned to bottom shows live counts; click to expand full summary sheet up to 60vh
- **C — Top collapsible**: banner above table with counts; click ▼ to expand full summary; layout toggle embedded in header

**Summary content (shared across A/B/C)**
- Box size input (default 6, manual override, min 1)
- Total Wines section: each wine × quantity, then "X bottles → Y full boxes + 1 partial (Z)"
- By Company section: per-order wine breakdown + bottle count + box calc + contact name/phone
- Print button → opens new window with formatted packing sheet, auto-triggers print, closes

**Print sheet**
- Monospace `Courier New` layout
- Header: date, box size, order count
- TOTAL WINES section with wine breakdown + total boxes
- BY COMPANY section: per-company wines, bottles, boxes, contact — `page-break-inside: avoid`

**Inline status confirmation**
- Clicking any step on `VerticalStepper` no longer fires immediately
- Sets `pendingChange` state → small "→ Confirmed? ✓ ✗" row appears below the stepper
- ✓ confirms and fires `updateWineOrderStatus`; ✗ cancels; auto-dismisses after 5 seconds
- Works in all modes (cards, table); only one pending change at a time across all orders

**TypeScript**: 0 errors

### Key files changed
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — full rewrite
- `saas/app/admin/wine-orders/PackingView.tsx` — NEW: summary layouts A/B/C + print
- `saas/app/admin/wine-orders/page.tsx` — `max-w-3xl` → `max-w-5xl`

### What's still needed (user testing)
1. Switch to Table view → filter by status + search → verify rows filter correctly
2. Switch to Pack mode → verify confirmed+paid orders pre-checked → uncheck one → verify summary updates
3. Change box size from 6 to 12 → verify box counts recalculate
4. Click Print → verify packing sheet opens and prints correctly
5. Click a stepper step → verify "→ X?" confirm row appears → confirm → verify status changes → verify auto-dismiss after 5s
6. Test layout A (split panel) and C (top collapsible) — switch between them in Pack mode

---

## 2026-06-26 (Part 2) — Hardcoding fixes, Contact Info settings, Settings UX overhaul (full detail)

## 2026-06-26 (Part 2) — Hardcoding fixes, Contact Info settings, Settings UX overhaul (full detail)

### Completed

**Hardcoded branding fixes (wines page + invoice)**
- `saas/app/(site)/wines/page.tsx` — replaced static `export const metadata` with `export async function generateMetadata()` reading `x-tenant-name` header; reads logo headers and passes to WineCatalogueClient
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — added `logoUrl`/`logoAlt` props; replaced hardcoded `<img>` in wine page heading with props
- `saas/app/admin/orders/InvoicePrint.tsx` — added `displayName` prop (default `'Nikalas Marani'`), replaced all 3 hardcoded name strings
- `saas/app/admin/orders/page.tsx` — reads `x-tenant-name` header, passes `displayName` to OrdersTable
- `saas/app/admin/orders/OrdersTable.tsx` — accepts `displayName` prop, passes to both InvoicePrint instances
- `saas/app/admin/orders/[id]/page.tsx` — reads `x-tenant-name` header, passes to OrderDetail
- `saas/app/admin/orders/[id]/OrderDetail.tsx` — accepts `displayName` prop, passes to InvoicePrint

**Contact Info settings section — NEW**
- `saas/app/admin/settings/SettingsClient.tsx` — collapsible "Contact Info" section (chevron toggle) with 5 fields: email, phone, address, Facebook URL, Instagram URL; saves via `updateSetting` on return-arrow click
- `saas/app/admin/settings/page.tsx` — loads all 5 contact settings via `getSetting`, passes as props
- `saas/app/(site)/layout.tsx` — reads 5 contact settings, passes to SiteNav + uses in footer (fallback to NM defaults if empty)
- `saas/app/(site)/SiteNav.tsx` — `SocialIcons` now accepts props; phone/email/Facebook/Instagram all dynamic from settings
- `saas/scripts/seed-contact.ts` — NEW: seeds NM contact values into Setting table; run: `npx tsx scripts/seed-contact.ts` ✅ already run

**Settings page UX — inline edit/save pattern**
Applied consistent read-only display → pencil edit → return arrow save → "Saved" hint text pattern to:
- Payment Details (5 rows: recipient name, personal ID, bank name, bank code, IBAN)
- Branding alt text field
- Booking Rules (Wine Tasting minimum, Tasting + Lunch minimum)
- Contact Info (5 fields — same pattern, introduced here)

Pattern details:
- Default: shows current value as styled display div (or faded italic placeholder if empty)
- Red pencil icon (right) → enter edit mode; red return arrow (↵) → save and exit
- No blur auto-save — must click the arrow
- "Saved" replaces hint text for 2 seconds on success; Escape cancels without saving

**TypeScript**: 0 errors throughout

### Key files changed
- `saas/app/(site)/wines/page.tsx` — generateMetadata + logo prop
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — logoUrl/logoAlt props
- `saas/app/admin/orders/InvoicePrint.tsx` — displayName prop
- `saas/app/admin/orders/page.tsx` + `OrdersTable.tsx` — displayName chain
- `saas/app/admin/orders/[id]/page.tsx` + `OrderDetail.tsx` — displayName chain
- `saas/app/(site)/layout.tsx` — contact settings + footer dynamic
- `saas/app/(site)/SiteNav.tsx` — SocialIcons accepts props
- `saas/app/admin/settings/SettingsClient.tsx` — Contact Info section + edit/save UX across 3 sections
- `saas/app/admin/settings/page.tsx` — 5 new getSetting calls
- `saas/scripts/seed-contact.ts` — NEW: seeds NM contact info

---

## 2026-06-26 — Dynamic branding (logo, favicon, display name) (full detail)

### Completed

**`saas/prisma/schema.prisma`**
- Added `logoUrl String?`, `logoAlt String?`, `faviconUrl String?`, `displayName String?` to `Tenant` model
- `prisma db push` done — all 4 columns live in DB

**`saas/proxy.ts`**
- Extended `TenantInfo` with the 4 new fields
- Switched from process-lifetime cache to **5-minute TTL** (`cachedAt` timestamp per entry)
- Forwards new headers: `x-tenant-logo`, `x-tenant-logo-alt`, `x-tenant-favicon`, `x-tenant-name`

**`saas/app/layout.tsx`**
- Replaced static `metadata` export with `generateMetadata()` — reads `x-tenant-name` header for dynamic `<title>` and description
- Renders `<link rel="icon">` from `x-tenant-favicon` header when set

**`saas/app/(site)/layout.tsx` + `SiteNav.tsx`**
- Layout reads `x-tenant-logo` / `x-tenant-logo-alt` headers, passes to SiteNav as props
- SiteNav renders dynamic logo with fallback to `/icons/logo-dark.svg`

**`saas/app/(site)/page.tsx`**
- Removed `next/image` `<Image>` for logo (SVG, not LCP element, doesn't need optimization)
- Reads logo from header, renders plain `<img>` — simpler and consistent with other placements

**`saas/app/admin/layout.tsx` + `admin/login/page.tsx`**
- Both read `x-tenant-logo` / `x-tenant-logo-alt` headers
- Dynamic logo in admin nav top-left and login page

**`saas/app/actions/superAdmin.ts`**
- `getTenant`, `createTenant`, `updateTenant` extended with `logoUrl`, `logoAlt`, `faviconUrl`, `displayName`

**`saas/app/actions/uploadLogo.ts` — NEW**
- `uploadTenantLogo(formData)` — client admin uploads their own logo
- `uploadTenantFavicon(formData)` — client admin uploads their own favicon
- `uploadTenantLogoAdmin(tenantId, formData)` — super-admin uploads for any tenant
- `uploadTenantFaviconAdmin(tenantId, formData)` — super-admin uploads favicon for any tenant
- `saveTenantLogo(url, alt)` / `saveTenantFavicon(url)` — save URLs to DB, revalidate layout
- All upload to Supabase Storage `logos` bucket; accepts SVG/PNG/JPG/ICO/WebP

**`saas/app/super-admin/tenants/TenantFormClient.tsx`**
- Added Display Name field
- Logo upload: file picker → immediate upload → preview; shows existing logo; Remove button
- Favicon upload: same pattern; shows 32px preview
- Note on upload buttons: disabled until tenant is saved (need ID for storage path)
- Logo alt text field appears when logo is set

**`saas/app/admin/settings/SettingsClient.tsx` + `page.tsx`**
- New **Branding** section above Closed Days
- Logo upload: upload → saves immediately to DB (no separate save button)
- Alt text field: saves on blur
- Favicon upload: same immediate-save pattern

**`saas/next.config.ts`**
- Added Supabase Storage domain to `images.remotePatterns` (for any future `<Image>` usage with remote logos)

**`saas/prisma.config.ts`** (bug fix)
- Added `directUrl: env("DIRECT_URL")` — prisma.config.ts was overriding schema.prisma and ignoring DIRECT_URL, causing `db push` to timeout against PgBouncer port 6543. Now correctly uses port 5432 for migrations.

**`saas/scripts/seed-branding.ts` — NEW**
- Sets `displayName: 'Nikalas Marani'`, `logoUrl: '/icons/logo-dark.svg'`, `logoAlt: 'Nikalas Marani'` on the nikalasmarani.ge tenant
- Run: `npx tsx scripts/seed-branding.ts`

**TypeScript**: 0 errors

### What's still needed (user testing)
1. Go to `/super-admin/tenants` → edit Nikalas Marani → verify Display Name, Logo, Favicon fields appear
2. Run `npx tsx scripts/seed-branding.ts` from saas/ to seed Nikalas Marani's branding in DB
3. For a new client: upload a different logo → verify the public site and admin nav update (within 5 min cache TTL)
4. Upload a favicon → verify browser tab icon updates

### Key files changed
- `saas/prisma/schema.prisma` — 4 new Tenant fields
- `saas/prisma.config.ts` — directUrl fix (critical bug: db push was timing out)
- `saas/proxy.ts` — TTL cache + new branding headers
- `saas/next.config.ts` — Supabase Storage remotePatterns
- `saas/app/layout.tsx` — generateMetadata + favicon link
- `saas/app/(site)/layout.tsx` — logo headers → SiteNav
- `saas/app/(site)/SiteNav.tsx` — dynamic logo prop
- `saas/app/(site)/page.tsx` — plain img for hero logo, read from header
- `saas/app/admin/layout.tsx` — dynamic logo
- `saas/app/admin/login/page.tsx` — dynamic logo (now async)
- `saas/app/actions/superAdmin.ts` — branding fields in CRUD
- `saas/app/actions/uploadLogo.ts` — NEW: upload actions
- `saas/app/super-admin/tenants/TenantFormClient.tsx` — logo/favicon/displayName UI
- `saas/app/admin/settings/SettingsClient.tsx` — Branding section
- `saas/app/admin/settings/page.tsx` — passes logo headers as props
- `saas/scripts/seed-branding.ts` — NEW: seed Nikalas Marani branding

### Next up
- Run `npx tsx scripts/seed-branding.ts` (seeds Nikalas Marani logo URL in DB so tenant row is authoritative)
- **Update Vercel `DATABASE_URL`** — still needs port 6543 + `?pgbouncer=true` (local .env already correct)
- User test super-admin panel (7 steps from previous session still outstanding)

---

## 2026-06-26 — Super-admin panel (full detail)

### Completed

**New route: `/super-admin`** — separate from tenant admin, accessible only to `super_admin` users.

**Proxy guard (`saas/proxy.ts`)**
- Added `/super-admin` route check: unauthenticated → redirect to `/admin/login`; authenticated but not `super_admin` → redirect to `/admin`
- Refactored `isSuperAdmin` to be computed once at the top of the guard block

**`saas/lib/requireSuperAdmin.ts` — NEW**
- Checks Supabase session + `app_metadata.role === 'super_admin'`; throws if not satisfied

**`saas/app/actions/superAdmin.ts` — NEW**
- Tenant CRUD: `getTenants`, `getTenant`, `createTenant`, `updateTenant`, `deleteTenant`
  - `deleteTenant` blocks deletion if tenant has any orders or companies (FK safety)
  - All theme data serialized from `tenant.theme` Json column
- User management (Supabase Admin REST API, same pattern as `set-admin-metadata.ts`):
  - `listAdminUsers` — fetches all Supabase users with `no-store` cache
  - `setUserTenant(userId, tenantId)` — assigns tenant admin role
  - `setUserSuperAdmin(userId)` — grants super_admin
  - `removeUserAdminRole(userId)` — clears app_metadata; guards against self-demotion
  - `createAdminUser(email, password, mode, tenantId?)` — creates Supabase user + sets metadata in one call

**`saas/app/super-admin/ColorPicker.tsx` — NEW**
- `react-colorful` `HexColorPicker` (proper color wheel + saturation area) in a click-to-open popover
- Hex text input with `#` prefix for manual entry
- Color preview strip at bottom of popover
- Closes on outside click

**Layout + pages:**
- `layout.tsx` — dark theme (`#0b1120` bg, `#111827` nav); gradient indigo logo mark; "PLATFORM" badge; Tenants / Users nav; "← Tenant Admin" back link; super_admin check (redirects to `/admin` if not authorized)
- `page.tsx` — redirects to `/super-admin/tenants`
- `tenants/page.tsx` — server component; fetches all tenants with stats
- `tenants/TenantsClient.tsx` — card-per-tenant list; color swatch with glow; order/company count; edit link; delete (only shown when 0 data); inline confirm dialog
- `tenants/TenantFormClient.tsx` (shared by new + [id]) — name, domain, slug (auto-fills from name while untouched); two ColorPicker instances (primary + hover); live brand preview panel (mock nav strip in brand color, mock buttons, accent text); save/cancel; success toast
- `tenants/new/page.tsx` — breadcrumb + TenantFormClient in "new" mode
- `tenants/[id]/page.tsx` — fetches tenant by ID, passes to TenantFormClient in "edit" mode
- `users/page.tsx` — server component; fetches all Supabase users + all tenants + current user ID
- `users/UsersClient.tsx` — user row per account; avatar initial; role badge (super_admin indigo / tenant name green / no access gray); "Change role" inline form (tenant dropdown or super_admin option); "Remove access" (hidden for self); "New Admin User" form (email, password, access level selector, tenant dropdown)

**`saas/app/admin/layout.tsx`**
- Added "⬡ Platform" indigo link in top-right nav, visible only when `user.app_metadata.role === 'super_admin'`

**TypeScript**: 0 errors

### What's still needed (user testing)
1. Log in → verify "⬡ Platform" link appears in admin nav top-right
2. Click "⬡ Platform" → verify dark super-admin layout loads with Tenants and Users nav
3. Tenants page → verify Nikalas Marani row shows with brand color swatch + order/company counts
4. Click Edit on Nikalas Marani → verify form pre-fills; open color picker → verify color wheel + hex input work; pick a new color → verify live preview updates
5. Save → verify changes persist (reload the edit page)
6. Users page → verify all Supabase accounts listed; verify your account shows "super_admin" badge
7. Create a new admin user for a test tenant → verify user appears in Supabase auth dashboard

### Key files changed
- `saas/proxy.ts` — super-admin route guard
- `saas/lib/requireSuperAdmin.ts` — NEW
- `saas/app/actions/superAdmin.ts` — NEW
- `saas/app/admin/layout.tsx` — Platform link
- `saas/app/super-admin/layout.tsx` — NEW
- `saas/app/super-admin/page.tsx` — NEW (redirect)
- `saas/app/super-admin/ColorPicker.tsx` — NEW
- `saas/app/super-admin/tenants/page.tsx` — NEW
- `saas/app/super-admin/tenants/TenantsClient.tsx` — NEW
- `saas/app/super-admin/tenants/TenantFormClient.tsx` — NEW
- `saas/app/super-admin/tenants/new/page.tsx` — NEW
- `saas/app/super-admin/tenants/[id]/page.tsx` — NEW
- `saas/app/super-admin/users/page.tsx` — NEW
- `saas/app/super-admin/users/UsersClient.tsx` — NEW

### Next up
- User test the super-admin panel (7 steps in "What's still needed" above) — currently blocked on login verification
- **Dynamic branding sprint** — make logo, favicon, and admin display name per-tenant (see Roadmap v3 "Dynamic branding" section for full task list). This is the next thing to build before onboarding a second client. Architecture: same pattern as brand colors — add fields to Tenant table, read in proxy, forward as headers, render in layout. Upload UI goes in both super-admin Edit Tenant form and client's own /admin/settings.

---

## 2026-06-26 — Bug #4: PgBouncer transaction mode (full detail)

### Completed

**Problem solved**: `DATABASE_URL` used port 5432 (PgBouncer session mode). Each `PrismaClient` holds a connection open for its lifetime; Supabase caps session mode at 15 connections. Under Vercel serverless (cold starts) or dev hot reloads, the pool fills up and returns `EMAXCONNSESSION`. `proxy.ts` also created a second `new PrismaClient()` at module level, burning two connections per hot reload instead of one.

**`saas/.env`**
- `DATABASE_URL` switched from port 5432 → port 6543 (`?pgbouncer=true`)
- `DIRECT_URL` stays on port 5432 (used only by `prisma db push` / migrations)

**`saas/proxy.ts`**
- Removed `import { PrismaClient } from '@prisma/client'` and `const db = new PrismaClient()`
- Now imports shared singleton: `import { db } from '@/lib/db'`
- Eliminates the second connection that bypassed the singleton guard

### Key design decisions
- Transaction mode returns connections to the pool immediately after each query — 15 physical connections can serve hundreds of concurrent requests
- `?pgbouncer=true` tells Prisma to disable prepared statements, which don't work in transaction mode
- `SET LOCAL ROLE` and `set_config(..., true)` (needed for Bug #5 / RLS) are transaction-scoped and revert at `COMMIT` — fully compatible with transaction mode

### What's still needed (user action required)
1. **Update Vercel environment variable** — go to Vercel → Project Settings → Environment Variables → update `DATABASE_URL` to the port 6543 URL with `?pgbouncer=true`. The local `.env` is already updated; Vercel still has the old value.
2. After deploying, run `npx prisma db push` from `saas/` to confirm the `DIRECT_URL` path still works

### Key files changed
- `saas/.env` — `DATABASE_URL` → port 6543 + `?pgbouncer=true`
- `saas/proxy.ts` — removed rogue `new PrismaClient()`, uses shared singleton

### Next up
- ~~Bug #5~~ — also resolved this session (see below)

---

## 2026-06-26 — Bug #5: withTenantDb fully implemented (RLS now enforced)

### Completed

**Problem solved**: `withTenantDb` in `lib/db.ts` was a stub — it never opened a transaction or called `SET LOCAL ROLE`. The app connected as `postgres` (Supabase superuser), which bypasses RLS by design. The RLS policies were deployed but dormant.

**`saas/lib/db.ts`**
- Replaced stub body with full implementation:
  - Opens a Prisma `$transaction` (15s timeout)
  - Calls `set_config('app.tenant_id', tenantId, true)` — sets the session variable RLS policies read
  - Calls `SET LOCAL ROLE app_user` — voluntarily downgrades to non-superuser so Postgres enforces RLS
  - `LOCAL` on both means they revert at `COMMIT` — no leakage between requests

**Verified with `check-rls.ts`**: all 12 tenant tables have `tenant_isolation` policies; RLS ON on all of them. `Tenant` table is 🔴 (correct — no tenantId, no RLS needed).

**TypeScript**: 0 errors

### What changed
- Tenant isolation is now enforced at two independent layers:
  1. Query-level `where: { tenantId }` in every server action (unchanged)
  2. DB-level RLS via `app_user` role + `tenant_isolation` policy (now active)
- A query that accidentally omits `tenantId` filter will now return 0 rows instead of cross-tenant data

### Key files changed
- `saas/lib/db.ts` — `withTenantDb` stub replaced with real `$transaction` + role/config setup

### Next up
- All 5 known bugs are now resolved (bugs #1–#5)
- Ready to move to next roadmap item

---

## 2026-06-25 — Theming: per-tenant CSS brand color (full detail)

### Completed

**Problem solved**: `#7c1d23` (wine-red) was hardcoded in 32 files (56 occurrences). New tenants couldn't have a different brand color.

**Solution**: Single CSS variable `--color-brand` injected server-side per tenant with zero flash.

**`saas/prisma/schema.prisma`**
- Added `theme Json?` to `Tenant` model; `prisma db push` done

**`saas/app/globals.css`**
- Added `:root { --color-brand: #7c1d23; --color-brand-hover: #9b2429; }` as defaults
- `.btn-wine` updated to use `var(--color-brand)` / `var(--color-brand-hover)`

**`saas/proxy.ts`**
- Cache expanded from `Map<string, string>` to `Map<string, TenantInfo>` (tenantId + brandColor + brandHover)
- Reads `theme` JSON from tenant row on first request per domain, then caches for process lifetime
- Forwards brand colors as `x-tenant-brand` / `x-tenant-brand-hover` request headers

**`saas/app/layout.tsx`**
- Now async; reads `x-tenant-brand` / `x-tenant-brand-hover` from headers
- Injects `<style>:root { --color-brand: X; --color-brand-hover: Y; }</style>` into `<head>` server-side — no flash

**All 32 UI files updated (replace_all)**
- Every `'#7c1d23'` → `'var(--color-brand)'` across components, admin pages, public site pages
- Email templates (`invoiceEmail.ts`, `bookingConfirmation.ts`) intentionally left as hex — email clients don't support CSS vars
- `WinesClient.tsx` BLANK.color kept as `'#7c1d23'` (wine bottle dot data, not theme)

**`saas/scripts/seed-theme.ts` — NEW**
- Sets `{ primaryColor: '#7c1d23', primaryHover: '#9b2429' }` on nikalasmarani.ge tenant
- Run: `npx tsx scripts/seed-theme.ts` (from saas/ folder — not yet run due to classifier outage)

### Key design decisions
- Colors forwarded as headers from proxy (already has cached DB access) rather than a second DB hit in layout
- CSS variable injection happens in `<head>` before any styles load — no color flash for non-default tenants
- Fallback chain: tenant theme JSON → header fallback (`#7c1d23`) → CSS `:root` default — three layers of safety
- Adding a new client with different branding: just set `theme` JSON on their tenant row in DB

### Key files changed
- `saas/prisma/schema.prisma` — `theme Json?` on Tenant
- `saas/app/globals.css` — CSS variable definitions + `.btn-wine` updated
- `saas/proxy.ts` — TenantInfo cache, theme header forwarding
- `saas/app/layout.tsx` — async, reads headers, injects style tag
- 32 UI files — replace_all `#7c1d23` → `var(--color-brand)`
- `saas/scripts/seed-theme.ts` — NEW: theme seed for nikalasmarani.ge

### Next up (user)
1. Run `npx tsx scripts/seed-theme.ts` from saas/ folder (sets theme on nikalas marani tenant)
2. To give a future client a different color: update their tenant row's `theme` field in DB or via the upcoming super-admin UI
3. **Todo**: `/super-admin` page — list tenants, color picker UI, edit theme JSON

---

## 2026-06-25 — Phase 6: Per-tenant admin auth (full detail)

### Completed

**Problem solved**: Admin auth only checked "is someone logged in?" — no tenant verification. Any logged-in user could access any tenant's admin.

**Solution**: `app_metadata` on Supabase users now determines access. Two roles:
- `role: 'super_admin'` — bypasses tenant check, can access all tenants (Max's account)
- `tenantId: '<id>'` — must match the current domain's tenant

**`saas/lib/requireAdmin.ts`**
- Now reads `x-tenant-id` from request headers (set by middleware from the domain)
- If `user.app_metadata.role === 'super_admin'` → passes immediately
- Else checks `user.app_metadata.tenantId === currentTenantId` → throws Unauthorized if mismatch

**`saas/proxy.ts`**
- Same tenant check enforced at the edge before requests reach the app
- Wrong-tenant users redirected to `/admin/login`
- Login page redirect also tenant-aware (won't auto-redirect to `/admin` if user belongs to a different tenant)

**`saas/scripts/set-admin-metadata.ts` — NEW**
- Uses Supabase REST API directly (no SDK — avoids Node 20 WebSocket issue)
- `npm run set-admin -- --email <email> --super` → grants super_admin
- `npm run set-admin -- --email <email> --tenantId <id>` → locks to a tenant

**`saas/package.json`**
- Added `"set-admin": "tsx scripts/set-admin-metadata.ts"` script

**Users configured:**
- `max.mghvdliashvili@gmail.com` → `super_admin` (all tenants)
- `nikalasmarani@email.ge` → `tenantId: cmqou94er0000vl1sl9v0yv54` (Nikalas Marani only)

**TypeScript**: 0 errors

### Key design decisions
- `super_admin` flag is a clean hook for Max's future management UI — any "list all tenants / impersonate" feature just checks that same flag
- Script uses raw fetch against Supabase REST API rather than the JS SDK to avoid the Node 20 WebSocket dependency issue
- Both proxy.ts and requireAdmin.ts enforce the check — edge blocks page loads, requireAdmin blocks direct server action POSTs

### Key files changed
- `saas/lib/requireAdmin.ts` — tenant check + super_admin bypass
- `saas/proxy.ts` — tenant check at edge + tenant-aware login redirect
- `saas/scripts/set-admin-metadata.ts` — NEW: user provisioning script
- `saas/package.json` — set-admin script added

### Next up (user testing)
1. Log in with `max.mghvdliashvili@gmail.com` → should access `/admin` normally
2. Log in with `nikalasmarani@email.ge` → should work on nikalasmarani.ge, blocked on other domains
3. When adding a new client: `npm run set-admin -- --email client@domain.ge --tenantId <id>`

---

## 2026-06-25 — Individual pricing management (full detail)

### Completed

**Problem solved**: Individual booking prices were hardcoded at 50₾/100₾ — no admin UI to change them, no way to set volume discounts for walk-in groups.

**Solution**: Individuals treated as a special pinned "company" with full price tier management, identical to tour operators.

**`saas/prisma/schema.prisma`**
- Added `isIndividual Boolean @default(false)` to Company model
- Added `isDisplayPrice Boolean @default(false)` to Price model
- `prisma db push` — both columns live in DB

**`saas/app/actions/companies.ts` — `ensureIndividualsCompany`**
- New exported helper; finds or creates the Individuals pseudo-company for a given tenant
- Called from companies page on every load — idempotent, safe to call repeatedly

**`saas/app/actions/prices.ts` — `setDisplayPrice`**
- New server action; atomically unsets all `isDisplayPrice` flags for a company then sets the given price
- Guards: requires admin, verifies the price belongs to an Individuals company of the current tenant
- Revalidates `/` (home page) and `/admin/companies`

**`saas/app/admin/companies/page.tsx`**
- Calls `ensureIndividualsCompany` on load (creates Individuals row if missing)
- Passes `isIndividual` flag through to client; count shows "X tour operators" (excludes Individuals)

**`saas/app/admin/companies/CompaniesClient.tsx` — full rewrite**
- `isIndividual` + `isDisplayPrice` added to Company/Price types
- Individuals row pinned above the tour operators list; amber/gold border + `#fffbeb` background
- Individuals row header shows currently displayed prices or "50₾ / 100₾ defaults" if none selected
- No edit/delete buttons on Individuals row
- Price tiers on Individuals row show a **★ Show on site** amber button — clicking it calls `setDisplayPrice`; active tier shows "★ Shown on site" with amber styling; only one active at a time
- Shared `PriceTiersSection` component used by both Individuals and tour operator rows (previously inlined)
- Hint text under tiers explains the 50/100₾ fallback behavior

**`saas/app/(site)/page.tsx`**
- Renamed `companies` → `allCompanies`; post-fetch: filters to `companies` (non-individual) + extracts `individualsRow`
- `displayTier = individualsRow?.prices.find(p => p.isDisplayPrice)`
- `displayPriceTasting` and `displayPriceLunch` replace hardcoded 50/100 in package cards
- Company selector for booking form receives `companies` (Individuals excluded)

**`saas/app/actions/createBooking.ts`**
- Fetches Individuals company + tiers at booking time
- Uses `findTier(individualsCompany.prices, guestCount)` to resolve the correct rate
- Falls back to 50/100₾ if no Individuals company or no matching tier

**`saas/app/(site)/wines/page.tsx`**
- Added `isIndividual: false` to company `findMany` — Individuals row excluded from wine order form selector

**TypeScript**: 0 errors

### Key design decisions
- Individuals is a real DB row (not a virtual construct) — same Price table, same tier logic, zero special-casing in pricing engine
- `ensureIndividualsCompany` is idempotent — safe to call on every page load; cheap SELECT, CREATE only on first access
- `isDisplayPrice` is per-company (not global) so future tenants can have their own display tiers
- `setDisplayPrice` uses a `$transaction` to avoid a window where no tier is marked as display

### Key files changed
- `saas/prisma/schema.prisma` — isIndividual + isDisplayPrice fields
- `saas/app/actions/companies.ts` — ensureIndividualsCompany added
- `saas/app/actions/prices.ts` — setDisplayPrice added; getTenantId imported
- `saas/app/admin/companies/page.tsx` — ensureIndividualsCompany call + isIndividual prop
- `saas/app/admin/companies/CompaniesClient.tsx` — full rewrite: Individuals row pinned, display-price radio, PriceTiersSection extracted
- `saas/app/(site)/page.tsx` — display price fetch + Individuals filter
- `saas/app/actions/createBooking.ts` — Individuals tiers for individual pricing
- `saas/app/(site)/wines/page.tsx` — isIndividual: false filter

### Next up (user testing)
1. Go to `/admin/companies` → verify Individuals row is pinned at top with amber styling
2. Expand Individuals → add a tier (e.g. 1–20 guests, 45₾/85₾) → click ★ Show on site → check home page shows updated prices
3. Add another tier → click ★ Show on site on it → verify previous tier's star clears
4. Check booking form still works for individual bookings with the new tier pricing

---

## 2026-06-22 — Visual mode: iframe-based live site editor (full detail)

### Completed

**Problem solved**: Visual mode was a hardcoded replica of the site (VisualNav, VisualHome, VisualAbout, VisualContact, VisualFormPreview) — it drifted from the real site every time the UI changed.

**Solution**: Visual mode now renders the actual live site page in an `<iframe>` with `?editMode=true&locale={locale}`. The iframe loads the real page server-side, so it's always in sync.

**`saas/components/EditModeSuppressor.tsx` — NEW client component**
- Runs inside the iframe; intercepts all `<a>` click events (capture phase, `preventDefault` only) to prevent navigation away
- Also intercepts `<form>` submit events to prevent form submission
- Hash anchors (e.g. `#book`) are allowed through so page-internal scroll still works
- Only rendered when `isEditMode && isAdmin` — non-admin visitors with `?editMode=true` in URL are unaffected

**`saas/app/admin/content/ContentClient.tsx` — Visual mode rewrite**
- Deleted VisualNav, VisualFormPreview, VisualHome, VisualAbout, VisualContact (330 lines removed)
- Visual mode now renders: `<iframe src="/{section}?editMode=true&locale={locale}" style={{ height: 800px }} />`
- Section tabs map to: home → `/`, about → `/about`, contact → `/contact`
- `key={mode+'-'+locale+'-'+section}` on outer div forces iframe reload when section/locale changes
- Locale switcher and section tabs still work — they change the iframe URL

**`saas/app/(site)/page.tsx` — Edit mode support**
- New `searchParams: Promise<{ editMode?: string; locale?: string }>` prop (Next.js 15 async pattern)
- When `editMode=true`: awaits `getSiteContext()` to check admin; overrides locale from searchParams
- Defines local `ET()` helper function (closure over `isAdmin`, `locale`, `c`) — conditionally renders `EditableText` or plain tag
- Wraps editable content: hero eyebrow, hero subtitle, book/order buttons in hero, package titles/descs, booking heading/intro
- Hero eyebrow and subtitle: conditional JSX (EditableText when admin, original styled span when not)
- Button text inside `<a>` tags: EditableText rendered inline with `as="span"`
- `<EditModeSuppressor />` rendered when `isEditMode && isAdmin`

**`saas/app/(site)/about/page.tsx` — Edit mode support**
- Same pattern: searchParams, isEditMode, locale override, isAdmin check
- ET helper wraps: about_eyebrow, about_heading (hero), 3 story paragraphs, expect heading, 6 expect card fields, cta_text, cta_btn
- Hero eyebrow/heading rendered via ET inside the backdrop-blur frosted card

**`saas/app/(site)/contact/page.tsx` — Edit mode support**
- Same pattern
- ET helper wraps: contact_eyebrow, contact_heading (hero), 4×3 contact card fields (12 total), find_us heading, map_directions, book_cta, book_btn

**TypeScript**: 0 errors

### Key design decisions
- `ET()` is a plain function (not a JSX component) defined inside each async page function — closures over `isAdmin`, `locale`, `c`; returns EditableText or a plain HTML tag
- Navigation suppressor uses capture phase (`addEventListener('click', ..., true)`) so it fires before any child handlers; does NOT call `stopPropagation()` so EditableText's own `onClick` still fires
- Form fields inside `<BookingForm>` are not wrapped with EditableText (too complex, still fully editable via Text mode)
- `saveContent` server action already has `requireAdmin()` guard — EditableText in the iframe is safe even without extra checks

### Key files changed
- `saas/components/EditModeSuppressor.tsx` — NEW
- `saas/app/admin/content/ContentClient.tsx` — Visual* components deleted, iframe added
- `saas/app/(site)/page.tsx` — editMode support, ET helper, EditModeSuppressor
- `saas/app/(site)/about/page.tsx` — editMode support, ET helper, EditModeSuppressor
- `saas/app/(site)/contact/page.tsx` — editMode support, ET helper, EditModeSuppressor

### Next up (user testing)
1. Go to `/admin/content` → switch to Visual mode → verify the iframe shows the real site (real hero images, real nav, real content)
2. Hover over a text element (e.g. package title) → verify pencil badge appears → click → edit text → Save
3. Switch locale EN ↔ KA → verify iframe reloads in correct language
4. Switch section tabs (Home / About / Contact) → verify correct page loads in iframe
5. Try clicking a nav link in the iframe → verify it does NOT navigate away

---

## 2026-06-22 — Company access codes (soft auth) — v1.7 complete

### Completed

**DB schema** (`saas/prisma/schema.prisma`)
- Added 5 nullable fields to Company model: `contactName`, `contactPhone`, `contactEmail`, `address`, `accessCode`
- `prisma db push` done — all columns live in DB

**Server actions** (`saas/app/actions/companies.ts`)
- `createCompany` — now auto-generates an 8-char alphanumeric access code on creation (e.g. `XK9F2M48`)
- `updateCompany` — extended to accept all 5 new profile fields
- `regenerateAccessCode(id)` — admin action; generates new code, saves, returns it
- `setAccessCode(id, code)` — admin action; sets a custom code (uppercased)
- `verifyCompanyCode(companyId, code)` — public action (no requireAdmin); verifies code case-insensitively; returns profile fields on match, error on mismatch

**Admin — Companies slide-over panel** (`saas/app/admin/companies/CompaniesClient.tsx`)
- Edit button now opens a full right-side slide-over panel (instead of inline edit)
- Panel sections: Company info (name, ID code, address), Contact person (name, phone, email), Access code
- Access code row: show/hide toggle, copy button, "Generate new code" button; edit inline (saves on blur)
- "Code set" green badge shown on company row when a code exists
- Price tier expand/edit functionality unchanged

**Booking form** (`saas/components/BookingForm.tsx`)
- Company type now includes `accessCode: string | null`
- Name/phone/email inputs converted from uncontrolled → controlled (state: `firstName`, `lastName`, `phone`, `email`)
- When company selected + code exists: popup appears (password input with show/hide toggle, "Remember device" checkbox, "I'm not a company rep" escape link)
- Correct code → `verifyCompanyCode` server call → splits `contactName` on first space into firstName/lastName; fills phone/email
- localStorage: key `company_auth_{companyId}`, 30-day expiry; on selection checks cache before showing popup
- Wrong code → inline error, unlimited retries

**Wine orders form** (`saas/app/(site)/wines/WineCatalogueClient.tsx`, `saas/app/(site)/wines/page.tsx`)
- Company dropdown added at top of reservation form (optional)
- Selecting company with a code → same popup flow
- Auto-fills: businessName, llcId, address, contactName, contactPhone
- No company selected → form works exactly as before

**TypeScript**: 0 errors

### Key files changed
- `saas/prisma/schema.prisma` — 5 new Company fields
- `saas/app/actions/companies.ts` — full rewrite: new actions + extended updateCompany
- `saas/app/admin/companies/CompaniesClient.tsx` — slide-over panel replaces inline edit
- `saas/app/admin/companies/page.tsx` — passes new fields to client
- `saas/components/BookingForm.tsx` — controlled inputs + code popup + auto-fill + localStorage
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — company selector + popup + controlled inputs
- `saas/app/(site)/wines/page.tsx` — fetches companies, passes as prop

### Next up (user testing)
1. Admin: open Companies page → click Edit on any company → verify slide-over opens with all fields
2. Admin: set a custom code (e.g. `MARANI42`) or use the generated one → click Copy
3. Public booking form: select that company → verify popup appears → enter wrong code (error) → enter correct code → verify name/phone/email auto-fill
4. Wine orders page: select company → same popup flow → verify fields auto-fill

---

## 2026-06-22 — Image/banner audit + two fixes: compression + tenant isolation (full detail)

### Completed

**Image/banner audit**
- Full review of how images and hero banners are handled vs. industry standards
- 7 findings documented; 2 implemented this session; 5 added as v1.6 roadmap items

**Fix 1 — Image compression on upload (`saas/app/actions/uploadImage.ts`)**
- Installed `sharp` as a dependency
- All uploaded background images are now compressed server-side before storage: resized to max 2000px wide, converted to WebP at quality 82
- Typical reduction: 3–9 MB raw file → ~150–300 KB WebP
- Stored filename is now `${tenantId}/${Date.now()}.webp` (includes tenant prefix — see Fix 2)

**Fix 2 — Tenant isolation in Supabase Storage (`saas/app/actions/uploadImage.ts`, `saas/app/admin/content/page.tsx`, `saas/app/admin/content/BackgroundsTab.tsx`)**
- Uploads stored at `${tenantId}/filename.webp` (previously flat shared bucket)
- `listUploadedImages()` in `page.tsx` now lists from `${tenantId}/` prefix — tenants only see their own images
- `deleteBgImage` validates the storage path starts with the caller's own `${tenantId}/` and has exactly one slash — blocks cross-tenant deletes
- `BackgroundsTab.tsx`: replaced `filenameFromUrl()` (returned only last URL segment) with `storagePathFromUrl()` (extracts full bucket-relative path after `/backgrounds/`) so the delete call passes the correct path including tenant prefix

**TypeScript**: 0 errors after all changes

### Key files changed
- `saas/app/actions/uploadImage.ts` — sharp compression + WebP conversion + tenant-scoped paths
- `saas/app/admin/content/page.tsx` — `listUploadedImages` scoped to tenant prefix
- `saas/app/admin/content/BackgroundsTab.tsx` — `storagePathFromUrl` replaces `filenameFromUrl`
- `saas/package.json` — sharp + @types/sharp added

### Remaining v1.6 items (see Roadmap)
- ~~LCP preload hint for hero image~~ ✅ Done
- ~~CSS media query for responsive backgrounds~~ ✅ Done
- ~~Next.js `<Image>` for logo~~ ✅ Done
- ~~Simplify background-size to `cover`~~ ✅ Done (cover + scale)
- ~~Alt text on uploaded image thumbnails~~ ✅ Done
- **v1.6 fully complete**

### Next up
- User test: upload a background image → confirm it appears, save it, delete it
- Run `setup-rls.ts` against Supabase (still outstanding from Sprint 3A)
- Sprint 4: per-tenant admin auth

---

## 2026-06-22 — RLS structural change: withTenantDb wrapper + setup-rls script (full detail)

### Completed

**Diagnosis**
- Ran `scripts/check-rls.ts` → confirmed RLS is ON for all 12 tables but with **0 policies**
- Root cause: Prisma connects as `postgres` (Supabase superuser), which **bypasses RLS by design**; policies have no effect unless the connection voluntarily downgrades to a non-superuser role

**`withTenantDb` wrapper — `saas/lib/db.ts`**
- Added `TxClient` type (Prisma transaction client shape)
- Added `withTenantDb(tenantId, fn)`: opens a `$transaction`, executes `set_config('app.tenant_id', tenantId, true)` (session variable for policies to read) and `SET LOCAL ROLE app_user` (voluntarily downgrade to non-superuser → RLS enforced), then runs `fn(tx)`
- `LOCAL` on both commands means they revert at COMMIT/ROLLBACK — no leakage between requests

**All 25 tenant data files updated to use `withTenantDb`**
- 13 server action files: `settings.ts`, `siteContent.ts`, `blockedDates.ts`, `companies.ts`, `wines.ts`, `wineOrders.ts`, `menuItems.ts`, `masterclassItems.ts`, `orderExtras.ts`, `orderMasterclass.ts`, `orders.ts`, `createBooking.ts`, `submitWineOrder.ts`
- 12 page files: `admin/wines/`, `admin/companies/`, `admin/menu-items/`, `admin/masterclass/`, `admin/wine-orders/`, `admin/content/`, `admin/orders/`, `admin/orders/new/`, `admin/orders/[id]/`, `admin/statistics/`, `(site)/`, `(site)/wines/`
- `lib/pricing.ts`: `recalcOrderTotal` now takes `tenantId` + uses `withTenantDb` internally
- Atomic read+write pattern: functions like `updateOrderEnhanced`, `addOrderExtra`, `addMasterclassLine` now group their read+write in one `withTenantDb` callback

**`scripts/setup-rls.ts` — NEW**
- Creates `app_user` role (NOLOGIN)
- GRANTs SELECT/INSERT/UPDATE/DELETE on all 12 tenanted tables; SELECT only on Tenant
- Creates `tenant_isolation` policies:
  - 9 tables with direct `tenantId`: `USING ("tenantId" = current_setting('app.tenant_id', true))`
  - `Price`: JOIN to Company
  - `OrderMasterclass`, `OrderExtra`: JOIN to Order
- Idempotent (DROP POLICY IF EXISTS before each CREATE)

**TypeScript check**: 0 errors after all changes

### Key files changed
- `saas/lib/db.ts` — `TxClient` type + `withTenantDb` function added
- `saas/lib/pricing.ts` — `recalcOrderTotal(orderId, tenantId)` new signature
- All 13 server action files in `saas/app/actions/` — wrapped with `withTenantDb`
- All 12 page files in `saas/app/` — wrapped with `withTenantDb`
- `saas/scripts/setup-rls.ts` — NEW: creates app_user role + all RLS policies

### Next up
- **Run `setup-rls.ts`** against Supabase to actually create the role and policies
- Verify with `check-rls.ts` — should show policies on all 12 tables
- Sprint 4: per-tenant admin auth

---

## 2026-06-22 — Multi-tenant architecture: Sprint 1A + 1B + Sprint 2 (full detail)

### Completed

**Sprint 1A — Schema + Seed**
- Added `Tenant` model to `schema.prisma` (`id, name, domain, slug, createdAt`)
- Added nullable `tenantId String?` to 9 tables: Company, Order, MenuItem, MasterclassItem, WineOrder, Setting, SiteContent, BlockedDate, Wine
- Child tables left without `tenantId` (always accessed via parent): Price, OrderMasterclass, OrderExtra
- Updated unique constraints: `SiteContent` → `@@unique([key, locale, tenantId])`; `BlockedDate` → `@@unique([date, tenantId])`
- Ran `prisma db push --accept-data-loss` successfully; all columns created in DB
- Created `scripts/seed-tenants.ts` — inserts 2 tenants, backfills 59 orders, 2 companies, 6 wines, 6 wine orders, 6 menu items, 5 masterclass items, 29 settings, 19 site content rows to Nikalas Marani tenant

**Sprint 1B — Middleware + Tenant Helper**
- Added `DEFAULT_TENANT_ID` to `.env` (fallback for localhost dev)
- Rewrote `saas/proxy.ts`: expanded matcher to all routes (not just `/admin`); added `resolveTenantId(host)` with module-level Map cache; sets `x-tenant-id` on every request header; localhost uses env fallback; auth redirect logic preserved
- Created `saas/lib/tenant.ts`: `getTenantId()` reads `x-tenant-id` from request headers; throws if missing (fail-safe against unscoped queries)

**Sprint 2 — Query Scoping (THE FLIP)**
- Setting PK changed from `key @id` → `id @id @default(cuid())` + `@@unique([key, tenantId])` via raw SQL script (`scripts/migrate-setting-pk.ts`) — handled safely because `prisma db push` cannot add a non-nullable column to tables with existing rows
- Updated all 13 server action files and 12 page/component files — 27 files total in a single coordinated pass (half-scoped is worse than unscoped)
- Security patterns applied: `findMany → where: { tenantId }`, `create → tenantId in data`, `update → updateMany with tenantId`, `delete → deleteMany with tenantId`, `findUnique on ID → findFirst with tenantId`
- Child tables (OrderMasterclass, OrderExtra) verified via parent Order tenantId before mutation
- Public actions (createBooking, submitWineOrder) also scoped — tenant resolved from request headers
- TypeScript: 0 errors after all changes
- Public site verified: `http://localhost:3000` home page loaded correctly with booking form

### Key files changed
- `saas/prisma/schema.prisma` — Tenant model + tenantId columns + unique constraint updates + Setting PK change
- `saas/proxy.ts` — full rewrite: tenant resolution + expanded matcher
- `saas/lib/tenant.ts` — NEW: `getTenantId()` helper
- `saas/.env` — `DEFAULT_TENANT_ID` added
- `saas/scripts/seed-tenants.ts` — NEW: tenant seed + backfill
- `saas/scripts/migrate-setting-pk.ts` — NEW: raw SQL PK migration for Setting
- All 13 server action files in `saas/app/actions/` — tenantId scoping
- All 12 page/component files in `saas/app/` with direct db calls — tenantId scoping
- `saas/scripts/seed-ka.ts` — updated to use new `key_locale_tenantId` accessor
- `vault/migration-progress.md` — NEW: full migration tracker with sprint-by-sprint details

### Key decisions
- Node.js runtime (not Edge) for proxy.ts by default in Next.js 16 → Prisma works directly, no Supabase REST fetch needed
- Module-level Map cache in proxy.ts avoids DB hit on every request after first resolution per domain
- All 27 files updated in one pass — no interim half-scoped state
- Localhost uses `DEFAULT_TENANT_ID` env var; second tenant testable via Windows hosts file trick (`127.0.0.1 winery2.local`)

### ⚠️ Needs user testing (Max to do manually)
See full checklist in `vault/migration-progress.md` → Sprint 2 "What to test" section.
1. Admin orders — visit `/admin/orders`, confirm 59 orders visible
2. Admin companies, wines, content, settings — spot check a few pages
3. Submit a test booking on public form → check it appears in admin orders
4. Second tenant isolation — add `127.0.0.1 winery2.local` to Windows hosts file, visit `http://winery2.local:3000/admin/orders` → should show 0 orders

### Next up
- Max to run the 4 user testing steps above (⚠️ these are for Max, not for Claude)
- Supabase RLS update to enforce `tenantId` (Sprint 2 deferred item — query scoping is now the primary guard)
- Sprint 4: per-tenant admin auth (Supabase user tied to `tenantId`)

---

## 2026-06-21 — Custom image upload for Backgrounds tab (full detail)

### Completed
- **Upload button in Backgrounds tab** — dashed `+`-style card added to the image picker grid (after all built-in images); clicking it opens a hidden `<input type="file" accept="image/*">`; the selected file is uploaded to Supabase Storage `backgrounds` bucket via `uploadBgImage` server action; the returned public URL is added to `extraImages` state and auto-selected as the active background.
- **Uploaded images appear in the grid** — shown alongside built-in winery/hero/gallery images; no visual difference except they have an X delete button.
- **Remove uploaded images** — hovering an uploaded image reveals a small dark `×` button in the top-right corner; clicking calls `deleteBgImage` server action (deletes from Supabase Storage) and removes from local state; if the deleted image was active it clears the selection.
- **Shared image list** — all 3 page editors (Home / About / Contact) share the same uploaded image list; uploading from one editor makes the image available in all.
- **Persisted across page loads** — `page.tsx` calls `supabase.storage.from('backgrounds').list()` on load and passes existing uploads as `uploadedImages` prop through `ContentClient` → `BackgroundsTab`.
- **Supabase Storage** — uses the `backgrounds` public bucket; `uploadBgImage` auto-creates the bucket on first upload; service role client (`SUPABASE_SERVICE_ROLE_KEY`) used server-side for write access; 10 MB file size limit; path traversal guard on delete.

### Key files changed
- `saas/lib/supabase/service.ts` — NEW: service role Supabase client
- `saas/app/actions/uploadImage.ts` — NEW: `uploadBgImage` + `deleteBgImage` server actions
- `saas/app/admin/content/page.tsx` — lists existing uploads from Supabase Storage on load
- `saas/app/admin/content/ContentClient.tsx` — `uploadedImages` prop added to Props + component signature + BackgroundsTab call
- `saas/app/admin/content/BackgroundsTab.tsx` — `ImagePicker` rewritten: upload button, uploaded image cells with hover-X, delete handler; `PageBgEditor` passes extraImages/onUpload/onDelete; `BackgroundsTab` manages `extraImages` state

### Next up
- User test: upload an image, set it as background, save; hover + delete an uploaded image
- One-time setup: ensure Supabase `backgrounds` bucket exists (auto-created on first upload)
- Gallery page still outstanding
- PDF invoice email attachment still outstanding
- Minor fixes #5–#7 from security plan

---

## 2026-06-19 — Hero subtitle box fix + responsive text (full detail)

### Completed
- **Hero subtitle — single unified box** — `saas/app/(site)/page.tsx`: replaced `display: inline` + `box-decoration-break: clone` + `border-radius: 0` (which fragmented the background into per-line boxes) with `display: block` on the span + `border-radius: 6px`. Box now renders as one clean rounded box.
- **Fluid font sizing** — removed Tailwind breakpoint classes; subtitle `<p>` now uses `fontSize: 'clamp(0.8rem, 2.2vw, 1.05rem)'` for continuous scaling as viewport is dragged.
- **Box stretches with viewport** — `<p>` changed from `maxWidth: '34ch'` to `width: 'min(90%, 680px)'` with `mx-auto`; span changed to `display: block` so it fills the container width rather than shrinking to longest line.
- **v1.5 Page Backgrounds user-tested ✅** — Max confirmed the full image feature is done: Backgrounds tab (pick images, adjust position/zoom, save, remove), hero banners on all 3 public pages, winery fallback images, hover effects. Features #75–#78 marked user-tested.

### Key files changed
- `saas/app/(site)/page.tsx` — subtitle span: `display: block`, `border-radius: 6px`, removed `box-decoration-break`; `<p>` width `min(90%, 680px)`, `clamp()` font size

### Next up
- Gallery page still outstanding (images in `public/images/slider/` + `gallery/`)
- PDF invoice email attachment still outstanding
- Minor fixes #5–#7 from security plan

---

## 2026-06-19 — Hero background images, admin backgrounds editor + hero UI polish (full detail)

### Completed
- **3 winery images imported** — `Winery Image 1.jfif`, `winery image 2.avif`, `winery image 3.jpg` converted to JPG via sharp; saved to `saas/public/images/winery1.jpg`, `winery2.jpg`, `winery3.jpg`
- **Admin Backgrounds tab** — new third mode in `/admin/content` (alongside Text / Visual); image picker grid (8 images), X/Y position sliders, zoom slider, 200×128px live preview; saves to `Setting` table; per-page (Home / About / Contact)
- **Hero banners on all 3 public pages** — Home gets a full-bleed hero wrapping existing content; About and Contact get a 300px hero banner at top; all read background settings from DB with hardcoded winery image fallbacks (winery1/2/3.jpg)
- **`updateSetting` revalidation expanded** — now also revalidates `/about`, `/contact`, `/admin/content`
- **Overlay style settled** — About + Contact: frosted card (light 0.30 tint, `backdrop-filter: blur(6px)` dark pill bottom-left). Home: combination approach (see below)
- **Home hero — combination design:**
  - Light overlay (0.32) that darkens to 0.70 on banner hover (`transition: background-color 0.45s ease`) via pure CSS `.hero-banner:hover .hero-overlay`
  - Logo displayed in original colours on a cream rounded box (`rgba(245,239,230,0.92)`, `border-radius: 22px`)
  - "Kakheti, Georgia" eyebrow: inline dark pill (`box-decoration-break: clone`) — hugs text per line
  - Subtitle: inline dark background with `box-decoration-break: clone`, `border-radius: 0` and padding sized to eliminate gaps between lines — lines merge into one connected block
  - Two buttons in individual opaque boxes; both get `2px solid rgba(255,255,255,0.65)` border; wine-red glow on Book hover, white glow on Order Wine hover; buttons scale 1.06 on individual hover, 1.04 on banner hover
- **Hero taller** — `pt-24 pb-20` for more image presence; `max-w-xl` for better centring

### Key decisions
- Settled on Option C (frosted card) for About + Contact, custom combination for Home
- `box-decoration-break: clone` with `border-radius: 0` and `padding: 11px` on the subtitle span is the technique that creates seamless per-line-width highlights
- Pure CSS hover (no client component) keeps the home page a server component

### Key files changed
- `saas/public/images/winery1.jpg`, `winery2.jpg`, `winery3.jpg` — NEW
- `saas/app/admin/content/BackgroundsTab.tsx` — NEW
- `saas/app/admin/content/ContentClient.tsx` — backgrounds mode added
- `saas/app/admin/content/page.tsx` — fetches bg settings
- `saas/app/actions/settings.ts` — expanded revalidatePath
- `saas/app/(site)/page.tsx` — full hero rewrite with all combination effects
- `saas/app/(site)/about/page.tsx` — 300px hero banner, frosted card style
- `saas/app/(site)/contact/page.tsx` — 300px hero banner, frosted card style

### Next up
- User test the Backgrounds tab — pick images, save, verify live
- Gallery page still outstanding (images in `public/images/slider/` + `gallery/`)
- PDF invoice email attachment still outstanding
- Minor fixes #5–#7 from security plan

---

## 2026-06-19 — Multi-tenant architecture plan (full detail)

### Completed
- **Multi-tenant plan written** — `vault/Plan-MultiTenant.md` created; full 8-phase plan for growing from 1 to N client companies on a shared DB + single deployment
- **Roadmap v3 expanded** — v3 section updated to reference the plan with sprint-by-sprint checkboxes

### Key decisions
- Architecture: Option A — single Supabase DB with `tenantId` column on every table (vs. separate DB per client or separate deployments)
- Domain routing: Next.js middleware reads `Host` header → resolves `tenantId`
- RLS is the safety net; query-level scoping is the primary guard
- Theming (colors, logo) via CSS variables — no separate codebase per client

### Key files changed
- `vault/Plan-MultiTenant.md` — NEW: full multi-tenant plan, 8 phases, sprint grouping
- `vault/Roadmap.md` — v3 Platform section expanded with sprint breakdown + plan reference

### Next up
- Start Sprint 1 when ready: create `tenants` table, seed it, write middleware, add nullable `tenantId` to all tables

---

## 2026-06-02 — Mobile admin plan + show password (full detail)

### Completed
- **Show password toggle on admin login** — added `showPassword` state to `LoginForm.tsx`; eye icon button (SVG, no library) positioned absolutely inside the password field wrapper; toggles `type="password"` / `type="text"`; eye-off icon shown when password visible, eye icon when hidden
- **Mobile admin plan written** — `vault/Plan-MobileAdmin.md` created; full plan for Orders list card view, filter bar collapse, order detail audit, wine orders column fix; v1.4 added to Roadmap

### Key files changed
- `saas/app/admin/login/LoginForm.tsx` — `showPassword` state, eye toggle button, `paddingRight` on input
- `vault/Plan-MobileAdmin.md` — NEW: full mobile admin plan
- `vault/Roadmap.md` — v1.4 Mobile Admin section added; old v1.4 Page Backgrounds renamed to v1.5
- `vault/FeatureLog.md` — feature #71 added

### Next up (remaining from this session)
- Order detail page: tap target audit (last piece of mobile plan)
- User test all mobile admin changes on a real phone

---

## 2026-06-01 — Date format + past date protection (full detail)

### Completed
- **DD/MM/YYYY custom date input** — built `saas/components/DateInput.tsx`: text input with DD/MM/YYYY placeholder, auto-inserts slashes as user types, calendar icon button opens native date picker via `showPicker()`, syncs internal YYYY-MM-DD value with display. Replaces all `input[type=date]` in booking form and admin orders filter bar. Universal — works the same regardless of OS/browser locale.
- **Past date protection** — booking form: `isPastDate` flag shows inline red warning immediately when user types a past date; handleSubmit blocks submission with error message. `createBooking.ts`: server-side guard compares `dateStr < todayStr` and returns error before any DB writes. Missing-date guard also added to handleSubmit.
- **lang="en-GB"** — set on `<html>` in `app/layout.tsx` (good for other locale-dependent behaviour; doesn't affect date inputs in Chrome which ignores it, hence the custom component).

### Key files changed
- `saas/components/DateInput.tsx` — NEW: universal DD/MM/YYYY input component
- `saas/components/BookingForm.tsx` — uses DateInput; hidden `name="date"` input; past-date warning + submit guard; missing-date submit guard
- `saas/app/admin/orders/OrdersFilters.tsx` — From/To filters use DateInput
- `saas/app/actions/createBooking.ts` — past-date server guard
- `saas/app/layout.tsx` — lang="en-GB"

### Next up
- User test the date filters — set From/To and confirm results update correctly
- User test the content editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Bug fix: date filter inputs (full detail)

### Completed
- **KnownBug #1 fixed — date filter inputs** — The "From" and "To" date inputs in the orders filter bar were controlled by server-side `params` props. When a user picked a date from the native picker, `onChange` fired, `router.push` started a navigation, but React immediately reset the input back to the old value (from `params`) while waiting for the server to respond. This made the selection look lost. Fix: added `localDateFrom`/`localDateTo` local state that updates instantly on change, then syncs back to server params once navigation settles (detected by the existing `navKey` effect). The server query itself was always correct — all bookings are stored at UTC midnight so the `gte`/`lte` Prisma filters were sound.

### Key files changed
- `saas/app/admin/orders/OrdersFilters.tsx` — added `localDateFrom`/`localDateTo` state; inputs now use local state; `setUpcoming`/`clearFilters` also update local state; `navKey` effect syncs on settlement

### Next up
- User test the date filters — set From/To and confirm results update correctly
- User test the content editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Security audit + fixes (full detail)

### Completed
- **Code inspection** — full review of recent features (editable content, booking form, server actions); 7 findings identified (2 critical, 2 medium, 3 minor).
- **Finding #1 disproved** — initial finding that admin routes were unprotected was wrong; `saas/proxy.ts` is the Next.js 16 middleware entry point and correctly redirects unauthenticated visitors to `/admin/login`. Verified by navigating to admin without session.
- **Finding #2 fixed — server action auth guard** — server actions are exposed as HTTP POST endpoints; the proxy only protects page URLs, so direct POSTs to action endpoints via public URLs bypassed auth entirely. Proved by calling `saveContent` via `POST /` with `Next-Action` header — DB was written without a session. Fix: created `lib/requireAdmin.ts` (checks Supabase session, throws Unauthorized if no user) and added `await requireAdmin()` to every write action across 12 files.
- **Finding #3 fixed — masterclass price from DB** — `createBooking` trusted client-supplied `pricePerUnit` for masterclass line items, allowing a user to submit `pricePerUnit: 0` and pay nothing for add-ons. Proved by submitting a booking with fake price — order created with totalPrice excluding masterclass cost. Fix: server now fetches `masterclassItem.pricePerUnit` from DB by ID and ignores the client value in both the total calculation and the stored record.
- **Finding #4 fixed — enhanced booking min-guest check** — min-guest validation used `guestCount` (total incl. free guests), so a booking with `guestCount: 10` but `tastingGuestCount: 0, lunchGuestCount: 0` passed validation with `totalPrice: 0`. Fix: enhanced bookings now validate `tastingGuestCount + lunchGuestCount` against the minimum.

### Key files changed
- `saas/lib/requireAdmin.ts` — NEW: Supabase auth check helper
- `saas/app/actions/siteContent.ts` — requireAdmin on saveContent, saveContentSection, deleteContent
- `saas/app/actions/settings.ts` — requireAdmin on updateSetting
- `saas/app/actions/blockedDates.ts` — requireAdmin on addBlockedDate, removeBlockedDate
- `saas/app/actions/companies.ts` — requireAdmin on createCompany, updateCompany, deleteCompany
- `saas/app/actions/orders.ts` — requireAdmin on all 6 write functions
- `saas/app/actions/wines.ts` — requireAdmin on createWine, updateWine, deleteWine
- `saas/app/actions/wineOrders.ts` — requireAdmin on updateWineOrderStatus
- `saas/app/actions/prices.ts` — requireAdmin on createPrice, updatePrice, deletePrice
- `saas/app/actions/masterclassItems.ts` — requireAdmin on all 3 write functions
- `saas/app/actions/menuItems.ts` — requireAdmin on all 3 write functions
- `saas/app/actions/orderExtras.ts` — requireAdmin on addOrderExtra, removeOrderExtra
- `saas/app/actions/orderMasterclass.ts` — requireAdmin on addMasterclassLine, removeMasterclassLine
- `saas/app/actions/createBooking.ts` — DB-fetched masterclass prices; paying-guest min check

### Remaining (minor — no security/pricing risk)
- **#5** `hasDbValue` false-negative in EditableText when empty string saved
- **#6** No `revalidatePath` in `saveContent`/`deleteContent`
- **#7** EditableText outer `<div>` wrapper breaks HTML semantics for inline elements

### Next up
- User test the editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Fix date filters on admin orders (KnownBugs #1)
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Dual-mode site content editor (full detail)

### Completed
- **Dual-mode content editor** — `/admin/content` now has **Text** mode (flat labeled list per section: Navigation / Home / About / Contact) and **Visual** mode (full faithful page preview — nav bar + page body — with every hardcoded string editable inline via hover+click).
- **New SiteContent keys** — added ~25 new keys for strings previously locked in `lib/t.ts`: nav labels (`nav_home`, `nav_about`, `nav_wines`, `nav_contact`, `nav_book`), button text (`home_book_btn`, `home_order_wine_btn`, `about_cta_btn`, `contact_book_btn`), page headings (`about_eyebrow`, `about_heading`, `contact_eyebrow`, `contact_heading`, etc.), card notes, directions text, CTAs.
- **Public pages wired** — `app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx` all check `SiteContent` first with `t()` as fallback, so edits in admin now show on the live site.
- **SiteNav wired** — `(site)/layout.tsx` fetches `getContentMap('nav', locale)` and passes to `SiteNav`; nav labels + "Book a Visit" button now DB-backed.
- **Visual mode details**: framed in a rounded border with drop shadow; nav links are inert (not navigating away); booking form shows as a visual placeholder (`pointer-events-none`); `Navigation` tab hidden in visual mode (nav always shown at top of each preview).

### Key files changed
- `saas/app/admin/content/ContentClient.tsx` — full rewrite with mode switcher, FIELDS schema, TextMode, VisualNav, VisualHome, VisualAbout, VisualContact
- `saas/app/(site)/layout.tsx` — fetches nav content map, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — accepts `navContent` prop, uses DB values with t() fallback
- `saas/app/(site)/page.tsx` — hero buttons + booking heading use new SiteContent keys
- `saas/app/(site)/about/page.tsx` — eyebrow, heading, expect heading, CTA from SiteContent
- `saas/app/(site)/contact/page.tsx` — eyebrow, heading, card notes, directions, CTA from SiteContent

### Extended (same session — notes from Max)
- **"Kakheti, Georgia" eyebrow** — was hardcoded, now editable via `home_location_eyebrow` key
- **Contact card headers** (Phone / Email / Location / Cancellation) — now editable via `contact_label_*` keys; wired to live contact page
- **Booking form preview in visual mode** — replaced gray placeholder with full form structure: Booking Type toggles, Visit Type options, Date, Time Slot, Number of Guests, First Name, Last Name, Phone, Email, "Request Booking" button, cancel policy text — all labels editable in-place
- **BookingForm wired** — accepts `formContent` prop; `fc()` helper uses DB value with `t()` fallback for all 14 visible labels; home page fetches `getContentMap('form', locale)` and passes it down
- **Form section tab** added to Text mode (Navigation / Home / Form / About / Contact)
- **Reset to default** — `↺` badge on `EditableText` hover (only when DB value exists); tooltip previews fallback text; click calls `deleteContent` action; value snaps to fallback; "↺ Reset to default" flash. `deleteContent` added to `siteContent.ts`.

### Key files changed (full session)
- `saas/app/admin/content/ContentClient.tsx` — full rewrite × 2: dual-mode editor, FIELDS schema, VisualNav, VisualHome, VisualAbout, VisualContact, VisualFormPreview, TextMode
- `saas/components/EditableText.tsx` — reset badge + tooltip + `deleteContent` call; `hasDbValue` guard
- `saas/app/actions/siteContent.ts` — `deleteContent` action added
- `saas/app/(site)/layout.tsx` — fetches nav content map, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — `navContent` prop; DB-backed nav labels + book button
- `saas/app/(site)/page.tsx` — `home_location_eyebrow`, hero buttons, book heading, `formContent` fetch + BookingForm prop
- `saas/app/(site)/about/page.tsx` — eyebrow, heading, expect heading, CTA from SiteContent
- `saas/app/(site)/contact/page.tsx` — eyebrow, heading, card headers + notes + directions + CTA from SiteContent
- `saas/components/BookingForm.tsx` — `formContent` prop, `fc()` helper, all visible labels DB-backed

### Next up
- **Security & bug fixes** — see `vault/Plan-SecurityAndBugFixes.md` (7 items, 2 critical)
- User test the editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Fix date filters on admin orders (KnownBugs #1)

---

## 2026-05-28 — Session 3 (full detail)

### Completed
- **Settings page — Georgian text replaced with English** — payment field labels, section header, and email placeholder were in Georgian; all switched to English. Translations saved to `vault/Features/Add Language/Georgian Translations.md` for future i18n work.
- **Calendar view** — Table/Calendar toggle on orders page; custom month grid (no library); booking count badge per day (wine red); click day → switches to table filtered to that date; today highlighted.
- **Calendar day hover preview** — Obsidian-style popover on day cells shows all orders for that day: name, time, guests, visit type, status (colour-coded), company, total. 200ms delay; right-aligns for cols 4–6 to avoid clipping; stays open when hovering onto the card.
- **Export orders to CSV** — "Export CSV" button in filter bar; respects active filters; downloads `orders-YYYY-MM-DD.csv`; 13 columns.
- **Configurable min guests per visit type** — Settings → Booking Rules section; two number inputs (Wine Tasting / Tasting + Lunch); saves on blur; enforced in BookingForm (dynamic min, inline warning) and createBooking (server guard); package cards on home page show dynamic minimum.
- **Fix: home page min guests static** — added `export const dynamic = 'force-dynamic'` to `app/(site)/page.tsx`; home page now re-fetches settings on each request instead of baking values at build time.
- **Block dates (closed days)** — new `BlockedDate` DB model (prisma db push); Settings → Closed Days section; date picker + optional reason + block button; list with × remove; public form shows inline error when blocked date selected; createBooking guards server-side.
- **Shimmer loading skeleton** — `loading.tsx` in `/admin/orders` shows a warm brown shimmer skeleton (header + filter bar + 9 rows) during page navigation. `@keyframes shimmer` in globals.css.
- **Smooth scroll on "Book a Visit"** — `scroll-behavior: smooth` added to `html` in globals.css.
- **Status filter** — Status dropdown in orders filter bar; all 6 statuses (NEW/CONFIRMED/INVOICE_SENT/PAID/COMPLETED/CANCELLED); integrated into all filter queries; `OrderStatus` enum cast fixes TypeScript.
- **Progress bar on filter change** — thin wine-red progress bar animates under filter bar while navigating (`@keyframes nav-progress`); filter bar dims to 60% opacity. Uses `useState` + `useEffect` watching params (not `useTransition` — more reliable for concurrent updates).
- **Fix: status filter intermittent** — replaced `startTransition(router.push)` with direct `router.push` + `useState/useEffect` approach; navigation is no longer a low-priority concurrent update that could be dropped.
- **Status counts in dropdown** — status dropdown shows live counts per status within the current date/company filter context: "New (12)", "Confirmed (3)" etc.; options with 0 orders are disabled (greyed out). Uses `db.order.groupBy` on a `baseWhere` that ignores the status filter itself.

### Key files changed this session
- `saas/app/admin/orders/page.tsx` — view param, calendar data, baseWhere + groupBy for statusCounts, CalendarView + ViewToggle integration; `include` on orders query fixed with `OrderStatus` cast
- `saas/app/admin/orders/CalendarView.tsx` — NEW: month grid + hover popover
- `saas/app/admin/orders/ViewToggle.tsx` — NEW: Table/Calendar toggle (no useSearchParams — receives params as props)
- `saas/app/admin/orders/OrdersFilters.tsx` — Export CSV button, status filter, progress bar, status counts, shimmer/loading state
- `saas/app/admin/orders/loading.tsx` — NEW: shimmer skeleton
- `saas/app/actions/orders.ts` — `exportOrdersCsv` action; `OrderStatus` cast on status filter
- `saas/app/admin/settings/page.tsx` — min guest settings + blocked dates fetch
- `saas/app/admin/settings/SettingsClient.tsx` — Booking section header, Booking Rules section, Closed Days section
- `saas/app/actions/settings.ts` — two new defaults
- `saas/app/actions/blockedDates.ts` — NEW: getBlockedDates, addBlockedDate, removeBlockedDate
- `saas/prisma/schema.prisma` — BlockedDate model added
- `saas/components/BookingForm.tsx` — dynamic minGuests props, blockedDates prop, inline blocked date error
- `saas/app/(site)/page.tsx` — force-dynamic, min guest + blocked dates fetch + BookingForm props
- `saas/app/actions/createBooking.ts` — server-side blocked date + min guest validation
- `saas/app/globals.css` — smooth scroll, shimmer keyframes, nav-progress keyframes

### Bugs fixed / lessons learned
- `useSearchParams()` in client components without a `<Suspense>` boundary crashes the entire page in Next.js App Router production builds (passes build, fails at runtime). Fix: remove `useSearchParams`, receive params as props from the server component instead.
- `startTransition(router.push)` makes navigation a low-priority concurrent update that can be interrupted. Fix: call `router.push` directly.
- Prisma `where` clause with a union type spread causes cascading type errors on `include` results — fix with `as OrderStatus` cast on the string param.
- Home page with settings-dependent content must have `export const dynamic = 'force-dynamic'` or values are baked in at build time.

- **Fix: calendar hover preview** — `e.currentTarget` is nullified by React after the event handler returns, so calling `.getBoundingClientRect()` inside a `setTimeout` always failed silently. Fixed by capturing `const target = e.currentTarget` before the timeout.

- **Wine description field** — `description String?` on Wine model; textarea in admin edit+add forms; shown on card below type/price
- **Wine orders status stepper** — Pending → Confirmed → Paid → Delivered (4 stages); active step has glow ring + bold label; inactive steps faded; stepper centered in col 3; optimistic UI; `updateWineOrderStatus` server action
- **Wine order ID on card** — `#xxxxxxxx` monospace badge (first 8 chars of cuid)
- **Wine order total amount** — `totalAmount Float?` on WineOrder schema; price now stored per wine in JSON (`{id, name, quantity, price}`); total computed in `submitWineOrder`; displayed on admin card
- **Schema**: `prisma db push` done — both Wine.description and WineOrder.totalAmount columns live in DB

### Key files changed this session
- `saas/prisma/schema.prisma` — Wine.description + WineOrder.totalAmount added
- `saas/app/actions/wines.ts` — description param added to createWine/updateWine
- `saas/app/actions/wineOrders.ts` — NEW: updateWineOrderStatus
- `saas/app/actions/submitWineOrder.ts` — price per wine in JSON; totalAmount computed and saved
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — price included in wines JSON on submit
- `saas/app/admin/wines/WinesClient.tsx` — description type, edit form textarea, display on card
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — NEW: status stepper client component
- `saas/app/admin/wine-orders/page.tsx` — now delegates to WineOrdersClient

### Bugs fixed / lessons learned
- Wine order JSON was missing `price` per bottle — amounts couldn't be computed without it. Fixed at submission time; old orders will show `—` for total (totalAmount is nullable).

- **Wine orders card layout redesign** — 3-column layout: col 1 (name/company/tags/address/contact), col 2 (amount/hours/phone, centered), col 3 (stepper); colored border on right edge matching status; status filter pills with solid color when selected; cancel order button removed; card width narrowed (`max-w-3xl`)

### Key files changed (wine orders redesign — 2026-05-28)
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — full layout redesign + stepper improvements + delivered status + filter pills
- `saas/app/admin/wine-orders/page.tsx` — max-w-5xl → max-w-3xl

- **Wine order statistics** — mode switcher (Bookings / Wine Orders pill toggle) on Statistics page; `WineStatistics.tsx` new component; 4 summary cards (total orders, total revenue, active orders, avg order value); year/month filter; status breakdown bars (5 statuses with matching colors from wine orders page); revenue by month/day chart; top wines by bottles ordered (bar chart aggregated from JSON); top customers by spend; all data fetched server-side in `statistics/page.tsx` using same displayTotal fallback logic as wine-orders page.

### Key files changed (wine order stats — 2026-05-29)
- `saas/app/admin/statistics/page.tsx` — added `db.wineOrder.findMany` + `db.wine.findMany`; wineOrders array with displayTotal computed server-side; passed as `wineOrders` prop
- `saas/app/admin/statistics/StatisticsClient.tsx` — added `mode` state (`bookings` | `wine`); pill switcher UI; renders `<WineStatistics>` when wine mode active; `wineOrders` prop added
- `saas/app/admin/statistics/WineStatistics.tsx` — NEW: full wine stats client component

### Next up
- **Fix date filters** on admin orders (KnownBugs #1) — date range filter doesn't work
- **Verify nikalasmarani.ge in Resend** — until done, invoice emails only deliver to max.mghvdliashvili@gmail.com, not real customers
- **Gallery page** — images already in `public/images/`, need to wire into public site
- **Send invoice by email — PDF attachment** — follow-up to HTML email; attach a PDF so customers get a proper document

---

## 2026-05-28 — Session 1 (compressed)

Settings text English; calendar view + hover preview; export CSV; configurable min guests; block dates; shimmer loading; smooth scroll; status filter + counts; progress bar on filter change.

---

## 2026-05-27 — Previous session (compressed)

Print invoice fixes (blank page, Georgian typos, payment section, 2-page bug); Vercel CLI set up; Supabase RLS on all 10 tables; Enhanced company booking Steps 4–6 (order detail page, admin create order, public form toggle with split counts/hot dishes/masterclass/live price breakdown).

---

## 2026-05-26 — Split pricing, Wine CRUD, company ID code, payment settings, print invoice

---

## Older sessions (compressed)

- 2026-05-22 — Statistics V2, logo rollout, 11 winery images downloaded, wine image assignment, email confirmation (Resend sandbox), admin mobile responsiveness, error states
- 2026-05-19 — Built public site (About, Contact, Wines catalogue), SiteNav, hamburger menu, WineOrder DB model, admin Wine Orders tab, brand assets (SVG logo, icons), deployed to Vercel
- 2026-05-18 — Order edit/delete slide-over, filter fixes (individuals only, upcoming), dedup script, preview server setup
- 2026-05-17 — Orders list, companies CRUD, price tiers with validations, seed script, statistics page, nav fixes
- 2026-05-17 — Scaffolded saas app, Supabase connected, booking form built, admin auth
- 2026-05-16 — GitHub Pages live, repo restructured, React Flow dashboard, project kickoff, vault created
