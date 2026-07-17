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

## 2026-07-01 — Scaling path at ~30 clients: account sharding over paying for Pro

**Chose:** Account sharding — open a new Supabase + Vercel account for new clients at ~25–30 tenants
**Rejected (for now):** Upgrading to Supabase Pro ($25/month)
**Why:** Egress is the constraint, not DB or storage. Opening a fresh account resets the free quota with zero code changes. At early growth stage, free is better until revenue is stable. Pro becomes the obvious call once the monthly cost is clearly covered. See [[Scaling-AccountSharding]] for the full checklist.

---

## 2026-05-16 — Pricing: setup fee + monthly

**Chose:** ~150–200 GEL setup + 50 GEL/month
**Rejected:** Pure monthly SaaS, per-booking commission
**Why:** Setup fee covers onboarding time and filters out non-serious clients. Monthly is low enough (≈$18) to be a no-brainer for any active business. Commission model is hard to track and invasive.

---

## 2026-07-17 — Multi-tenant email: shared platform domain, not tenant-supplied credentials

**Chose:** One shared platform sending domain, per-tenant display name + reply-to (default); per-tenant custom domain later as an opt-in for tenants who own their own domain
**Rejected:** Letting each tenant enter their own SMTP/email-provider credentials for the platform to send through
**Why:** Tenant-supplied credentials mean storing third-party secrets per tenant (breach risk), poor fit for non-technical users (Gmail/Outlook SMTP throttles hard and needs app-password workarounds), and deliverability/support becomes tenant-dependent and hard to debug. A shared verified domain needs zero setup per client and is the standard SaaS pattern. **Blocked:** Max doesn't yet own a domain to verify as the platform's shared sender — nothing here can be built until one is acquired. See [[Plan-MultiTenantEmail]] for full options analysis and the rough shape of the work.
