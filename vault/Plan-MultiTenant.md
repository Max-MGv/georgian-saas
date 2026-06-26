---
tags: [plan, architecture]
---

# Plan: Multi-Tenant Architecture

Goal: serve multiple client companies (e.g. wineries) from one codebase and one database, each on their own domain, with full data isolation.

---

## Architecture choice: Option A — Single DB, tenantId column

All clients share one Supabase DB and one Vercel deployment. Each client gets their own domain (e.g. `winery2.ge`). Middleware resolves which tenant they are from the incoming `Host` header.

**Why this over alternatives:**
- Option B (separate DB per tenant) — harder to migrate, costs more, overkill at 10 clients
- Option C (separate deployment per tenant) — doesn't scale; bugs fixed in one, forgotten in others

Supabase RLS (already in place) enforces isolation at the DB level as a safety net.

---

## Phases

### Phase 1 — Tenant foundation
**Safe to ship alone. Currently breaks nothing.**

- [ ] Create `tenants` table: `id, name, domain, slug`
- [ ] Seed with current client (`nikalasmarani.ge`)
- [ ] Write Next.js middleware that reads `Host` header → looks up `tenantId`
- [ ] Expose `tenantId` via a small helper (Next.js `headers()` or context)

Deploy and sit on it. App behaves identically — middleware just resolves to the one existing tenant.

---

### Phase 2 — DB schema: add tenantId everywhere
**Do after Phase 1. Non-breaking.**

- [ ] Add nullable `tenantId` column to every table (Prisma migration)
  - Tables: `Order`, `Company`, `Wine`, `WineOrder`, `BlockedDate`, `Setting`, `SiteContent`, `MenuItem`, `MasterclassItem`, `OrderMasterclass`, `OrderExtra`, `Price`
- [ ] Backfill all existing rows with the current tenant's ID
- [ ] Make `tenantId` non-nullable after backfill

Still breaks nothing — queries don't filter by it yet.

---

### Phase 3 — Query scoping (the "flip")
**Do after Phase 2. Do all tables in one push — half-scoped is worse than unscoped.**

- [ ] Every server action reads `tenantId` from middleware context
- [ ] Every `db.model.findMany / create / update / delete` filters or sets `tenantId`
- [ ] Full regression test: create booking, check admin, edit order, check stats — all on correct tenant

This is the highest-risk step. Test thoroughly before deploying.

---

### Phase 4 — RLS update
**Do alongside Phase 3. Pure Supabase config — no code changes.**

- [ ] Update all Supabase RLS policies to enforce `tenantId` at DB level
- [ ] If a query forgets to filter, the DB blocks it anyway

---

### Phase 5 — Scope content, settings, blocked dates
**Do after Phase 3. Each sub-step is independent.**

- [ ] **5a — SiteContent** — add `tenantId` to content rows; content editor scoped per tenant
- [ ] **5b — Settings** — each tenant has their own booking rules, email defaults, payment details
- [ ] **5c — BlockedDates** — each tenant has their own closed days

---

### Phase 6 — Per-tenant admin auth
**Do after Phase 3. Independent from Phase 5.**

- [ ] Each company gets their own Supabase user(s) tied to `tenantId`
- [ ] Admin middleware checks: is user logged in AND does their tenant match the domain?

---

### Phase 7 — Theming
**Do any time after Phase 1. Zero data-isolation risk.**

- [ ] Add `theme` JSON column to `tenants` table (primary color, logo URL, font, etc.)
- [ ] Middleware loads theme and injects as CSS variables
- [ ] No separate codebase needed per client — visual differences handled via CSS variables

---

### Phase 8 — Infrastructure + onboard first new client
**Do after all prior phases.**

- [ ] Vercel: add custom domain per new client
- [ ] DNS: client points their domain at Vercel
- [ ] Create `tenants` row for new client in DB
- [ ] Create their admin Supabase user
- [ ] Seed their settings (prices, min guests, payment details)
- [ ] New client is live

---

## Suggested sprint grouping

| Sprint     | Phases     | Notes                                 |
| ---------- | ---------- | ------------------------------------- |
| Sprint 1   | 1 + 2      | Safe, additive, no risk. ~1 day.      |
| Sprint 2   | 3 + 4      | The big flip. ~2–3 days with testing. |
| Sprint 3   | 5a, 5b, 5c | Any order, each standalone.           |
| Sprint 4   | 6          | Auth, separate concern.               |
| Anytime    | 7          | Theming, zero risk.                   |
| When ready | 8          | First new client onboarding.          |

---

## Related roadmap entry

See `vault/Roadmap.md` → v3 Platform section.
