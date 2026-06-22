---
tags: [migration, multi-tenant]
---

# Multi-Tenant Migration Progress

---

## ⚠️ TO DO FOR MAX — User Testing Checklist

Sprint 1A + 1B + Sprint 2 are all done in code. These steps require **you to test manually** — Claude cannot do this part.

- [ ] **Admin orders** — visit `http://localhost:3000/admin/orders` → confirm your 59 existing orders are all visible
- [ ] **Admin companies** — visit `http://localhost:3000/admin/companies` → confirm 2 companies visible
- [ ] **Admin wines** — visit `http://localhost:3000/admin/wines` → confirm 6 wines visible
- [ ] **Admin settings** — visit `http://localhost:3000/admin/settings` → confirm settings load (payment details, booking rules, etc.)
- [ ] **Admin content** — visit `http://localhost:3000/admin/content` → confirm content editor loads
- [ ] **Submit a test booking** — go to `http://localhost:3000`, fill out the form, submit; then check `/admin/orders` to confirm it appears
- [ ] **Second tenant isolation** — open `C:\Windows\System32\drivers\etc\hosts` in Notepad (as admin), add the line `127.0.0.1 winery2.local`, save; then visit `http://winery2.local:3000/admin/orders` → should show **0 orders** (separate tenant, no data)

If anything looks wrong, report back and Claude will fix it.

---

Full plan: `vault/Plan-MultiTenant.md`

---

## Sprint 1A — Schema + Seed ✅ DONE (2026-06-22)

### What was done
- Added `Tenant` model to `schema.prisma` (`id, name, domain, slug, createdAt`)
- Added nullable `tenantId String?` to 9 tables: `Company`, `Order`, `MenuItem`, `MasterclassItem`, `WineOrder`, `Setting`, `SiteContent`, `BlockedDate`, `Wine`
- Child tables left without `tenantId` (always accessed through parent): `Price`, `OrderMasterclass`, `OrderExtra`
- Fixed unique constraints:
  - `SiteContent`: `@@unique([key, locale])` → `@@unique([key, locale, tenantId])`
  - `BlockedDate`: `date @unique` → `@@unique([date, tenantId])`
  - `Setting`: kept `key @id` for now — PK change deferred to Sprint 2 (would break all settings queries)
- Ran `prisma db push --accept-data-loss` — all columns created in DB
- Created `scripts/seed-tenants.ts` — inserts 2 tenants, backfills all existing rows

### Tenants created
| Name | Domain | tenantId |
|---|---|---|
| Nikalas Marani | nikalasmarani.ge | `cmqou94er0000vl1sl9v0yv54` |
| Test Winery | winery2.local | `cmqou94sx0001vl1sga705ltt` |

### Rows backfilled (all to Nikalas Marani)
- Orders: 59, Companies: 2, Wines: 6, Wine Orders: 6
- Menu Items: 6, Masterclass Items: 5, Settings: 29, Site Content: 19
- Blocked Dates: 0

### Files changed
- `saas/prisma/schema.prisma` — Tenant model + tenantId columns + unique constraint updates
- `saas/scripts/seed-tenants.ts` — NEW: tenant seed + backfill script

---

## Sprint 1B — Middleware + Tenant Helper ✅ DONE (2026-06-22)

### What was done
- Added `DEFAULT_TENANT_ID` to `.env` (fallback for localhost dev)
- Updated `saas/proxy.ts`:
  - Matcher expanded from `/admin/:path*` → all routes (excluding static files)
  - Added `resolveTenantId(host)` — looks up `tenants` table via Prisma, with module-level cache
  - Sets `x-tenant-id` request header on every request
  - Localhost fallback uses `DEFAULT_TENANT_ID` env var
  - Auth redirect logic unchanged
- Created `saas/lib/tenant.ts`:
  - `getTenantId()` — reads `x-tenant-id` from request headers (for server components / actions)
  - Throws if header is missing (fail-safe — prevents unscoped queries in Sprint 2)

### Files changed
- `saas/.env` — `DEFAULT_TENANT_ID` added
- `saas/proxy.ts` — tenant resolution + expanded matcher
- `saas/lib/tenant.ts` — NEW: `getTenantId()` helper

### What to test (user)
1. **Public site still loads** — visit `http://localhost:3000` → home page should load normally
2. **Admin still works** — visit `http://localhost:3000/admin` → should redirect to login if not logged in; login should work as before
3. **Middleware logs** — in dev server console, check for any errors on page load
4. **Second tenant** — edit Windows hosts file, add `127.0.0.1 winery2.local`, visit `http://winery2.local:3000` → site should load (same content as main for now — scoping comes in Sprint 2)

---

## Sprint 2 — Query Scoping (THE FLIP) ✅ DONE (2026-06-22)

### What was done

**Schema:**
- `Setting` PK changed: `key @id` → `id @id @default(cuid())` + `@@unique([key, tenantId])`
- Raw SQL migration script (`scripts/migrate-setting-pk.ts`) ran safely on the live DB (29 rows migrated)

**Security patterns applied throughout:**
- All `findMany` → `where: { tenantId, ... }`
- All `create` → `tenantId` added to data
- All `update({ where: { id } })` → `updateMany({ where: { id, tenantId } })` — cross-tenant writes blocked
- All `delete({ where: { id } })` → `deleteMany({ where: { id, tenantId } })` — cross-tenant deletes blocked
- All `findUnique({ where: { id } })` on tenanted tables → `findFirst({ where: { id, tenantId } })` — cross-tenant reads blocked
- Child tables (`OrderMasterclass`, `OrderExtra`) verify parent order belongs to tenant before mutation
- `orderMasterclass.ts` also verifies masterclass item belongs to tenant before use
- Public actions (`createBooking`, `submitWineOrder`) scoped — tenant resolved from request headers

**Files updated (actions):**
- `settings.ts`, `siteContent.ts`, `blockedDates.ts`, `companies.ts`, `orders.ts`, `wines.ts`, `wineOrders.ts`, `masterclassItems.ts`, `menuItems.ts`, `orderExtras.ts`, `orderMasterclass.ts`, `createBooking.ts`, `submitWineOrder.ts`

**Files updated (pages with direct db calls):**
- `admin/orders/page.tsx`, `admin/orders/new/page.tsx`, `admin/orders/[id]/page.tsx`
- `admin/statistics/page.tsx`, `admin/wines/page.tsx`, `admin/wine-orders/page.tsx`
- `admin/companies/page.tsx`, `admin/menu-items/page.tsx`, `admin/masterclass/page.tsx`
- `admin/content/page.tsx`, `(site)/page.tsx`, `(site)/wines/page.tsx`

**Other fixes:**
- `scripts/seed-ka.ts` updated to use new `key_locale_tenantId` unique accessor
- TypeScript: 0 errors after all changes

### What to test (user)
1. **Public site loads** — `http://localhost:3000` home page, booking form visible ✅ (verified)
2. **Admin orders** — visit `/admin/orders`, confirm orders list loads with your data
3. **Admin companies** — visit `/admin/companies`, confirm companies visible
4. **Admin wines** — visit `/admin/wines`, confirm wines visible
5. **Admin content editor** — visit `/admin/content`, confirm content loads
6. **Admin settings** — visit `/admin/settings`, confirm settings load
7. **Submit a test booking** — fill out the form, submit; check it appears in admin orders
8. **Second tenant isolation** — add `127.0.0.1 winery2.local` to hosts file, visit `http://winery2.local:3000/admin/orders` — should show 0 orders (different tenant, no data yet)

---

## Sprint 3 — Content & Settings Scoping ✅ DONE (completed as part of Sprint 2, 2026-06-22)

Was planned as a separate sprint, but all items were covered during Sprint 2 in the same pass:
- `siteContent.ts` — all queries scoped by tenantId; `key_locale_tenantId` accessor used throughout
- `settings.ts` — all queries scoped; `key_tenantId` accessor used; Setting PK migrated from `key @id` to `id @id`
- `blockedDates.ts` — all queries scoped by tenantId; `date_tenantId` accessor used

---

## Sprint 4 — Per-Tenant Auth ⬜ NOT STARTED

- Supabase users linked to `tenantId`
- Admin login verifies tenant match

---

## Theming (any time after Sprint 1) ⬜ NOT STARTED

- `theme` JSON column on `Tenant` table
- CSS variables injected from middleware

---

## Known deferred decisions

| Item | Deferred to | Note |
|---|---|---|
| `Setting` PK change | Sprint 2 | Currently `key @id`; needs `id @id` + `@@unique([key, tenantId])` |
| RLS update | Sprint 2 | Do alongside query scoping |
| Per-tenant admin users | Sprint 4 | Currently one shared Supabase auth user |
