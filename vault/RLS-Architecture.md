---
tags: [architecture, security, rls]
---

# RLS Architecture — Multi-Tenant Data Isolation

Reference document for how tenant isolation works in this project. Read this before touching `lib/db.ts`, adding a new table, or debugging a "wrong tenant data" issue.

---

## The problem we solved

Prisma connects to Supabase as the `postgres` role. In Postgres, **superusers bypass RLS entirely** — policies exist but are simply ignored. This means enabling RLS on a table in the Supabase dashboard does nothing as long as Prisma is using the default connection string.

Before Sprint 3A: RLS was ON, 0 policies, Prisma bypassing everything. Only protection was application-level `where: { tenantId }` filters.

After Sprint 3A: two independent enforcement layers.

---

## How it works now

### The wrapper — `lib/db.ts`

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

**What each line does:**

- `$transaction` — opens a `BEGIN` / `COMMIT` block. Everything inside is one atomic transaction.
- `set_config('app.tenant_id', tenantId, true)` — writes the tenant ID as a Postgres session variable. The third argument `true` means `LOCAL` (reverts at transaction end — no leakage between requests).
- `SET LOCAL ROLE app_user` — downgrades the connection from `postgres` (superuser, bypasses RLS) to `app_user` (non-superuser, subject to RLS). `LOCAL` means it reverts at COMMIT/ROLLBACK.
- `fn(tx)` — your actual Prisma query runs here, under the downgraded role.

### The RLS policies

Every table has a `tenant_isolation` policy. For tables with a direct `tenantId` column:

```sql
CREATE POLICY tenant_isolation ON "Order"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

`current_setting('app.tenant_id', true)` reads the session variable set above. The second argument `true` means "return NULL if not set" — this is fail-secure: if for any reason the session variable is missing, the policy returns no rows instead of throwing an error.

For child tables without a `tenantId` column, policies JOIN to the parent:

```sql
-- OrderExtra (no tenantId) — checks via parent Order
CREATE POLICY tenant_isolation ON "OrderExtra"
  USING (
    EXISTS (
      SELECT 1 FROM "Order" o
      WHERE o.id = "OrderExtra"."orderId"
        AND o."tenantId" = current_setting('app.tenant_id', true)
    )
  ) ...
```

Same pattern for `OrderMasterclass` (→ Order) and `Price` (→ Company).

---

## Two-layer isolation diagram

```
Incoming request
      │
      ▼
proxy.ts  →  resolves tenantId from Host header (superuser db, no RLS)
      │
      ▼
getTenantId()  →  reads x-tenant-id header, throws if missing
      │
      ▼
withTenantDb(tenantId, tx => ...)
      │
      ├─ BEGIN transaction
      ├─ set_config('app.tenant_id', tenantId)  ← Layer 2 setup
      ├─ SET LOCAL ROLE app_user                ← enables RLS enforcement
      │
      ▼
   tx.order.findMany({ where: { tenantId } })   ← Layer 1: app filter
      │
      ▼
   Postgres RLS policy evaluates                ← Layer 2: DB filter
   "tenantId" = current_setting(...)
      │
      ▼
   Rows returned only if BOTH layers pass
      │
      ├─ COMMIT / ROLLBACK (role + session var auto-revert)
```

---

## Tables and policies

| Table | tenantId? | Policy type | Policy condition |
|---|---|---|---|
| Order | ✅ direct | simple | `"tenantId" = current_setting(...)` |
| Company | ✅ direct | simple | same |
| Wine | ✅ direct | simple | same |
| WineOrder | ✅ direct | simple | same |
| MenuItem | ✅ direct | simple | same |
| MasterclassItem | ✅ direct | simple | same |
| BlockedDate | ✅ direct | simple | same |
| SiteContent | ✅ direct | simple | same |
| Setting | ✅ direct | simple | same |
| Price | ❌ via Company | JOIN | EXISTS (Company where tenantId = ...) |
| OrderMasterclass | ❌ via Order | JOIN | EXISTS (Order where tenantId = ...) |
| OrderExtra | ❌ via Order | JOIN | EXISTS (Order where tenantId = ...) |
| Tenant | N/A | no RLS | Read by proxy.ts as superuser before tenant context exists |

---

## The `app_user` role

```sql
CREATE ROLE app_user NOLOGIN;
GRANT app_user TO postgres;           -- allows postgres to SET ROLE app_user
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON <all 12 tables> TO app_user;
GRANT SELECT ON "Tenant" TO app_user; -- read-only on Tenant
```

`NOLOGIN` means `app_user` cannot open a direct DB connection — it only exists to be switched into via `SET LOCAL ROLE`. This is intentional: you cannot accidentally expose it.

`GRANT app_user TO postgres` is the key step that makes `SET LOCAL ROLE app_user` work. Without it, Postgres returns `permission denied to set role "app_user"` even if `postgres` has superuser-like privileges in Supabase.

---

## Re-running the setup

The setup script is idempotent — safe to run multiple times:

```
cd saas
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/setup-rls.ts
```

Use `scripts/check-rls.ts` to verify the current state:

```
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-rls.ts
```

Expected output: 🟢 on all 12 tenanted tables, 🔴 on Tenant (intentional), policies visible for all 12.

---

## How to use `withTenantDb` — patterns

### Single query (most common)
```typescript
const orders = await withTenantDb(tenantId, tx =>
  tx.order.findMany({ where: { tenantId }, orderBy: { date: 'desc' } })
)
```

### Multiple parallel queries (page load pattern)
```typescript
const [companies, menuItems] = await Promise.all([
  withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId } })),
  withTenantDb(tenantId, tx => tx.menuItem.findMany({ where: { tenantId } })),
])
```
Each call is its own transaction. They can run in parallel safely — they don't interfere with each other.

### Atomic read + write (use when correctness requires both or neither)
```typescript
const result = await withTenantDb(tenantId, async (tx) => {
  const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
  if (!order) return { error: 'not found' }
  const extra = await tx.orderExtra.create({ data: { orderId, label, amount } })
  return { success: true, extraId: extra.id }
})
```
Both operations succeed or both roll back. Use this when you need a parent-exists check before inserting a child row.

### Sequential calls (ok when operations are independent)
```typescript
// First call completes and commits
const order = await withTenantDb(tenantId, tx => tx.order.findFirst(...))
if (!order) return

// Second call is a separate transaction
await withTenantDb(tenantId, tx => tx.order.update(...))
```
Fine for cases where the second operation doesn't depend on the first being atomic with it.

---

## Adding a new table — checklist

1. **Add `tenantId String?` to the Prisma model** (or rely on a parent that has one)
2. **Run `prisma db push`**
3. **Backfill existing rows** if any (raw SQL: `UPDATE "NewTable" SET "tenantId" = '...' WHERE "tenantId" IS NULL`)
4. **Add to `setup-rls.ts`**:
   - Add to `writableTables` array for GRANT
   - Add a `CREATE POLICY` block (simple if direct tenantId, JOIN if child table)
5. **Re-run `setup-rls.ts`** (idempotent — safe)
6. **Wrap all queries** in `withTenantDb` in any action or page that reads/writes the table
7. **Verify** with `check-rls.ts`

---

## What bypasses RLS (by design)

| What | Why | Is this a risk? |
|---|---|---|
| `proxy.ts` tenant lookup | Uses `db` (superuser) directly, before tenantId is known | No — only reads the `Tenant` table, which has no sensitive per-tenant data |
| Supabase dashboard queries | Supabase runs as superuser | Only you have dashboard access |
| `DATABASE_URL` connection | The `postgres` role bypasses RLS | Keep this env var out of git; rotate if exposed |
| `scripts/seed-tenants.ts`, `check-rls.ts`, `setup-rls.ts` | Admin scripts run as superuser intentionally | Local dev / one-off ops only |

---

## Security assessment

**What's protected:** All tenant business data (orders, companies, wines, settings, content, prices, blocked dates, wine orders, extras, masterclass lines).

**Threat model:** If a bug in application code omits a `where: { tenantId }` filter, Postgres RLS still prevents cross-tenant rows from being returned. The DB is the last line of defence.

**Tested:** 21 DB integration tests, including explicit cross-tenant isolation checks (T1 order ID queried under T2 context returns 0 rows). All pass.

**Not covered by RLS:** The `Tenant` table itself — a compromised app could read all tenant metadata (name, domain, slug). This is low-risk for now (not financial data) but should be addressed if the platform grows.
