---
tags: [plan, infra, feature-79]
---

# Feature #79 — Dev/Prod Environments ✅ BUILT 2026-07-23

All 7 steps executed 2026-07-23 (one session). This doc is now the **reference for the environment setup and daily workflow**. See `ClaudeInstructions.md` Rule 0 for the strict version of the rule below.

## THE FLOW — staging first, master after

```
  work happens  →  push to STAGING  →  check the staging URL  →  Max approves  →  merge to MASTER  →  live
                     (dev database)      (dev database)                            (production)      (customers)
```

1. **All code changes go to the `staging` branch first.** Never push straight to `master`.
2. **Staging auto-deploys** to `georgian-saas-git-staging-mg-productions-projects.vercel.app`, reading the **dev** database — safe to break, no real customer ever sees it.
3. **Check it on the staging URL.** Only once it looks right does the change move on.
4. **Merge `staging` → `master` → push.** This is the one step that reaches real customers on `nikalasmarani.vercel.app` — always with Max's explicit go-ahead, same as any other production-affecting action.
5. **If the change included a database/schema change**, it runs through the same shape: `prisma migrate dev` against dev first → verified on staging → `prisma migrate deploy` against prod as its own separate, deliberate step (never automatic, never bundled silently into the code push).

**Local development always points at the dev database** — that's what makes step 1 safe to just dive into.

**Guardrails:** check `git branch --show-current` before committing if unsure; switch back to `staging` right after any `master` merge+push so the next commit can't land on `master` by accident; never force-push either branch.

## How this actually connects (read this if any of it feels confusing)

It's not one "dev/prod switch" — it's three independent layers chained together: **URL → deployment → env-var scope → database → tenant row → content.** A URL doesn't contain a database; typing it triggers that whole chain.

1. **Which code runs** — decided by git branch (`master` or `staging`).
2. **Which database that code talks to** — decided by Vercel's **Environment Variables scope** (Project Settings → Environment Variables). Each var like `DATABASE_URL` is tagged Production / Preview / Development. This project: Production-scoped vars → prod Supabase; Preview-scoped vars (applies to *every* non-production branch, including `staging`) → dev Supabase. Pushing to `staging` auto-builds a Preview deployment, Preview vars kick in, dev DB is used — no manual step.
3. **Which tenant's content shows** — decided inside whichever database you landed on, by matching the URL you typed against a `Tenant.domain` row. If nothing matches, you get the no-tenant `/welcome` placeholder.

**Key thing that isn't obvious:** `nikalasmarani.vercel.app`, `georgian-saas.vercel.app`, and `testwinery.vercel.app` are all the exact same production deployment — same code, same (prod) database. They look different only because the tenant lookup inside prod's DB succeeds for one domain and fails for the other two (`testwinery.vercel.app`'s tenant row was deleted in this same #79 session — see `MigrationNotes.md`).

**Where to actually find the staging URL:** it will never appear on Vercel's Domains tab — that page only lists explicitly-attached domains + Production system URLs. `georgian-saas-git-staging-mg-productions-projects.vercel.app` is a **branch deployment alias**, auto-created on push to any non-`master` branch, visible under the **Deployments** tab (filter by branch), not Domains.

## The two lanes

| | URL | Database | Deploys from |
|---|---|---|---|
| **Production** | nikalasmarani.vercel.app | prod Supabase (`dshsfkffcsgerdqinqst`) | `master` branch |
| **Staging** | georgian-saas-git-staging-mg-productions-projects.vercel.app | dev Supabase (`jpbkkngpgtvqmsocitjx`) | `staging` branch |
| **Local dev** | localhost:3000 | dev Supabase (same as staging) | `saas/.env` |

- Env split lives in Vercel: Production-scoped vars → prod DB; Preview-scoped vars → dev DB. All values in `credentials.txt` (repo root, gitignored).
- Localhost resolves the **Staging Winery** tenant via `DEFAULT_TENANT_ID` in `.env`; the staging URL resolves it via its `Tenant.domain` row **in the dev DB**.
- Staging Winery (`cmrxb85wo0000vlc0d964nzf8`) = snapshot clone of NM content (36 settings, 64 SiteContent, 6 companies+tiers, 6 wines+vintages, 6 menu items, 5 masterclass items; NO orders). displayName = "Nikalas Marani (Staging)" so browser tabs are distinguishable. **Snapshot goes stale** — refresh = wipe staging tenant rows in dev + rerun `scripts/clone-nm-to-staging.ts` (script refuses to run over an existing staging tenant).
- Prod `.env` backup: `saas/.env.prod.backup` (gitignored).

## Daily workflow

1. Develop locally (against dev DB — safe to break).
2. Schema change? `npx prisma migrate dev --name <change>` (dev server stopped — Rule 10). This records a migration file AND applies it to dev.
3. Commit to `staging` branch → push → check the staging URL.
4. Happy? Merge `staging` → `master` → push → prod deploys.
5. If the change had a migration: `npx prisma migrate deploy` **with prod URLs** (put prod DATABASE_URL/DIRECT_URL from credentials.txt into the command env or temporarily into .env — deploy does NOT run migrations automatically; build is only `prisma generate && next build`).

## Migration state (baseline, 2026-07-23)

- Old `20260517121307_init` deleted (file + prod `_prisma_migrations` row); replaced by squashed `20260723000000_baseline` = exact current schema (verified drift-free against prod via `migrate diff` before anything was recorded).
- Baseline marked `--applied` on BOTH DBs; `migrate status` clean on both.
- Dev DB also got the full RLS layer (app_user role, 14 tenant_isolation policies, platform-table lock) via MCP migration `rls_setup_and_platform_lock` — dev matches prod's security posture, incl. the 2026-07-23 Tenant/PlatformConfig lockdown.
- Storage buckets `logos` / `backgrounds` / `wine-photos` created (public) in dev.

## Gotchas learned during setup (important!)

- **Dev pooler `pool_size` = 15** (Supabase default). The home page fires ~26 parallel `withTenantDb` transactions per render (18 in `page.tsx` Promise.all + layout's own); under session pooling this EXCEEDED the cap (`EMAXCONNSESSION`). Fixes applied: local `DATABASE_URL` uses the **transaction pooler (6543)** with `connection_limit=20&pool_timeout=30`. Optional dashboard improvement: raise dev pool_size 15 → 30 (Settings → Database → Connection pooling).
- **~6s page renders are NORMAL for this app on BOTH prod and staging** (force-dynamic + many sequential transactions; measured identical 2026-07-23). Not a staging regression. Perf optimization = separate backlog item.
- **Streamed pages look "empty" to naive checks**: the HTML arrives as shell+skeleton first, content chunk after. When browser-verifying, wait for full render; a `curl | grep` for real content is the reliable server-side check. (A hidden Claude browser pane freezes pages mid-stream — display the pane.)
- New Supabase projects: pooler host was `aws-0-eu-central-1` (prod is `aws-1`) — always copy the exact string from Dashboard → Connect. Pooler takes a few minutes to provision after project creation; direct `db.*.supabase.co` host is IPv6-only (unreachable from Max's network).
- Supabase free tier pauses idle projects after ~1 week — if staging errors after a quiet stretch, resume the dev project in the dashboard.

## Still open (small)

- [x] **Staging admin login** ✅ 2026-07-23 — Max created `maxb2bsaas@gmail.com` in dev Supabase; Claude ran `npm run set-admin -- --email maxb2bsaas@gmail.com --tenantId cmrxb85wo0000vlc0d964nzf8` (locked to Staging Winery); password had a mismatch on first attempt, force-reset via Admin API to match credentials.txt; verified login on staging URL → lands in Orders, correctly shows only the STAGING TEST-79 booking (tenant-scoped).
- [ ] Optional: raise dev pooler pool_size 15 → 30 (dashboard).
- [ ] Optional: assign a friendlier alias domain (e.g. `georgian-saas-staging.vercel.app`) to the `staging` branch in Vercel → Settings → Domains, then update the staging Tenant.domain in dev DB to match.
- [ ] The one test order in dev (`STAGING TEST-79`) can stay as evidence or be deleted from staging admin once login works.
