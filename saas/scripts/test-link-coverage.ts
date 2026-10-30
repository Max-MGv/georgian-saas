/**
 * T-318 R3 (blind review) — an ADMIN card link marks an order Paid only when the money on the ledger now covers
 * the total. A link is for a fixed amount and cannot be cancelled; if the price changed after it was made, the
 * old link can still be paid, and that must not turn a part-paid order Paid.
 *
 *   booking, total 25000:  link 10000 settles → payment recorded, order NOT paid;  link 15000 settles → Paid.
 *   wine order, due 4500:  link 3000 settles → NOT paid;  link 1500 settles → Paid.
 *   control: the guest's OWN checkout (no `-topup-` marker) for the full price still marks Paid, as before.
 *
 * Throwaway rows on the DEV database (deleted at the end) → needs --write; dry run without it.
 *
 * Run: npx tsx scripts/test-link-coverage.ts --write
 */
import { db } from '../lib/db'
import { settlePayment } from '../lib/payments/settle'
import { buildSignature } from '../lib/payments/flitt'
import { seedStageColumns } from '../lib/statusWrite'

if (!process.argv.includes('--write')) {
  console.log('Dry run (no --write): would create throwaway booking / wine-order rows on the DEV database, settle signed')
  console.log('fake callbacks for part-covering and completing admin links, check when the order turns Paid, then delete them.')
  process.exit(0)
}

// No real mail from this process, whatever .env says (nothing here sends: settlePayment itself never mails).
process.env.RESEND_API_KEY = ''

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-cov-' + Date.now()
const ago = (ms: number) => new Date(Date.now() - ms)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
const signed = (fields: Record<string, string | number>, secret: string) => ({ ...fields, signature: buildSignature(fields, secret) })
const approved = (pid: string, amount: number) => ({ payment_id: pid, order_status: 'approved', amount, currency: 'GEL' })

async function main() {
  const secret = (await db.tenant.findUnique({ where: { id: TENANT }, select: { flittSecretKey: true } }))?.flittSecretKey
  if (!secret) throw new Error('Staging Winery has no flittSecretKey configured — cannot build valid signatures')

  const orderIds: string[] = []
  const wineIds: string[] = []
  const pay = (target: { orderId?: string; wineOrderId?: string }, pid: string, amount: number, ref?: string) =>
    db.payment.create({ data: { tenantId: TENANT, ...target, provider: 'flitt', providerPaymentId: pid, flittOrderId: ref, amount, status: 'created' } })
  const paidAtOf = async (t: { orderId?: string; wineOrderId?: string }) =>
    t.orderId ? (await db.order.findUnique({ where: { id: t.orderId }, select: { paidAt: true } }))?.paidAt
      : (await db.wineOrder.findUnique({ where: { id: t.wineOrderId }, select: { paidAt: true } }))?.paidAt

  try {
    console.log('\nBooking, total 25000\n')
    const b = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-b`, totalPrice: 25000, ...seedStageColumns('booking', 'CONFIRMED', ago(86_400_000)),
      },
    })
    orderIds.push(b.id)
    await pay({ orderId: b.id }, `${PREFIX}-b1`, 10000, `${b.id}-topup-7d-aa-bb`)
    const r1 = await settlePayment(signed(approved(`${PREFIX}-b1`, 10000), secret))
    check('the 10000 link settles', r1.ok && r1.outcome === 'settled')
    check('…but 10000 of 25000 does NOT mark the booking Paid', (await paidAtOf({ orderId: b.id })) == null)
    await pay({ orderId: b.id }, `${PREFIX}-b2`, 15000, `${b.id}-topup-7d-cc-dd`)
    const r2 = await settlePayment(signed(approved(`${PREFIX}-b2`, 15000), secret))
    check('the 15000 link settles', r2.ok && r2.outcome === 'settled')
    check('…and now 25000 of 25000 DOES mark it Paid', (await paidAtOf({ orderId: b.id })) != null)

    console.log('\nWine order, wines 3000 + fee 1500\n')
    const w = await db.wineOrder.create({
      data: {
        tenantId: TENANT, businessName: `ZZ ${PREFIX}-w`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
        contactEmail: 'zz-cov@example.invalid', totalAmount: 3000, deliveryFee: 1500, ...seedStageColumns('wineOrder', 'NEW', ago(86_400_000)),
      },
    })
    wineIds.push(w.id)
    await pay({ wineOrderId: w.id }, `${PREFIX}-w1`, 3000, `${w.id}-topup-7d-ee-ff`)
    const r3 = await settlePayment(signed(approved(`${PREFIX}-w1`, 3000), secret))
    check('the 3000 link settles', r3.ok && r3.outcome === 'settled')
    check('…but 3000 of 4500 does NOT mark the wine order Paid', (await paidAtOf({ wineOrderId: w.id })) == null)
    await pay({ wineOrderId: w.id }, `${PREFIX}-w2`, 1500, `${w.id}-topup-7d-gg-hh`)
    await settlePayment(signed(approved(`${PREFIX}-w2`, 1500), secret))
    check('…and 4500 of 4500 DOES', (await paidAtOf({ wineOrderId: w.id })) != null)

    console.log('\nThe return page after a DECLINE\n')
    const d = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-d`, totalPrice: 25000, ...seedStageColumns('booking', 'NEW', ago(3_600_000)),
      },
    })
    orderIds.push(d.id)
    await pay({ orderId: d.id }, `${PREFIX}-d1`, 25000)
    const declined = (pid: string) => ({ payment_id: pid, order_status: 'declined', amount: 25000, currency: 'GEL' })
    const first = await settlePayment(signed(declined(`${PREFIX}-d1`), secret))
    const again = await settlePayment(signed(declined(`${PREFIX}-d1`), secret))
    check('the first decline is recorded and is not approved', first.ok && first.outcome === 'not-approved' && first.approved === false)
    check('the duplicate decline is "already-settled" but still NOT approved (the return route must show failed)', again.ok && again.outcome === 'already-settled' && again.approved === false, JSON.stringify(again))
    check('and the order was not marked Paid', (await paidAtOf({ orderId: d.id })) == null)

    console.log('\nControl — the guest\'s own checkout\n')
    const c = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-c`, totalPrice: 25000, ...seedStageColumns('booking', 'NEW', ago(3_600_000)),
      },
    })
    orderIds.push(c.id)
    await pay({ orderId: c.id }, `${PREFIX}-c1`, 25000) // no marker: the guest's own checkout
    await settlePayment(signed(approved(`${PREFIX}-c1`, 25000), secret))
    check('a full-price guest checkout still marks Paid', (await paidAtOf({ orderId: c.id })) != null)
  } finally {
    await db.orderEvent.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    await db.payment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.wineOrder.deleteMany({ where: { id: { in: wineIds } } })
    console.log(`\n(cleanup: ${orderIds.length} bookings + ${wineIds.length} wine orders removed)`)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
