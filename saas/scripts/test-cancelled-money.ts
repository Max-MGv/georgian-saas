/**
 * T-318 R2 — card money on a CANCELLED order (Q-2, Max 2026-10-29 "as recommended").
 *
 *   Part A  no emails: a card payment that settles on a cancelled booking / wine order sends neither
 *           the guest's "booking confirmed" nor the winery's "new paid booking" nor a wine receipt.
 *           Controls: the same payment on a live (NEW) order DOES try to send.
 *   Part B  liveMoneyCovers — the rule behind "reopening re-marks Paid": live money must cover the
 *           total; partial, reversed, unsettled and 0 ₾ do not.
 *   Part C  the money is recorded and the order stays unpaid (settlement guard) — and the settlement
 *           flagged the PAID event `afterCancellation`.
 *
 * Throwaway rows on the DEV database (deleted at the end) → needs --write; dry run without it.
 * The reopen itself runs inside `changeBookingStatus` (needs an admin session), so it is checked in
 * the browser; this proves the pieces it is built from.
 *
 * Run: npx tsx scripts/test-cancelled-money.ts --write
 */
import { db, withTenantDb } from '../lib/db'
import { settlePayment, sendSettlementEmail } from '../lib/payments/settle'
import { liveMoneyCovers } from '../lib/payments/manualPayment'
import { buildSignature } from '../lib/payments/flitt'
import { seedStageColumns } from '../lib/statusWrite'

if (!process.argv.includes('--write')) {
  console.log('Dry run (no --write): would create throwaway cancelled + live booking / wine-order rows on the DEV')
  console.log('database, settle signed fake callbacks, check the email choice and the cover rule, then delete them.')
  process.exit(0)
}

// No real mail from this process, whatever .env says: the Resend client throws without a key.
process.env.RESEND_API_KEY = ''

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-canc-' + Date.now()
const ago = (ms: number) => new Date(Date.now() - ms)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
const signed = (fields: Record<string, string | number>, secret: string) => ({ ...fields, signature: buildSignature(fields, secret) })
const approved = (pid: string, amount: number) => ({ payment_id: pid, order_status: 'approved', amount, currency: 'GEL' })

async function emailChoice(orderId: string | null, wineOrderId: string | null, adminLink: boolean): Promise<'sent' | 'silent' | string> {
  try {
    await sendSettlementEmail(TENANT, orderId, wineOrderId, adminLink)
    return 'silent'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return /api key/i.test(msg) ? 'sent' : `unexpected error: ${msg}`
  }
}

async function main() {
  const secret = (await db.tenant.findUnique({ where: { id: TENANT }, select: { flittSecretKey: true } }))?.flittSecretKey
  if (!secret) throw new Error('Staging Winery has no flittSecretKey configured — cannot build valid signatures')

  const orderIds: string[] = []
  const wineIds: string[] = []
  const mkBooking = (tag: string, stage: 'NEW' | 'CANCELLED', total: number) =>
    db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-${tag}`, email: 'zz-canc@example.invalid', totalPrice: total,
        ...seedStageColumns('booking', stage, ago(86_400_000)),
      },
    }).then(o => { orderIds.push(o.id); return o })
  const mkWine = (tag: string, stage: 'NEW' | 'CANCELLED') =>
    db.wineOrder.create({
      data: {
        tenantId: TENANT, businessName: `ZZ ${PREFIX}-${tag}`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
        contactEmail: 'zz-canc@example.invalid', totalAmount: 3000, deliveryFee: 0,
        ...seedStageColumns('wineOrder', stage, ago(86_400_000)),
      },
    }).then(o => { wineIds.push(o.id); return o })
  const pay = (target: { orderId?: string; wineOrderId?: string }, pid: string, amount: number, extra: object = {}) =>
    db.payment.create({ data: { tenantId: TENANT, ...target, provider: 'flitt', providerPaymentId: pid, amount, status: 'created', ...extra } })

  try {
    // ── Part A + C ───────────────────────────────────────────────────────────────
    console.log('\nPart A/C — emails and settlement on cancelled vs live orders\n')
    const live = await mkBooking('live', 'NEW', 20000)
    const dead = await mkBooking('dead', 'CANCELLED', 20000)
    await pay({ orderId: live.id }, `${PREFIX}-live`, 20000)
    await pay({ orderId: dead.id }, `${PREFIX}-dead`, 20000)
    const rLive = await settlePayment(signed(approved(`${PREFIX}-live`, 20000), secret))
    const rDead = await settlePayment(signed(approved(`${PREFIX}-dead`, 20000), secret))
    check('both settle', rLive.ok && rLive.outcome === 'settled' && rDead.ok && rDead.outcome === 'settled')
    if (rLive.ok) check('live booking: the confirmation / winery mail IS attempted (control)', await emailChoice(rLive.orderId, rLive.wineOrderId, rLive.adminLink) === 'sent')
    if (rDead.ok) check('CANCELLED booking: no mail is attempted', await emailChoice(rDead.orderId, rDead.wineOrderId, rDead.adminLink) === 'silent')
    check('settle reports afterCancellation: true for the cancelled booking, false for the live one',
      rDead.ok && rDead.afterCancellation === true && rLive.ok && rLive.afterCancellation === false)
    if (rDead.ok) check('the explicit flag is honoured by the sender (no stage lookup needed)', await sendSettlementEmail(TENANT, rDead.orderId, rDead.wineOrderId, rDead.adminLink, true).then(() => 'silent', () => 'threw') === 'silent')
    const deadNow = await db.order.findUnique({ where: { id: dead.id }, select: { paidAt: true, stage: true } })
    check('CANCELLED booking: money recorded, order NOT marked paid, still cancelled', deadNow?.paidAt == null && deadNow?.stage === 'CANCELLED')
    const ev = await db.orderEvent.findFirst({ where: { orderId: dead.id, type: 'PAID' } })
    check('CANCELLED booking: the PAID event is flagged afterCancellation', (ev?.payload as { afterCancellation?: boolean } | null)?.afterCancellation === true)

    const wLive = await mkWine('live', 'NEW')
    const wDead = await mkWine('dead', 'CANCELLED')
    await pay({ wineOrderId: wLive.id }, `${PREFIX}-wlive`, 3000)
    await pay({ wineOrderId: wDead.id }, `${PREFIX}-wdead`, 3000)
    const rwLive = await settlePayment(signed(approved(`${PREFIX}-wlive`, 3000), secret))
    const rwDead = await settlePayment(signed(approved(`${PREFIX}-wdead`, 3000), secret))
    check('both wine payments settle', rwLive.ok && rwDead.ok)
    if (rwLive.ok) check('live wine order: the receipt IS attempted (control)', await emailChoice(rwLive.orderId, rwLive.wineOrderId, rwLive.adminLink) === 'sent')
    if (rwDead.ok) check('CANCELLED wine order: no mail is attempted', await emailChoice(rwDead.orderId, rwDead.wineOrderId, rwDead.adminLink) === 'silent')

    // ── Part B ───────────────────────────────────────────────────────────────────
    console.log('\nPart B — liveMoneyCovers (the rule behind "reopening re-marks Paid")\n')
    const covers = (ref: { orderId?: string; wineOrderId?: string }, due: number) => withTenantDb(TENANT, tx => liveMoneyCovers(tx, ref, due))
    check('settled card money = the total → covers', await covers({ orderId: dead.id }, 20000))
    check('…more than the total → covers', await covers({ orderId: dead.id }, 15000))
    check('…less than the total → does not cover', !(await covers({ orderId: dead.id }, 25000)))
    check('a 0 ₾ total is never "covered"', !(await covers({ orderId: dead.id }, 0)))
    await db.payment.updateMany({ where: { providerPaymentId: `${PREFIX}-dead` }, data: { reversedAt: new Date() } })
    check('a reversed payment does not count', !(await covers({ orderId: dead.id }, 20000)))
    await db.payment.updateMany({ where: { providerPaymentId: `${PREFIX}-dead` }, data: { reversedAt: null, settledAt: null } })
    check('an unsettled payment does not count', !(await covers({ orderId: dead.id }, 20000)))
    check('wine: settled 3000 covers 3000', await covers({ wineOrderId: wDead.id }, 3000))
    check('wine: does not cover 3500', !(await covers({ wineOrderId: wDead.id }, 3500)))
  } finally {
    // Dependants first (payments, events), then the orders. Only rows this run made.
    await db.orderEvent.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    await db.payment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { wineOrderId: { in: wineIds } }] } })
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.wineOrder.deleteMany({ where: { id: { in: wineIds } } })
    const left = await db.order.count({ where: { surname: { startsWith: PREFIX } } })
    console.log(`\n(cleanup: ${orderIds.length} bookings + ${wineIds.length} wine orders removed; ${left} bookings left behind)`)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
