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
- [x] Chosen architecture: per-client instances (separate Vercel + Supabase per client)
- [x] Draft pricing: 150–200 GEL setup + 50 GEL/month
- [ ] Confirm pricing with partner
- [ ] Define what "setup" includes (domain config, branding, DB seed, onboarding call?)
- [x] First client: Nikalas Marani only for now — no other targets yet
- [ ] Draft a one-paragraph sales pitch in Georgian

### Operations
- [x] Define client onboarding checklist (what steps to deploy a new client instance):
  1. Client creates free Supabase account (supabase.com)
  2. Client creates a new Supabase project, shares connection string with us
  3. We deploy a new Vercel project from the same GitHub repo
  4. We add the client's env vars (Supabase keys) to Vercel
  5. We run `prisma migrate deploy` to set up their DB tables
  6. Done — their instance is live
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
- [ ] **Fix date filters on admin orders** (KnownBugs #1) — filter by date range on orders page doesn't work
- [ ] Verify nikalasmarani.ge in Resend — unlock email delivery to any customer
- [ ] Gallery page — wire up slider photos and gallery photos on public site (images already in `public/images/`)
- [ ] Georgian / English language toggle
- [ ] Calendar view for bookings
- [ ] Export orders to CSV / Excel

---

## v1.2 — Enhanced Company Booking (Active Plan)

Full plan: `vault/Plan-EnhancedCompanyBooking.md`

- [ ] **Step 1 — DB schema**: split guest counts (lunch/tasting/free), MenuItem, MasterclassItem, OrderMasterclass, OrderExtra models
- [ ] **Step 2 — Menu Items admin**: admin manages hot dish options (vegetable/meat) at `/admin/menu-items`
- [ ] **Step 3 — Masterclass admin**: admin manages masterclass types + unit prices at `/admin/masterclass`
- [ ] **Step 4 — Clickable order detail**: `/admin/orders/[id]` — view + edit all enhanced fields, recalculate total
- [ ] **Step 5 — Admin create order**: `/admin/orders/new` — create full company order from scratch
- [ ] **Step 6 — Public form toggle**: settings toggle enables enhanced form for company bookings on public site
- [ ] **Step 7 — Invoice updates**: reflect split counts + masterclass/extras as line items (optional)

Other planned improvements:
- [ ] Minimum guest count configurable per visit type in admin settings
- [ ] Block dates (e.g. winery closed days) configurable in admin

---

## v2 — Growth Features

- [ ] Online payments (Georgian bank integration or Stripe)
- [ ] Customer can view/cancel their own booking
- [ ] Multiple admin users with roles
- [ ] Availability limits (max bookings per time slot)

---

## v3 — Platform

- [ ] Multi-tenant architecture (shared DB, subdomain per client)
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
