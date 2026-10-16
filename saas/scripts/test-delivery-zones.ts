/**
 * Delivery zones (T-8, vault/Plan-WineOrderFeatures.md Chunk 4): cross-tenant isolation, the
 * database's own money guards, SetNull on delete, and the rules parser's fallbacks.
 *
 * Run: npx tsx scripts/test-delivery-zones.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'
import { parseWineOrderRules, meetsMinimum } from '../lib/wineOrderRules'

const db = new PrismaClient()
const A = 'zz-test-delivery-zones-a'
const B = 'zz-test-delivery-zones-b'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
async function rejects(fn: () => Promise<unknown>) {
  try { await fn(); return false } catch { return true }
}

async function cleanup() {
  await db.wineOrder.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.companyAddress.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.deliveryZone.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── Delivery zones ──\n')
  await cleanup()
  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Zones A', domain: 'zz-zones-a.invalid', slug: A },
      { id: B, name: 'ZZ Zones B', domain: 'zz-zones-b.invalid', slug: B },
    ],
  })
  const zA = await withTenantDb(A, tx => tx.deliveryZone.create({ data: { tenantId: A, nameEn: 'Tbilisi', fee: 0 } }))
  const zB = await withTenantDb(B, tx => tx.deliveryZone.create({ data: { tenantId: B, nameEn: 'Batumi', fee: 2500 } }))

  for (const [t, own] of [[A, zA.id], [B, zB.id]] as const) {
    const rows = await withTenantDb(t, tx => tx.deliveryZone.findMany())
    check(`${t}: sees exactly its 1 zone`, rows.length === 1 && rows[0]!.id === own, `saw ${rows.length}`)
  }
  check("B's zone is invisible to A by id", (await withTenantDb(A, tx => tx.deliveryZone.findUnique({ where: { id: zB.id } }))) === null)
  const upd = await withTenantDb(A, tx => tx.deliveryZone.updateMany({ where: { id: zB.id }, data: { fee: 1 } }))
  check("A cannot reprice B's zone", upd.count === 0)
  check('A cannot create a zone for B (WITH CHECK)',
    await rejects(() => withTenantDb(A, tx => tx.deliveryZone.create({ data: { tenantId: B, nameEn: 'Smuggled', fee: 0 } }))))

  // ── Money guards in the database itself ──
  check('A negative zone fee is refused by the database',
    await rejects(() => db.deliveryZone.create({ data: { tenantId: A, nameEn: 'Neg', fee: -1 } })))
  const base = { tenantId: A, businessName: 'ZZ', address: 'ZZ', contactName: 'ZZ', contactPhone: '0' }
  check('A negative order delivery fee is refused',
    await rejects(() => db.wineOrder.create({ data: { ...base, deliveryFee: -5 } })))
  check('A pickup order with a delivery fee is refused',
    await rejects(() => db.wineOrder.create({ data: { ...base, fulfilment: 'PICKUP', deliveryFee: 500 } })))
  check('A pickup order with a fee still pending is refused',
    await rejects(() => db.wineOrder.create({ data: { ...base, fulfilment: 'PICKUP', deliveryFeePending: true } })))
  const pickupOk = await db.wineOrder.create({ data: { ...base, fulfilment: 'PICKUP' } })
  check('A plain pickup order is accepted', !!pickupOk.id)

  // ── Deleting a zone keeps the order's snapshot and the address ──
  const company = await db.company.create({
    data: { tenantId: A, name: 'ZZ Co', isWineOrderCompany: true, addresses: { create: [{ address: 'ZZ st', deliveryZoneId: zA.id }] } },
    include: { addresses: true },
  })
  const order = await db.wineOrder.create({
    data: { ...base, companyId: company.id, deliveryZoneId: zA.id, deliveryZoneName: 'Tbilisi', deliveryFee: 0 },
  })
  await withTenantDb(A, tx => tx.deliveryZone.delete({ where: { id: zA.id } }))
  const o2 = await db.wineOrder.findUnique({ where: { id: order.id } })
  const a2 = await db.companyAddress.findUnique({ where: { id: company.addresses[0]!.id } })
  check('Deleting a zone keeps the order, link null, snapshot intact',
    o2?.deliveryZoneId === null && o2?.deliveryZoneName === 'Tbilisi' && o2?.deliveryFee === 0)
  check('…and keeps the address, just without a zone', a2 !== null && a2.deliveryZoneId === null)

  // ── Rules parser ──
  const rules = (m: Record<string, string>) => parseWineOrderRules(k => m[k])
  check('Unset rules → no minimum, no pickup, pay for wine now', JSON.stringify(rules({})) === JSON.stringify({ minOrder: { type: 'off' }, pickupEnabled: false, unknownZonePayment: 'pay_wine_now' }))
  check('Bottles minimum parsed', rules({ wine_min_order_type: 'bottles', wine_min_order_value: '6' }).minOrder.type === 'bottles')
  check('Garbage minimum value → off', rules({ wine_min_order_type: 'amount', wine_min_order_value: 'abc' }).minOrder.type === 'off')
  check('Zero minimum value → off', rules({ wine_min_order_type: 'bottles', wine_min_order_value: '0' }).minOrder.type === 'off')
  check('Unknown type → off', rules({ wine_min_order_type: 'litres', wine_min_order_value: '5' }).minOrder.type === 'off')
  check("Only 'reservation' selects reservation", rules({ wine_unknown_zone_payment: 'RESERVATION' }).unknownZonePayment === 'pay_wine_now')
  const six = rules({ wine_min_order_type: 'bottles', wine_min_order_value: '6' }).minOrder
  check('6-bottle minimum: 5 fails, 6 passes', !meetsMinimum(six, 5, 99999) && meetsMinimum(six, 6, 0))
  const amt = rules({ wine_min_order_type: 'amount', wine_min_order_value: '20000' }).minOrder
  check('200₾ minimum: 199.99₾ fails, 200₾ passes', !meetsMinimum(amt, 99, 19999) && meetsMinimum(amt, 1, 20000))

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch(async e => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exitCode = 1 })
  .finally(() => db.$disconnect())
