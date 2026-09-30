/**
 * Verifies KnownBugs.md #65: a second real settlement on the same order must
 * not overwrite Order.paidAt.
 *
 * settlePayment()'s `stage: 'NEW'` guard exists to stop a late gateway
 * callback from dragging a booking a human already moved forward. It never
 * checked whether the order had already been paid once, so a second
 * independent payment on the same order (a manual deposit + a card top-up,
 * or two Flitt payments — a real, shipped flow) — while the order's stage is
 * still NEW, which is ordinary — would silently move `paidAt` forward on
 * every subsequent settlement.
 *
 * This script proves the bug on the code as it stands, then (after the fix
 * lands) proves it's gone, using validly-signed synthetic callback bodies
 * built the same way scripts/test-payment-flow.ts does — no real Flitt call.
 *
 * Run: npx tsx scripts/test-settle-double-payment.ts
 */
import { db } from '../lib/db'
import { settlePayment } from '../lib/payments/settle'
import { buildSignature } from '../lib/payments/flitt'

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-dbl-' + Date.now()

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

function signedBody(fields: Record<string, string | number>, secret: string) {
  return { ...fields, signature: buildSignature(fields, secret) }
}

async function makeOrder(surname: string) {
  return db.order.create({
    data: {
      tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING',
      date: new Date('2030-08-01'), timeSlot: '12:00',
      guestCount: 2, name: 'ZZ', surname, totalPrice: 20000,
    },
  })
}

async function makePayment(orderId: string, pid: string, amount: number) {
  return db.payment.create({
    data: { tenantId: TENANT, orderId, provider: 'flitt', providerPaymentId: pid, amount, status: 'created' },
  })
}

async function main() {
  const secret = (await db.tenant.findUnique({ where: { id: TENANT }, select: { flittSecretKey: true } }))?.flittSecretKey
  if (!secret) throw new Error('Staging Winery has no flittSecretKey configured — cannot build valid signatures')

  console.log('\n── settlePayment: second settlement must not move paidAt (KnownBugs #65) ──\n')

  const orderIds: string[] = []

  try {
    // ── Part A: prove the bug (or confirm the fix holds) on a fresh order ──
    console.log('Part A — two real settlements on one NEW-stage order\n')
    const orderA = await makeOrder('DblA')
    orderIds.push(orderA.id)

    const pidA1 = PREFIX + '-a1'
    await makePayment(orderA.id, pidA1, 10000)
    const r1 = await settlePayment(signedBody({ payment_id: pidA1, order_status: 'approved', amount: 10000, currency: 'GEL' }, secret))
    check('first settlement succeeds', r1.ok && r1.outcome === 'settled', JSON.stringify(r1))
    const afterFirst = await db.order.findUnique({ where: { id: orderA.id } })
    check('order paidAt set after first settlement', afterFirst?.paidAt != null, `paidAt=${afterFirst?.paidAt}`)
    const firstPaidAt = afterFirst?.paidAt ?? null

    // Second, independent payment on the SAME order. Stage is still NEW —
    // ordinary; not every booking gets its stage dropdown advanced.
    const orderCheck = await db.order.findUnique({ where: { id: orderA.id }, select: { stage: true } })
    check('order stage is still NEW before second payment', orderCheck?.stage === 'NEW', `stage=${orderCheck?.stage}`)

    // Ensure a clearly later timestamp so a timestamp mixup can't mask the bug.
    await new Promise(r => setTimeout(r, 1100))

    const pidA2 = PREFIX + '-a2'
    await makePayment(orderA.id, pidA2, 10000)
    const r2 = await settlePayment(signedBody({ payment_id: pidA2, order_status: 'approved', amount: 10000, currency: 'GEL' }, secret))
    check('second settlement still completes without error', r2.ok && r2.outcome === 'settled', JSON.stringify(r2))

    const afterSecond = await db.order.findUnique({ where: { id: orderA.id } })
    const secondPaidAt = afterSecond?.paidAt ?? null
    console.log(`\n  first settlement paidAt:  ${firstPaidAt?.toISOString()}`)
    console.log(`  second settlement time:  (~1.1s later)`)
    console.log(`  order.paidAt after 2nd:  ${secondPaidAt?.toISOString()}\n`)

    const unchanged = firstPaidAt != null && secondPaidAt != null && firstPaidAt.getTime() === secondPaidAt.getTime()
    check('order.paidAt STAYS at the first settlement time after a second settlement', unchanged,
      unchanged ? '' : `paidAt moved from ${firstPaidAt?.toISOString()} to ${secondPaidAt?.toISOString()} — bug reproduced / fix not applied`)

    const secondPaymentRow = await db.payment.findFirst({ where: { providerPaymentId: pidA2 } })
    check('the second Payment row itself still settled normally', secondPaymentRow?.settledAt != null, `settledAt=${secondPaymentRow?.settledAt}`)

    // ── Part B: single-payment case must be unaffected ──────────────────────
    console.log('Part B — single-payment case (regression check)\n')
    const orderB = await makeOrder('DblB')
    orderIds.push(orderB.id)
    const pidB = PREFIX + '-b1'
    await makePayment(orderB.id, pidB, 15000)
    const rB = await settlePayment(signedBody({ payment_id: pidB, order_status: 'approved', amount: 15000, currency: 'GEL' }, secret))
    check('single settlement succeeds', rB.ok && rB.outcome === 'settled', JSON.stringify(rB))
    const orderBAfter = await db.order.findUnique({ where: { id: orderB.id } })
    check('single-payment order gets paidAt set', orderBAfter?.paidAt != null, `paidAt=${orderBAfter?.paidAt}`)
    check('single-payment order un-abandons / stage untouched', orderBAfter?.stage === 'NEW')
  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────────
    await db.payment.deleteMany({ where: { providerPaymentId: { startsWith: PREFIX } } })
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    const leftoverPayments = await db.payment.count({ where: { providerPaymentId: { startsWith: PREFIX } } })
    const leftoverOrders = await db.order.count({ where: { id: { in: orderIds } } })
    check('cleanup: no throwaway Payment rows remain', leftoverPayments === 0, `count=${leftoverPayments}`)
    check('cleanup: no throwaway Order rows remain', leftoverOrders === 0, `count=${leftoverOrders}`)
  }

  console.log(`\n──────────────────────────────────────────────────`)
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch(e => { console.error('ERROR:', e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
