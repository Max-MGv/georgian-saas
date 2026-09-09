---
tags: [bugs]
---

# Known Bugs

| # | Description | Area | Status |
|---|---|---|---|
| 1 | Date filters don't work on orders admin panel | Admin / Orders | 🟢 Resolved |
| 2 | Guest count input: backspace resets to 0, typing prepends to 0 instead of replacing | Public / Booking form | 🟢 Resolved |
| 3 | Time slot picker allows selecting past hours on today's date | Public / Booking form | 🟢 Resolved |
| 4 | Supabase connection pool exhaustion (session mode) — production risk | Infrastructure | 🟢 Resolved |
| 5 | RLS policies deployed but never enforced — withTenantDb is a stub | Security / DB | 🟢 Resolved |
| 6 | Vercel functions ran in `iad1` while databases are in `eu-central-1` — every page ~3s | Infrastructure | 🟢 Resolved |
| 7 | Click-reveal popover silently clipped by an `overflow-hidden` ancestor (2nd instance of this pattern) | Admin / Onboarding | 🟢 Resolved |
| 8 | Flex children don't shrink below content width — Georgian step labels overflowed into neighboring columns | Admin / Onboarding | 🟢 Resolved |
| 9 | Orders page header (title + view toggle + New Order button) had no `flex-wrap` — overflowed at 375px in Georgian | Admin / Orders | 🟢 Resolved |
| 10 | Onboarding wizard's Contact step wrote to the wrong database table (`SiteContent`, feeds only the public `/contact` page) instead of the `Setting` table that actually feeds the sitewide footer/nav and invoice return address | Admin / Onboarding | 🟢 Resolved |
| 11 | Onboarding wizard's company creation ignored the tenant's actual modules — always defaulted `isBookingCompany:true, isWineOrderCompany:false` regardless of what the tenant had enabled | Admin / Onboarding | 🟢 Resolved |
| 12 | `getFinishDetailsStatus()`'s "needs pricing" check applied to ALL companies, including wine-order-only ones that never use price tiers — false-positive nudge | Admin / Onboarding | 🟢 Resolved |
| 13 | Real Companies list page (`/admin/companies`) had zero visual indicator for missing identificationCode/contact/pricing — same underlying data as the nudge banner, just never surfaced per-row | Admin / Companies | 🟢 Resolved |
| 14 | Enhanced-booking and wine-catalogue "code confirmed"/"no rate for guest count"/discount badges hardcode light green/red colors that don't respect the tenant's theme (`BookingForm.tsx`, `WineCatalogueClient.tsx`) — would clash on dark presets | Public / Booking, Wine Catalogue | 🟢 Resolved |
| 15 | `CompaniesClient.tsx` nests a `<button>` (`HelpHint`'s "?" trigger) inside another `<button>` (the row summary) — invalid HTML, hydration mismatch on every `/admin/companies` load | Admin / Companies | 🔴 Open |
| 16 | `/wines` Grid view / List view toggle buttons are hardcoded English literals with no `t()` key backing — never translate in any locale | Public / Wine Catalogue | 🟢 Resolved |
| 17 | `app/actions/prices.ts` — `createPrice`/`updatePrice`/`deletePrice` bypassed tenant isolation entirely (raw `db` instead of `withTenantDb`), letting a tenant-A admin write/delete another tenant's pricing data by passing a cross-tenant `companyId`/`priceId` | Security / DB | 🟢 Resolved |
| 18 | Public site nav bar (`SiteNav.tsx`) — Georgian's two-word labels ("ჩვენ შესახებ"/About, "ღვინის შეკვეთა"/Order Wine) wrapped onto 2 lines at desktop widths, uneven with the single-word labels that couldn't wrap | Public / Nav | 🟢 Resolved |
| 19 | No protection against concurrent-traffic bursts — production hits a hard 200-connection DB ceiling around 100-150 simultaneous visitors, causing a whole-site outage (including tenant routing) that outlasted the burst by several minutes; zero rate limiting anywhere in the app | Infrastructure | 🔴 Open |
| 20 | Admin panel (`/admin`) doesn't respect tenant theme presets — the nav shell, page background, banners and most UI are hardcoded to the "Cream & wine" preset's exact hex values instead of the `--site-*` CSS vars; only isolated spots (e.g. `var(--color-brand)`) pick up the tenant's actual theme | Admin (all pages) | 🟢 Resolved |
| 21 | Same bug as #20, one level down: nearly every individual admin page body (`CompaniesClient.tsx`, `ContentClient.tsx`, `WinesClient.tsx`, `SettingsClient.tsx`, `OrdersTable.tsx` and ~15 other admin files) independently defines its own hardcoded cream-preset color constant for cards/tables/borders; two shared components used during admin editing (`HelpHint.tsx`, `EditableLongText.tsx`) carry the same bug onto tenant-facing pages too | Admin (nearly all pages) / Shared components | 🟢 Resolved |
| 22 | `app/actions/submitWineOrder.ts` computes the wine-order total entirely from client-supplied `price`/`discountPercent` values (parsed straight out of submitted form JSON) with zero server-side lookup against real `WineVintage.price`/`Company.wineDiscountPercent` — a tampered request can fabricate any total, which also becomes the literal amount charged via Flitt once a tenant has online payment enabled. Same bug class as the already-fixed masterclass-pricing issue (`Plan-SecurityAndBugFixes.md` #3) and #17, never applied here. Found via a dedicated penetration test, confirmed by direct code read. | Security / Wine Orders | 🟢 Resolved |
| 23 | `/admin` main content container hardcoded `max-w-6xl` (1152px) regardless of viewport — on wide monitors every admin page (Orders table especially) rendered narrower than the screen with wasted margin on both sides, while the table still needed its own internal horizontal scroll for its wider content | Admin (all pages) | 🟢 Resolved |

---

## Bug #19 — No protection against concurrent-traffic bursts; production hits a hard DB connection ceiling around 100–150 simultaneous visitors, causing a whole-site outage that outlasts the burst

**Severity:** Medium-High — not an active incident with ~1 real tenant today, but a real, unguarded ceiling with no warning system between "fine" and "site down for everyone." Confirmed directly against **live production**, not just estimated from localhost.
**Found:** 2026-08-12, dedicated stress test (Max's request, `FeatureLog.md` #129), first pass on localhost then repeated directly against `nikalasmarani.vercel.app` with Max's explicit go-ahead (confirmed all 61 existing production orders are fake/seed data, and production's payment module has no Flitt credentials configured) · **Status:** 🔴 Open (measured and documented, not fixed)

**Symptom, measured on live production:** read-path (page loads) stayed error-free up to 50 concurrent visitors (0.4–1.0s typical), then 7% failed at 100 concurrent and **70% failed at 150 concurrent** — worse, 67 of those failures were inside the tenant-routing middleware itself, meaning *every* route fails during the spike, not just database-heavy ones. **The site kept returning 500s for a few minutes after the test traffic had already stopped**, confirmed by a direct `pg_stat_activity` query showing the database itself back to a normal connection count (29 of 200) while the app was still erroring — some of Vercel's running app instances had their database client left in a broken state by the spike and didn't self-heal as fast as the database did. It recovered on its own within several minutes. Write-path (booking submissions) tested more conservatively up to 30 concurrent given the above — mostly stable, a few 50+ second outliers, no sustained outage at that level (not pushed further on live production).

**Root cause:** the database (Supabase) enforces a hard cap of **200 total client connections, project-wide**. `DATABASE_URL` caps each running instance of the app to `connection_limit=20` through PgBouncer. On Vercel, a traffic burst causes multiple serverless instances to spin up in parallel, each opening its own 20-connection pool — enough concurrent instances pushes the *combined* total past the database's absolute 200-connection ceiling, which then flatly refuses new connections (`FATAL: (EMAXCONN) max client connections reached, limit: 200`) rather than the softer per-instance "wait then time out" behavior (`P2028`) that a single localhost process shows. Every `withTenantDb()` call (`lib/db.ts`) opens its own transaction; a single Home page load fans out to ~8 *parallel* calls, a single booking submission chains up to 5 *sequential* calls — both draw from this same shared, cross-instance ceiling.

**Compounding factor:** confirmed by code search — there is **no rate limiting, throttling, or abuse protection anywhere in the app** (booking form, wine orders, admin login all unprotected). Nothing softens a burst before it reaches the ceiling above.

**Localhost comparison:** an earlier localhost-only pass (production-mode build, **dev** database, run from a machine geographically far from the database) showed errors starting much lower — around 50 concurrent — because of the added network latency holding each connection open longer. Production's real ceiling is meaningfully higher in absolute terms (confirmed above), but fails in a more totalizing way once reached, and the post-burst "hangover" outage was not visible at all in the localhost pass (a single local process doesn't have the multi-instance dynamic that caused it).

**Not fixed here** — this was a measurement/report pass only. See [[StressTest-2026-08-12]] for the recommended next steps (basic per-IP rate limiting, graceful failure messaging, investigating why the app's DB client doesn't self-heal as fast as the database does, and only if real traffic approaches these numbers, revisiting the pooling/scaling configuration).

---

## Bug #18 — Georgian nav labels wrapping onto 2 lines

> 🟢 **RESOLVED same day found, 2026-08-12.** Max flagged it from a screenshot of the staging Georgian homepage; diagnosed live via the dev server before touching source.

**Root cause:** same shape as bugs #8/#9 (Georgian text runs longer than English, hitting a width constraint) but manifesting as wrapping instead of overflow this time. `SiteNav.tsx`'s header content sat in a `max-w-4xl` (896px) container — enough room for English's nav labels, not quite enough for Georgian's once the full row (logo + links + book button + divider + language switcher + divider + social icons) is accounted for. When the row doesn't fit, the browser's default flex-shrink lets any label containing a space wrap onto 2 lines to save width; single-word labels (Home, Contact) have no space to wrap at, so they stayed put — producing the lopsided look in the screenshot.

**Fix:** widened the header's container `max-w-4xl` → `max-w-5xl` (896px → 1024px) and added `whitespace-nowrap` to the nav links and Book button, so a future translation running long can't silently wrap again — it would need the container to genuinely run out of room, which the width bump prevents down to the `md:` breakpoint (768px) where the layout falls back to the mobile hamburger menu anyway. Confirmed safe to widen: the homepage's own content sections use `max-w-xl`/`max-w-2xl` (576–672px), narrower than the nav already — the nav bar is already the widest element on the page independent of body content width, so this doesn't introduce any new inconsistency.

**Verified live** (dev server, DOM measurements before writing to source): no wrapping and no horizontal overflow in either locale at 768px, 900px, or 1280px viewport width — the full range the desktop nav is shown at. `tsc --noEmit` clean.

---

## Bug #10 — Onboarding Contact step targeted the wrong store

> 🟢 **RESOLVED same day found, 2026-08-07.** Found during a first-principles audit of what the onboarding wizard actually covers vs. what a tenant needs.

**Root cause:** Two separate database tables both use the field names `contact_phone`/`contact_email`/`contact_address`. `SettingsClient.tsx`'s Contact Info section (pre-existing, long-standing) writes to the `Setting` table — this is what feeds the sitewide footer/nav and the invoice email's return address. The onboarding wizard's Contact step (`saveOnboardingContactInfo()` in `app/actions/onboarding.ts`) instead wrote to the `SiteContent` table, which only ever fed the public `/contact` page's info cards. A tenant could complete the wizard's Contact step and see it marked "done" while the footer, nav, and every invoice's return address stayed blank.

**Why it went unnoticed:** real tenants (Nikalas Marani, and Staging Winery as its clone) already had the `Setting`-store fields populated through ordinary Settings-page use, predating the wizard — so the mismatch was invisible on the only two tenants that exist. It would only bite a genuinely new tenant who fills in the wizard before ever touching Settings.

**Fix:** repointed `saveOnboardingContactInfo()`'s write path and `getOnboardingStatus()`'s `contactInfoStepDone`/initial-value read path to `getSetting()`/`updateSetting()`. No backfill needed — confirmed no live tenant is in the broken state. Verified live: the wizard's Contact & Site Info step now correctly pre-fills Staging Winery's real phone/email/address (previously would have shown blank).

---

## Bug #9 — Orders page header overflow at mobile width in Georgian

> 🟢 **RESOLVED same day found, 2026-08-07.** Found incidentally while verifying the new [[Plan-OnboardingFlow|Phase 3 finish-details banner]] on mobile — unrelated to that banner itself (confirmed via element-by-element inspection, and `/admin/wines` at the same width had no overflow).

**Root cause:** `app/admin/(panel)/orders/page.tsx`'s header row (`flex items-center justify-between`, no `flex-wrap`) held the page title, the Table/Calendar toggle, and the "+ New Order" button. Georgian's longer, un-hyphenated strings for all three pushed the row to 424px against a 375px viewport — same underlying cause as bug #8, different file.

**Fix:** added `flex-wrap gap-y-2` to the outer row and `flex-wrap` to the inner button group, so the row wraps onto multiple lines instead of overflowing. Verified: `scrollWidth === clientWidth` (375 vs 375) at 375px in Georgian, screenshot-confirmed clean wrap (title → toggle → button, each on its own line).

---

## Bug #4 — Supabase connection pool exhaustion (session mode)

> 🟢 **RESOLVED.** Everything below is the original write-up, kept as history — it is written in the present tense as an open bug, so read it as "what was true then", not as current state. **Current state:** `DATABASE_URL` uses the transaction pooler (port 6543, `pgbouncer=true`) on both environments; local dev additionally sets `connection_limit=20&pool_timeout=30`. Related: Bug #6 (2026-07-29) explains why this hurt more than expected — each transaction was holding its connection for 3–4 *transatlantic* round trips. The 2026-07-29 batching refactor also cut the Home page from ~24 transactions to ~8, specifically for headroom here.

**Severity:** High — can bring down the live site under load

**Root cause:**  
`DATABASE_URL` uses port **5432** (PgBouncer session mode). In session mode, each `PrismaClient` instance holds a real Postgres connection open for its entire lifetime — it is never returned to the pool until `$disconnect()` is called, which almost never happens in a Node app.

Supabase caps session mode at **15 concurrent connections** on the current plan.

**Why it surfaced in dev:**  
Next.js hot reloading creates new module instances repeatedly without closing old ones. Each new instance creates a new `PrismaClient` → new connection → connection never released → pool fills up in ~15 hot reloads.

**Why it's a production risk:**  
Vercel deploys as serverless functions. Each cold start creates a new process → new `PrismaClient` → new connection held open. 15 simultaneous cold starts (e.g. right after a deploy) would exhaust the pool and return `EMAXCONNSESSION` to real users. With the multi-tenant model (all clients on one URL), traffic multiplies across tenants making this more likely.

**Additional contributor:**  
`proxy.ts` creates its own `new PrismaClient()` at module level (separate from the singleton in `lib/db.ts`). In dev this means 2 connections burned per hot reload instead of 1.

**Fix:**  
Switch `DATABASE_URL` to port **6543** (PgBouncer transaction mode). In transaction mode, connections are returned to the pool immediately after each query/transaction — the pool can serve hundreds of concurrent requests from 15 physical connections.

Add `?pgbouncer=true` to the URL so Prisma disables prepared statements (which don't work in transaction mode).

`DIRECT_URL` stays on port 5432 — it's only used by `prisma db push` / migrations which run once and don't need pooling.

```
DATABASE_URL="postgresql://...@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

**Resolution steps:**
1. In Supabase dashboard → Project Settings → Database, copy the **Transaction pooler** connection string (port 6543)
2. Update `saas/.env` and the matching Vercel environment variables:
   ```
   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
   ```
3. Confirm `saas/prisma/schema.prisma` datasource block has `directUrl = env("DIRECT_URL")` — if missing, add it
4. Run `npx prisma db push` (from `saas/`) to confirm it still works via the direct URL
5. Start the dev server and verify normal queries work (admin orders page is a good smoke test)
6. In `saas/proxy.ts`, replace `new PrismaClient()` at module level with the shared singleton imported from `@/lib/db` — this eliminates the second connection that bypasses the singleton guard

**Note on Bug #5 compatibility:** `SET LOCAL ROLE` and `set_config(..., true)` are transaction-scoped — they revert at `COMMIT`, the same moment PgBouncer reclaims the connection. Fixing this bug does not conflict with implementing Bug #5.

---

## Bug #5 — RLS policies deployed but never enforced (withTenantDb is a stub)

> 🟢 **RESOLVED — and the description below is now factually wrong about current code.** It states `withTenantDb` "is a stub" that "never opens a transaction". That has not been true since Sprint 3A was completed: `saas/lib/db.ts` today opens a real `$transaction`, calls `set_config('app.tenant_id', …)` and `SET LOCAL ROLE app_user`, with `{ timeout: 15000, maxWait: 10000 }` (verified by reading the file 2026-07-29). RLS is genuinely enforced. Everything below is kept as the historical write-up of the bug — do not read it as current state. Architecture reference: [[RLS-Architecture]].

**Severity:** Medium — tenant isolation is still enforced by query scoping, but the DB-level safety net is silently absent

**Background:**  
Sprint 3A (2026-06-22) deployed RLS infrastructure to Supabase via `setup-rls.ts`:
- Created `app_user` Postgres role (NOLOGIN)
- Granted SELECT/INSERT/UPDATE/DELETE on all 12 tenanted tables to `app_user`
- Created `tenant_isolation` RLS policies on all 12 tables that check `current_setting('app.tenant_id')`

The plan was for `withTenantDb` to open a `$transaction`, call `SET LOCAL ROLE app_user` + `set_config('app.tenant_id', tenantId, true)`, then run the query — forcing Postgres to enforce RLS.

**What actually happened:**  
`withTenantDb` in `saas/lib/db.ts` is a stub. It never opens a transaction and never calls `SET LOCAL ROLE`. The app connects as `postgres` (Supabase superuser), which **bypasses RLS by design** in Postgres — superusers are exempt from all row-level security policies.

```ts
// saas/lib/db.ts — current state
export async function withTenantDb<T>(tenantId, fn) {
  // comment says "future enhancement" — the $transaction + SET LOCAL ROLE was never written
  return fn(db)   // ← just passes the PrismaClient directly
}
```

**Current protection:**  
Tenant isolation relies entirely on `where: { tenantId }` in every query (one layer). The RLS second layer is set up in Supabase but dormant.

**Risk:**  
If a query somewhere accidentally omits the `tenantId` filter, it would return cross-tenant data with no DB-level catch. With one client this is undetectable; with multiple clients this is a data leak.

**Fix:**  
Implement `withTenantDb` properly in `saas/lib/db.ts`. `SET LOCAL ROLE` and `set_config(..., true)` are transaction-scoped and revert at `COMMIT` — fully compatible with PgBouncer transaction mode (Bug #4). No special handling needed.

**Resolution steps:**
1. Apply Bug #4 fix first (switch to PgBouncer transaction mode) — `withTenantDb` uses `$transaction`, which requires a pooled connection that supports transactions; transaction mode on port 6543 satisfies this
2. Replace the stub body in `saas/lib/db.ts` with the full implementation:
   ```typescript
   export async function withTenantDb<T>(
     tenantId: string,
     fn: (tx: TxClient) => Promise<T>
   ): Promise<T> {
     return db.$transaction(async (tx) => {
       await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
       await tx.$executeRaw`SET LOCAL ROLE app_user`
       return fn(tx)
     }, { timeout: 15000 })
   }
   ```
3. Run `npx tsx scripts/check-rls.ts` from `saas/` — confirms RLS is ON and `tenant_isolation` policies exist on all 12 tables (already deployed in Sprint 3A; this step just verifies nothing changed)
4. Smoke-test: load `/admin/orders`, create a booking on the public form, check `/admin/statistics` — confirm normal operation under the new transaction wrapper
5. If a second tenant is available, verify cross-tenant isolation: query an order ID belonging to tenant A while authenticated as tenant B — should return 0 rows

**Note:** Query-level `where: { tenantId }` scoping stays in place. RLS is the second enforcement layer, not a replacement.

---

## Bug #6 — Vercel functions ran in the wrong region (every page ~3s)

**Severity:** High — affected every page view for every visitor, on every tenant, since launch
**Found + fixed:** 2026-07-29 · **Status:** 🟢 Resolved

**Symptom:** every public page took ~2.9–3.4s before the first byte arrived, regardless of page, tenant, or cache state. Long assumed to be "normal for this app" — `Plan-DevProdEnvironments.md` even documented "~6s page renders are NORMAL", and a 2026-07-23 note filed it as a future optimization item.

**Root cause:** no function region was pinned (no `vercel.json`, nothing in `next.config.ts`), so Vercel's default applied and functions executed in **`iad1` (Washington DC)**. Both Supabase projects live in **`eu-central-1` (Frankfurt)**. Every database round trip crossed the Atlantic (~90ms), and `withTenantDb` needs 3–4 *sequential* round trips per transaction (`set_config`, `SET LOCAL ROLE`, the query, `COMMIT`).

**Evidence that isolated it:** a real 36-row `findMany` cost **666ms** while an *empty* transaction cost **680ms** — i.e. ~100% network latency, ~0% database work. That ruled out query design and pointed at distance. `X-Vercel-Id` confirmed it: `fra1::iad1::…` — edge in Frankfurt, compute in Washington.

**Fix:** `saas/vercel.json` with `{"regions": ["fra1"]}`. **Home TTFB ~2.93s → ~0.40s (7×); full load 5.8s → 0.49s (10×).**

**How to detect a regression:**
```bash
curl -s -D - -o /dev/null https://nikalasmarani.vercel.app/ | grep -i x-vercel-id
```
Expect `fra1::fra1::…`. A second segment of `iad1` means the region pin was lost — see MaintenanceNotes §8 for why the file's location makes that easy to do by accident.

**Related:** this also explains why Bug #4's pool pressure hurt more than expected — each transaction held its connection for 3–4 transatlantic round trips instead of microseconds.

**Wrong turn worth remembering:** the first diagnosis was that ~24 per-request DB transactions caused the delay. A batching refactor was built and **measurably changed nothing** (1,581ms → ~1,620ms), because those queries already ran in parallel. Measuring, rather than reasoning from plausibility, is what found the real cause. Full record: [[Plan-Performance]], [[Perf-Baseline-2026-07-29]].

---

## Bug #7 — Click-reveal popover clipped by an `overflow-hidden` ancestor

**Severity:** Low — cosmetic (content invisible except a 1px sliver), no data risk
**Found + fixed:** 2026-08-04 (same session as #139 Guide Mode) · **Status:** 🟢 Resolved

**Symptom:** the first version of `components/HelpHint.tsx`'s popover rendered as a plain nested `position: absolute` `<div>`. Placed inside the onboarding wizard's Individuals-pricing row (`rounded-xl border overflow-hidden` container), the popover was silently clipped by that ancestor's `overflow-hidden` — visible only as a 1px sliver at the row's bottom edge.

**This is the second occurrence of this exact bug shape** — the first was Bug-shaped issue #140 (`OrdersTable.tsx`'s status dropdown, clipped by the Orders table's `overflow-auto max-h-[70vh]` scroll wrapper). Any *new* absolutely-positioned popover/dropdown nested inside a card, scroll container, or anything with `overflow-hidden`/`overflow-auto` is at risk of this — it is not specific to onboarding or to tables.

**Fix (same as #140):** render the popover via a `document.body` portal (`createPortal`) as `position: fixed`, computed from the trigger element's own `getBoundingClientRect()`, clamped to stay within the viewport. `HelpHint.tsx` now does this by default — any future call site gets the fix for free, no special handling needed.

**How to detect a regression:** if you ever build a new popover/dropdown/tooltip from scratch instead of reusing `HelpHint.tsx` or copying its portal pattern, and it's nested inside anything with `overflow-hidden` or a bounded-scroll wrapper, check it renders fully on screen — don't assume a plain nested `absolute` div is safe.

---

## Bug #8 — Flex children don't shrink below content width (Georgian step labels overflowed into neighboring columns)

**Severity:** Low — cosmetic, mobile + Georgian only
**Found + fixed:** 2026-08-04 (same session, onboarding wizard visual redesign) · **Status:** 🟢 Resolved

**Symptom:** `StepNav.tsx`'s step icons gained always-visible labels underneath (e.g. "Companies," "Wines"). In English this fit fine. In Georgian, longer un-hyphenated words (e.g. "საკონტაქტო ინფორმაცია" for "Contact info") ran into the neighboring step's label instead of wrapping, because flexbox children default to a minimum width equal to their content's natural width — they don't shrink below that just because the parent says `flex: 1`, so the label text pushed past its column's allotted share of the row.

**Fix:** added `min-width: 0` to each step's flex column (the standard fix for this well-known flexbox default) plus `w-full break-words` on the label span itself, so long labels wrap inside their own column instead of overflowing into the next one.

**How to detect a regression:** any time a flex-row layout with `flex: 1` children holds text that varies in length by locale (Georgian text is often meaningfully longer than its English source), check Georgian at mobile width (375px) specifically — English fitting is not evidence Georgian will too. This is now the *second* Georgian-specific layout bug found this way in the onboarding wizard alone (the first was the Simple-mode `flex-wrap` overflow found in the Companies step's original UI review, same day) — worth treating "check Georgian at mobile width" as a standard step for any new admin-panel layout, not an afterthought.

---

## Bug #11 — Onboarding wizard's company creation ignored the tenant's actual modules

> 🟢 **RESOLVED same day found, 2026-08-07.** Found by Max, hands-on, testing the wizard from a genuinely fresh tenant with both Bookings and Wine Orders enabled.

**Root cause:** `createOnboardingCompany()` in `app/actions/onboarding.ts` called `createCompany(name)` with no module flags at all, so every company the wizard created silently defaulted to `isBookingCompany: true, isWineOrderCompany: false` — regardless of which modules the tenant actually had on. A tenant with only Wine Orders enabled (booking off) would still get booking-only companies from the wizard, useless for their actual purpose; a tenant with both enabled had no way to mark a company as wine-order (or both) at all.

**Fix:** `createOnboardingCompany()` now takes an explicit `{isBookingCompany, isWineOrderCompany}` argument. `CompaniesStep.tsx` only asks (a small pill selector, "Bookings"/"Wine Orders", multi-select) when the tenant has both modules on — with just one, the answer is obvious and it's set silently, no extra clicking. Verified live: a company added with both pills selected shows "Both modules" on the real `/admin/companies` page, matching exactly what manual creation there produces.

---

## Bug #12 — Post-launch nudge false-positived "needs pricing" on wine-order-only companies

> 🟢 **RESOLVED same day found, 2026-08-07.** Found while fixing #11 — pricing tiers are a booking concept (guest counts, visit pricing); wine-order companies don't use them at all, so `getFinishDetailsStatus()`'s blanket "0 price tiers → needs details" check would have flagged every wine-order-only company as incomplete forever, with no way to ever satisfy it.

**Fix:** the pricing condition in `getFinishDetailsStatus()` (`app/actions/onboarding.ts`) and the equivalent per-row check in `CompaniesClient.tsx` (`missingDetails()`) now only apply when `isBookingCompany` is true. `identificationCode` and contact-info checks stay unconditional (relevant to both company types).

---

## Bug #13 — Real Companies list page had no visual indicator for missing details

> 🟢 **RESOLVED same day found, 2026-08-07.** Max flagged this directly: clicking the finish-details banner's link lands on `/admin/companies`, but the list itself gave no way to tell which company the banner meant — "2 tiers · 0 orders" text doesn't say what's *missing*. Deliberately deferred earlier this session (see [[Plan-OnboardingFlow]] Phase 3 section) until the full scope was known, rather than patching it twice.

**Fix:** `CompaniesClient.tsx` now computes the same `missingDetails()` check used by the nudge banner (identificationCode / contact info / pricing, the last one booking-only per #12) and renders a small amber "⚠ Needs details" badge per row, with a click-reveal `HelpHint` listing exactly what's missing (e.g. "Still missing: ID code, contact info") — reusing the accessible click-reveal component already built for #139 rather than a new hover-only tooltip. No new server round-trip: the page already fetched every field needed.

---

## Bug #14 — Enhanced-booking/wine-catalogue status colors don't respect the tenant's theme

> 🟢 **RESOLVED same day found, 2026-08-07.** Max asked directly whether the public site fully respects all 10+ super-admin theme presets — audited rather than assumed (see [[Plan-OnboardingFlow]] part 12 for the full audit). Structural theming (backgrounds, borders, text, brand color) was confirmed solid everywhere; this was the one real, narrower gap found.

**Root cause:** `components/BookingForm.tsx`'s company-code-confirmed box, its "no rate for this guest count" alert, and all its plain error text — plus the same UI copy-pasted into `app/(site)/wines/WineCatalogueClient.tsx`, including its discount badge — hardcoded literal hex colors (`#f0fdf4`/`#86efac`/`#16a34a`/`#15803d` for success, `#fff8f0`/`#fca5a5`/`#b91c1c` for error). Everything else in both files was already correctly theme-aware (`var(--site-*)`) — these were the one class of exception. The theme system (`lib/themePresets.ts`) has no dedicated success/error tokens to begin with, only `bg`/`surface`/`text`/`muted`/`border`/`secondary`/`brand`.

**Fix:** rather than hand-authoring success/error color pairs for all 16 presets (11 light, 5 dark), each file now defines a small `STATUS` object that blends the semantic hue into the theme's own surface/border/text via CSS `color-mix()` — e.g. `color-mix(in srgb, #16a34a 12%, var(--site-surface))` for the success background. This keeps every status color recognizably green/red while automatically adapting to whatever tone the active preset actually has, light or dark, with no per-preset authoring needed and no new theme architecture. Verified the mechanism resolves correctly against real computed CSS on both the light default ("Cream & wine") and a dark preset ("Midnight cellar," switched on the actual test tenant via super-admin, then reverted) — on dark, the mix correctly produced a dark-green-tinted background with a bright, readable green text/border instead of the old fixed light-mint box. `tsc --noEmit` clean.

**Not fixed, deliberately out of scope:** the admin panel's own separate (and much larger, pre-existing) pattern of only theming the `--color-brand` accent and hardcoding everything else — confirmed this is consistent across every admin page, not specific to this bug, and a different-sized problem. A `hover:bg-gray-50` Tailwind literal on both files' "Enter Manually" button was also left as-is (low severity, a brief hover flash; fixing it would need JS-driven state since inline `style` can't express `:hover`).

---

## Bug #15 — Nested `<button>` on `/admin/companies` causes a hydration mismatch

**Severity:** Medium — no data loss by itself, but cost multiple clicks their effect unpredictably (row expand, tab toggle, "+ Add Booking Company") and once contributed to a stale-element-reference incident that briefly overwrote real Cookie Company data during manual testing (caught and reverted)
**Found:** 2026-08-10, while building the Playwright suite's companies-CRUD test (#147 Phase 3) · **Status:** 🔴 Open

**Root cause:** `CompaniesClient.tsx`'s per-company row summary is a `<button onClick={() => setExpandedId(...)}>` (`app/admin/(panel)/companies/CompaniesClient.tsx` ~line 733) wrapping the row's whole content, including a conditionally-rendered `<HelpHint text={...} />` (~line 757) whenever the row has a "needs details" warning. `HelpHint.tsx` itself renders its "?" trigger as its own `<button type="button">` (~line 69) — so a `<button>` ends up nested inside another `<button>`, which is invalid HTML. Browsers correct this at parse time, so React's server-rendered markup and the DOM the browser actually builds disagree, producing a hydration mismatch on every page load, in any locale. (The similarly-structured Individuals row, ~line 664-685, is safe — its `HelpHint` sits as a sibling *after* the closing `</button>`, not inside it.)

**Observed impact:** React periodically discards/rebuilds the affected DOM subtrees client-side to reconcile the mismatch, which cost clicks their effect unpredictably across the page — not one flaky element, a property of the whole page. Worked around in the Playwright test with a click-and-verify retry helper (`clickUntil()`); not fixed at the source. While diagnosing this live via `playwright-cli`, a stale cached element reference (pointing at a row that had just been rebuilt) briefly caused a real accidental edit to Cookie Company's live data — caught via the actual POST body and reverted via direct SQL, confirmed restored.

**Recommended fix:** move any row's `HelpHint` outside the row-summary `<button>` (same pattern already used correctly for the Individuals row), or make the row-summary clickable via a non-`<button>` element (e.g. a `<div role="button" tabIndex={0}>`) if `HelpHint` needs to stay visually inside it. Not fixed here — flagged this session as task chip `task_b2b8da79`, tracked separately from the Playwright suite that found it (`playwright/KNOWN-ISSUES.md` #2).

---

## Bug #16 — `/wines` Grid/List view toggle buttons are hardcoded English, no i18n

> 🟢 **RESOLVED 2026-08-12.** Fixed as part of [[Plan-I18nIntegrity]] part A, item 1 (the plan's first, well-scoped fix).

**Severity:** Low — cosmetic, Georgian-only gap; no functional impact
**Found:** 2026-08-11, while building the Playwright suite's locale-integrity test (#147 Phase 4) · **Status:** 🟢 Resolved

**Root cause:** `app/(site)/wines/WineCatalogueClient.tsx`'s view-toggle buttons (~line 726-742) set `title="Grid view"` and `title="List view"` as plain string literals — neither calls `t()` against `lib/t.ts`, so there is no Georgian (or any other locale) translation to fall back to or leak from. This is a different failure shape than the #131-class bug the new locale-integrity test guards against (a dictionary key existing but missing a `ka` row, which falls back to raw-key text or English) — here there is no key at all, so the test's raw-key-leak and console-error assertions never trip on it.

**Impact:** these two labels stay in English even when a visitor has switched the whole `/wines` page to Georgian — everything else on the page translates correctly.

**Fix:** added `wines.view.grid`/`wines.view.list` keys to `lib/t.ts` in both `en` ("Grid view"/"List view") and `ka` ("ბადის ხედი"/"სიის ხედი"), and swapped the two literal `title` strings for `t(locale, 'wines.view.grid')`/`t(locale, 'wines.view.list')` calls — `locale` was already in scope in the component. Verified directly: a standalone script importing `lib/t.ts` confirmed both keys resolve correctly for `en` and `ka`. `npx tsc --noEmit` clean. New `scripts/check-i18n-parity.ts` (built same session, part B1 of the same plan) confirms `t.ts` is at full 119/119 key parity, including these two. Originally flagged as task chip `task_c0ea7d95`, found and documented in `playwright/notes/11-locale-integrity.md` and `playwright/KNOWN-ISSUES.md`.

---

## Bug #17 — `prices.ts` bypassed tenant isolation (raw `db` instead of `withTenantDb`)

> 🟢 **RESOLVED same day found, 2026-08-12.** Found during the full architecture/flow review earlier this session ([[ArchitectureReview-2026-08-12]] section 1), flagged as task chip `task_262c73ba`, then fixed with Max's explicit go-ahead.

**Severity:** High — a real cross-tenant write path, not a hypothetical. Would have let any tenant-A admin write or delete another tenant's pricing data today, with 2 real tenants on the platform.

**Root cause:** `app/actions/prices.ts` — `createPrice`, `updatePrice`, `deletePrice` — called the raw Prisma client (`db.price.*`) directly instead of going through `withTenantDb` (`lib/db.ts`), the tenant-isolation wrapper every other tenant-scoped action uses (see [[RLS-Architecture]]). They were guarded only by `requireAdmin()` (`lib/requireAdmin.ts`), which takes no arguments and only checks that the *calling admin's own* tenant matches the current request's domain — it never validated that the `companyId`/`priceId` *argument* passed into these functions belonged to that tenant. `Price` has no `tenantId` column of its own; its RLS policy is JOIN-based against `Company.tenantId`. Because these three functions never called `withTenantDb` (which does `SET LOCAL ROLE app_user` before querying), they ran as the raw `postgres`-role connection, which bypasses RLS by design (superuser). Only `setDisplayPrice` in the same file already did this correctly (`price.company.tenantId !== tenantId` check) — that was the reference pattern for the fix. `onboarding.ts`'s `createOnboardingCompany()`/`addIndividualsPriceTier()` both call into `createPrice`, so they inherited the gap without knowing it (harmless in practice there, since both always pass a same-tenant `companyId` — the risk was a direct/crafted call, e.g. via devtools network tab).

**Adversarial verification (same review session, before the fix):** a second agent was sent specifically to try to disprove the finding and could not — confirmed these are real Next.js Server Actions, directly invocable by an authenticated tenant-A admin with an arbitrary tenant-B ID, bypassing the UI entirely. That pass also surfaced that `scripts/setup-rls.ts` only ever runs `ENABLE ROW LEVEL SECURITY`, never `FORCE ROW LEVEL SECURITY` — investigated as part of this fix, see below.

**Fix:** `createPrice`, `updatePrice`, `deletePrice` now all run inside `withTenantDb(tenantId, ...)` using the admin's own resolved `tenantId` (from `getTenantId()`). Since `Price`'s RLS policy requires `EXISTS (Company WHERE company.id = price.companyId AND company.tenantId = current_setting('app.tenant_id'))`, a cross-tenant `companyId`/`priceId` argument now fails RLS automatically. On top of that, each function does an explicit ownership check before touching anything (mirrors `setDisplayPrice`'s pattern) so a cross-tenant attempt returns a friendly `{ error: 'Not found.' }` instead of a thrown Postgres RLS exception. `validateTier()` (the overlap-check helper) was also changed to take the transaction client instead of the raw `db`, so its read is tenant-scoped too.

**`FORCE ROW LEVEL SECURITY` investigation:** the review session's adversarial pass had flagged this as a second, independent reason unwrapped queries bypass RLS (Postgres `ENABLE` without `FORCE` exempts a table's *owner* role, and the app's Prisma connection owns every table). Queried `pg_roles` against the **dev** database directly: `postgres` has `rolbypassrls = true`. A Postgres role with `rolbypassrls = true` ignores RLS regardless of `FORCE` — `FORCE` only removes the owner-exemption, it does not touch genuine `BYPASSRLS`/superuser status. So adding `FORCE ROW LEVEL SECURITY` to `setup-rls.ts` would change **nothing** for this connection today — it was **not** added. This corrects the review doc's speculation, which had correctly identified the mechanism but hadn't yet confirmed which case actually applies here. If `DATABASE_URL` is ever pointed at a role without `BYPASSRLS` (a real superuser-status change, not something planned), this should be revisited.

**Verification:** `npx tsc --noEmit` clean. `npx tsx scripts/check-rls.ts` confirms all 14 tenanted tables still have RLS on with policies intact (unchanged by this fix). New `scripts/test-price-rls.ts` (two-tenant pattern, modeled on `scripts/test-payment-rls.ts` per `MaintenanceNotes.md` §10 — the general `test-rls.ts` suite doesn't reliably catch a JOIN-policy miss like this one) — 10/10 checks pass, covering both the raw RLS policy directly and the fixed action functions' explicit ownership checks. Kept as a permanent addition.

**Status:** fixed and pushed to `staging` (dev database, `georgian-saas-git-staging-...vercel.app`). **Not yet merged to `master`/production** — awaiting Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #20 — Admin panel (`/admin`) doesn't respect tenant theme presets

> 🟢 **RESOLVED same day found, 2026-08-13.** Fixed together with Bug #21 in one combined pass — see the shared fix write-up after #21's root-cause section below.

**Severity:** Medium — cosmetic only (no data/security impact), but real and reproducible: a tenant on any dark preset gets a jarring light-cream admin panel, the opposite of what the super-admin theme picker promises ("Everything but the brand color is fixed by the theme").
**Found:** 2026-08-13, Max asked to verify directly after noticing it was called out (but never given its own tracked bug) inside [[KnownBugs]] Bug #14's write-up — that fix's "not fixed, deliberately out of scope" note flagged this exact gap on 2026-08-07 without logging it as its own bug · **Status:** 🟢 Resolved

**Reproduced live:** on the local dev server (Staging Winery tenant, dev DB), switched the tenant's theme in `/super-admin/tenants/[id]` from "Cream & wine" to the dark "Deep harbor" preset, saved, restarted the dev server to clear the 5-minute tenant cache, then logged into `/admin` as the tenant admin. Confirmed via computed styles: the root CSS vars updated correctly (`--site-bg: #131A22`, `--site-surface: #1B242E`, `--color-brand: #3E7FB0`), but the admin nav bar (`app/admin/(panel)/layout.tsx`) rendered with `background-color: rgb(255, 249, 243)` (`#FFF9F3`) and border `rgb(224, 212, 192)` (`#E0D4C0`) — the literal "Cream & wine" preset's surface/border hex, unchanged from before the switch. Nav link text, the page shell background, and onboarding-banner styling were all similarly hardcoded. Reverted the tenant back to "Cream & wine" afterward — no lasting change to tenant data.

**Root cause:** `app/admin/(panel)/layout.tsx` hardcodes literal hex colors for the entire admin shell (`backgroundColor: '#f0ebe3'` on the page wrapper; `#fff9f3`/`#e0d4c0` on the nav; `#a89070`/`#6b5a47` on nav text) instead of the `var(--site-bg)`/`var(--site-surface)`/`var(--site-border)`/`var(--site-muted)` tokens that `app/layout.tsx` already injects globally from `resolveTenantTheme()` (confirmed those vars *are* present and correct on `/admin` pages — only the shell ignores them). Individual admin pages follow the same pattern: a grep across `app/admin/**` found `var(--color-brand)` used in isolated spots (buttons, accent text) but almost no use of `var(--site-*)` — most page bodies rely on plain Tailwind grays/whites instead, so cards/banners/dividers stay light regardless of preset. This is the same "admin theming gap" flagged narratively (not as its own bug) inside Bug #14's write-up on 2026-08-07: "the admin panel's own separate (and much larger, pre-existing) pattern of only theming the `--color-brand` accent and hardcoding everything else — confirmed this is consistent across every admin page."

**Fixed same session** — see combined write-up after #21 below.

---

## Bug #21 — Same hardcoded-cream bug as #20, repeated independently across nearly every admin page body

> 🟢 **RESOLVED same day found, 2026-08-13.**

**Severity:** Medium — same class as #20 (cosmetic, no data/security impact), but far larger in surface area: this is the *dominant* styling pattern across the admin panel, not a handful of stragglers.
**Found:** 2026-08-13, same session as #20 — Max asked for a second subagent to specifically hunt for more theming bugs beyond the admin shell. Delegated a read-only investigation (no edits, no dev server) scoped to skip the already-known #14 (resolved) and #20 (shell) findings · **Status:** 🟢 Resolved

**Root cause:** #20 covers `app/admin/(panel)/layout.tsx` (the shared nav/shell). This bug is the same pattern one level down — nearly every individual admin page component independently defines its own local `const C = { text: '#1c1008', muted: '#6b5a47', faint: '#a89070', border: '#e0d4c0', bg: '#fff9f3', ... }` (the "Cream & wine" preset's literal token values) and uses it for real chrome — card backgrounds, borders, tab bars, input backgrounds, table rows — instead of the `var(--site-*)` tokens already available globally. Confirmed present (with line numbers) in: `companies/CompaniesClient.tsx`, `content/ContentClient.tsx`, `masterclass/MasterclassClient.tsx`, `wines/WinesClient.tsx`, `wine-orders/PackingView.tsx` + `WineOrdersClient.tsx`, `settings/SettingsClient.tsx`, `orders/CalendarView.tsx` + `OrdersFilters.tsx` + `OrdersTable.tsx` + `ViewToggle.tsx` + `[id]/OrderDetail.tsx` + `new/NewOrderForm.tsx` (plus their thin server-wrapper `page.tsx` files), `menu-items/MenuItemsClient.tsx`, `statistics/StatisticsClient.tsx` + `StatisticsV2.tsx` + `WineStatistics.tsx` + `SearchableSelect.tsx`, `app/admin/(panel)/loading.tsx` (even the loading skeleton clashes), and `app/admin/(panel)/LogoutButton.tsx`.

**Two shared components used from tenant-facing pages during admin inline-editing carry the same bug:** `components/HelpHint.tsx` (its trigger button and popover both hardcode cream hex) and `components/EditableLongText.tsx` (textarea/save/cancel/read-mode card all hardcoded) — notably its sibling `components/EditableText.tsx` already does this correctly via `var(--site-*)`, so `EditableLongText` is an inconsistency within the same component family, not a from-scratch gap.

**A working fix template already exists in the codebase:** two files in `content/` — `BackgroundsTab.tsx` and `BookingFormVisualPanel.tsx` — define the identical-shaped `C` object but point every value at `var(--site-*)`/`var(--color-brand)` instead of hex. Whoever fixes #20/#21 can copy that pattern rather than invent one.

**Also found, smaller and separate:** `components/BookingForm.tsx` and `app/(site)/wines/WineCatalogueClient.tsx`'s "Enter Manually" button uses a correctly-themed resting state but an untthemed `hover:bg-gray-50` Tailwind literal for its hover state (distinct from the already-fixed Bug #14 status badges in the same two files) — medium confidence, cosmetic, hover-only. And `components/AdminBar.tsx` uses a fixed dark-maroon edit-mode strip that never references any theme token — flagged as a product-judgment call (may be intentionally constant, like the super-admin panel's own fixed theme) rather than an assumed bug, since no doc/comment establishes intent either way.

**Confirmed clean by the same investigation:** the public-facing site (`app/(site)/**`, `SiteNav.tsx`, legal pages, `payment/result/page.tsx`) is close to fully theme-aware — the one hardcoded value found (`page.tsx`'s hero-gradient dark end) is explicitly commented in-code as deliberate.

**Fix (both #20 and #21, same combined pass, 2026-08-13):** scoped the ~36 affected files into 6 non-overlapping chunks (shell + shared components; Companies/Content/Settings; Orders — 10 files; Wines/Wine-orders/Menu-items/Masterclass; Statistics; Onboarding wizard) and ran 6 parallel subagents, each given the exact same hex→CSS-var mapping table (`#f5efe6`/`#f0ebe3`→`var(--site-bg)`, `#fff9f3`/`#fffdf9`→`var(--site-surface)`, `#1c1008`→`var(--site-text)`, `#6b5a47`→`var(--site-muted)`, `#e0d4c0`→`var(--site-border)`, `#a89070`→`var(--site-secondary)`, `#7c1d23`→`var(--color-brand)`, `#9b2429`→`var(--color-brand-hover)`), the already-correct `BackgroundsTab.tsx`/`BookingFormVisualPanel.tsx` files as a reference pattern to copy, and a strict "leave any non-table hex alone" rule to protect semantic status/success/error/warning colors and Recharts series colors from being touched. Pure color-value substitution — no logic, structure, or prop changes; final diff was exactly 185 insertions / 185 deletions across 36 files, confirming no line-count drift.

One agent made a good independent catch: `wine-orders/PackingView.tsx`'s printed packing-sheet HTML is built as a separate `window.open()` document that doesn't inherit `app/layout.tsx`'s CSS vars, so it correctly left that block's hex alone rather than silently breaking the print sheet (same "print views are intentionally plain" exception as `InvoicePrint.tsx`/`BookingSheetPrint.tsx`).

**Review pass caught 3 classes of issues the mapping table missed, all fixed by hand afterward:**
1. **A real mapping bug:** the Statistics chunk resolved `bg: '#fff9f3'` to `var(--site-bg)` instead of `var(--site-surface)` in `StatisticsClient.tsx`/`StatisticsV2.tsx`/`WineStatistics.tsx` — inconsistent with how the same `C.bg` field is used elsewhere (a card/panel surface, not the page background) and with every other file's mapping. Corrected in all three.
2. **A recurring near-miss color, `#8b4513`:** several agents independently flagged this "rust" section-header/badge accent as clearly the same bug (it plays the identical role `ContentClient.tsx`'s own `rust` field already names, which the reference files map to `var(--site-secondary)`) but didn't touch it since it wasn't an exact match to the given table. Confirmed via grep it's used identically as a section-header label color 21 times across 8 files (`MenuItemsClient.tsx`, `ContentClient.tsx`'s `rust` field, `SettingsClient.tsx` ×12, `MasterclassClient.tsx` ×2, `wine-orders/page.tsx`'s order-count badge paired with `#f5ede0`, `NewOrderForm.tsx` ×3, `OrderDetail.tsx` ×4) — mapped all of them to `var(--site-secondary)` (and `#f5ede0`→`var(--site-bg)` for the one paired badge). Similarly, `HelpHint.tsx`'s "?" trigger button used near-miss tones (`#f0e6d8`/`#8b7355`/`#d9c7a8`) for its closed state that the chunk-1 agent correctly left alone — mapped these to the same `var(--site-surface)`/`var(--site-muted)`/`var(--site-border)` its own popover already used, for consistency within the same small component.
3. **A scoping mistake, not an agent error:** I told the onboarding-wizard agent that step files (`PaymentInfoStep.tsx`, `ContentPhotosStep.tsx`, `ReviewStep.tsx`, etc.) only contained semantic colors on top of the shared `C` import, so left them out of its file list — wrong for 3 files, which had 5 more exact-table-match hardcoded surface colors alongside their semantic ones. Found via a full server-rendered-HTML sweep of every fixed route (`fetch()` + regex for the mapped hex, run against actual response bodies rather than relying on client-side rendering) and fixed directly.

**Verification:** `npx tsc --noEmit` clean throughout (before and after the manual corrections above). Live-tested on the dev server (Staging Winery tenant): confirmed the default "Cream & wine" preset renders unchanged (computed nav/shell colors matched the original hardcoded values, since the token resolves to the same hex by design — the sole visible exception being the outer page-wrapper background moving from a bespoke `#f0ebe3` to the shared `var(--site-bg)` token's `#f5efe6`, a ~2% lightness shift that aligns the admin shell with the same background used everywhere else on the "Cream & wine" preset rather than a one-off custom shade — judged a correct side-effect of the fix, not a regression). Then switched the tenant to the dark "Midnight cellar" preset (restarting the dev server to clear the 5-min tenant cache) and confirmed via computed styles that the shell, nav, and page-body cards across Orders/Companies/Statistics now correctly render dark surface/border/text (`#262220`/`#3A332C`/`#F1E9DD`). Ran a server-HTML sweep across all 10 fixed routes (`orders`, `companies`, `wines`, `wine-orders`, `menu-items`, `masterclass`, `statistics`, `content`, `settings`, `onboarding`) for any remaining mapped hex — zero unintended matches; the only hits were already-documented intentional exceptions (`WinesClient.tsx`'s `BLANK_PRODUCT` default wine-swatch color, `WineStep.tsx`'s `TYPE_COLOR` per-wine-type swatch map, both print views) plus one false positive (a real seeded wine's own data color, `"Kisi": #6b5a47`, coincidentally matching the muted-text hex). Reverted the test tenant back to "Cream & wine" afterward — no lasting change to tenant data. No console errors introduced; the only console noise throughout was expected local dev-server HMR websocket messages.

**Deliberately left out of this fix, still open:**
- `components/AdminBar.tsx`'s fixed dark-maroon edit-mode strip — ambiguous whether intentionally constant (like the super-admin panel's own fixed theme) or a bug; no doc/comment establishes intent either way, flagged for Max's call rather than guessed at.
- `app/admin/login/LoginForm.tsx` — pre-tenant-identity screen, wasn't part of the original Bug #14/#20/#21 audit scope, left alone.
- `BookingForm.tsx`/`WineCatalogueClient.tsx`'s untethered `hover:bg-gray-50` on the "Enter Manually" button (noted in #21's original write-up) — still not fixed; inline `style` can't express `:hover`, would need JS-driven state, judged not worth the added complexity for a hover-only cosmetic flash.
- Plain white (`#ffffff`) stat-card backgrounds in the Statistics pages, and `ContentClient.tsx`'s tab-strip track background (`#ede5d8`) — both flagged by review as plausibly the same bug class but lower-confidence/lower-impact judgment calls, left untouched rather than guessed at.

**Committed** 2026-09-06 in `3777b04` on `staging` (dev database), alongside the Bug #22 fix below. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #22 — Wine-order checkout trusts client-supplied price/discount, no server-side revalidation

> 🟢 **RESOLVED same day found, 2026-09-06.**

**Severity:** Critical — a customer-facing money path with zero server-side validation. Not yet live-exploitable for real payment on production specifically (Nikalas Marani's Flitt module has no credentials configured today, per Bug #19's write-up), but the stored order/total is fabricated regardless, and the payment-amount risk activates the moment any tenant turns on online payment.
**Found:** 2026-09-06, dedicated penetration test (Max's request) — see [[penetration test]] for full test design and findings. Confirmed independently by direct code read, not just the tester's report · **Status:** 🟢 Resolved

**Root cause:** `app/actions/submitWineOrder.ts` parses the submitted wine list straight from client JSON (`JSON.parse(winesJson)`, line 44) — each item carries its own client-supplied `price`, and the order subtotal is computed directly from it (`sum + w.quantity * w.price`, line 51). `discountPercent` is read the same way, straight off form data (lines 37-38), with no lookup against the real `Company.wineDiscountPercent` and no clamp (a value over 100 makes the total go negative). Neither value is ever checked against the database's real `WineVintage.price`. The resulting `totalAmount` is written to the `WineOrder` row, snapshotted per-line into `WineOrderItem.priceSnapshot`, and — for any tenant with online payment enabled — passed as the literal `amount` to `startCheckout()` (line 117), which is what Flitt actually charges. Same bug class as the already-fixed masterclass-pricing trust issue (`Plan-SecurityAndBugFixes.md` #3, "Masterclass price trusted from client") and structurally similar to #17 (a money/pricing path that skipped a server-side check) — just never applied to wine orders specifically.

**Reproduced:** a hand-crafted request (captured from the real `/wines` form's request shape, then replayed via `curl` with `price: 0.01` and `discountPercent: 99` on 5 units of a real 15₾ wine) created a real `WineOrder` row at an effectively-zero total. Test data was tagged `PENTEST-*` and deleted afterward, confirmed empty by follow-up query.

**Fix:** `submitWineOrder.ts` now fetches the real `WineVintage.price` for every `vintageId` in the order (tenant-scoped, inside the existing pattern of a `withTenantDb` call) and the company's real `wineDiscountPercent` (also tenant-scoped), and computes `subtotal`/`totalAmount` from those server-fetched values instead of the client's `w.price`/raw `discountPercent` field — mirroring the fix already applied to masterclass pricing in `createBooking.ts`. `priceSnapshot` on each `WineOrderItem` now stores the server-verified price, not the client-submitted one. Discount is clamped to 0–100 (`Math.min(realCompany.wineDiscountPercent, 100)`) as defense in depth. If a submitted `vintageId` doesn't resolve to a real, active, tenant-owned vintage, the whole order is now rejected with "One or more selected wines are no longer available" rather than silently pricing it at 0.

**Verified:** `npx tsc --noEmit` clean. Live-tested end-to-end on the dev server: installed a `window.fetch` hook (same technique the pentest used) that rewrote the outgoing request's `price` to `0.01` and `discountPercent` to `99` on a real 5-bottle order of a 15₾ wine, submitted it through the real UI, and confirmed directly in the database that the resulting order stored `totalAmount: 75` (5 × the real 15₾ price) and `discountPercent: null` — the tampered values were completely ignored, exactly as intended. Test order tagged `PENTEST-VerifyFix`, deleted afterward, confirmed removed by follow-up query.

Full write-up with all findings (including 5 lower-severity/infrastructure items and a "tested and not vulnerable" section covering cross-tenant IDOR, auth/access control, SQL injection, and XSS): [[findings]].

**Committed** 2026-09-06 in `3777b04` on `staging` (dev database), alongside the Bug #20/#21 fix. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #23 — Admin panel content container didn't stretch to full screen width

> 🟢 **RESOLVED same day found, 2026-09-09.** Max flagged it via a screenshot of `/admin/orders` on a wide monitor.

**Severity:** Low — cosmetic, no data impact, but affects every admin page.
**Found:** 2026-09-09, Max's bug list this session · **Status:** 🟢 Resolved

**Root cause:** `app/admin/(panel)/layout.tsx`'s `<main>` wrapper hardcoded `max-w-6xl` (1152px) regardless of viewport width. On a wide monitor this centered every admin page's content in a ~1152px column with large wasted margins on both sides. Separately, the Orders table's own row content (whitespace-nowrap across ~10 default columns) needs ~1411px — wider than even the 1152px cap — so the table's own `overflow-auto` wrapper also kicked in its own horizontal scrollbar. That's the "narrower AND still scrolls" symptom in Max's screenshot: two independent width constraints stacking. `OrdersTable.tsx` itself was already correct (`w-full` table inside `overflow-auto`, with the existing mobile-card fallback from Bug #9) — no changes needed there.

**Fix:** widened the container: `max-w-6xl` → `max-w-screen-2xl` (1152px → 1536px), a standard Tailwind step. Other admin pages that scope their own content narrower (e.g. Settings' inner `max-w-2xl`) are unaffected since they nest their own width inside this shared outer container.

**Verified:** measured via `getBoundingClientRect()` in the browser at 1920px (main: 1152px→1536px, table now fills width with no internal scroll for the default column set), 1280px (table fills width, internal scroll appears only where content genuinely doesn't fit — expected), 768px and 375px (no page-level horizontal overflow, mobile card view unaffected, Georgian nav labels still fine). Columns dropdown (show/hide columns) still functions correctly at the new width. `npx tsc --noEmit` clean.

**Committed** 2026-09-09 in `fee8362` on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #24 — Bug-report button overlapped the wine cart's sticky bottom bar

> 🟢 **RESOLVED same day found, 2026-09-09.** Max flagged this happening during a wine-buying flow.

**Severity:** Low — cosmetic, no data impact.
**Found:** 2026-09-09, Max's bug list this session · **Status:** 🟢 Resolved

**Root cause:** `components/BugReportWidget.tsx`'s floating trigger button (`fixed bottom:20px, right:20px`, z-index 8900) sits at the same bottom-right corner as `app/(site)/wines/WineCatalogueClient.tsx`'s sticky "add to cart" bar (`fixed bottom-0 left-0 right-0 z-40`, ~65px tall), which only appears once the cart has items. Because the widget's z-index is far higher, once the cart bar appeared the bug-report button rendered directly on top of the bar's checkout button/price text instead of clearing it.

**Fix:** the cart bar now publishes its own live height (via `ResizeObserver`, not a hardcoded number, since the bottle-list text can wrap) to a `--cart-bar-offset` CSS var on `document.documentElement`, reset to `0px` whenever the cart is empty or the component unmounts. `BugReportWidget.tsx`'s button offset changed from `bottom: 20` to `bottom: calc(20px + var(--cart-bar-offset, 0px))` — defaults to unchanged everywhere else, only lifts on the wines page when the bar is actually showing. Chosen over a global fixed offset (would waste space on every other page for a collision that only exists in one place) and over prop/context plumbing (the widget is a shared, page-unaware component mounted once per surface — a CSS var bridge is the lighter-weight fix).

**Verified:** confirmed the exact overlap first (button 652–700px vs bar 655–720px, same vertical span) at desktop and 375px mobile widths, then after the fix measured a clean ~32px gap at both. Confirmed no change with an empty cart, and confirmed the bug-report panel itself still opens/closes correctly with the cart bar showing. Grepped the app for other full-width `fixed bottom-0` bars — this cart bar is the only one; admin slide-overs and the wine drawer are all side/full-screen overlays, unaffected. `npx tsc --noEmit` clean.

**Committed** 2026-09-09 in `3c38a2d` on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #25 — Wine catalogue Type/Style/Year filters didn't respect each other

> 🟢 **RESOLVED same day found, 2026-09-09.**

**Severity:** Low-Medium — no data impact, but a confusing dead click for real customers on `/wines`.
**Found:** 2026-09-09, Max's bug list this session · **Status:** 🟢 Resolved

**Root cause:** `app/(site)/wines/WineCatalogueClient.tsx`'s 3 filter pill groups (Type, Style, Year) each computed their available options from the FULL wine list independently of the other two active filters. Example: a winery with Red-2023 but no Red-2022 — selecting Type=Red still showed "2022" as a normal clickable Year pill (some wine somewhere is 2022), and clicking it silently produced zero results.

**Fix:** added 3 cross-filter matcher helpers, each checking only the OTHER two dimensions (never its own), and a `disabled` flag per pill option computed against them. Disabled options stay visible with their label (not hidden) but render grayed (`opacity: 0.4`, `cursor: not-allowed`, themed via the same `C.border`/`C.muted` tokens already used for inactive pills) and their click is a no-op. The active pill and "All" are hardcoded never-disabled.

**Verified:** live on the dev server with a real cross-filter gap (one Red/2026/Dry/Sparkling wine, separate White/Amber wines in other years) — selecting Type=Red grayed out every Year except 2026 and grayed "Semi-dry" style; clicking a grayed Year pill did nothing; selecting a valid Year then correctly grayed out other Types with no wine in that year, confirming reciprocal cross-respect. `npx tsc --noEmit` clean.

**Committed** 2026-09-09 in `7aba432` on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---
