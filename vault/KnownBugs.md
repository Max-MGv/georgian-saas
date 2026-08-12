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
