---
tags: [qa, wine-orders, production-readiness, stress-test]
---

# QA + stress test — wine order features (T-13, T-8, T-14, T-12, T-9, Chunks 1–15)

**Date:** 2026-10-14 · **Code tested:** `staging` @ `73218d3` (same commit staging.vineworks.ge serves) ·
**Databases:** dev only. **Nothing was run against production.** Plan: [[Plan-WineOrderFeatures]].

Max asked: "stress test it and QA test it to make sure it is ready for production".

## Verdict

See "Result / verdict" below. **Update the same day:** Max said "apply any fixes to bugs you found" — every finding except F14 (a runbook note) was fixed on `staging`; see "Fixes applied" at the end. The verdict after the fixes: **ready for the production runbook**, pending Max's own staging check.

## What was run

| # | Check | How | Result |
|---|---|---|---|
| 1 | Type check, lint, en/ka parity | `tsc --noEmit`, `eslint`, `check-i18n-parity` | tsc clean · lint 83 errors = the 83 baseline from before this work · parity ✅ |
| 2 | Production build | `npm run build` (what Vercel runs) | ✅ |
| 3 | Migration rehearsal | Production's exact structure (every migration up to `20261007120000`) rebuilt in a throwaway schema on the dev DB, filled with a copy of dev's rows (152 wine orders, 23 companies, 426 bookings…) plus awkward addresses (spaces only, empty, padded), then the 7 pending migrations applied with `prisma migrate deploy` — the runbook's step 1 | ✅ all 7 applied in 9.5 s · backfill 16/16 companies with a real address (padded text trimmed, blank skipped) · every old order DELIVERY / no fee / not pending / COMPANY · RLS + policy + `app_user` grant on the 3 new tables, anon/authenticated none · all CHECK constraints present · **no drift**: the migrated schema equals `schema.prisma` exactly (also true for the dev DB) · runbook step 4b: 0 rows, then 1 after simulating an old-code edit, then 0 again (idempotent). Schema dropped afterwards. |
| 4 | Crafted public requests (50) | The real `submitWineOrder` request captured from the browser and replayed with altered fields against the production build; DB checked after each | see "Attack probes" |
| 5 | Crafted admin requests (40) | The new admin actions called directly: signed out, other-tenant ids, bad money/dates | see "Attack probes" |
| 6 | Load / stress | Burst load against the production build, compared with the same test on the code from before this work (`dbfa5d1`), same machine, same DB | see "Load" |
| 7 | Full browser suite | Playwright tiers 1–4, `--workers=1`, fresh dev server, routes warmed, onboarding tenant reset, toggles checked | _(below)_ |
| 8 | Phone + Georgian | staging.vineworks.ge `/wines` drawer at 375 and 320 px, English and Georgian, Company and Individual | ✅ no horizontal overflow; new strings translated |
| 9 | Deployed staging | Vercel: staging = `73218d3`, READY · TTFB `/` ≈ 0.4 s, `/wines` ≈ 0.4 s | ✅ |

**Suite (row 7):** 63/65 on the full run (42.1 min). The 2 failures (`booking-simple`: order page >30 s; `onboarding-wizard`: "Adding…" >10 s) both **passed in two clean isolated reruns**. The dev server was at 1.5 GB (the documented bloat pattern), so they're environmental. **Script tests:** 16 scripts, 284/284 pass; the date script also passes with the server clock set to UTC and to New York.
**Admin at phone width (390/320, en + ka):** Wine Orders, Calendar, New order, Settings, Companies: no overflow.

## Result / verdict

**Ready for production after one small fix (F1).** F2 is advisable. Everything else can follow later.

### Fix before production
- **F1 — Georgian dates on Vercel (new in T-14 / Chunk 12).** `formatPreferredDate` (`lib/wineOrderDate.ts`) and the "card link sent" line (`WineOrdersClient.tsx:382`) use `toLocaleDateString('ka-GE')`. `lib/emails/templates/dateFormat.ts` (2026-09-14) records that Vercel's Node lacks Georgian ICU data, which produced `09.14.2026` in production invoices. Consequences: (a) the **Georgian wine receipt email** (`settle.ts:407`) shows the preferred date in English format; (b) Georgian-admin **Wine Orders cards** render one date on the server and another in the browser, causing a React **hydration error** on every load (reproduced locally: a browser without Georgian data vs the server). Fix: build the string from a fixed month table, as `dateFormat.ts` already does.

### Advisable before production (small)
- **F2 — "No preferred date" list** under the Calendar lists every non-cancelled undated order, **delivered ones included**. On production that is every past wine order on day one. Limit it to open (New/Confirmed) orders.
- **F3 — No upper limit on the preferred date** (server accepts 9999-12-31). Cap at, say, one year.

### Later / separate tickets (none caused by this work unless marked)
- F4 Wine name/year on order lines come from the browser (a crafted request can relabel a line; the price is correct). Pre-existing.
- F5 A hidden wine (inactive wine, active vintage) can be ordered by a crafted request. Pre-existing.
- F6 Crafted vintage ids ("constructor", a number) get HTTP 500 instead of a clean message; nothing is written. Pre-existing.
- F7 No length limits on free-text fields (a 50,000-character address is accepted). Pre-existing.
- F8 Manual fee payment: a fractional amount is stored truncated, a string amount gives a 500 (admin-only, crafted). Add `Number.isInteger`.
- F9 Simultaneous fee recordings can overpay (reproduced: 2 of 2 accepted). Max decided to show it as a credit; an optional row lock would prevent it.
- F10 Access codes: custom codes have no minimum length and the public code lookup has no attempt limit. Since Chunk 15 the code is the only gate to company prices and contacts.
- F11 Some older public drawer labels are English in Georgian mode ("Your Order", "Total", "Order & Pay", "Checkout →"). Pre-existing.
- F12 In Company mode the dropdown still defaults to "— Individual / no company —", next to the new Individual switch (UX).
- F13 `/wines` loads the delivery setup after the other reads instead of alongside them: +0.9 s locally, unmeasurable on staging (0.4 s).
- F14 Runbook step 4b only fills companies with no address; an address *edited* during the deploy window is not synced (minutes; acceptable).

### Attack probes (rows 4–5) — summary
Public: refused correctly — fractional, negative, over-1000, string and huge quantities; bad JSON; another tenant's wine, zone or company; inactive zone; pickup when off; missing / past / Closed Day / 30 Feb dates; code missing, wrong, another company's, booking-only company; another company's saved address; foreign Origin (Next's CSRF check); rate limit (2 of 22 throttled). Accepted correctly — lowercase code; saved-address zone enforced over a crafted "other"; Individual strips company, LLC and address; 2,000 junk contacts write nothing; client price and discount ignored.
Admin: every action refused signed-out (DB unchanged); every other-tenant id refused; bad fees, dates, rules and zones refused.

### Load (row 6) — before (`dbfa5d1`) vs now, one local production build, dev DB
GET /wines single 1.39 → 2.34 s (F13); 10/25 at once: no errors in either; 50 at once: before 0–1 errors, now 3 (P2028, single local pool of 20); 100 at once: ~60% errors in **both** (same ceiling, see [[StressTest-2026-08-12]]). Submit (all reads, no write): 0 errors up to 50 at once in both, p50 at 50 = 2.8 s → 3.9 s. 20 real orders at once (with Flitt checkout): 20/20 OK, p95 4.3 s. Home page unchanged.

**Leftovers:** QA helpers in `saas/scripts/_qa/` and `saas/tests/_qa/` (untracked, never commit); `.claude/launch.json` gained a `saas-prod-build` entry; scratch worktree removed. Dev DB: all QA rows, zones and settings removed; the rehearsal schema dropped; admin language back to `en`.

## Fixes applied (2026-10-14, same day — Max: "apply any fixes to bugs you found") — plan Chunk 16

All on `staging` in commit `f1ff942`, ticket **T-83** (Ready to test); **nothing on production**. KnownBugs #80–#86.

**Verified after the fixes:** date script 28/28 (local, UTC, New York) · fee script 10/10 (3 simultaneous → 1 accepted) · new `test-access-code-rules` 5/5 · 16 related scripts pass · 44 related specs pass (the Georgian wine spec was updated to the translated labels — it had pinned the English) · crafted-request probe re-run: every earlier failure now refused cleanly · Georgian admin at 390/320 px: no overflow, 0 hydration errors · production build ✅ · lint: no new errors (source 81 vs 83 baseline).

| Finding | Fix | Where |
|---|---|---|
| F1 Georgian dates on Vercel | Fixed month tables (`formatIsoDay`), no ICU; card-link line too | `lib/wineOrderDate.ts`, `WineOrdersClient.tsx` |
| F2 undated list | Only open orders (not delivered / cancelled), like Pack | `WineOrdersClient.tsx` |
| F3 date upper bound | `too_far` beyond one year — server, form message, picker `max` | `lib/wineOrderDate.ts`, `submitWineOrder.ts`, `WineCatalogueClient.tsx`, `DateInput.tsx`, `lib/t.ts` |
| F4 name/year from browser | Snapshot from the DB (customer's language) | `submitWineOrder.ts` |
| F5 hidden wine orderable | Only active vintages of active wines | `submitWineOrder.ts` |
| F6 500 on odd ids | String check + `Map` lookup → clean "no longer available" | `submitWineOrder.ts` |
| F7 no length limits | Caps: names 200, address 500, hours 200, phone 50, email 254, code 64, ≤ 20 contacts | `submitWineOrder.ts` |
| F8 fractional manual payment | `Number.isInteger` (bookings + wine) | `lib/payments/manualPayment.ts` |
| F9 simultaneous payments | Order row locked `FOR UPDATE` (bookings + wine) — 3 at once → exactly 1 | `lib/payments/manualPayment.ts` |
| F10 access codes | Hand-set codes ≥ 6 chars; typed-code lookup 30 / 10 min / IP | `lib/accessCodeRules.ts`, `companies.ts`, `companyPeople.ts`, `writeRateLimit.ts` |
| F11 English drawer | 29 `wine.ui.*` keys + existing `form.*` keys (Georgian drafted — Max to check) | `WineCatalogueClient.tsx`, `lib/t.ts` |
| F12 overlapping option | "— Not on the list —" | same |
| F13 `/wines` sequential load | Into the page's `Promise.all` | `app/(site)/wines/page.tsx` |
| extra | Calendar "today" highlight in Georgian time (was UTC) | `components/MonthCalendar.tsx` |
| F14 | Runbook note only (address edited during the deploy window) | [[Plan-WineOrderFeatures]] runbook 4b |

**Not fixed (separate, pre-existing):** KnownBugs #81 — other `ka-GE` date uses (My Reports page, onboarding review).

**Incident during this work (mine):** removing the temporary "before" worktree deleted ~180 packages from
`saas/node_modules` through the junction it contained (Windows `Remove-Item -Recurse` followed it). No
source or data was touched; restored with `npm ci` (727 packages, from the lockfile) + `prisma generate`.
Lesson: delete a junction with `rmdir` and check it is gone *before* any recursive delete of its parent.
