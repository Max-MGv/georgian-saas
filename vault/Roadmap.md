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
- [x] Hosting path: localhost for development → Vercel when ready for first client. GitHub Pages is static-only and cannot host the main app (needs API routes + DB). Decision on hosting deferred until acceptable draft exists.

---

## v1 — Core Booking & Admin (MVP)

Estimated: 3–5 focused weekends with AI assistance.

### Setup
- [x] Create GitHub repo
- [x] `npx create-next-app@latest` with TypeScript + Tailwind
- [x] Create Supabase project, copy keys to `.env.local`
- [x] Install Prisma, define schema, push to DB
- [x] Install shadcn/ui

### Build Order
1. [x] **Booking form** (public page) — live at localhost:3000, saves to Supabase, confirmed working
2. [x] **Admin auth** — login/logout working, `/admin` routes protected by middleware
3. [ ] **Orders list** — table with filters, the core feature
4. [ ] **Order edit/delete** — modal or separate page
5. [ ] **Companies CRUD** — simple list + add/edit/delete
6. [ ] **Prices CRUD** — per-company tiers
7. [ ] **Statistics page** — summary cards + Recharts bar charts
8. [ ] **Deploy to Vercel** — connect repo, add env vars

### Polish before first client
- [ ] Responsive design (mobile-friendly)
- [ ] Error states and loading indicators
- [ ] Confirm dialogs before delete

---

## v1.1 — Quality of Life

- [ ] Email confirmation to customer on booking (Resend)
- [ ] Georgian / English language toggle
- [ ] Calendar view for bookings
- [ ] Export orders to CSV / Excel

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
