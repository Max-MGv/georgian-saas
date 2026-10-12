/**
 * `startTopUpCheckout` (bookings) and `startWineTopUpCheckout` (wine orders) — the shared card-link
 * top-up code after T-8 Chunk 6b generalised it (lib/payments/topUpCheckout.ts): the guards that
 * run BEFORE any checkout is created (balance, tenant). The success path calls `startCheckout`,
 * which reads request headers for its return URL, so it is covered by Playwright instead
 * (tier3 wine-order-delivery-fee.spec.ts; tier5 payment-post-payment-extras.spec.ts for bookings).
 *
 * Run: npx tsx scripts/test-topup-checkout.ts   (dev database only)
 */
import { db } from '../lib/db'
import { startTopUpCheckout, startWineTopUpCheckout } from '../lib/payments/topUpCheckout'
import { asTetri } from '../lib/money'

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('\n── top-up checkouts: booking + wine order ──\n')
  const booking = await db.order.create({
    data: {
      tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'),
      timeSlot: '12:00', guestCount: 2, name: 'ZZ', surname: 'TopUp', totalPrice: 20000, paidAt: new Date(),
      payments: { create: { tenantId: TENANT, provider: 'manual', method: 'CASH', status: 'recorded', amount: 15000, settledAt: new Date() } },
    },
  })
  const wine = await db.wineOrder.create({
    data: {
      tenantId: TENANT, businessName: 'ZZ TopUp Wine', address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
      totalAmount: 3000, deliveryFee: 1500, paidAt: new Date(),
      payments: { create: { tenantId: TENANT, provider: 'manual', method: 'CASH', status: 'recorded', amount: 3000, settledAt: new Date() } },
    },
  })
  try {
    // Booking — unchanged behaviour after the refactor: balance 50₾.
    const over = await startTopUpCheckout({ orderId: booking.id, tenantId: TENANT, amount: asTetri(5001), orderDesc: 'ZZ' })
    check('booking: more than the balance is refused', 'error' in over)
    // Wine order — balance 15₾ (the delivery fee).
    const wOver = await startWineTopUpCheckout({ wineOrderId: wine.id, tenantId: TENANT, amount: asTetri(1501), orderDesc: 'ZZ' })
    check('wine: more than the balance is refused', 'error' in wOver)
    const wOther = await startWineTopUpCheckout({ wineOrderId: wine.id, tenantId: 'zz-not-this-tenant', amount: asTetri(1500), orderDesc: 'ZZ' })
    check("wine: another tenant's id cannot start a checkout", 'error' in wOther)
  } finally {
    await db.order.delete({ where: { id: booking.id } })
    await db.wineOrder.delete({ where: { id: wine.id } })
  }
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error('ERROR:', e); process.exitCode = 1 }).finally(() => db.$disconnect())
