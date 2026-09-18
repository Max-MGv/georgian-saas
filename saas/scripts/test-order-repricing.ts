/**
 * Proves an order cannot be re-priced by a later change to a company's tiers
 * (chunk 4 of vault/DataModel/Plan-DataModel.md).
 *
 * The bug this guards: `recalcOrderTotal` used to re-read the company's *live*
 * `Price` rows. Change a company's rates in March, add a ₾20 extra to their
 * February booking, and the whole booking silently re-priced at March rates.
 * Nobody would have seen it happen — the total simply became a different
 * number, with no error and no record of the old one.
 *
 * Creates its own throwaway company and orders, and deletes them at the end.
 * All amounts are tetri.
 *
 *   npx tsx scripts/test-order-repricing.ts
 */
import { db } from '../lib/db'
import { recalcOrderTotal } from '../lib/pricing'

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) { passed++; console.log(`  ok   ${label}`); return }
  failed++
  console.error(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function main() {
  const company = await db.company.create({
    data: {
      name: `ZZ-repricing-probe-${Date.now()}`,
      tenantId: TENANT,
      isBookingCompany: true,
      prices: {
        create: [{
          minGuests: 1, maxGuests: 100,
          pricePerPerson: 7000,             // ₾70
          tastingLunchPricePerPerson: 3000, // +₾30 → combo ₾100
          registrationPrice: 2500,          // ₾25
        }],
      },
    },
    include: { prices: true },
  })
  const tier = company.prices[0]

  // ── 1. An order sold at today's rates ─────────────────────────────────────
  // 4 tasting guests at ₾70 + ₾25 registration = ₾305
  const order = await db.order.create({
    data: {
      tenantId: TENANT, companyId: company.id,
      bookingType: 'COMPANY', visitType: 'TASTING',
      date: new Date('2030-01-01'), timeSlot: '12:00',
      guestCount: 4, tastingGuestCount: 4, lunchGuestCount: 0,
      name: 'ZZ', surname: 'Repricing',
      totalPrice: 30500,
      tastingRateSnapshot: tier.pricePerPerson,
      lunchRateSnapshot: tier.pricePerPerson + tier.tastingLunchPricePerPerson,
      registrationFeeSnapshot: tier.registrationPrice,
    },
  })

  await recalcOrderTotal(order.id, TENANT)
  check('recalc with no lines reproduces the original total',
    (await db.order.findUnique({ where: { id: order.id } }))!.totalPrice, 30500)

  // ── 2. The winery raises its prices ───────────────────────────────────────
  await db.price.update({
    where: { id: tier.id },
    data: { pricePerPerson: 9000, registrationPrice: 5000 }, // ₾70 → ₾90, ₾25 → ₾50
  })

  // ── 3. An admin adds a ₾20 extra to the OLD booking ───────────────────────
  await db.orderExtra.create({ data: { orderId: order.id, label: 'ZZ probe extra', amount: 2000 } })
  await recalcOrderTotal(order.id, TENANT)

  const after = (await db.order.findUnique({ where: { id: order.id } }))!.totalPrice
  // Correct: the booking keeps its agreed rates and only gains the extra.
  check('the extra is added at the ORIGINAL rates', after, 32500)
  // What the bug did: 4 × ₾90 + ₾50 + ₾20 = ₾430. If this ever matches, the
  // snapshot is being ignored and live tiers are back in the hot path.
  check('it did NOT reprice at the new tier', after === 43000, false)

  // ── 4. Orders predating the snapshot still recalc, from live tiers ────────
  const legacy = await db.order.create({
    data: {
      tenantId: TENANT, companyId: company.id,
      bookingType: 'COMPANY', visitType: 'TASTING',
      date: new Date('2030-01-02'), timeSlot: '12:00',
      guestCount: 4, tastingGuestCount: 4, lunchGuestCount: 0,
      name: 'ZZ', surname: 'Legacy',
      totalPrice: 0,
      // no snapshot — the pre-chunk-4 shape
    },
  })
  await recalcOrderTotal(legacy.id, TENANT)
  // 4 × ₾90 + ₾50 = ₾410, from the tiers as they now stand. Expected, and the
  // module logs a warning when it takes this path.
  check('a snapshot-less order falls back to live tiers',
    (await db.order.findUnique({ where: { id: legacy.id } }))!.totalPrice, 41000)

  // ── 5. Lunch guests use the combo rate from the snapshot ──────────────────
  const combo = await db.order.create({
    data: {
      tenantId: TENANT, companyId: company.id,
      bookingType: 'COMPANY', visitType: 'TASTING_LUNCH',
      date: new Date('2030-01-03'), timeSlot: '12:00',
      guestCount: 3, tastingGuestCount: 1, lunchGuestCount: 2,
      name: 'ZZ', surname: 'Combo',
      totalPrice: 0,
      tastingRateSnapshot: 7000, lunchRateSnapshot: 10000, registrationFeeSnapshot: 2500,
    },
  })
  await recalcOrderTotal(combo.id, TENANT)
  // 1 × ₾70 + 2 × ₾100 + ₾25 = ₾295
  check('split counts price off the snapshot',
    (await db.order.findUnique({ where: { id: combo.id } }))!.totalPrice, 29500)

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await db.order.deleteMany({ where: { companyId: company.id } })
  await db.company.delete({ where: { id: company.id } })
  const leftover = await db.company.count({ where: { name: { startsWith: 'ZZ-repricing-probe' } } })
  check('probe data cleaned up', leftover, 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async err => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
