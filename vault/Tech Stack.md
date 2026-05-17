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

## Supabase — Cost & Architecture Decision

**Each client creates their own free Supabase account.** They sign up at supabase.com, create a project, give us the connection string. We deploy their app instance pointing at their DB.

Why this works:
- Free tier per client forever (500MB storage — a winery generates ~7MB/year of booking data)
- Client owns their own data (strong trust argument for small Georgian businesses)
- Clean separation — if we part ways, their data stays with them
- We never manage their DB costs

Free tier limit to know: 2 projects per account. Since each client has their own account, this is never an issue.

Supabase gives us: **PostgreSQL database** (where all data lives) + **Auth** (admin login system).

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
