/**
 * T-318 Chunk 2 — settlement rules, "Mark paid" ledger and the server rules for admin card links.
 * (Plan-AdminCardPayments §7 Chunk 2.)
 *
 *   Part A  card money from ANY stage: a signed approved callback on every stage × (unpaid / already
 *           paid) × (booking / wine order). Unpaid + not cancelled → Paid (paidAt set, abandonedAt
 *           cleared); already paid → paidAt untouched (KnownBugs #65); CANCELLED → recorded, NOT Paid,
 *           and its PAID event carries `afterCancellation`. The stage never moves.
 *   Part B  recordManualPayment writes the REMAINING balance (nothing when covered / over-covered /
 *           called twice; completes a part-paid order; re-marking after an un-pay writes again).
 *   Part C  startTopUpCheckout / startWineTopUpCheckout refuse: cancelled, no price / 0 ₾, and a
 *           partial amount on an UNPAID order. (Only refusals — an accepted link would call Flitt.)
 *
 * Throwaway rows on the DEV database, deleted at the end → needs --write (dry run without it).
 * Never run against production.
 *
 * Run: npx tsx scripts/test-settle-stages.ts --write
 */
import { db, withTenantDb } from '../lib/db'
import { settlePayment } from '../lib/payments/settle'
import { buildSignature } from '../lib/payments/flitt'
import { recordManualPayment, reverseManualPayments, recordAdditionalPayment, recordAdditionalWinePayment } from '../lib/payments/manualPayment'
import { startTopUpCheckout, startWineTopUpCheckout } from '../lib/payments/topUpCheckout'
import { seedStageColumns } from '../lib/statusWrite'
import { asTetri } from '../lib/money'

if (!process.argv.includes('--write')) {
  console.log('Dry run (no --write): would create ~25 throwaway booking / wine-order rows on the DEV database,')
  console.log('settle signed fake callbacks over every stage, test the "Mark paid" ledger and the link refusals,')
  console.log('then delete the rows. Add --write to run it.')
  process.exit(0)
}

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-stg-' + Date.now()
const LONG_AGO = new Date('2026-01-15T10:00:00Z')

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
const signed = (fields: Record<string, string | number>, secret: string) => ({ ...fields, signature: buildSignature(fields, secret) })

type Kind = 'booking' | 'wine'
type Stage = 'NEW' | 'CONFIRMED' | 'DONE' | 'CANCELLED' // DONE = COMPLETED for a booking, DELIVERED for wine
const STAGES: Stage[] = ['NEW', 'CONFIRMED', 'DONE', 'CANCELLED']

const orderIds: string[] = []
const wineIds: string[] = []
let seq = 0

async function makeOrder(kind: Kind, o: { stage: Stage; paidAt?: Date | null; abandoned?: boolean; total?: number | null }) {
  const total = o.total === undefined ? 20000 : o.total
  if (kind === 'booking') {
    const stage = o.stage === 'DONE' ? 'COMPLETED' : o.stage
    const row = await db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'),
        timeSlot: '12:00', guestCount: 2, name: 'ZZ', surname: `${PREFIX}-${++seq}`, totalPrice: total,
        ...seedStageColumns('booking', stage, LONG_AGO),
        paidAt: o.paidAt ?? null, abandonedAt: o.abandoned ? new Date() : null,
      },
    })
    orderIds.push(row.id)
    return row.id
  }
  const stage = o.stage === 'DONE' ? 'DELIVERED' : o.stage
  const row = await db.wineOrder.create({
    data: {
      tenantId: TENANT, businessName: `ZZ ${PREFIX}-${++seq}`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
      totalAmount: total, ...seedStageColumns('wineOrder', stage, LONG_AGO),
      paidAt: o.paidAt ?? null, abandonedAt: o.abandoned ? new Date() : null,
    },
  })
  wineIds.push(row.id)
  return row.id
}
const ref = (kind: Kind, id: string) => (kind === 'booking' ? { orderId: id } : { wineOrderId: id })
const readOrder = (kind: Kind, id: string) =>
  kind === 'booking' ? db.order.findUnique({ where: { id } }) : db.wineOrder.findUnique({ where: { id } })
const addPayment = (kind: Kind, id: string, pid: string, amount: number, extra: { settled?: boolean; method?: 'CARD' | 'CASH' } = {}) =>
  db.payment.create({
    data: {
      tenantId: TENANT, ...ref(kind, id), provider: extra.settled ? 'manual' : 'flitt', providerPaymentId: extra.settled ? null : pid,
      amount, status: extra.settled ? 'recorded' : 'created', settledAt: extra.settled ? new Date() : null,
    },
  })
const liveSum = async (kind: Kind, id: string) =>
  (await db.payment.aggregate({ where: { ...ref(kind, id), settledAt: { not: null }, reversedAt: null }, _sum: { amount: true } }))._sum.amount ?? 0

async function main() {
  const secret = (await db.tenant.findUnique({ where: { id: TENANT }, select: { flittSecretKey: true } }))?.flittSecretKey
  if (!secret) throw new Error('Staging Winery has no flittSecretKey configured — cannot build valid signatures')

  try {
    // ── Part A ───────────────────────────────────────────────────────────────────
    console.log('\nPart A — card money from every stage (booking + wine order)\n')
    for (const kind of ['booking', 'wine'] as Kind[]) {
      for (const stage of STAGES) {
        for (const wasPaid of [false, true]) {
          const label = `${kind} ${stage}${wasPaid ? ' (already paid)' : ' (unpaid)'}`
          const paidBefore = wasPaid ? new Date('2026-02-01T09:00:00Z') : null
          const id = await makeOrder(kind, { stage, paidAt: paidBefore })
          const pid = `${PREFIX}-a${++seq}`
          const amount = wasPaid ? 5000 : 20000 // a paid order is being topped up; an unpaid one pays in full
          await addPayment(kind, id, pid, amount)
          const r = await settlePayment(signed({ payment_id: pid, order_status: 'approved', amount, currency: 'GEL' }, secret))
          const after = await readOrder(kind, id)
          const events = await db.orderEvent.findMany({ where: { ...ref(kind, id), type: 'PAID' } })
          const flagged = events.some(e => (e.payload as { afterCancellation?: boolean } | null)?.afterCancellation === true)
          const pay = await db.payment.findFirst({ where: { providerPaymentId: pid } })

          check(`${label}: settles`, r.ok && r.outcome === 'settled', JSON.stringify(r))
          check(`${label}: the Payment row is settled (money recorded)`, pay?.settledAt != null)
          check(`${label}: stage never moves`, after?.stage === (kind === 'booking' ? (stage === 'DONE' ? 'COMPLETED' : stage) : (stage === 'DONE' ? 'DELIVERED' : stage)))
          if (wasPaid) {
            check(`${label}: paidAt untouched`, after?.paidAt?.getTime() === paidBefore!.getTime(), `${after?.paidAt?.toISOString()}`)
          } else if (stage === 'CANCELLED') {
            check(`${label}: NOT marked Paid`, after?.paidAt == null, `paidAt=${after?.paidAt?.toISOString()}`)
          } else {
            const fresh = after?.paidAt != null && Date.now() - after.paidAt.getTime() < 120_000
            check(`${label}: marked Paid`, fresh, `paidAt=${after?.paidAt?.toISOString()}`)
          }
          check(`${label}: PAID event ${stage === 'CANCELLED' ? 'flagged afterCancellation' : 'not flagged'}`,
            events.length === 1 && flagged === (stage === 'CANCELLED'), JSON.stringify(events.map(e => e.payload)))
          check(`${label}: ledger counts the card money`, (await liveSum(kind, id)) === amount)
        }
      }
    }
    // An abandoned booking that then pays: leaves Abandoned (the DB constraint would refuse otherwise).
    {
      const id = await makeOrder('booking', { stage: 'NEW', abandoned: true })
      const pid = `${PREFIX}-ab`
      await addPayment('booking', id, pid, 20000)
      const r = await settlePayment(signed({ payment_id: pid, order_status: 'approved', amount: 20000, currency: 'GEL' }, secret))
      const after = await db.order.findUnique({ where: { id } })
      check('abandoned booking that pays: Paid and no longer abandoned', r.ok && after?.paidAt != null && after.abandonedAt == null)
    }

    // ── Part B ───────────────────────────────────────────────────────────────────
    console.log('\nPart B — "Mark paid" writes the remaining balance\n')
    const manual = (kind: Kind, id: string, total = 20000, method: 'CASH' | 'BANK_TRANSFER' = 'CASH') =>
      withTenantDb(TENANT, tx => recordManualPayment(tx, { tenantId: TENANT, ...ref(kind, id), amount: asTetri(total), at: new Date(), method }))
    for (const kind of ['booking', 'wine'] as Kind[]) {
      const none = await makeOrder(kind, { stage: 'CONFIRMED' })
      await manual(kind, none)
      check(`${kind}: nothing paid yet → a row for the full 20000`, (await liveSum(kind, none)) === 20000)
      await manual(kind, none)
      check(`${kind}: called twice → still 20000 (no double count)`, (await liveSum(kind, none)) === 20000)

      const part = await makeOrder(kind, { stage: 'CONFIRMED' })
      await addPayment(kind, part, `${PREFIX}-p${++seq}`, 8000, { settled: true })
      await manual(kind, part)
      check(`${kind}: part-paid (8000 on file) → completed with the missing 12000, ledger 20000`, (await liveSum(kind, part)) === 20000)
      const rows = await db.payment.findMany({ where: { ...ref(kind, part), method: 'CASH' } })
      check(`${kind}: …that row is exactly 12000 and says CASH`, rows.length === 1 && rows[0].amount === 12000)

      const over = await makeOrder(kind, { stage: 'CONFIRMED' })
      await addPayment(kind, over, `${PREFIX}-o${++seq}`, 25000, { settled: true })
      await manual(kind, over)
      check(`${kind}: already over-covered (25000 on 20000) → nothing written`, (await liveSum(kind, over)) === 25000)

      // un-pay then pay again: the reversed row no longer counts, so the balance is written again
      await withTenantDb(TENANT, tx => reverseManualPayments(tx, { ...ref(kind, none), at: new Date() }))
      check(`${kind}: un-pay reverses the manual row (ledger 0)`, (await liveSum(kind, none)) === 0)
      await manual(kind, none)
      check(`${kind}: pay again after un-pay → 20000 again`, (await liveSum(kind, none)) === 20000)
    }

    // ── Part C ───────────────────────────────────────────────────────────────────
    console.log('\nPart C — admin card link: server refusals\n')
    const linkB = (orderId: string, amount: number) => startTopUpCheckout({ orderId, tenantId: TENANT, amount: asTetri(amount), orderDesc: 'zz' })
    const linkW = (wineOrderId: string, amount: number) => startWineTopUpCheckout({ wineOrderId, tenantId: TENANT, amount: asTetri(amount), orderDesc: 'zz' })
    const errOf = (r: { error: string } | { success: true }) => ('error' in r ? r.error : 'ACCEPTED')

    const cb = await makeOrder('booking', { stage: 'CANCELLED', paidAt: new Date('2026-02-01T09:00:00Z') })
    check('booking: cancelled → refused', /cancelled/i.test(errOf(await linkB(cb, 1000))))
    const nb = await makeOrder('booking', { stage: 'CONFIRMED', total: null })
    check('booking: no price → "Set the price first."', errOf(await linkB(nb, 1000)) === 'Set the price first.')
    const zb = await makeOrder('booking', { stage: 'CONFIRMED', total: 0 })
    check('booking: 0 ₾ → "Set the price first."', errOf(await linkB(zb, 1000)) === 'Set the price first.')
    const ub = await makeOrder('booking', { stage: 'CONFIRMED' })
    check('booking: UNPAID + partial amount (5000 of 20000) → must be the full amount', /full amount owed/.test(errOf(await linkB(ub, 5000))))
    const pb = await makeOrder('booking', { stage: 'CONFIRMED', paidAt: new Date('2026-02-01T09:00:00Z') })
    await addPayment('booking', pb, `${PREFIX}-pb`, 20000, { settled: true })
    check('booking: PAID order still refuses more than the balance (old rule intact)', /more than the outstanding balance/.test(errOf(await linkB(pb, 3000))))

    const cw = await makeOrder('wine', { stage: 'CANCELLED', paidAt: new Date('2026-02-01T09:00:00Z') })
    check('wine: cancelled → refused', /cancelled/i.test(errOf(await linkW(cw, 1000))))
    const nw = await makeOrder('wine', { stage: 'CONFIRMED', total: null })
    check('wine: no price → "Set the price first."', errOf(await linkW(nw, 1000)) === 'Set the price first.')
    const uw = await makeOrder('wine', { stage: 'CONFIRMED' })
    check('wine: UNPAID + partial amount → must be the full amount', /full amount owed/.test(errOf(await linkW(uw, 5000))))

    // Recording a Bank / Cash top-up on a cancelled order is refused too (blind test, 2026-10-29)
    const topB = await withTenantDb(TENANT, tx => recordAdditionalPayment(tx, { orderId: cb, tenantId: TENANT, amount: asTetri(100), at: new Date(), method: 'CASH' }))
    check('booking: a recorded top-up on a CANCELLED order is refused', 'error' in topB && /cancelled/i.test(topB.error), JSON.stringify(topB))
    const topW = await withTenantDb(TENANT, tx => recordAdditionalWinePayment(tx, { wineOrderId: cw, tenantId: TENANT, amount: asTetri(100), at: new Date(), method: 'CASH' }))
    check('wine: a recorded top-up on a CANCELLED order is refused', 'error' in topW && /cancelled/i.test(topW.error), JSON.stringify(topW))
    const cbPayments = await db.payment.count({ where: { orderId: cb, provider: 'manual', method: 'CASH' } })
    check('…and nothing was written for it', cbPayments === 0)
  } finally {
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.wineOrder.deleteMany({ where: { id: { in: wineIds } } })
    const leftP = await db.payment.count({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    const leftO = await db.order.count({ where: { id: { in: orderIds } } })
    const leftW = await db.wineOrder.count({ where: { id: { in: wineIds } } })
    check('cleanup: no throwaway rows remain', leftP === 0 && leftO === 0 && leftW === 0, `payments=${leftP} orders=${leftO} wine=${leftW}`)
  }

  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error('ERROR:', e); process.exitCode = 1 }).finally(() => db.$disconnect())
