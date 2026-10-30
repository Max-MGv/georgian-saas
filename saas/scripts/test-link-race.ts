/**
 * T-318 (Max, 2026-10-30) — two admins pressing Card at the same moment must end up with ONE link.
 *
 * Fires two admin-link requests for the same order at once. Before the advisory lock both found nothing
 * open (the first link only exists once Flitt answers) and each minted its own link. Now the second waits,
 * finds the first's link and gets it back (`reused`).
 *
 *   booking, total 12345:   2 concurrent starts → same paymentId, exactly one Payment row, one `reused`.
 *   wine order, due 4500:   same.
 *   control:                a later third request → the same link again, still one row.
 *
 * Calls the REAL Flitt test merchant (creates one unpaid checkout per order — never paid) and writes
 * throwaway rows on the DEV database (deleted at the end) → needs --write; dry run without it.
 *
 * Run: npx tsx scripts/test-link-race.ts --write
 */
import Module from 'node:module'

if (!process.argv.includes('--write')) {
  console.log('Dry run (no --write): would create a throwaway booking and wine order on the DEV database, ask the Flitt')
  console.log('test merchant for a card link twice AT ONCE for each, check both callers get the same single link, then delete them.')
  process.exit(0)
}

// startCheckout reads the request's Host header to build the callback URLs; there is no request here.
const load = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load
;(Module as unknown as { _load: unknown })._load = function (this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === 'next/headers') return { headers: async () => new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }) }
  return load.call(this, request, ...rest)
}

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-race-' + Date.now()
const ago = (ms: number) => new Date(Date.now() - ms)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  const { db } = await import('../lib/db')
  const { seedStageColumns } = await import('../lib/statusWrite')
  const { startTopUpCheckout, startWineTopUpCheckout } = await import('../lib/payments/topUpCheckout')
  const { asTetri } = await import('../lib/money')

  const orderIds: string[] = []
  const wineIds: string[] = []
  try {
    console.log('\nBooking, total 12345 — two requests at once\n')
    const b = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-b`, totalPrice: 12345, ...seedStageColumns('booking', 'CONFIRMED', ago(86_400_000)),
      },
    })
    orderIds.push(b.id)
    const askBooking = () => startTopUpCheckout({ orderId: b.id, tenantId: TENANT, amount: asTetri(12345), orderDesc: 'ZZ race test', locale: 'en' })
    const [b1, b2] = await Promise.all([askBooking(), askBooking()])
    check('both requests succeed', 'success' in b1 && 'success' in b2, JSON.stringify([b1, b2]))
    if ('success' in b1 && 'success' in b2) {
      check('…and got the SAME link', b1.paymentId === b2.paymentId && b1.checkoutUrl === b2.checkoutUrl)
      check('…exactly one of them was a reuse', [b1.reused, b2.reused].filter(Boolean).length === 1, JSON.stringify([b1.reused, b2.reused]))
    }
    check('only ONE Payment row exists for the booking', (await db.payment.count({ where: { orderId: b.id } })) === 1)
    const b3 = await askBooking()
    check('a later request hands the same link back', 'success' in b3 && 'success' in b1 && b3.paymentId === b1.paymentId && b3.reused === true)
    check('…and there is still one row', (await db.payment.count({ where: { orderId: b.id } })) === 1)

    console.log('\nWine order, wines 3000 + fee 1500 — two requests at once\n')
    const w = await db.wineOrder.create({
      data: {
        tenantId: TENANT, businessName: `ZZ ${PREFIX}-w`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
        contactEmail: 'zz-race@example.invalid', totalAmount: 3000, deliveryFee: 1500, ...seedStageColumns('wineOrder', 'NEW', ago(86_400_000)),
      },
    })
    wineIds.push(w.id)
    const askWine = () => startWineTopUpCheckout({ wineOrderId: w.id, tenantId: TENANT, amount: asTetri(4500), orderDesc: 'ZZ race test', locale: 'en' })
    const [w1, w2] = await Promise.all([askWine(), askWine()])
    check('both requests succeed', 'success' in w1 && 'success' in w2, JSON.stringify([w1, w2]))
    if ('success' in w1 && 'success' in w2) {
      check('…and got the SAME link', w1.paymentId === w2.paymentId)
      check('…exactly one of them was a reuse', [w1.reused, w2.reused].filter(Boolean).length === 1, JSON.stringify([w1.reused, w2.reused]))
    }
    check('only ONE Payment row exists for the wine order', (await db.payment.count({ where: { wineOrderId: w.id } })) === 1)

    console.log('\nDifferent orders do not wait for each other\n')
    const other = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-02'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-o`, totalPrice: 5000, ...seedStageColumns('booking', 'CONFIRMED', ago(86_400_000)),
      },
    })
    orderIds.push(other.id)
    const [x, y] = await Promise.all([
      askBooking(),
      startTopUpCheckout({ orderId: other.id, tenantId: TENANT, amount: asTetri(5000), orderDesc: 'ZZ race test', locale: 'en' }),
    ])
    check('two different orders each get their own link', 'success' in x && 'success' in y && x.paymentId !== y.paymentId)
  } finally {
    await db.orderEvent.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    await db.payment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.wineOrder.deleteMany({ where: { id: { in: wineIds } } })
    console.log(`\n(cleanup: ${orderIds.length} bookings + ${wineIds.length} wine orders removed)`)
    await db.$disconnect()
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
