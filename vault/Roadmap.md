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
- [ ] Confirm visit types in scope: tasting only (50₾/person) + tasting+meal (100₾/person)
- [ ] Confirm booking form fields: name, surname, phone, email, date, time slot, guest count, visit type, company (optional)
- [ ] Confirm admin panel scope: orders list, order detail, companies, prices, statistics
- [ ] Decide: is wine product catalogue (6 wines shown on site) in or out of MVP?
- [ ] Decide: is gallery/media management in or out of MVP?
- [ ] Decide: is the public-facing winery page (about, gallery, contact) in or out of MVP, or is it only the booking widget?

### Business Model
- [x] Chosen architecture: per-client instances (separate Vercel + Supabase per client)
- [x] Draft pricing: 150–200 GEL setup + 50 GEL/month
- [ ] Confirm pricing with partner
- [ ] Define what "setup" includes (domain config, branding, DB seed, onboarding call?)
- [ ] Identify first 3 target clients beyond Nikalas Marani
- [ ] Draft a one-paragraph sales pitch in Georgian

### Operations
- [ ] Define client onboarding checklist (what steps to deploy a new client instance)
- [ ] Decide: who handles client support? (you, partner, shared?)
- [ ] Decide: what SLA / uptime expectation do you offer?
- [ ] Decide: domain setup — do clients bring their own domain or use a subdomain of yours?

---

## v1 — Core Booking & Admin (MVP)

Estimated: 3–5 focused weekends with AI assistance.

### Setup
- [ ] Create GitHub repo
- [ ] `npx create-next-app@latest` with TypeScript + Tailwind
- [ ] Create Supabase project, copy keys to `.env.local`
- [ ] Install Prisma, define schema, push to DB
- [ ] Install shadcn/ui

### Build Order
1. [ ] **Booking form** (public page) — good confidence boost, simplest thing
2. [ ] **Admin auth** — protect `/admin` routes with Supabase Auth
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
