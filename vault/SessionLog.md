---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

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

## 2026-07-17 (session 3) — Feature #120 Per-tenant module toggles (full detail)

### Completed

Built the larger feature Max asked for after the #119 quick-wins review: per-tenant module toggles for Bookings / Wine Orders / Public Website. Full step-by-step build log lives in `vault/Plan-TenantModules.md` (created at the start so work could resume if the session ended mid-build — all 11 steps completed in one session, plan file left in place as a reference rather than deleted).

**Design** — 3 booleans on `Tenant` (`modulesBooking` default true, `modulesWineOrders` default false, `modulesPublicSite` default true), mirroring the existing Company-level `isBookingCompany`/`isWineOrderCompany` pattern (#117). Public Website module is a kill switch (redirects to a "coming soon" page), not a widget-only mode — Max explicitly chose this over the bigger "full site vs. booking-widget" alternative when asked.

**Enforcement (3 layers)**:
- `proxy.ts` resolves the 3 flags alongside the existing tenant fetch, forwards as headers (`x-tenant-modules-booking`, `x-tenant-modules-wine-orders`); redirects all public `(site)` routes to new `/coming-soon` page when Public Website is off (admin/super-admin routes explicitly excluded from this redirect)
- Admin nav (`admin/(panel)/layout.tsx`) filters hidden links by module
- New `lib/requireModule.ts` (`requireBookingModule`/`requireWineOrdersModule`) added as a server-side guard at the top of every gated page — Orders, Menu Items, Masterclass (booking); Wines, Wine Orders (wine); public `/wines` redirects inline to `/`. This matters because hiding a nav link doesn't stop someone deep-linking directly.

**Consistency fixes beyond the original plan** (small, done while in the area): public `SiteNav.tsx` hides the "Order Wine" link when wine module is off (threaded `wineOrdersOn` prop through `(site)/layout.tsx`); home page hero's "Order Wine" button same treatment. Without these, a disabled module would still show dead links that just bounce back.

**Shared pages made conditional instead of gated**: Statistics (`page.tsx` skips the DB query for whichever module is off; `StatisticsClient.tsx` only shows the Bookings/Wine Orders mode switcher when both are on, defaults to whichever single module is enabled) and Companies (tab switcher same treatment — hidden when only one module active). These two pages already mixed booking + wine data before this feature (statistics queries both `Order` and `WineOrder`; Companies already has Bookings/Wine Orders tabs from #117), so they got conditional sections rather than an all-or-nothing page guard.

**Super-admin tenant form** — 3 checkboxes added between Favicon and Brand colors sections in `TenantFormClient.tsx`; amber warning note when Public Website is unchecked; `getTenant`/`createTenant`/`updateTenant` in `superAdmin.ts` read/write all 3 fields.

**Critical catch during verification** — the new `modulesWineOrders` column defaulted to `false` on `db push`, and Postgres backfills that default onto existing rows too. This meant the LIVE Nikalas Marani tenant (9 real wine orders, fully active feature) would have had Wines/Wine Orders silently disappear from its own admin nav the moment this shipped, until someone manually flipped the toggle. Caught by querying the DB directly with a one-off `npx tsx` script (deleted after use) before assuming anything was fine, and fixed by setting `modulesWineOrders: true` specifically for Nikalas Marani. Restarted the dev server to clear `proxy.ts`'s in-memory tenant cache and re-verified nav/Orders/Wine Orders/Statistics/Companies all render exactly as before. **Lesson**: any new `@default` boolean on a shared table needs its value checked against existing tenants' actual usage, not just assumed safe because "it's just a new column."

**Verification boundary** — did not toggle Nikalas Marani's real `modulesPublicSite` off to test the coming-soon redirect live, even briefly, because this project has no separate dev/staging DB yet (single shared Supabase instance — see Roadmap backlog "Development / staging environment", still unchecked) and that tenant is the actual production site with real customer traffic. Verified everything else that could be checked safely: `/coming-soon` renders correctly with tenant branding when visited directly; the redirect logic itself is a 4-line boolean check following the exact pattern of 3 other route guards already live in the same `proxy.ts` function. If Max wants to see the kill-switch redirect happen live, he should trigger it himself for a few seconds when convenient.

TypeScript: 0 errors throughout.

### Files changed
- `saas/prisma/schema.prisma` — 3 new Tenant fields
- `saas/proxy.ts` — module flags resolved + forwarded, public-site kill switch redirect
- `saas/app/coming-soon/page.tsx` — NEW
- `saas/lib/requireModule.ts` — NEW
- `saas/app/admin/(panel)/layout.tsx` — nav filtered by module
- `saas/app/admin/(panel)/orders/page.tsx`, `menu-items/page.tsx`, `masterclass/page.tsx` — booking guard
- `saas/app/admin/(panel)/wines/page.tsx`, `wine-orders/page.tsx` — wine guard
- `saas/app/(site)/wines/page.tsx` — wine guard (inline redirect)
- `saas/app/(site)/layout.tsx`, `SiteNav.tsx` — wine nav link consistency
- `saas/app/(site)/page.tsx` — wine hero button consistency
- `saas/app/admin/(panel)/statistics/page.tsx` + `StatisticsClient.tsx` — conditional sections
- `saas/app/admin/(panel)/companies/page.tsx` + `CompaniesClient.tsx` — conditional tab switcher
- `saas/app/super-admin/tenants/TenantFormClient.tsx` — 3 module checkboxes
- `saas/app/actions/superAdmin.ts` — module fields in CRUD
- DB: `modulesWineOrders` backfilled `true` for Nikalas Marani specifically (one-off fix, not a migration file)
- Vault: `Plan-TenantModules.md` (NEW, full build log), `FeatureLog.md` (#120 row), `SessionLog.md` (this entry)

**#121 — Super admin login defaults to Platform.** Max noticed logging in as super_admin always landed on `/admin` (Tenant Admin), requiring an extra click on "⬡ Platform" every time. Root cause: `proxy.ts`'s login-redirect block sent every logged-in user to `/admin` regardless of role. Split into two branches — `super_admin` → `/super-admin`, tenant admin → `/admin` (unchanged). The reverse links ("← Tenant Admin" in super-admin nav, "⬡ Platform" in admin nav) already existed, so switching either direction still works, just the default landing spot flipped. One file, `saas/proxy.ts`. Browser-verified: visiting `/admin/login` while already authenticated as super_admin now redirects to `/super-admin/tenants`.

**#122 — Cross-tenant Orders/Bookings activity view.** Max asked how much effort a combined orders view in super-admin would be; scoped it as small-to-medium (read-only easy, cross-tenant write actions hard because they'd fight the RLS/`withTenantDb` architecture), wrote the scope to `vault/Plan-SuperAdminOrdersView.md`, got the go-ahead, built it.

New `/super-admin/orders` page — Bookings/Wine Orders tab switcher (kept as two tabs rather than one merged table; the two record types don't share a row shape). `getAllBookings()`/`getAllWineOrders()` in `superAdmin.ts` query `db` directly across every tenant (same RLS-bypass pattern already used by `getTenants()`'s stats) — discovered mid-build that `Order`/`WineOrder` have no Prisma relation to `Tenant`, just a plain `tenantId` string column, so tenant name/domain gets attached via a manual `Map` lookup rather than an `include`. Tenant + status filters, "Upcoming only" toggle (default on) for Bookings. Every row has an "Open ↗" link to that tenant's *real* domain admin page (`https://{domain}/admin/orders/{id}` for bookings — confirmed this route exists; `https://{domain}/admin/wine-orders` for wine orders — confirmed no per-order detail route exists there, so it links to the list) — deliberately no inline edit/status actions on this page itself, by design.

Browser-verified end to end on live Nikalas Marani data: Bookings tab defaulted to "Upcoming only" correctly showed just 1 future booking (03 Sept 2026) out of 60; unchecking showed all 60; Wine Orders tab showed all 9 with correct wine-specific status labels (Pending/Confirmed/Paid/Delivered/Cancelled vs. the booking statuses); both tabs' "Open ↗" links pointed to the correct real URLs.

TypeScript: 0 errors throughout both #121 and #122.

### Files changed (in addition to #120's list above)
- `saas/proxy.ts` — login redirect split by role (#121)
- `saas/app/actions/superAdmin.ts` — `getAllBookings`, `getAllWineOrders` (#122)
- `saas/app/super-admin/orders/page.tsx` — NEW (#122)
- `saas/app/super-admin/orders/OrdersActivityClient.tsx` — NEW (#122)
- `saas/app/super-admin/layout.tsx` — "Orders" nav link (#122)
- Vault: `Plan-SuperAdminOrdersView.md` (NEW), `FeatureLog.md` (#121, #122 rows), `MaintenanceNotes.md` §4 (NEW — tenant resolution is always single-tenant, `DEFAULT_TENANT_ID` localhost trap)

### What's next
- Max: if you want to see the "coming soon" kill-switch live, toggle Public Website off for Nikalas Marani for a few seconds yourself and check `nikalasmarani.ge` — not something to automate given it's the live site
- Max: consider whether Test Winery (`winery2.local`) is worth a hosts-file entry for local testing going forward — would make future feature verification on a non-production tenant much easier
- Bigger follow-up (not started): "full marketing site vs. booking-widget-only" was the other Public Website option Max didn't pick this round — worth revisiting if a future client wants bookings without a full site
- Bigger follow-up (not started): if the cross-tenant Orders view ever needs write actions (status change, edit) instead of click-through, that's real work against the RLS architecture — not a quick add-on to #122

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
