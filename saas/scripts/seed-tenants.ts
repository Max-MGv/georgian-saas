/**
 * Tenant seed + backfill script
 * Run: npx tsx scripts/seed-tenants.ts
 *
 * What this does:
 *   1. Creates Nikalas Marani as Tenant 1 (production)
 *   2. Creates a test tenant for local multi-tenant testing
 *   3. Backfills all existing rows with Nikalas Marani's tenantId
 */

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const db = new PrismaClient()

async function main() {
  // ── 1. Upsert tenants ────────────────────────────────────────────────────────

  console.log('\n-- Tenants --')

  const nikalas = await db.tenant.upsert({
    where: { domain: 'nikalasmarani.ge' },
    update: {},
    create: {
      name: 'Nikalas Marani',
      domain: 'nikalasmarani.ge',
      slug: 'nikalasmarani',
    },
  })
  console.log(`✓ Tenant 1: ${nikalas.name} (${nikalas.id})`)

  const testTenant = await db.tenant.upsert({
    where: { domain: 'winery2.local' },
    update: {},
    create: {
      name: 'Test Winery',
      domain: 'winery2.local',
      slug: 'test-winery',
    },
  })
  console.log(`✓ Tenant 2: ${testTenant.name} (${testTenant.id})`)

  // ── 2. Backfill existing rows → Nikalas Marani ───────────────────────────────

  console.log('\n-- Backfill (tenantId = null → nikalasmarani) --')

  const tenantId = nikalas.id

  const [orders, companies, wines, wineOrders, menuItems, masterclassItems, settings, siteContent, blockedDates] =
    await Promise.all([
      db.order.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.company.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.wine.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.wineOrder.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.menuItem.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.masterclassItem.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.setting.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.siteContent.updateMany({ where: { tenantId: null }, data: { tenantId } }),
      db.blockedDate.updateMany({ where: { tenantId: null }, data: { tenantId } }),
    ])

  console.log(`  Orders:           ${orders.count} rows`)
  console.log(`  Companies:        ${companies.count} rows`)
  console.log(`  Wines:            ${wines.count} rows`)
  console.log(`  Wine Orders:      ${wineOrders.count} rows`)
  console.log(`  Menu Items:       ${menuItems.count} rows`)
  console.log(`  Masterclass Items:${masterclassItems.count} rows`)
  console.log(`  Settings:         ${settings.count} rows`)
  console.log(`  Site Content:     ${siteContent.count} rows`)
  console.log(`  Blocked Dates:    ${blockedDates.count} rows`)

  console.log('\n✅ Done. All existing rows are now assigned to Nikalas Marani.')
  console.log(`   Nikalas Marani tenantId: ${nikalas.id}`)
  console.log(`   Test Winery tenantId:    ${testTenant.id}`)
  console.log('\n   Save these IDs — you will need them for the middleware env var.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
