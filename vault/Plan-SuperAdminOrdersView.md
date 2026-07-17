---
tags: [plan, done]
---

# Plan — Cross-tenant Orders/Bookings view in Super Admin (Feature #122)

**Status: DONE (2026-07-17).** Built and browser-verified in one session. See `SessionLog.md` session 3 (2026-07-17) for the narrative and `FeatureLog.md` #122 for the index entry.

## Goal
Let Max see bookings + wine orders across ALL tenants from `/super-admin`, without visiting each tenant's own domain. **Read-only** — no edit/delete/status-change here. Those stay on the existing single-tenant admin pages (`/admin/orders`, `/admin/wine-orders`), which the RLS/`withTenantDb` architecture is built around. Building cross-tenant write actions would be real work (see the effort discussion in chat, 2026-07-17) — explicitly out of scope for this pass.

## Design decisions
- **Two tabs, not one merged table** — Bookings and Wine Orders have very different shapes (guestCount/visitType vs. businessName/wineItems). Forcing them into one row format would be more work and less readable than reusing the mode-switcher pattern already established on the tenant Statistics and Companies pages (#117, #120).
- **New nav item "Orders"** in the `/super-admin` layout, alongside Tenants / Users / Settings.
- **Click-through, not inline actions** — each row links out to `https://{tenant.domain}/admin/orders/{id}` (or `/admin/wine-orders`). This works because `super_admin` already bypasses the tenant-match check in `proxy.ts` for any domain — confirmed working pattern, not new plumbing.
- **Default filter to something bounded** — "Upcoming" or a recent date range by default (matching the existing tenant Orders page's `Upcoming` quick filter), not an unbounded all-time list. Will grow unbounded across tenants over time otherwise.
- **Queries bypass `withTenantDb` intentionally** — same pattern already used in `getTenants()` (raw `db.order.count()` etc., across all tenants). `db` connects as the Postgres superuser, which is exempt from RLS by design (see `RLS-Architecture.md`) — this is expected and already relied upon for the Tenants list stats.

## Steps
1. **Server action** — `getAllBookings()` and `getAllWineOrders()` in `superAdmin.ts`. Each does a plain `db.order.findMany()` / `db.wineOrder.findMany()` across all tenants, `include: { tenant: { select: { name, domain } } }`, defaults to upcoming/recent window, returns tenant name + domain per row for the click-through link.
2. **New page** — `saas/app/super-admin/orders/page.tsx` — server component, calls both actions, passes to client.
3. **New client component** — `saas/app/super-admin/orders/OrdersActivityClient.tsx` — dark-themed (matches rest of `/super-admin`, NOT the tenant admin's cream theme) — Bookings/Wine Orders tab switcher, date range + tenant + status filters, table with Tenant column, row links to `https://{domain}/admin/...`.
4. **Nav link** — add "Orders" to `saas/app/super-admin/layout.tsx` nav array.
5. **TypeScript check** — `npx tsc --noEmit`, 0 errors.
6. **Browser verification** — confirm both tabs load real cross-tenant data, filters work, a row's link opens the correct tenant's real order detail page.
7. **Vault update** — `FeatureLog.md` (#122 row), `SessionLog.md`, mark this plan `done`.

## Estimate
~2–3 hours. Mostly reuses existing filter/table UI patterns rather than inventing new ones.

## Files touched
- `saas/app/actions/superAdmin.ts`
- `saas/app/super-admin/orders/page.tsx` (NEW)
- `saas/app/super-admin/orders/OrdersActivityClient.tsx` (NEW)
- `saas/app/super-admin/layout.tsx`
