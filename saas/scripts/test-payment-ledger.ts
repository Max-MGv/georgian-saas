/**
 * Proves the payment ledger holds (chunk 6 of vault/DataModel/Plan-DataModel.md).
 *
 * Before this, `Payment` was a Flitt attempt log: only card payments ever made
 * a row, so `SUM(amount)` was card revenue while `paidAt IS NOT NULL` was all
 * revenue, and nothing reconciled the two.
 *
 * The two rules worth guarding, because both are easy to get subtly wrong:
 *
 * 1. **No double counting.** An order the gateway already settled must not
 *    gain a second, manual row when an admin toggles paid off and on.
 * 2. **A real card payment is never marked reversed.** That money is with the
 *    gateway; saying otherwise in the ledger would misstate reality. Un-paying
 *    a gateway-paid order is an admin override, and chunk 5's OrderEvent is
 *    what records it.
 *
 * Creates its own throwaway data and deletes it.
 *
 *   npx tsx scripts/test-payment-ledger.ts
 */
import { db, withTenantDb } from '../lib/db'
import { recordManualPayment, reverseManualPayments } from '../lib/payments/manualPayment'

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) { passed++; console.log(`  ok   ${label}`); return }
  failed++
  console.error(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function makeOrder(surname: string, total: number) {
  return db.order.create({
    data: {
      tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING',
      date: new Date('2030-07-01'), timeSlot: '12:00',
      guestCount: 2, name: 'ZZ', surname, totalPrice: total,
    },
  })
}

const live = (orderId: string) =>
  db.payment.findMany({ where: { orderId, settledAt: { not: null }, reversedAt: null } })

async function main() {
  // ── 1. A hand-recorded payment becomes a real row ─────────────────────────
  const manual = await makeOrder('LedgerManual', 24000) // ₾240
  await withTenantDb(TENANT, tx =>
    recordManualPayment(tx, { tenantId: TENANT, orderId: manual.id, amount: 24000, at: new Date() }))

  let rows = await db.payment.findMany({ where: { orderId: manual.id } })
  check('marking paid by hand writes a payment row', rows.length, 1)
  check('  ...recorded as manual', rows[0]?.provider, 'manual')
  check('  ...with an explicit method', rows[0]?.method, 'MANUAL')
  check('  ...for the order total', rows[0]?.amount, 24000)
  check('  ...and settled', rows[0]?.settledAt != null, true)

  // ── 2. Un-paying reverses, it does not delete ─────────────────────────────
  await withTenantDb(TENANT, tx => reverseManualPayments(tx, { orderId: manual.id, at: new Date() }))
  rows = await db.payment.findMany({ where: { orderId: manual.id } })
  check('un-paying keeps the row', rows.length, 1)
  check('  ...marked reversed', rows[0]?.reversedAt != null, true)
  check('  ...and it no longer counts', (await live(manual.id)).length, 0)

  // ── 3. Re-paying after a reversal records a fresh payment ─────────────────
  await withTenantDb(TENANT, tx =>
    recordManualPayment(tx, { tenantId: TENANT, orderId: manual.id, amount: 24000, at: new Date() }))
  check('re-paying records a new row', (await db.payment.count({ where: { orderId: manual.id } })), 2)
  check('  ...and exactly one counts', (await live(manual.id)).length, 1)

  // ── 4. A gateway-paid order must not gain a manual row ────────────────────
  const card = await makeOrder('LedgerCard', 30000) // ₾300
  await db.payment.create({
    data: {
      tenantId: TENANT, orderId: card.id, provider: 'flitt', method: 'CARD',
      providerPaymentId: `probe-${Date.now()}`, status: 'approved',
      amount: 30000, settledAt: new Date(),
    },
  })
  await withTenantDb(TENANT, tx =>
    recordManualPayment(tx, { tenantId: TENANT, orderId: card.id, amount: 30000, at: new Date() }))
  check('a gateway-settled order gains NO second row', (await db.payment.count({ where: { orderId: card.id } })), 1)
  check('  ...so revenue is not double counted',
    (await live(card.id)).reduce((s, p) => s + p.amount, 0), 30000)

  // ── 5. Un-paying never reverses a real card payment ───────────────────────
  await withTenantDb(TENANT, tx => reverseManualPayments(tx, { orderId: card.id, at: new Date() }))
  const cardRow = (await db.payment.findMany({ where: { orderId: card.id } }))[0]
  check('the card payment is left alone', cardRow?.reversedAt, null)
  check('  ...because that money is really with the gateway', cardRow?.method, 'CARD')

  // ── 6. Reconciliation ─────────────────────────────────────────────────────
  // The thing that was impossible before: collected revenue from the ledger
  // agreeing with the orders' own totals.
  const collected = (await live(manual.id)).concat(await live(card.id))
    .reduce((s, p) => s + p.amount, 0)
  check('ledger reconciles with the order totals', collected, 24000 + 30000)

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await db.order.deleteMany({ where: { id: { in: [manual.id, card.id] } } })
  check('payments cascade away with their orders',
    await db.payment.count({ where: { orderId: { in: [manual.id, card.id] } } }), 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async err => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
