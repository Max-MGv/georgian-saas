---
tags: [roadmap]
---

# Roadmap

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
