---
tags: [plan, infra, feature-79]
---

# Plan — Dev/Prod Environments (Feature #79)

Approved in discussion 2026-07-23. Not yet started. Goal: separate rehearsal from performance — today all testing, seed scripts, and experiments share one database with Nikalas Marani's real bookings (Test Winery lives in the prod DB right now).

## What we're achieving (business terms)

A second, private stage: a full copy of the site on its own URL, backed by its own database with test data. Anything can be tried there without any risk to real customer data. Only checked work moves to the live site. $0 cost (free tiers).

## Decisions made (via AskUserQuestion 2026-07-23)

- Max currently pushes straight to `master` → new habit: work goes through a `staging` branch first
- Staging tenant = **copy of Nikalas Marani's** real content/settings (most realistic testing), not a generic dummy
- One stable staging URL (single `staging` branch), NOT per-feature preview URLs — simpler mental model
- Switch from `prisma db push` to `prisma migrate` as part of this work (closes the "two schemas drift apart" gap)

## The 7 steps

1. **Create dev database** — new free Supabase project `georgian-saas-dev`
2. **Establish migration history** — baseline migration matching current prod schema exactly; mark as already-applied on prod (`prisma migrate resolve`) WITHOUT running anything. ⚠️ Riskiest step — dry-run against dev first. Get it wrong and Prisma tries to reconcile prod schema.
3. **Clean up production** — remove Test Winery tenant from the live DB
4. **Build staging tenant** — clone NM's content/settings (SiteContent, Setting, branding, module flags) into dev DB. NOTE: this is a one-time snapshot; it will NOT auto-sync with future NM changes — refreshing it later is a manual task.
5. **Wire environments** — local `.env` → dev DB; Vercel Production env vars → prod DB (unchanged); Vercel Preview env vars → dev DB (new)
6. **Staging URL** — push `staging` branch → Vercel generates its stable preview URL → add a `Tenant` row in the DEV db with `domain` = that exact URL (otherwise it shows the /welcome placeholder — tenant resolution is domain-based)
7. **New workflow** — `prisma migrate dev` locally against dev → push to `staging` → verify on staging URL → merge to `master` → `prisma migrate deploy` against prod

## Known cons / gotchas

- Staging discipline is manual forever; easy to slip back to direct-to-master under pressure
- Staging tenant content is a snapshot, goes stale unless manually refreshed
- Schema changes now run twice (dev then prod)
- Supabase free tier auto-pauses after ~1 week idle → staging may show a DB error until manually resumed in dashboard (don't panic)
- Windows EPERM rule (ClaudeInstructions Rule 10) applies to `prisma migrate` exactly as to `db push` — stop dev server first
- Cloned test data ≠ real traffic; some bugs still only appear in prod

## MCP status (2026-07-23)

Max connected both official MCP servers (Supabase + Vercel) — capability audit in SessionLog 2026-07-23. Most infra steps are now doable by Claude directly; see that entry for the exact can/can't list.

## Division of labor (pre-MCP baseline; MCP shifts most of this to Claude)

- Max: account-level auth (one-time), staging-first habit ongoing
- Claude: migrations, clone script, Test Winery removal, branch/push, tenant row for staging URL
