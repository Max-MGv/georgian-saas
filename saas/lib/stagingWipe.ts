/**
 * Wipes the Staging Winery tenant's transactional data — no reseed. Distinct
 * from `demoSeed.ts`'s reset, which wipes and immediately rebuilds fixture
 * data; this exists for testing flows (onboarding, empty states) against a
 * truly clean tenant, which the demo reset can't do because it never leaves
 * things empty.
 *
 * Deletes exactly what `seedDemoTenant` deletes (Payment, Order, WineOrder,
 * Company, MenuItem, MasterclassItem, onboarding-flag Settings) and stops
 * there — Max's call: "wipe whatever demo can reseed." Wines, general
 * settings and site content are untouched.
 *
 * SAFETY: resolves the tenant by slug ('staging-winery') and refuses anything
 * else, so it cannot be aimed at a real winery even if called against the
 * wrong database.
 */
import type { PrismaClient } from '@prisma/client'

export const STAGING_SLUG = 'staging-winery'

const ONBOARDING_KEYS = [
  'onboarding_works_with_companies',
  'onboarding_offers_food_addons',
  'onboarding_offers_masterclasses',
  'onboarding_launched_at',
]

export async function wipeStagingTenant(db: PrismaClient): Promise<{
  tenantId: string
  tenantName: string
  deleted: { orders: number; wineOrders: number; companies: number; payments: number }
}> {
  const tenant = await db.tenant.findFirst({ where: { slug: STAGING_SLUG } })
  if (!tenant) throw new Error(`No tenant with slug "${STAGING_SLUG}" on this database.`)
  const tid = tenant.id

  const before = await db.$transaction([
    db.order.count({ where: { tenantId: tid } }),
    db.wineOrder.count({ where: { tenantId: tid } }),
    db.company.count({ where: { tenantId: tid } }),
    db.payment.count({ where: { tenantId: tid } }),
  ])

  // Order matters: payments reference orders; order lines and wine items
  // cascade; companies can only go once nothing references them.
  await db.payment.deleteMany({ where: { tenantId: tid } })
  await db.order.deleteMany({ where: { tenantId: tid } })
  await db.wineOrder.deleteMany({ where: { tenantId: tid } })
  await db.company.deleteMany({ where: { tenantId: tid } })
  await db.menuItem.deleteMany({ where: { tenantId: tid } })
  await db.masterclassItem.deleteMany({ where: { tenantId: tid } })
  await db.setting.deleteMany({ where: { tenantId: tid, key: { in: ONBOARDING_KEYS } } })

  return {
    tenantId: tid,
    tenantName: tenant.displayName ?? tenant.name,
    deleted: {
      orders: before[0],
      wineOrders: before[1],
      companies: before[2],
      payments: before[3],
    },
  }
}
