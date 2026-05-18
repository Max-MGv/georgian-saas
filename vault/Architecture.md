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
- **Customer** — visits the public booking page, fills in the form, submits. No login required.
- **Admin** — logs into `/admin` with email + password to manage orders, companies, prices, and statistics.

---

## Next.js
- type: framework
- connects-to: Prisma

The main application framework. Holds all the pages and the backend logic.

**What it does:**
- Serves the public booking page (customer-facing)
- Serves the admin panel (password-protected)
- Handles form submissions and data queries via API routes

**If it breaks locally:** restart with `npm run dev` in the `saas/` folder.

**Key folders inside Next.js:**
- `app/(public)/` — customer-facing pages
- `app/admin/` — admin panel pages
- `app/api/` — backend logic (form submissions, data fetching)
- `components/` — reusable UI pieces

---

## Prisma
- type: service
- connects-to: Supabase DB

The translator between the app and the database. You write TypeScript, Prisma turns it into SQL and talks to Supabase.

**Key files:**
- `prisma/schema.prisma` — defines all tables and columns. Edit this to change DB structure.
- `prisma/migrations/` — history of every DB change ever made. Like git for the database.
- `app/generated/prisma/` — auto-generated code. Never edit manually.

**Common commands:**
- `npx prisma migrate dev --name description` — apply schema changes to the DB
- `npx prisma generate` — regenerate TypeScript types after schema change
- `npx prisma studio` — open a visual browser of your database data

**If it breaks:**
- Can't reach DB → check `DATABASE_URL` in `.env`, make sure you're using the session pooler URL
- Types wrong → run `npx prisma generate`
- Schema out of sync → run `npx prisma migrate dev`

---

## Supabase Auth
- type: auth
- connects-to: Next.js

Handles the admin login system. Stores admin user accounts, manages sessions (who is logged in), and protects the `/admin` routes.

**How it works:**
- Admin visits `/admin/login`, enters email + password
- Supabase Auth verifies credentials and returns a session token
- Next.js checks for this token on every `/admin` page — if missing, redirects to login

**If it breaks:**
- Admin can't log in → check Supabase Auth settings in the Supabase dashboard → Authentication tab
- Session expiring too fast → adjust JWT expiry in Supabase Auth settings

---

## Supabase DB
- type: database
- connects-to:

The actual database where all data is stored. PostgreSQL running on Supabase's servers.

**Tables:**
- `Company` — partner tour operators and agencies
- `Order` — every booking (name, date, guests, visit type, price, company)
- `Price` — per-company pricing tiers based on group size

**To browse data visually:** go to supabase.com → your project → Table Editor.

**If it breaks:**
- Connection error → check the session pooler URL in credentials.txt, paste into `.env`
- Data looks wrong → check Table Editor in Supabase dashboard
- Accidental deletion → Supabase free tier keeps 24h of backups (Pro plan has daily backups)

---

## Booking Form
- type: page
- connects-to: Next.js

The public-facing page at `localhost:3000`. Customers use it to request a booking — no login needed.

**What it does:** Collects name, date, time, guest count, visit type, and contact info. Calculates price live. On submit, saves a row to the Order table in Supabase and shows a confirmation message.

**To verify it works:** Submit a test booking → check Supabase Table Editor → Order table should have a new row.

**If it breaks:** Check the browser console for errors. Most likely cause is a lost DB connection — restart the dev server.

---

## Admin Panel
- type: page
- connects-to: Next.js, Companies Admin, Orders Admin, Statistics

The password-protected management interface at `localhost:3000/admin`. Only accessible after logging in via Supabase Auth.

**What's built:**
- Login / logout (Supabase Auth)
- Navigation: Orders, Companies, Statistics
- Orders list with date + company filters and revenue total
- Companies CRUD with inline add / edit / delete
- Price tiers per company — expandable rows, overlap and min/max validation

**What's not built yet:** Statistics page, order edit/delete, deploy to Vercel.

**If you get locked out:** Go to supabase.com → Authentication → Users → reset your password.

---

## Seed Script
- type: tool
- connects-to: Next.js

A developer-only script at `scripts/seed.ts`. Run with `npx tsx scripts/seed.ts` to populate the database with realistic test orders.

**How it fits the pipeline:**

Normal customer flow: Browser → Booking Form → HTTP → `createBooking()` → Prisma → DB

Seed script flow: Seed Script → `createBooking()` → Prisma → DB

It enters the pipeline at the same point as a real submission — skipping only the browser and HTTP layer (which are just delivery mechanisms). Every validation, price calculation, and tier lookup runs identically. The data that lands in the DB is indistinguishable from real bookings.

**Why not write directly to Prisma in the seed?**
If you skip `createBooking()` and write rows directly, you have to manually replicate the pricing logic. If the logic changes later, the seed silently produces wrong data. Calling `createBooking()` keeps the seed permanently in sync with the real app.

**When to run it:**
- Before building the Statistics page, to have realistic data to chart
- After wiping the DB during development
- When onboarding a new client instance (with client-specific data)

---

## Companies Admin
- type: subpage
- connects-to: Prisma

Manages the list of tour companies and their per-group pricing tiers.

**What it does:**
- Add, edit, delete companies
- Each company has one or more price tiers: guest range + price per person + optional flat fee
- Tiers are validated: no overlapping ranges, min cannot exceed max
- If a company has no tiers, individual rates (50₾ / 100₾) apply automatically

**To verify:** Go to `/admin/companies`, expand a company row to see its tiers.

---

## Statistics
- type: subpage
- connects-to: Prisma

Admin page at `/admin/statistics`. Gives the winery owner a revenue and booking overview at a glance.

**What it shows:**
- 4 summary cards: total orders, total revenue, this month's orders + revenue, average order value
- Bar chart: bookings per month (last 6 months)
- Bar chart: revenue ₾ per month (last 6 months)
- Split bars: tasting vs tasting+lunch (orders + revenue)
- Split bars: individual vs company bookings (orders + revenue)
- Top companies table ranked by revenue with mini bar per row

**Data flow:** server component fetches all orders + company names from Supabase, computes all aggregates in TypeScript, passes clean typed data to a client component (Recharts needs the browser). No raw DB data reaches the client.

**To verify:** Run `npm run seed` first for test data, then open `/admin/statistics`.

---

## Orders Admin
- type: subpage
- connects-to: Prisma

Shows every booking submitted through the public form.

**What it does:**
- Table of all orders: name, date, time, guests, type, company, total price
- Filter by date range, "Upcoming" quick button, individuals only, or by company
- Inline delete with confirm; slide-over edit panel (date, time, guests, name, contact, notes)
- Revenue total updates with active filters

**To verify:** Submit a test booking on the public page, then check `/admin/orders`.
