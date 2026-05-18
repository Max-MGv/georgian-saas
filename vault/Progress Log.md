---
tags: [log]
---

# Progress Log

Most recent entry at the top.

---

## 2026-05-18 — Order edit/delete, filter fixes, deduplication

- Order edit: slide-over panel from the right — editable fields: date, time, guests, name, phone, email, internal notes. Visit type and price locked (delete + rebook to change those)
- Order delete: inline confirm same pattern as Companies
- Fixed Prisma enum import bug — `BookingType`/`VisitType` imported as values in a client component pulled Node.js runtime into browser bundle; replaced with plain string literals
- Fixed orders filter: was not re-rendering table on filter change (useState didn't update from props). Fixed with `key` prop on OrdersTable tied to filter params
- Added "Individuals only" option to the booking type filter dropdown
- Added "Upcoming" quick button — sets dateFrom to today, highlights when active
- Removed dead "Prices" nav link (pricing lives inside Companies)
- Ran deduplication script — removed 22 duplicate orders left from running seed twice; 23 clean orders remain
- `scripts/cleanup-duplicates.ts` added for future use

**Next:** Deploy to Vercel → v1 ships

---

## 2026-05-17 — Orders list, Companies CRUD, Prices, Seed script, Statistics page

### Orders list (`/admin/orders`)
- Table with all bookings: name, date, time, guests, visit type, company, total price
- Filter by date range and by company — URL-based so filters are shareable/bookmarkable
- Live revenue total updates with filters

### Companies CRUD + Price tiers (`/admin/companies`)
- Inline add/edit/delete for companies
- Expandable rows per company showing price tiers
- Price tier form: guest range, price/person, optional flat fee
- Validation on save: no overlapping ranges, min cannot exceed max, errors shown inline

### Validations added across the app
- Price tier overlap detection (server-side, company-scoped)
- Company booking with no matching tier → clear error, booking blocked
- Booking form: at least phone or email required
- Price preview on booking form now shows actual company tier rate (not just individual rate)
- Red warning + disabled submit button when guest count falls in a tier gap
- Past dates already blocked by `min` on date input

### Seed script (`npm run seed`)
- `scripts/seed.ts` — calls `createBooking()` directly (same pipeline as real customers)
- Generates 20 individual bookings (realistic Georgian names) + 1 booking per company tier
- Dates spread across 6 months, mix of visit types — 22 orders seeded, 0 failures
- Safe to run multiple times (adds more rows each time)

### Statistics page (`/admin/statistics`)
- 4 summary cards: total orders, total revenue, this month, avg order value
- Two bar charts (Recharts): bookings per month + revenue per month, last 6 months
- Split breakdowns: tasting vs tasting+lunch, individual vs company
- Top companies table ranked by revenue with proportional mini-bars

### Other
- Removed dead `/admin/prices` nav link (pricing lives inside Companies)
- Fixed Orders nav link (was pointing to `/admin`, now `/admin/orders`)
- `tsx` installed as dev dep for running seed scripts
- `recharts` installed for statistics charts

**Next session:** Order edit/delete → Deploy to Vercel

---

## 2026-05-17 — Main app scaffolded + booking form + admin auth live

- Scaffolded main SaaS app at `georgian-saas/saas/` (Next.js 16, TypeScript, Tailwind, shadcn/ui)
- Connected Supabase: session pooler URL (port 5432 was blocked), DB password in `credentials.txt`
- Pushed Prisma schema → 3 tables live in Supabase: `Company`, `Order`, `Price`
- Architecture: each client creates their own free Supabase account — stays free forever per client
- Built public booking form (`localhost:3000`): visit type, individual vs. company, date/time, guests, live price preview, saves to DB — confirmed working end-to-end
- Colour scheme: warm parchment (`#f5efe6`), wine red (`#7c1d23`), dark brown text
- Built admin auth: login/logout, middleware protecting `/admin`, admin layout with nav
- Admin panel at `localhost:3000/admin` — login works, Orders/Companies/Prices/Statistics tabs visible
- Dashboard upgraded: Architecture tab added (tab switcher in top bar), nodes colour-coded by layer type, click any node for plain-language explanation
- **Next:** Orders list (real data from DB, filters, revenue total)

---

## 2026-05-17 — GitHub Pages live

- Converted dashboard to static export (`output: 'export'` in next.config.ts)
- Added GitHub Actions workflow (`.github/workflows/deploy.yml`) — auto-deploys on every push to master
- Made repo public, enabled GitHub Pages
- **Dashboard live at:** https://max-mgv.github.io/georgian-saas/
- Workflow: edit vault in Obsidian → `git push` → site updates in ~1 min

---

## 2026-05-17 — Repo restructure + GitHub

- Reorganised into `georgian-saas/` as the single project root
  - `vault/` — all Obsidian `.md` files (point Obsidian here)
  - `dashboard/` — Next.js app (moved from standalone `project-dashboard/`)
- Updated `VAULT_PATH` in dashboard: absolute for local dev, falls back to `../vault` relative path for production
- Initialised git, created private GitHub repo: [Max-MGv/georgian-saas](https://github.com/Max-MGv/georgian-saas)
- **Next:** connect repo to Vercel for hosted deployment of the dashboard
- **After that:** scaffold the main Georgian SaaS product (Next.js + Supabase + Prisma)

---

## 2026-05-16 — Project dashboard built + click bug fixed

- Built standalone Next.js 16 (Turbopack) app at `claude-projects/project-dashboard/`
- Tech: React Flow (`@xyflow/react`), react-markdown, Tailwind CSS
- Reads directly from this Obsidian vault — no separate data source
- **Overview view**: 4 phase nodes (MVP → v1.1 → v2 → v3) in a horizontal chain, each with progress bar
- **Phase drill-down**: click a phase → graph re-renders with section nodes
- **Detail panel**: click a section node → slide-in panel with task checklist + rendered markdown
- Parser reads `Roadmap.md` for structure, `MVP Features.md` for detail content, `Progress Log.md` for last-updated date
- Fixed click bug: moved click handling to React Flow's `onNodeClick` prop (was blocked by `elementsSelectable={false}`)
- Build passes cleanly (TypeScript + Turbopack)
- **To run:** `cd claude-projects/project-dashboard && npm run dev` → opens at `localhost:3000`
- **Next:** scaffold the main Georgian SaaS app (Next.js + Supabase + Prisma)

---

## 2026-05-16 — Project kickoff

- Defined the product vision: white-label booking + revenue CRM for small Georgian businesses
- Chose tech stack: Next.js 14, Supabase, Prisma, shadcn/ui, Vercel
- Decided on per-client-instance architecture (not multi-tenant) for MVP
- Set MVP scope: booking form + orders + companies + prices + statistics
- Created Obsidian vault with full strategy, tech, schema, roadmap, and business model docs
- **Next:** scaffold the Next.js repo and connect Supabase
