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
- connects-to: Next.js

The password-protected management interface at `localhost:3000/admin`. Only accessible after logging in.

**What's built:**
- Login / logout (Supabase Auth)
- Navigation: Orders, Companies, Prices, Statistics
- Orders page (stub — real data coming next)

**What's not built yet:** Orders list with real data, Companies, Prices, Statistics.

**If you get locked out:** Go to supabase.com → Authentication → Users → reset your password.
