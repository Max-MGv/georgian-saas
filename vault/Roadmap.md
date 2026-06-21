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
- [ ] **Fix date filters on admin orders** (KnownBugs #1) — filter by date range on orders page doesn't work
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
- [ ] **#5 `hasDbValue` false-negative** — empty-string saves make reset badge disappear; pass explicit prop
- [ ] **#6 `revalidatePath` missing** — `saveContent`/`deleteContent` don't revalidate `/admin/content` or site pages
- [ ] **#7 EditableText `<div>` wrapper** — outer wrapper breaks HTML semantics when `as="span"` used inside block elements

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

## Draft Ideas / Backlog (not planned yet — notes only)

These are rough ideas, not committed features. Scope and approach TBD.

- [ ] **Company soft-auth / access codes** — companies get a one-time code (admin can regenerate or hardcode it); code entered on booking form or wine order form; valid code pre-fills company data (name, tax code, address, etc.); company profile page in admin gets extended with all order-relevant fields; admin can edit company profile. *(Draft: auth flow, code delivery method, and form UX all TBD)*
- [ ] **Editable social / contact links in admin** — admin page to change the URLs behind all contact icons (Instagram, Facebook, phone, email, etc.) so they don't need to be hardcoded. *(Draft: likely extends existing SiteContent or Settings store)*
- [ ] **Forgot password for admins** — "Forgot password" flow on the admin login page; sends a reset link to Max or the company rep's email. *(Draft: Supabase has a built-in reset flow — needs deciding who receives the email)*
- [ ] **Feature flags panel (for Max)** — internal panel where Max can toggle features on/off (e.g. hide wine orders tab, disable image backgrounds, hide masterclass section); scoped to admin UI and public site. *(Draft: list of toggleable features TBD)*
- [ ] **Printable daily booking sheet** — print/export view for employees; rows grouped by day, each row shows one booking with all relevant info (name, time, guests, visit type, company, notes). *(Draft: format and trigger TBD — browser print or PDF?)*
- [ ] **Printable wine packing sheet** — print/export view for employees; shows total bottles per wine across all upcoming orders, with breakdown of how to distribute into boxes per company order. *(Draft: box-packing logic TBD)*
- [ ] **Wine orders — total upcoming bottles banner** — sticky or top-of-page summary on the wine orders admin page showing total bottles per wine across all non-delivered orders, so employees can see packing totals at a glance without printing. *(Draft: filter scope TBD — all pending, or configurable date range?)*

---

## v2 — Growth Features

- [ ] Online payments (Georgian bank integration or Stripe)
- [ ] Customer can view/cancel their own booking
- [ ] Multiple admin users with roles
- [ ] Availability limits (max bookings per time slot)

---

## v3 — Platform

Full plan: `vault/Plan-MultiTenant.md`

**Sprint 1** (safe, additive):
- [ ] `tenants` table + seed with current client
- [ ] Middleware resolves `tenantId` from `Host` header
- [ ] Nullable `tenantId` column on every table + backfill

**Sprint 2** (the big flip):
- [ ] All server actions + DB queries scoped by `tenantId`
- [ ] Supabase RLS updated to enforce `tenantId`

**Sprint 3** (independent, any order):
- [ ] SiteContent scoped per tenant
- [ ] Settings scoped per tenant
- [ ] BlockedDates scoped per tenant

**Sprint 4:**
- [ ] Per-tenant admin auth (Supabase user tied to `tenantId`)

**Anytime:**
- [ ] Theming — `theme` JSON on `tenants` table, CSS variables

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
