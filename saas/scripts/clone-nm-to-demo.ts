/**
 * ONE-OFF: clones Nikalas Marani's tenant content from the PROD database
 * into a "Vineworks Demo" tenant, for the demo.vineworks.ge sandbox
 * ([[Plan-DemoSite]]). Same shape as clone-nm-to-staging.ts.
 *
 * Copies: Tenant row (new id/slug/domain), Settings, SiteContent, Companies
 * (+ Price tiers), Wines (+ WineVintages), MenuItems, MasterclassItems, BlockedDates.
 * Deliberately NOT copied: Orders, WineOrders (real customer data), auth users.
 *
 * Run:  npx tsx scripts/clone-nm-to-demo.ts
 * Env:  SOURCE_URL (prod, read-only usage) + TARGET_URL (dev or prod, whichever
 *       DB the demo tenant should live in) must be set.
 *       DEMO_DOMAIN optional — defaults to a placeholder; update Tenant.domain
 *       once the real domain (demo.vineworks.ge) is ready to point at this row.
 *
 * Snapshot semantics: this is a point-in-time copy. Re-running it later to
 * refresh the demo requires wiping the demo tenant's rows first (the script
 * refuses to run if the demo tenant already exists).
 */
import { PrismaClient } from '@prisma/client'

const NM_TENANT_ID = 'cmqou94er0000vl1sl9v0yv54'
const DEMO_DOMAIN = process.env.DEMO_DOMAIN ?? 'demo.placeholder.local'

const source = new PrismaClient({ datasources: { db: { url: process.env.SOURCE_URL } } })
const target = new PrismaClient({ datasources: { db: { url: process.env.TARGET_URL } } })

async function main() {
  if (!process.env.SOURCE_URL || !process.env.TARGET_URL) {
    throw new Error('SOURCE_URL and TARGET_URL env vars are required')
  }

  const nm = await source.tenant.findUnique({ where: { id: NM_TENANT_ID } })
  if (!nm) throw new Error('NM tenant not found in SOURCE db — wrong SOURCE_URL?')

  const existing = await target.tenant.findFirst({ where: { slug: 'vineworks-demo' } })
  if (existing) throw new Error('vineworks-demo already exists in TARGET db — wipe it first to re-clone')

  // Tenant row — NM's branding/theme/modules, demo identity
  const demo = await target.tenant.create({
    data: {
      name: 'Vineworks Demo',
      displayName: 'Vineworks Estate',
      slug: 'vineworks-demo',
      domain: DEMO_DOMAIN,
      theme: nm.theme ?? undefined,
      logoUrl: nm.logoUrl,
      logoAlt: nm.logoAlt,
      faviconUrl: nm.faviconUrl,
      modulesBooking: nm.modulesBooking,
      modulesWineOrders: nm.modulesWineOrders,
      modulesPublicSite: nm.modulesPublicSite,
      modulesLegalPages: nm.modulesLegalPages,
      modulesOnlinePayment: nm.modulesOnlinePayment,
      wineDetailLevel: nm.wineDetailLevel,
    },
  })
  const did = demo.id
  console.log(`Created demo tenant ${did}`)

  const settings = await source.setting.findMany({ where: { tenantId: NM_TENANT_ID } })
  await target.setting.createMany({
    data: settings.map(({ id, tenantId, ...r }) => ({ ...r, tenantId: did })),
  })
  console.log(`Settings: ${settings.length}`)

  const content = await source.siteContent.findMany({ where: { tenantId: NM_TENANT_ID } })
  await target.siteContent.createMany({
    data: content.map(({ id, tenantId, ...r }) => ({ ...r, tenantId: did })),
  })
  console.log(`SiteContent: ${content.length}`)

  const companies = await source.company.findMany({
    where: { tenantId: NM_TENANT_ID },
    include: { prices: true },
  })
  for (const c of companies) {
    const { id, tenantId, prices, ...row } = c
    const created = await target.company.create({ data: { ...row, tenantId: did } })
    if (prices.length) {
      await target.price.createMany({
        data: prices.map(({ id, companyId, ...p }) => ({ ...p, companyId: created.id })),
      })
    }
  }
  console.log(`Companies: ${companies.length} (with price tiers)`)

  const wines = await source.wine.findMany({
    where: { tenantId: NM_TENANT_ID },
    include: { vintages: true },
  })
  for (const w of wines) {
    const { id, tenantId, vintages, ...row } = w
    const created = await target.wine.create({ data: { ...row, tenantId: did } })
    if (vintages.length) {
      await target.wineVintage.createMany({
        data: vintages.map(({ id, wineId, tenantId: tid, ...v }) => ({
          ...v, wineId: created.id, tenantId: tid == null ? tid : did,
        })),
      })
    }
  }
  console.log(`Wines: ${wines.length} (with vintages)`)

  const menuItems = await source.menuItem.findMany({ where: { tenantId: NM_TENANT_ID } })
  await target.menuItem.createMany({
    data: menuItems.map(({ id, tenantId, ...r }) => ({ ...r, tenantId: did })),
  })
  console.log(`MenuItems: ${menuItems.length}`)

  const mcItems = await source.masterclassItem.findMany({ where: { tenantId: NM_TENANT_ID } })
  await target.masterclassItem.createMany({
    data: mcItems.map(({ id, tenantId, ...r }) => ({ ...r, tenantId: did })),
  })
  console.log(`MasterclassItems: ${mcItems.length}`)

  const blocked = await source.blockedDate.findMany({ where: { tenantId: NM_TENANT_ID } })
  await target.blockedDate.createMany({
    data: blocked.map(({ id, tenantId, ...r }) => ({ ...r, tenantId: did })),
  })
  console.log(`BlockedDates: ${blocked.length}`)

  console.log(`\nDone. Demo tenant id: ${did}`)
  console.log(`Remember: set Tenant.domain to demo.vineworks.ge once ready to go live.`)
}

main().finally(async () => {
  await source.$disconnect()
  await target.$disconnect()
})
