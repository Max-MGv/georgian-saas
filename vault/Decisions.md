---
tags: [decisions]
---

# Decisions Log

A record of key choices made and why — useful when revisiting or explaining tradeoffs.

---

## 2026-05-16 — Next.js over Django

**Chose:** Next.js 14 (TypeScript)
**Rejected:** Django + React (separate repos)
**Why:** One language for frontend + backend, industry standard for web apps in 2025, better AI codegen support, trivial Vercel deployment. Python background is an advantage for reading logic but not a constraint on stack choice.

---

## 2026-05-16 — Per-client instances over multi-tenancy

**Chose:** Separate Vercel + Supabase project per client
**Rejected:** Shared database with `tenant_id` on every table
**Why:** Simpler to build for MVP. No risk of client data mixing — important for trust in the Georgian market. Manual ~30 min setup per client is acceptable at small scale. Will revisit when 20+ clients.

---

## 2026-05-16 — Supabase over bare PostgreSQL

**Chose:** Supabase (managed Postgres)
**Rejected:** Self-hosted Postgres on VPS
**Why:** Built-in auth (saves building login from scratch), generous free tier, no server management, row-level security for future multi-tenant migration.

---

## 2026-05-16 — Pricing: setup fee + monthly

**Chose:** ~150–200 GEL setup + 50 GEL/month
**Rejected:** Pure monthly SaaS, per-booking commission
**Why:** Setup fee covers onboarding time and filters out non-serious clients. Monthly is low enough (≈$18) to be a no-brainer for any active business. Commission model is hard to track and invasive.
