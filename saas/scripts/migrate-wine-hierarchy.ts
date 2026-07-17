/**
 * One-off migration for Feature #116 — Wine hierarchy. ALREADY RUN (2026-07-17).
 * Ran BETWEEN schema phase 1 (WineVintage/WineOrderItem added, old fields kept)
 * and schema phase 2 (Wine.price / Wine.type / WineOrder.wines removed):
 *   npx tsx scripts/migrate-wine-hierarchy.ts
 *
 * Idempotent — skips wines that already have a vintage and orders that
 * already have line items. The `Old*` casts exist because the source columns
 * were dropped from the schema in phase 2; re-running now is a safe no-op.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

type OldWineItem = { id: string; name: string; quantity: number; price?: number }

type OldWine = {
  id: string; price?: number; imagePath: string | null
  active: boolean; sortOrder: number; tenantId: string | null
}

type OldWineOrder = { id: string; wines?: unknown }

async function main() {
  let vintagesCreated = 0
  const wines = (await db.wine.findMany()) as unknown as OldWine[]
  for (const wine of wines) {
    const existing = await db.wineVintage.findFirst({ where: { wineId: wine.id } })
    if (existing) continue
    if (wine.price == null) continue
    await db.wineVintage.create({
      data: {
        wineId: wine.id,
        year: 2026,
        price: wine.price,
        imagePath: wine.imagePath,
        active: wine.active,
        sortOrder: wine.sortOrder,
        tenantId: wine.tenantId,
      },
    })
    vintagesCreated++
  }

  let itemsCreated = 0
  const orders = (await db.wineOrder.findMany()) as unknown as OldWineOrder[]
  for (const order of orders) {
    const items = order.wines as OldWineItem[] | null
    if (!Array.isArray(items) || items.length === 0) continue
    const existing = await db.wineOrderItem.findFirst({ where: { wineOrderId: order.id } })
    if (existing) continue
    for (const item of items) {
      const vintage = await db.wineVintage.findFirst({ where: { wineId: item.id } })
      await db.wineOrderItem.create({
        data: {
          wineOrderId: order.id,
          wineVintageId: vintage?.id ?? null,
          wineNameSnapshot: item.name,
          vintageYearSnapshot: 2026,
          priceSnapshot: item.price ?? 0,
          quantity: item.quantity,
        },
      })
      itemsCreated++
    }
  }

  console.log(`Created ${vintagesCreated} vintages, ${itemsCreated} order items`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
