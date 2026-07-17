---
tags: [feature, wines]
---

# Feature 116 — Wine Hierarchy: WineVintage + WineOrderItem

Built 2026-07-17. The biggest refactor in the project: the flat `Wine` model was split into a two-level hierarchy, wine orders moved from a JSON blob to a proper line-item table, and the public catalogue got filter pills.

## What it does (user-facing)

- **Admin → Wines** is now a two-level list: each wine *product* (name, type, sweetness, sparkling, alcohol %, description, colour, default photo) expands to show its *vintages* (year, price, optional photo override, visible/hidden). A wine only appears in the public catalogue if it has at least one active vintage.
- **Public `/wines`** shows one card per vintage (name + year badge + "Red Dry · Sparkling · 13.5%" meta line). Two rows of filter pills above the grid: **Type** (All · Red · White · Amber · Rosé) and **Style** (All · Dry · Semi-dry · Semi-sweet · Sweet · Sparkling), AND-combined, client-side.
- **Wine orders** store one `WineOrderItem` row per ordered vintage with snapshots (name, year, price at order time), so old orders display correctly even if a wine or vintage is later renamed, repriced, or deleted.

## Key design decisions

- **Snapshots are the display source of truth.** `WineOrderItem.wineVintageId` is nullable with `onDelete: SetNull` — deleting a vintage never breaks past orders; their name/year/price snapshots remain.
- **`WineVintage` has a direct `tenantId`** (simple RLS policy, same as Wine). **`WineOrderItem` has no `tenantId`** — RLS joins through its parent `WineOrder` (same pattern as `OrderExtra`).
- **Two-phase schema migration**: phase 1 added the new tables while keeping `Wine.price`/`Wine.type`/`WineOrder.wines`; the data migration script ran in between; phase 2 dropped the old columns. The spec said to drop `price` in phase 1, but that would have destroyed the data the migration needed — kept until phase 2 instead.
- **Migration defaults**: every existing wine got one vintage with `year: 2026` and its old price/image; every old order JSON item became a `WineOrderItem` with `vintageYearSnapshot: 2026`. All existing wines defaulted to `RED`/`DRY` — Max needs to set the real types in admin.
- **`setup-rls.ts` now runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY`** on every tenanted table. Previously RLS was enabled via the Supabase dashboard; new tables created by `prisma db push` start with RLS off, so without this the new policies would have been dormant.

## Files touched

- `saas/prisma/schema.prisma` — `WineType` + `Sweetness` enums; Wine reshaped (lost `type`/`price`, gained `wineType`, `sweetness`, `sparkling`, `alcoholLevel`, `vintages`); new `WineVintage` + `WineOrderItem`; `WineOrder` lost `wines Json`, gained `wineItems`
- `saas/scripts/migrate-wine-hierarchy.ts` — NEW, one-off data migration (already run: 6 vintages, 16 order items, verified 1:1 against the old JSON)
- `saas/scripts/setup-rls.ts` — grants + policies for both new tables; ENABLE ROW LEVEL SECURITY loop added
- `saas/scripts/seed.ts` — wine-order seeding now picks active vintages and creates `wineItems`
- `saas/app/actions/wines.ts` — full rewrite: product CRUD + `assignWineImage`, vintage CRUD + `assignVintageImage` + `toggleVintageActive`, `getWinesWithVintages`; all via `withTenantDb`
- `saas/app/actions/submitWineOrder.ts` — parses `{vintageId, name, year, quantity, price}` items; creates WineOrder + WineOrderItems in one `withTenantDb` transaction
- `saas/app/admin/(panel)/wines/page.tsx` + `WinesClient.tsx` — full rewrite: expandable two-level UI
- `saas/app/(site)/wines/page.tsx` — fetches products + active vintages, flattens to vintage cards
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — new `DbWine` type, quantities keyed by `vintageId`, year badges, meta labels, filter pills, new submit payload
- `saas/app/admin/(panel)/wine-orders/page.tsx` + `WineOrdersClient.tsx` + `PackingView.tsx` — all reads switched from `order.wines` JSON to `order.wineItems`; item format "Wine Name · 2021 × 3 bottles"; packing summary groups by name + year
- `saas/app/admin/(panel)/statistics/page.tsx` — wine order stats now read `wineItems` snapshots (spec missed this file; it read `wine.price` + `order.wines`)

## Edge cases handled

- Vintage deleted after orders exist → items keep displaying via snapshots (`SetNull` FK)
- Wine deleted → its vintages cascade-delete; order items again survive via snapshots
- Old orders without `totalAmount` → admin displays an estimate summed from item price snapshots (`~` prefix)
- Product with zero vintages → hidden from public catalogue; admin shows a hint to add one
- Old order JSON items without a `price` field → migrated with `priceSnapshot: 0`
- Filter combination with no matches → "No wines match these filters." empty state

## What to test (also in MyToDo.md)

Admin two-level wines UI, vintage CRUD + image overrides, public filters, checkout, admin wine orders + packing display. Claude verified end-to-end in the browser: filters, qty stepper, drawer checkout, submission (test order "TEST — Feature 116 verification", DB row confirmed with linked vintage + snapshots). Admin pages verified by TypeScript + DB checks only (no admin login available to Claude).
