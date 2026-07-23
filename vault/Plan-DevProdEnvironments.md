---
tags: [plan, infra, feature-79]
---

# Feature #79 — Dev/Prod Environments ✅ BUILT 2026-07-23

All 7 steps executed 2026-07-23 (one session). This doc is now the **reference for the environment setup and daily workflow**.

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

- [ ] **Staging admin login**: dev Supabase project has NO auth users yet — `/admin/login` on staging can't log in. Create a user in dev dashboard (Auth → Add user) then set `app_metadata` via `npm run set-admin` with dev env vars.
- [ ] Optional: raise dev pooler pool_size 15 → 30 (dashboard).
- [ ] Optional: assign a friendlier alias domain (e.g. `georgian-saas-staging.vercel.app`) to the `staging` branch in Vercel → Settings → Domains, then update the staging Tenant.domain in dev DB to match.
- [ ] The one test order in dev (`STAGING TEST-79`) can stay as evidence or be deleted from staging admin once login works.
