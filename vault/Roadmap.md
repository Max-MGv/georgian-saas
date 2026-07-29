---
tags: [roadmap]
---

# Roadmap

## Phase 0 — Discovery & Decisions

Complete this before writing a single line of product code.

### Product Analysis
- [x] Identify reference product (nikalasmarani.ge)
- [x] Audit all visible features on the reference site
- [ ] Walk through the full booking flow as a customer — note every step, field, and confirmation
- [ ] Document what the reference site is missing (no admin panel visible, no order management, no multi-language working end-to-end)
- [ ] Decide: what do we clone exactly vs. what do we improve?

### Feature Scope
- [x] Define MVP feature list (booking form + orders + companies + prices + statistics)
- [x] Confirm visit types in scope: tasting only (50₾/person) + tasting+meal (100₾/person)
- [x] Confirm booking form fields: name, surname, phone, email, date, time slot, guest count, visit type, company selector (individual vs. tour company)
- [x] Confirm admin panel scope: orders list, order detail, companies, prices, statistics
- [x] Decide: wine product catalogue → **Out of MVP.** Landing page has a "View Catalogue" button that goes nowhere for now.
- [x] Decide: gallery/media management → **Out of MVP.** Photos hardcoded in the site; no upload UI needed yet.
- [x] Decide: full site replacement vs. booking widget only → **Full site, but MVP = booking widget + admin only. Public site (home, about, gallery, wine catalogue) comes after.**

### Business Model
- [x] Chosen architecture: multi-tenant (single Vercel deployment + single Supabase DB, `tenantId` per row, custom domain per client — see `vault/Plan-MultiTenant.md`)
- [x] Draft pricing: 150–200 GEL setup + 50 GEL/month
- [ ] Confirm pricing with partner
- [ ] Define what "setup" includes (domain config, branding, DB seed, onboarding call?)
- [x] First client: Nikalas Marani only for now — no other targets yet
- [ ] Draft a one-paragraph sales pitch in Georgian

### Operations
- [x] Define client onboarding checklist (what steps to add a new client — updated for multi-tenant architecture):
  1. Add their domain to the Vercel project (Settings → Domains)
  2. Client points their domain DNS at Vercel
  3. Insert a row in the `tenants` table (name, domain, slug)
  4. Create their admin Supabase user, link to their `tenantId`
  5. Seed their settings (prices, min guests, payment details, branding)
  6. Done — their instance is live on their own domain
  
  *(Old plan was one Supabase + one Vercel deployment per client — replaced by single shared deployment, see `vault/Plan-MultiTenant.md`)*
- [ ] Decide: who handles client support? (you, partner, shared?)
- [ ] Decide: what SLA / uptime expectation do you offer?
- [x] Hosting path: localhost for development → Vercel when ready for first client.

---

## v1 — Core Booking & Admin (MVP)

### Setup
- [x] Create GitHub repo
- [x] `npx create-next-app@latest` with TypeScript + Tailwind
- [x] Create Supabase project, copy keys to `.env.local`
- [x] Install Prisma, define schema, push to DB
- [x] Install shadcn/ui

### Build Order
1. [x] **Booking form** (public page) — saves to Supabase, confirmed working
2. [x] **Admin auth** — login/logout working, `/admin` routes protected by middleware
3. [x] **Orders list** — table with filters (date range, individuals only, per company, upcoming button), revenue total
4. [x] **Order edit/delete** — slide-over edit panel + inline delete confirm
5. [x] **Companies CRUD** — inline add/edit/delete with expandable price tier rows
6. [x] **Prices CRUD** — per-company tiers with overlap/min-max validation, flat fee support
7. [x] **Seed script** — `scripts/seed.ts`, run via `npm run seed`
8. [x] **Statistics page** — 4 summary cards, 2 bar charts, visit type & booking type breakdown, top companies table
9. [x] **Deploy to Vercel** — live at georgian-saas-mg-productions-projects.vercel.app

### Polish before first client
- [x] Responsive design (mobile-friendly) — public site + admin panel; iOS Safari zoom fixed
- [x] Error states and loading indicators — loading skeleton, Saving…/Deleting… button text, error messages on forms
- [x] Confirm dialogs before delete (admin) — inline Yes/No in orders, companies, price tiers

### Public site (built ahead of schedule)
- [x] Route group `(site)` with shared nav + footer
- [x] Home page — hero, packages, booking form
- [x] About page — winery story, what to expect
- [x] Contact page — phone, email, location
- [x] Order Wine page — wine catalogue with grid/list toggle, reservation form
- [x] Brand assets — SVG logo, phone/email/Facebook/Instagram icons in nav
- [x] Wine orders saved to DB, visible in admin under Wine Orders tab
- [x] Wine orders admin redesign — 3-column card layout; 4-stage stepper (Pending → Confirmed → Paid → Delivered); status filter pills; colored right border per status; active step highlighted; cancel order removed

---

## v1.1 — Quality of Life

- [x] Email confirmation to customer on booking (Resend) — sandbox mode only; upgrade by verifying nikalasmarani.ge in Resend
- [x] Time slot picker blocks past hours on today's date
- [x] Guest count input bug fixed — backspace/typing works correctly, clamps to min 4
- [x] Admin settings panel (`/admin/settings`) — extensible key-value settings store
- [x] Company rate privacy — visit type cards show "Company rate" not price; price shown on success screen only (togglable)
- [x] Statistics V2 — upcoming orders cards + filters + horizontal bar charts; toggle to V1 historical breakdown
- [x] Logo replaces "Nikalas Marani" text in hero, wine catalogue, admin login, admin nav bar
- [x] Winery images downloaded from nikalasmarani.ge → `saas/public/images/` (slider, gallery, products)
- [x] Wine DB model + admin CRUD (`/admin/wines`) — create/edit/delete wines, active toggle, sort order, `force-dynamic` on public page
- [x] Wine image assignment — inline in wine edit row; `imagePath` on Wine model; catalogue shows real photos with color-gradient fallback
- [x] Split company pricing — separate tasting vs tasting+lunch ₾/person per price tier; booking auto-picks correct rate
- [x] Company identification code field — optional field on Company, shown in CRUD and on printed invoices
- [x] Payment details in admin settings — 5 bank fields (recipient name, personal number, bank name, bank code, IBAN), editable on `/admin/settings`, shown on invoices
- [x] Print invoice — printer icon on each order row; Georgian-language invoice (ინვოისი) rendered and printed via browser; `@media print` CSS isolates the invoice layout
- [x] **Send invoice by email (HTML)** — envelope icon on order row; modal shows recipient + editable message; sends Georgian invoice HTML via Resend; default message in Settings → Emails; PDF attachment to follow
- [ ] **Send invoice by email (PDF attachment)** — generate PDF of invoice and attach to the email (follow-up to HTML-only phase above)
- [x] **Invoice UI polish** — brown palette throughout, bold values vs normal labels, WebKit monospace color fix
- [x] **Order status tracking** — NEW / CONFIRMED / COMPLETED / CANCELLED pipeline statuses; yellow NEW badge; editable on detail page
- [x] **Hover preview card** — Obsidian-style floating popover on order row hover; shows key details without navigating away
- [x] **Configurable columns** — show/hide any column in orders table; dropdown stays open; sticky actions column; icon buttons
- [x] **Rate UI improvements** — rate inputs in Guest Breakdown; both rates always visible; collapse after save
- [x] **Fix date filters on admin orders** (KnownBugs #1) — filter by date range on orders page doesn't work
- [ ] Verify nikalasmarani.ge in Resend — unlock email delivery to any customer
- [ ] Gallery page — wire up slider photos and gallery photos on public site (images already in `public/images/`)
- [ ] Georgian / English language toggle
- [x] Calendar view for bookings — month grid, booking count badges, day hover preview, click-to-filter
- [x] Export orders to CSV / Excel — filter-aware CSV download

---

## v1.3 — Editable Site Content ✅ Complete

Full plan: `vault/Plan-EditableSiteContent.md`

- [x] **SiteContent DB model** — `key/value/section/label/locale`; `@@unique([key, locale])`; `prisma db push`; RLS grant
- [x] **Server actions** — `getContent`, `getContentMap`, `saveContent`, `deleteContent` in `siteContent.ts`
- [x] **Admin content editor — Text mode** — `/admin/content`; sections: Navigation / Home / Form / About / Contact; flat labeled list; click-to-edit inline; Save/Cancel per field
- [x] **Admin content editor — Visual mode** — full live page replica (nav bar + page body) inside admin; every hardcoded string is an inline `EditableText`; booking form structure rendered visually with editable labels
- [x] **Reset to default** — ↺ badge per field (only when DB value exists); tooltip shows fallback before reset; `deleteContent` wipes the row; live site reverts to hardcoded fallback
- [x] **EN/KA locale switcher** — locale tabs on both modes; saves to `site_locale` cookie; `LocaleSwitcher` in public SiteNav
- [x] **All public pages wired** — Home, About, Contact use DB values with `t()` fallback for all visible text
- [x] **SiteNav wired** — layout fetches `getContentMap('nav', locale)`; nav links + "Book a Visit" button DB-backed
- [x] **BookingForm wired** — `formContent` prop; all 14 visible labels (Booking Type, field labels, submit button, cancel policy, success messages) DB-backed

---

## v1.2 — Enhanced Company Booking (Active Plan)

Full plan: `vault/Plan-EnhancedCompanyBooking.md`

- [x] **Step 1 — DB schema**: split guest counts (lunch/tasting/free), MenuItem, MasterclassItem, OrderMasterclass, OrderExtra models
- [x] **Step 2 — Menu Items admin**: admin manages hot dish options (vegetable/meat) at `/admin/menu-items`
- [x] **Step 3 — Masterclass admin**: admin manages masterclass types + unit prices at `/admin/masterclass` (MasterclassUnit enum: PER_PERSON/PER_PIECE/FLAT)
- [x] **Step 4 — Clickable order detail**: `/admin/orders/[id]` — view + edit all enhanced fields, recalculate total
- [x] **Step 5 — Admin create order**: `/admin/orders/new` — create full company order from scratch
- [x] **Step 6 — Public form toggle**: settings toggle enables enhanced form for company bookings on public site
- [x] **Step 7 — Invoice updates**: Simple/Detailed toggle on print picker; detailed shows split guest counts, masterclass lines, extras, itemised amount breakdown

Other planned improvements:
- [x] Minimum guest count configurable per visit type in admin settings — `min_guests_tasting` + `min_guests_tasting_lunch` settings; enforced on form + server
- [x] Block dates (e.g. winery closed days) configurable in admin — `BlockedDate` DB model; Settings UI; form + server guards

---

## Security & Bug Fixes (Active Plan)

Full plan: `vault/Plan-SecurityAndBugFixes.md`

- [x] ~~**#1 Auth redirect in admin layout**~~ — `proxy.ts` handles this correctly (Next.js 16 middleware)
- [x] **#2 Auth guard on write server actions** — `lib/requireAdmin.ts` added; all 12 write action files guarded
- [x] **#3 Masterclass price trusted from client** — `createBooking` now fetches prices from DB by ID
- [x] **#4 Enhanced booking skips min-guest check** — now validates `tastingGuestCount + lunchGuestCount`
- [x] **#5 `hasDbValue` false-negative** — `children != null` check in `EditableText.tsx` line 36 correctly handles empty string (not `!children`)
- [x] **#6 `revalidatePath` missing** — `saveContent` and `deleteContent` both call `revalidatePath('/', 'layout')` in `siteContent.ts` lines 40 + 56
- [x] **#7 EditableText `<div>` wrapper** — `inlineTags` set in `EditableText.tsx` line 97 picks `span` wrapper for inline tags, `div` for block tags
- [x] **#8 Tenant/PlatformConfig exposed via public REST API** (found + fixed 2026-07-23) — RLS enabled + anon/authenticated grants revoked on both tables; verified live. Backlog follow-up: revoke PostgREST grants on the 12 tenant tables too (policy-protected today, but the API is unused for DB access entirely)

---

## v1.4 — Mobile Admin Optimization

Full plan: `vault/Plan-MobileAdmin.md`

Goal: make the admin usable on a phone for the tasks an owner does on the go (check orders, read details, update status). Not full desktop parity.

- [x] **Show password toggle on admin login** — eye icon button toggles `type="password"` / `type="text"` on the password field
- [x] **Orders list: mobile card view** — on screens < 768px, hide table and show a card per order (name, date/time, guests, visit type, status badge, total); tap card → order detail; status badge tappable inline
- [x] **Orders filter bar: collapsible on mobile** — show Upcoming button + Filters(n) toggle + Clear on mobile; expanded panel with date/company/status; desktop bar unchanged
- [ ] **Order detail: tap target audit** — verify all buttons ≥ 44px tall, no horizontal overflow
- [x] **Wine Orders: column collapse** — card columns stack vertically on mobile (flex-col md:flex-row); col borders flip from left → top on mobile

---

## v1.5 — Page Background Customization ✅ COMPLETE (2026-06-19)

Full plan: `vault/Plan-PageBackgrounds.md`

**Designed to be fully reversible** — no new DB models, no file uploads, no new routes. Uses existing `Setting` table. Public pages fall back to hardcoded images if settings are missing. Revert = one `git revert` command.

> **Implementation note:** settings use `_bg_x` / `_bg_y` / `_bg_zoom` (separate numeric keys) instead of the planned `_bg_position` / `_bg_size`. Live preview is 200×128px (not 300×200px). Home page got a full combination-style hero (logo box, per-line text pills, hover-darken overlay, button glows) rather than the planned simple overlay. About + Contact got frosted-card style heroes. See Features #75–#77.

- [x] **Backgrounds tab in `/admin/content`** — new tab alongside Text / Visual
- [x] **`BackgroundImageEditor` component** — image picker grid (from `public/images/`), X/Y position sliders, zoom slider, live preview box (200×128px updates as you drag) — implemented as `BackgroundsTab.tsx` with inline `PageBgEditor`
- [x] **Home hero wired** — reads `home_hero_bg_path/x/y/zoom`; combination hero style with hover effects; falls back to `winery1.jpg`
- [x] **About hero wired** — 300px frosted-card banner; reads `about_hero_bg_*`; falls back to `winery2.jpg`
- [x] **Contact hero wired** — 300px frosted-card banner; reads `contact_hero_bg_*`; falls back to `winery3.jpg`

---

## v1.6 — Image & Banner Quality

Findings from an industry-standards audit of how images and hero banners are handled.

- [x] **Image compression on upload** — uploaded background images now compressed with `sharp` on the server before storage: resized to max 2000px wide, converted to WebP at quality 82. Reduces typical hero image from 3–9 MB raw to ~150–300 KB.
- [x] **Tenant isolation in uploaded image storage** — uploaded images are stored at `${tenantId}/filename.webp` in Supabase Storage (previously all tenants shared one flat folder). Listing scoped to own tenant prefix; delete validates path belongs to caller's tenant.
- [x] **LCP preload hint for hero image** — `preload(activeBgPath, { as: 'image', fetchPriority: 'high' })` (React 19 API) called server-side in all three public pages; emits `<link rel="preload">` in the rendered HTML so the browser discovers the hero image immediately, before CSS is parsed.
- [x] **Responsive images via CSS media query** — dual DOM nodes (mobile + desktop divs, shown/hidden via Tailwind — both downloaded by browser) replaced with a single `<div>` per page; background-image URL is swapped via a `<style>` block with `@media (min-width: 640px)` so only the matching image is fetched.
- [x] **Next.js `<Image>` for logo** — plain `<img>` in home hero swapped for Next.js `<Image width={200} height={72} priority>` to prevent CLS and add an early fetch hint for the logo.
- [x] **Simplify background-size logic** — manual viewport math (`max(zoom*vw, zoom*1.78*vh) auto`) replaced with `background-size: cover` + `transform: scale(zoom/100)` on the background div. Consistent with how the admin preview already works.
- [x] **Alt text on uploaded images in admin grid** — thumbnails now use the filename extracted from the storage path as alt text instead of the meaningless `"Uploaded"`.

---

## v1.7 — Company Access Codes (Soft Auth)

Full plan: `vault/Plan-CompanyAccessCodes.md`

- [x] **Step 1 — DB schema**: add `contactName`, `contactPhone`, `contactEmail`, `address`, `accessCode` to Company model
- [x] **Step 2 — Server actions**: extend `updateCompany`; add `verifyCompanyCode` (public), `regenerateAccessCode` (admin)
- [x] **Step 3 — Admin slide-over panel**: replace inline company edit with full side panel; access code field with show/hide, copy, regenerate
- [x] **Step 4 — Booking form popup**: company selected → code popup → auto-fill name/phone/email; localStorage 30-day memory
- [x] **Step 5 — Wine orders company selector**: add company dropdown to wine order form; same popup → auto-fill profile fields

---

## v1.8 — Site Performance ✅ COMPLETE (2026-07-29)

Full plan: `vault/Plan-Performance.md` · Before/after measurements: `vault/Perf-Baseline-2026-07-29.md`

Triggered by Max reporting the site felt slow. Audited with Lighthouse + network timing against live production; two independent causes found and fixed the same day.

- [x] **Vercel function region pinned to `fra1`** — the big one. Functions were executing in `iad1` (Washington DC) while both Supabase projects live in `eu-central-1` (Frankfurt), so every DB round trip crossed the Atlantic. Fixed with a 4-line `saas/vercel.json`. **Home TTFB ~2.93s → ~0.40s (7×); full load 5.8s → 0.49s (10×).** See MaintenanceNotes §8 — the file must stay in `saas/`, not the repo root.
- [x] **Wine product photos compressed** — 6 files in `public/images/products/` were camera-resolution originals (2991×2990px, ~2.15MB each) rendered into a 362×176px thumbnail; 98% wasted bytes. Resized to 750px + max PNG compression. **7.5MB → 1.06MB (86% smaller); `/wines` LCP 15.5s → 2.7s.**
- [x] **Settings/content reads batched per request** — Home page ~24 DB transactions → ~8. Kept for connection-pool headroom (see KnownBugs #4), **not** as a speed fix — it measurably did not change wall-clock time.
- [x] ~~**Data-layer caching (`unstable_cache` + `revalidateTag`)**~~ — **deliberately dropped.** Planned and approved, then abandoned once the real cause was found: it was scoped to remove a ~3s database wait that no longer exists, and would have added staleness plus cross-tenant cache-key risk for no gain.

Remaining, not urgent:
- [ ] **Wine photos → WebP** — Lighthouse estimates a further ~790KB on `/wines`. Kept as PNG deliberately (transparent backgrounds). Only worth it if that page needs more.
- [ ] **Admin edit mode not directly verified** against the batching refactor — covered by inference (same content map, proven equivalent), not observation. Worth a glance next time the home page text is edited in the admin.

---

## Draft Ideas / Backlog (not planned yet — notes only)

These are rough ideas, not committed features. Scope and approach TBD.

- [x] ~~**Company soft-auth / access codes**~~ → promoted to v1.7
- [x] **Google Maps embed on Contact page** — `maps_embed_url` setting, editable in Settings; iframe embed replaces the old placeholder.
- [x] **Development / staging environment** (#79, built 2026-07-23) — dev Supabase project + `staging` branch → stable preview URL on dev DB; prisma migrate baseline; NM-clone staging tenant; E2E isolation verified. See `Plan-DevProdEnvironments.md` for the daily workflow.
- [x] **Editable social / contact links in admin** — `contact_facebook`, `contact_instagram`, `contact_email`, `contact_phone`, `contact_address` settings editable in Settings → Contact section.
- [ ] **Forgot password for admins** — "Forgot password" flow on the admin login page; sends a reset link to Max or the company rep's email. *(Checked 2026-07-21: super-admin → Users has a manual "Set password" override (Max can set any admin's password directly), but there's no self-service email-based reset flow on `/admin/login` itself. Still open — kept for a client admin who's locked out without Max around.)*
- [x] **Feature flags panel (for Max)** — `modulesBooking` / `modulesWineOrders` / `modulesPublicSite` toggles on the Tenant model, set per-tenant in super-admin's Edit Tenant form; enforced via proxy headers + admin nav filtering + route guards. (Public Website toggle is a hard kill-switch to `/coming-soon` rather than granular per-section hiding.)
- [x] **Printable daily booking sheet** (#141, built 2026-07-26) — "Print Sheet" button in the Orders page filter toolbar (next to Export CSV) opens a preview modal, then prints a landscape-A4 table via `BookingSheetPrint.tsx`: one row per booking (date/time, tasting/lunch/extra guest counts, hot dish veg/meat, food notes, notes, company, contact name/phone), sorted chronologically, scoped to whatever date/company/status filters are active on the page.
- [ ] **Printable wine packing stickers** — NOT the box-summary sheet (that already exists in Wine Orders → Pack mode → Print). This is per-bottle/per-case sticker labels showing which wine + which company the order belongs to, for physically labeling bottles/boxes before dispatch. Not started yet. *(Draft: sticker size/layout, one sticker per bottle vs. per case, printer type TBD)*
- [ ] **Wine orders — total upcoming bottles banner** — sticky or top-of-page summary on the wine orders admin page showing total bottles per wine across all non-delivered orders, so employees can see packing totals at a glance without printing. *(Draft: filter scope TBD — all pending, or configurable date range?)*
- [ ] **Move NM's logo into Supabase Storage** — `Tenant.logoUrl` for Nikalas Marani still points at the shared `/icons/logo-dark.svg` repo file; upload it to the `logos` bucket like every other tenant logo so no tenant identity lives in shared public assets. *(Deferred from #125)*
- [ ] **Georgian translations for neutral fallback strings** — the neutral fallbacks introduced in #125 are English-only; a tenant with no ka content rows shows English fallbacks on the KA site. *(Deferred from #125 — low priority until a client actually launches Georgian-first with no content entered)*
- [x] **Wine catalogue filters (color, type/style)** — Type (Red/White/Amber/Rosé) + Style (Dry/Semi-dry/Semi-sweet/Sweet/Sparkling) pill rows on the public `/wines` page; AND-combined, client-side. Built with #116 Wine hierarchy (2026-07-17).

---

## v2 — Growth Features

- [ ] Online payments (Georgian bank integration or Stripe)
- [ ] Customer can view/cancel their own booking
- [ ] Multiple admin users with roles
- [ ] Availability limits (max bookings per time slot)

---

## v3 — Platform

Full plan: `vault/Plan-MultiTenant.md`

**Sprint 1** (safe, additive): ✅ DONE 2026-06-22
- [x] `tenants` table + seed with current client
- [x] Middleware resolves `tenantId` from `Host` header
- [x] Nullable `tenantId` column on every table + backfill

**Sprint 2** (the big flip): ✅ DONE 2026-06-22
- [x] All server actions + DB queries scoped by `tenantId`

**Sprint 3** (independent, any order): ✅ DONE as part of Sprint 2
- [x] SiteContent scoped per tenant
- [x] Settings scoped per tenant
- [x] BlockedDates scoped per tenant

**Sprint 3A — RLS structural enforcement**: ✅ DONE 2026-06-22
- [x] `withTenantDb(tenantId, fn)` wrapper in `lib/db.ts` — every transaction voluntarily downgrades to `app_user` role, enabling RLS
- [x] `app_user` Postgres role created (NOLOGIN), granted to `postgres`
- [x] `tenant_isolation` RLS policy deployed on all 12 tables (9 direct, 3 via JOIN)
- [x] All 25 files (13 actions + 12 pages) updated to use `withTenantDb`
- [x] 21/21 DB integration tests pass; cross-tenant isolation confirmed; 0 TypeScript errors
- [x] See `vault/RLS-Architecture.md` for full setup reference

**Sprint 4:** ✅ DONE 2026-06-25
- [x] Per-tenant admin auth (Supabase user tied to `tenantId`)
  - `app_metadata.role = 'super_admin'` → bypasses tenant check (Max's account)
  - `app_metadata.tenantId` → must match domain's tenant (client admin accounts)
  - `requireAdmin.ts` + `proxy.ts` both enforce; `set-admin` script provisions users

**Theming:** ✅ DONE 2026-06-25
- [x] `theme Json?` column on `tenants` table (`prisma db push`)
- [x] `--color-brand` + `--color-brand-hover` CSS variables defined in `globals.css`
- [x] All 56 hardcoded `#7c1d23` / `#9b2429` uses in 32 files replaced with CSS variables (emails kept as hex — email clients don't support CSS vars)
- [x] `proxy.ts` reads tenant theme from DB (cached), forwards as `x-tenant-brand` / `x-tenant-brand-hover` request headers
- [x] `app/layout.tsx` injects `<style>:root { --color-brand: X; }</style>` per tenant — zero flash, server-side
- [x] `scripts/seed-theme.ts` — sets nikalasmarani.ge theme in DB (run `npx tsx scripts/seed-theme.ts`)

**Super-admin UI:** ✅ DONE 2026-06-26, extended 2026-07-17
- [x] `/super-admin` route (super_admin only, proxy-guarded) — dark platform-layer theme
- [x] Tenants list — all tenants with brand color swatches, order/company/wine-order stats, "Open ↗" live-site link, edit/delete (delete blocked while tenant has any orders/companies/wine orders/wines)
- [x] Add/edit tenant — name, domain, slug, tenant ID + copy button, brand color picker (react-colorful wheel + hex), live preview, module toggle checkboxes
- [x] Users page — list all Supabase users with role badges; change role (confirmed working — role-clear bug fixed 2026-07-17); remove access (with confirm step); create new admin user
- [x] Login redirect — super_admin lands on `/super-admin` by default, not `/admin` (2026-07-17, #121)
- [x] **Per-tenant module toggles** (#120, 2026-07-17) — `modulesBooking`/`modulesWineOrders`/`modulesPublicSite` booleans on Tenant; enforced via proxy headers, admin nav filtering, and server-side route guards; Public Website module is a kill switch → `/coming-soon` page, not a widget-only mode. See `Plan-TenantModules.md`.
- [x] **Cross-tenant Orders/Bookings activity view** (#122, 2026-07-17) — `/super-admin/orders`, read-only, Bookings/Wine Orders tabs, click-through to each tenant's real admin for actions. See `Plan-SuperAdminOrdersView.md`.
- [x] **True no-tenant state + `/welcome` placeholder** (#123, 2026-07-18) — unknown domains no longer half-resolve to the default tenant; public routes → `/welcome` pitch page (KA+EN), `/super-admin` + `/admin/login` still work (platform domain = HQ). Nikalas Marani moved to `nikalasmarani.vercel.app` (own `.ge` domain pending — swap when Max gains it).

**Dynamic branding (logo, favicon, display name):** ✅ DONE 2026-06-26
- [x] Add `logoUrl String?`, `logoAlt String?`, `faviconUrl String?`, `displayName String?` to `Tenant` model → `prisma db push`
- [x] `proxy.ts` reads these fields, forwards as `x-tenant-logo`, `x-tenant-logo-alt`, `x-tenant-favicon`, `x-tenant-name` headers; 5-min TTL cache
- [x] `app/layout.tsx` — `generateMetadata()` for dynamic title; `<link rel="icon">` from favicon header
- [x] All 4 logo placements (public nav, home hero, admin nav, admin login) read from headers with fallback
- [x] Logo/favicon upload in **super-admin Edit Tenant form** — Supabase Storage `logos` bucket
- [x] Logo/favicon upload in **client's own `/admin/settings`** — Branding section
- [x] Run `npx tsx scripts/seed-branding.ts` — ✅ done 2026-06-26

**When ready:**
- [ ] First new client onboarding (Vercel domain, DB row, admin login)
- [ ] Self-service onboarding (client signs up, sets up their own instance)
- [ ] Billing dashboard

---

## Client Pipeline

| Client | Type | Status |
|---|---|---|
| Nikalas Marani | Winery | Reference product (family) |
| Next target | Winery | Prospect |

---

## Related

- [[MVP Features]]
- [[Business Model]]
