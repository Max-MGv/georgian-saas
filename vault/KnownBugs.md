---
tags: [bugs]
---

# Known Bugs

| # | Description | Area | Status |
|---|---|---|---|
| 1 | Date filters don't work on orders admin panel | Admin / Orders | 🟢 Resolved |
| 2 | Guest count input: backspace resets to 0, typing prepends to 0 instead of replacing | Public / Booking form | 🟢 Resolved |
| 3 | Time slot picker allows selecting past hours on today's date | Public / Booking form | 🟢 Resolved |
| 4 | Supabase connection pool exhaustion (session mode) — production risk | Infrastructure | 🟢 Resolved |
| 5 | RLS policies deployed but never enforced — withTenantDb is a stub | Security / DB | 🟢 Resolved |
| 6 | Vercel functions ran in `iad1` while databases are in `eu-central-1` — every page ~3s | Infrastructure | 🟢 Resolved |

---

## Bug #4 — Supabase connection pool exhaustion (session mode)

> 🟢 **RESOLVED.** Everything below is the original write-up, kept as history — it is written in the present tense as an open bug, so read it as "what was true then", not as current state. **Current state:** `DATABASE_URL` uses the transaction pooler (port 6543, `pgbouncer=true`) on both environments; local dev additionally sets `connection_limit=20&pool_timeout=30`. Related: Bug #6 (2026-07-29) explains why this hurt more than expected — each transaction was holding its connection for 3–4 *transatlantic* round trips. The 2026-07-29 batching refactor also cut the Home page from ~24 transactions to ~8, specifically for headroom here.

**Severity:** High — can bring down the live site under load

**Root cause:**  
`DATABASE_URL` uses port **5432** (PgBouncer session mode). In session mode, each `PrismaClient` instance holds a real Postgres connection open for its entire lifetime — it is never returned to the pool until `$disconnect()` is called, which almost never happens in a Node app.

Supabase caps session mode at **15 concurrent connections** on the current plan.

**Why it surfaced in dev:**  
Next.js hot reloading creates new module instances repeatedly without closing old ones. Each new instance creates a new `PrismaClient` → new connection → connection never released → pool fills up in ~15 hot reloads.

**Why it's a production risk:**  
Vercel deploys as serverless functions. Each cold start creates a new process → new `PrismaClient` → new connection held open. 15 simultaneous cold starts (e.g. right after a deploy) would exhaust the pool and return `EMAXCONNSESSION` to real users. With the multi-tenant model (all clients on one URL), traffic multiplies across tenants making this more likely.

**Additional contributor:**  
`proxy.ts` creates its own `new PrismaClient()` at module level (separate from the singleton in `lib/db.ts`). In dev this means 2 connections burned per hot reload instead of 1.

**Fix:**  
Switch `DATABASE_URL` to port **6543** (PgBouncer transaction mode). In transaction mode, connections are returned to the pool immediately after each query/transaction — the pool can serve hundreds of concurrent requests from 15 physical connections.

Add `?pgbouncer=true` to the URL so Prisma disables prepared statements (which don't work in transaction mode).

`DIRECT_URL` stays on port 5432 — it's only used by `prisma db push` / migrations which run once and don't need pooling.

```
DATABASE_URL="postgresql://...@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

**Resolution steps:**
1. In Supabase dashboard → Project Settings → Database, copy the **Transaction pooler** connection string (port 6543)
2. Update `saas/.env` and the matching Vercel environment variables:
   ```
   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
   ```
3. Confirm `saas/prisma/schema.prisma` datasource block has `directUrl = env("DIRECT_URL")` — if missing, add it
4. Run `npx prisma db push` (from `saas/`) to confirm it still works via the direct URL
5. Start the dev server and verify normal queries work (admin orders page is a good smoke test)
6. In `saas/proxy.ts`, replace `new PrismaClient()` at module level with the shared singleton imported from `@/lib/db` — this eliminates the second connection that bypasses the singleton guard

**Note on Bug #5 compatibility:** `SET LOCAL ROLE` and `set_config(..., true)` are transaction-scoped — they revert at `COMMIT`, the same moment PgBouncer reclaims the connection. Fixing this bug does not conflict with implementing Bug #5.

---

## Bug #5 — RLS policies deployed but never enforced (withTenantDb is a stub)

> 🟢 **RESOLVED — and the description below is now factually wrong about current code.** It states `withTenantDb` "is a stub" that "never opens a transaction". That has not been true since Sprint 3A was completed: `saas/lib/db.ts` today opens a real `$transaction`, calls `set_config('app.tenant_id', …)` and `SET LOCAL ROLE app_user`, with `{ timeout: 15000, maxWait: 10000 }` (verified by reading the file 2026-07-29). RLS is genuinely enforced. Everything below is kept as the historical write-up of the bug — do not read it as current state. Architecture reference: [[RLS-Architecture]].

**Severity:** Medium — tenant isolation is still enforced by query scoping, but the DB-level safety net is silently absent

**Background:**  
Sprint 3A (2026-06-22) deployed RLS infrastructure to Supabase via `setup-rls.ts`:
- Created `app_user` Postgres role (NOLOGIN)
- Granted SELECT/INSERT/UPDATE/DELETE on all 12 tenanted tables to `app_user`
- Created `tenant_isolation` RLS policies on all 12 tables that check `current_setting('app.tenant_id')`

The plan was for `withTenantDb` to open a `$transaction`, call `SET LOCAL ROLE app_user` + `set_config('app.tenant_id', tenantId, true)`, then run the query — forcing Postgres to enforce RLS.

**What actually happened:**  
`withTenantDb` in `saas/lib/db.ts` is a stub. It never opens a transaction and never calls `SET LOCAL ROLE`. The app connects as `postgres` (Supabase superuser), which **bypasses RLS by design** in Postgres — superusers are exempt from all row-level security policies.

```ts
// saas/lib/db.ts — current state
export async function withTenantDb<T>(tenantId, fn) {
  // comment says "future enhancement" — the $transaction + SET LOCAL ROLE was never written
  return fn(db)   // ← just passes the PrismaClient directly
}
```

**Current protection:**  
Tenant isolation relies entirely on `where: { tenantId }` in every query (one layer). The RLS second layer is set up in Supabase but dormant.

**Risk:**  
If a query somewhere accidentally omits the `tenantId` filter, it would return cross-tenant data with no DB-level catch. With one client this is undetectable; with multiple clients this is a data leak.

**Fix:**  
Implement `withTenantDb` properly in `saas/lib/db.ts`. `SET LOCAL ROLE` and `set_config(..., true)` are transaction-scoped and revert at `COMMIT` — fully compatible with PgBouncer transaction mode (Bug #4). No special handling needed.

**Resolution steps:**
1. Apply Bug #4 fix first (switch to PgBouncer transaction mode) — `withTenantDb` uses `$transaction`, which requires a pooled connection that supports transactions; transaction mode on port 6543 satisfies this
2. Replace the stub body in `saas/lib/db.ts` with the full implementation:
   ```typescript
   export async function withTenantDb<T>(
     tenantId: string,
     fn: (tx: TxClient) => Promise<T>
   ): Promise<T> {
     return db.$transaction(async (tx) => {
       await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
       await tx.$executeRaw`SET LOCAL ROLE app_user`
       return fn(tx)
     }, { timeout: 15000 })
   }
   ```
3. Run `npx tsx scripts/check-rls.ts` from `saas/` — confirms RLS is ON and `tenant_isolation` policies exist on all 12 tables (already deployed in Sprint 3A; this step just verifies nothing changed)
4. Smoke-test: load `/admin/orders`, create a booking on the public form, check `/admin/statistics` — confirm normal operation under the new transaction wrapper
5. If a second tenant is available, verify cross-tenant isolation: query an order ID belonging to tenant A while authenticated as tenant B — should return 0 rows

**Note:** Query-level `where: { tenantId }` scoping stays in place. RLS is the second enforcement layer, not a replacement.

---

## Bug #6 — Vercel functions ran in the wrong region (every page ~3s)

**Severity:** High — affected every page view for every visitor, on every tenant, since launch
**Found + fixed:** 2026-07-29 · **Status:** 🟢 Resolved

**Symptom:** every public page took ~2.9–3.4s before the first byte arrived, regardless of page, tenant, or cache state. Long assumed to be "normal for this app" — `Plan-DevProdEnvironments.md` even documented "~6s page renders are NORMAL", and a 2026-07-23 note filed it as a future optimization item.

**Root cause:** no function region was pinned (no `vercel.json`, nothing in `next.config.ts`), so Vercel's default applied and functions executed in **`iad1` (Washington DC)**. Both Supabase projects live in **`eu-central-1` (Frankfurt)**. Every database round trip crossed the Atlantic (~90ms), and `withTenantDb` needs 3–4 *sequential* round trips per transaction (`set_config`, `SET LOCAL ROLE`, the query, `COMMIT`).

**Evidence that isolated it:** a real 36-row `findMany` cost **666ms** while an *empty* transaction cost **680ms** — i.e. ~100% network latency, ~0% database work. That ruled out query design and pointed at distance. `X-Vercel-Id` confirmed it: `fra1::iad1::…` — edge in Frankfurt, compute in Washington.

**Fix:** `saas/vercel.json` with `{"regions": ["fra1"]}`. **Home TTFB ~2.93s → ~0.40s (7×); full load 5.8s → 0.49s (10×).**

**How to detect a regression:**
```bash
curl -s -D - -o /dev/null https://nikalasmarani.vercel.app/ | grep -i x-vercel-id
```
Expect `fra1::fra1::…`. A second segment of `iad1` means the region pin was lost — see MaintenanceNotes §8 for why the file's location makes that easy to do by accident.

**Related:** this also explains why Bug #4's pool pressure hurt more than expected — each transaction held its connection for 3–4 transatlantic round trips instead of microseconds.

**Wrong turn worth remembering:** the first diagnosis was that ~24 per-request DB transactions caused the delay. A batching refactor was built and **measurably changed nothing** (1,581ms → ~1,620ms), because those queries already ran in parallel. Measuring, rather than reasoning from plausibility, is what found the real cause. Full record: [[Plan-Performance]], [[Perf-Baseline-2026-07-29]].
