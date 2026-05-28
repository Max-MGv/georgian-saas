---
tags: [architecture, tech]
---

# System Architecture

This file drives the Architecture view in the project dashboard. Each `##` heading is a node in the diagram. The `connects-to` property draws arrows. Everything below the properties appears in the detail panel when you click a node.

---

## Browser
- type: client
- connects-to: Supabase Auth

The user's web browser — Chrome, Safari, etc. Both the customer booking page and the admin panel run here. No setup needed.

**There are two types of users:**
- **Customer** — visits the public winery site, fills in the booking form. No login required.
- **Admin** — logs into `/admin` with email + password to manage orders, companies, wines, settings, and statistics.

---

## Next.js
- type: framework
- connects-to: Prisma, Resend

The main application framework. Holds all pages, server actions, and backend logic.

**Public site (`app/(site)/`):**
- `/` — Home: hero, packages, booking form
- `/about` — Winery story
- `/contact` — Phone, email, location
- `/wines` — Wine catalogue (dynamic, reads from DB)

**Admin panel (`app/admin/`):**
- `/admin/orders` — All bookings with filters; print invoice; edit/delete
- `/admin/orders/[id]` — *(planned v1.2)* Order detail with enhanced fields
- `/admin/orders/new` — *(planned v1.2)* Create full company order
- `/admin/companies` — Company CRUD + price tiers per company
- `/admin/wines` — Wine catalogue CRUD + image assignment
- `/admin/menu-items` — Hot dish options CRUD (vegetable / meat sections)
- `/admin/masterclass` — Masterclass types + unit pricing (PER_PERSON / PER_PIECE / FLAT)
- `/admin/wine-orders` — B2B wine reservation requests
- `/admin/statistics` — Revenue + booking analytics (V2 default, V1 toggle)
- `/admin/settings` — App settings: price visibility, payment details, booking form toggle

**Server actions (`app/actions/`):**
- `createBooking.ts` — public booking submission + price calc
- `orders.ts` — edit, delete, update order
- `companies.ts` — company CRUD
- `prices.ts` — price tier CRUD
- `wines.ts` — wine CRUD
- `settings.ts` — read/write settings (key-value)
- `menuItems.ts` — hot dish CRUD (create/update/delete MenuItem)
- `masterclassItems.ts` — masterclass CRUD (create/update/delete MasterclassItem)
- `orderExtras.ts` — *(planned v1.2 Step 4)* order extra charges
- `orderMasterclass.ts` — *(planned v1.2 Step 4)* add/remove masterclass lines per order

**Key files:**
- `app/globals.css` — global styles including `@media print` for invoice
- `app/admin/orders/InvoicePrint.tsx` — Georgian invoice layout component

**If it breaks locally:** restart with `npm run dev` in the `saas/` folder.

---

## Prisma
- type: service
- connects-to: Supabase DB

The translator between the app and the database.

**Key files:**
- `prisma/schema.prisma` — defines all tables and columns
- `app/generated/prisma/` — auto-generated types, never edit manually

**Common commands (Windows — stop dev server first for `generate`):**
- `npx prisma db push --skip-generate` — apply schema changes to DB
- `npx prisma generate` — regenerate TypeScript types
- `npx prisma studio` — visual DB browser

**If it breaks:**
- EPERM on Windows → dev server is holding the DLL — stop it first, generate, restart
- Types wrong → run `npx prisma generate`
- Schema out of sync → run `npx prisma db push`

---

## Supabase Auth
- type: auth
- connects-to: Next.js

Handles the admin login system. Admin visits `/admin/login`, enters email + password; middleware protects all `/admin` routes.

**If locked out:** supabase.com → Authentication → Users → reset password.

---

## Supabase DB
- type: database
- connects-to:

PostgreSQL database. All application data lives here.

**Live tables:**
- `Company` — partner tour operators; has identificationCode for invoices
- `Order` — every booking; now includes split guest counts + hot dish + food notes fields
- `Price` — per-company pricing tiers; has both tasting and tasting+lunch rates
- `Wine` — wine catalogue items with image path + active/sort flags
- `WineOrder` — B2B wine reservation requests
- `Setting` — key-value config store (payment details, toggles)
- `MenuItem` — hot dish options (vegetable / meat), managed at `/admin/menu-items`
- `MasterclassItem` — masterclass types with MasterclassUnit enum + unit prices, managed at `/admin/masterclass`
- `OrderMasterclass` — junction: masterclass lines per order (quantity + price snapshot)
- `OrderExtra` — admin-entered extra charges per order (label + amount)

**To browse data:** supabase.com → Table Editor.

---

## Booking Form
- type: page
- connects-to: Next.js

Public page at `/`. Customers book a winery visit — no login needed.

**Current flow:**
- Select booking type (Individual / Company), visit type (Tasting / Tasting+Lunch), date, time, guests, contact info
- Price calculated live from company price tiers
- On submit: saves to `Order` table, sends confirmation email via Resend
- Company rate shown after booking only if admin has enabled that setting

**Planned (v1.2, Step 6):**
- Admin toggle `enable_enhanced_company_booking` → company bookings get enhanced form with split guest counts, hot dish selection, masterclass add-ons
- Individual bookings always use simple form

---

## Admin Panel
- type: page
- connects-to: Next.js, Companies Admin, Orders Admin, Statistics

Password-protected management interface at `/admin`.

**What's live:**
- Orders: table with filters (date range, company, individuals, upcoming), printer icon per row → Georgian invoice, edit slide-over, delete confirm
- Companies: inline CRUD + expandable price tiers (tasting + tasting+lunch rates per tier) + identification code field
- Wines: full CRUD at `/admin/wines` with inline image picker; active toggle, sort order
- Wine Orders: B2B reservation requests table
- Statistics: V2 default (upcoming cards + filters + bar charts), toggle to V1 historical breakdown
- Settings: price visibility toggle, 5 payment/bank detail fields for invoices

**Live (v1.2 Steps 1–3):**
- Menu Items (`/admin/menu-items`): CRUD for hot dish options (vegetable / meat sections)
- Masterclass (`/admin/masterclass`): CRUD for masterclass types + unit pricing (PER_PERSON / PER_PIECE / FLAT)

**Planned (v1.2 Steps 4–7):**
- Order detail page: click any order → full view + edit enhanced fields (guest split, hot dishes, masterclass, extras)
- Create order: full company order from scratch (`/admin/orders/new`)
- Public form toggle: `enable_enhanced_company_booking` setting switches company booking to enhanced form

---

## Seed Script
- type: tool
- connects-to: Next.js

`scripts/seed.ts` — run with `npm run seed`. Populates DB with realistic test orders and wines.

Enters the pipeline at `createBooking()` — same pricing logic, validations, and DB writes as real submissions. Data is indistinguishable from real bookings.

---

## Companies Admin
- type: subpage
- connects-to: Prisma

`/admin/companies` — manage tour companies and their pricing.

**Features:**
- Inline add/edit/delete
- Identification code field (shown on printed invoices)
- Price tiers per company: guest range + tasting price/person + tasting+lunch price/person + registration fee
- Tier validation: no overlapping ranges

---

## Statistics
- type: subpage
- connects-to: Prisma

`/admin/statistics` — revenue and booking overview.

**V2 (default):** Upcoming bookings cards, filters (year/month/company), horizontal bar charts for revenue by company.
**V1 (toggle):** Summary cards, monthly bar charts, visit type + booking type breakdowns, top companies table.

---

## Orders Admin
- type: subpage
- connects-to: Prisma

`/admin/orders` — all bookings.

**Features:**
- Table: date, time, name, type, company, guests, visit, total
- Filters: date range, company, individuals only, upcoming
- Per row: printer icon (Georgian invoice), edit (slide-over), delete (confirm)
- Revenue total updates with active filters
- *(planned v1.2 Step 4)* Click row → `/admin/orders/[id]` detail page with enhanced fields

---

## Resend
- type: service
- connects-to: Next.js

Transactional email. Sends booking confirmation after DB save. Fire-and-forget — email failure never blocks the booking.

**Current mode:** Sandbox — emails only deliver to max.mghvdliashvili@gmail.com
**To go live:** verify nikalasmarani.ge in Resend dashboard → update `from` address to `bookings@nikalasmarani.ge`

---

## Vercel CLI
- type: tool
- connects-to: Vercel

Installed globally (`npx vercel`). Linked to `mg-productions-projects/georgian-saas`.

**Useful commands:**
- `npx vercel ls` — list deployments + status (Ready / Error)
- `npx vercel logs <url>` — pull build or runtime logs
- `npx vercel inspect <url>` — full deployment details

Logged in as `max-mgv`. Run from `saas/` directory.
