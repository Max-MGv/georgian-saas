---
tags: [tech]
---

# Tech Stack

## Chosen Stack

| Layer | Tool | Why |
|---|---|---|
| Framework | **Next.js 14 (TypeScript)** | Industry standard, one language for everything, massive AI codegen support |
| Database | **PostgreSQL via Supabase** | Managed Postgres, built-in auth, row-level security, generous free tier |
| ORM | **Prisma** | Very readable schema, TypeScript integration, AI-friendly |
| UI | **shadcn/ui + Tailwind CSS** | Copy-paste components, professional look out of the box, no npm bloat |
| Deployment | **Vercel** | Near-zero DevOps, free tier, per-client deployment = new project |
| Email | **Resend** | Simple API, generous free tier for booking confirmations |

## Supabase — Cost & Capacity

**All clients share one Supabase project** (multi-tenant architecture — one DB, `tenantId` scoped per row). We manage the single Supabase account; clients never touch it.

Supabase gives us: **PostgreSQL database** (where all data lives) + **Auth** (admin login) + **Storage** (uploaded background images and logos).

### Free plan limits

| Resource | Limit |
|---|---|
| Database size | 500 MB (read-only above this) |
| File storage | 1 GB |
| Egress (bandwidth) | 5 GB/month |
| Active projects | 2 |
| Monthly active users | 50,000 |
| Edge function invocations | 500,000/month |
| Max file upload size | 50 MB |
| Automatic backups | None |

### Capacity simulation (as of 2026-07-01)

Per tenant per year: ~0.85 MB of DB data (500 bookings + 60 wine orders + indexes), ~1.7 MB of storage (8 uploaded bg images compressed to WebP ~200 KB each, plus logo/favicon).

| Scale | DB after yr 1 | DB after yr 3 | Storage | Monthly egress | Status |
|---|---|---|---|---|---|
| 10 clients | ~12 MB (2%) | ~35 MB (7%) | ~17 MB | ~770 MB | Safe |
| 30 clients | ~35 MB (7%) | ~105 MB (21%) | ~51 MB | ~2.3 GB | Safe |
| 100 clients | ~120 MB (24%) | ~360 MB (72%) | ~170 MB | ~7.7 GB | Egress over limit |

**Database and storage are not the constraint.** Egress is — every visitor fetches a hero background image (~200 KB) directly from Supabase Storage. At ~350 visits/month per winery, 30+ clients starts pushing the 5 GB egress limit.

### Upgrade trigger

At ~25–30 clients, choose one of two paths:
- **Supabase Pro ($25/month)** — 8 GB egress, 8 GB DB, 100 GB storage. Zero operational change. At 25 clients (1,250 GEL/month revenue) the cost is trivial.
- **Account sharding** — open a new Supabase + Vercel account, route new clients there, keep existing clients untouched. Free forever, but two dashboards to manage. See [[Scaling-AccountSharding]] for the full checklist and tradeoffs.

### Egress mitigation (before upgrading)

Set `Cache-Control: max-age=86400` on the Supabase Storage `backgrounds` bucket. Repeat visitors (the majority) won't re-fetch images, cutting egress by ~70%. Tenants using the default winery images (served from Vercel CDN) cost zero Supabase egress.

## Note on Python Background

You won't write deep backend code — AI handles that. Next.js API routes are where backend logic lives. Your Python instincts (reading logic, debugging) transfer — just different syntax.

## Why Not Django?

Django is great, but:
- Separate frontend still needed (React) → two codebases
- TypeScript + Next.js is what most web tutorials, templates, and AI training data use in 2024–2025
- Vercel deployment is trivially simple for Next.js

## Key Libraries to Know

```
next          → the framework
prisma        → talks to the database
@supabase/ssr → auth helpers for Next.js
shadcn/ui     → UI components
tailwindcss   → styling
recharts      → charts for statistics page
zod           → form/API validation
react-hook-form → form handling
```

## Local Dev Setup

```bash
npx create-next-app@latest georgian-saas --typescript --tailwind --app
cd georgian-saas
npx prisma init
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest init
```

## Related

- [[Database Schema]]
- [[Roadmap]]
