/**
 * T-321 — a booking paid through a card link an ADMIN made must not send "booking confirmed /
 * New paid booking"; the guest's own checkout must still send both. Wine orders are unchanged.
 * (Plan-AdminCardPayments Chunk 1.)
 *
 * What it proves, on the dev database with validly signed synthetic callbacks (no real Flitt call):
 *   Part A  settlePayment reports `adminLink` right: false for the guest's own checkout, true for a
 *           `-topup-` link, true again on a second delivery ('already-settled').
 *   Part B  the email choice: sendSettlementEmail returns silently for an admin-link booking and
 *           ATTEMPTS mail for the guest checkout and for a wine-order link (unchanged).
 *           No mail can leave: RESEND_API_KEY is blanked, so an attempt shows up as the Resend
 *           client's "Missing API key" error instead of a send.
 *   Part C  (only with --http=<base url>) the real return route: Location carries `kind=link` for an
 *           admin-link booking and nothing else. The dev server must have been started with a blank
 *           RESEND_API_KEY (the script cannot check that — see the launcher note in the plan).
 *
 * Writes throwaway rows to the DEV database and deletes them again, so it needs --write
 * (without it: dry run, prints the plan and exits). Never run against production.
 *
 * Run: npx tsx scripts/test-settle-admin-link.ts --write [--http=http://localhost:3100]
 */
import { db } from '../lib/db'
import { settlePayment, sendSettlementEmail } from '../lib/payments/settle'
import { buildSignature } from '../lib/payments/flitt'

const WRITE = process.argv.includes('--write')
const HTTP = process.argv.find(a => a.startsWith('--http='))?.slice('--http='.length)

if (!WRITE) {
  console.log('Dry run (no --write): would create throwaway booking + wine-order rows on the DEV database,')
  console.log('settle signed fake callbacks, check adminLink + the email choice, then delete the rows.')
  console.log('Add --write to run it. Add --http=http://localhost:3100 to also check the real return route.')
  process.exit(0)
}

// No real mail from this process, whatever .env says: the Resend client throws without a key.
process.env.RESEND_API_KEY = ''

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-t321-' + Date.now()

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
const signed = (fields: Record<string, string | number>, secret: string) => ({ ...fields, signature: buildSignature(fields, secret) })
const approved = (pid: string, amount: number) => ({ payment_id: pid, order_status: 'approved', amount, currency: 'GEL' })

/** 'sent' = it tried to send (and hit the blank key); 'silent' = returned without trying. */
async function emailChoice(orderId: string | null, wineOrderId: string | null, adminLink: boolean): Promise<'sent' | 'silent' | string> {
  try {
    await sendSettlementEmail(TENANT, orderId, wineOrderId, adminLink)
    return 'silent'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return /api key/i.test(msg) ? 'sent' : `unexpected error: ${msg}`
  }
}

async function makeBooking(tag: string) {
  return db.order.create({
    data: {
      tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING',
      date: new Date('2030-08-01'), timeSlot: '12:00', guestCount: 2,
      name: 'ZZ', surname: `${tag}`, email: 'zz-t321@example.invalid', totalPrice: 25000,
    },
  })
}
const makePayment = (target: { orderId?: string; wineOrderId?: string }, pid: string, amount: number, flittOrderId?: string) =>
  db.payment.create({
    data: { tenantId: TENANT, ...target, provider: 'flitt', providerPaymentId: pid, flittOrderId, amount, status: 'created' },
  })

async function main() {
  const secret = (await db.tenant.findUnique({ where: { id: TENANT }, select: { flittSecretKey: true } }))?.flittSecretKey
  if (!secret) throw new Error('Staging Winery has no flittSecretKey configured — cannot build valid signatures')

  const orderIds: string[] = []
  const wineIds: string[] = []
  try {
    // ── Part A + B: a booking paid by the guest, then topped up by an admin link ──
    console.log('\nPart A/B — booking: guest checkout, then an admin card link\n')
    const booking = await makeBooking('A')
    orderIds.push(booking.id)

    await makePayment({ orderId: booking.id }, `${PREFIX}-g`, 20000) // guest's own checkout: plain, no marker
    const g = await settlePayment(signed(approved(`${PREFIX}-g`, 20000), secret))
    check('guest checkout settles', g.ok && g.outcome === 'settled', JSON.stringify(g))
    check('guest checkout: adminLink is false', g.ok && g.adminLink === false)
    if (g.ok) check('guest checkout: confirmation + winery mail ARE attempted', await emailChoice(g.orderId, g.wineOrderId, g.adminLink) === 'sent')

    await makePayment({ orderId: booking.id }, `${PREFIX}-l`, 5000, `${booking.id}-topup-zz`) // the extras, via an admin link
    const l = await settlePayment(signed(approved(`${PREFIX}-l`, 5000), secret))
    check('admin link settles', l.ok && l.outcome === 'settled', JSON.stringify(l))
    check('admin link: adminLink is true', l.ok && l.adminLink === true)
    if (l.ok) check('admin link: NO mail is attempted', await emailChoice(l.orderId, l.wineOrderId, l.adminLink) === 'silent')

    const again = await settlePayment(signed(approved(`${PREFIX}-l`, 5000), secret))
    check("second delivery of the same link payment: 'already-settled', still adminLink", again.ok && again.outcome === 'already-settled' && again.adminLink === true, JSON.stringify(again))

    const row = await db.payment.findFirst({ where: { providerPaymentId: `${PREFIX}-l` } })
    check('settlement itself is unchanged: the link payment row is settled for 5000', row?.settledAt != null && row.amount === 5000)

    // ── Part B (wine): a wine-order fee link keeps its receipt — decided for Chunk 6 ──
    console.log('\nPart B — wine order: an admin fee link is unchanged (still attempts its receipt)\n')
    const wine = await db.wineOrder.create({
      data: {
        tenantId: TENANT, businessName: `ZZ ${PREFIX}`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
        contactEmail: 'zz-t321@example.invalid', totalAmount: 3000, deliveryFee: 1500, deliveryZoneName: 'ZZ Zone',
      },
    })
    wineIds.push(wine.id)
    await makePayment({ wineOrderId: wine.id }, `${PREFIX}-w`, 1500, `${wine.id}-topup-zz`)
    const w = await settlePayment(signed(approved(`${PREFIX}-w`, 1500), secret))
    check('wine fee link settles with adminLink true', w.ok && w.outcome === 'settled' && w.adminLink === true, JSON.stringify(w))
    if (w.ok) check('wine fee link: receipt IS still attempted (unchanged)', await emailChoice(w.orderId, w.wineOrderId, w.adminLink) === 'sent')

    // ── Part C: the real return route over HTTP ──────────────────────────────────
    if (HTTP) {
      console.log(`\nPart C — return route at ${HTTP}\n`)
      // An arrow, not a function declaration: a declaration loses the `secret` narrowing above.
      const viaReturnRoute = async (fields: Record<string, string | number>) => {
        const res = await fetch(`${HTTP}/api/payments/flitt/return`, {
          method: 'POST',
          redirect: 'manual',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(Object.entries(signed(fields, secret)).map(([k, v]) => [k, String(v)])),
        })
        return `${res.status} ${res.headers.get('location') ?? ''}`
      }
      const h1 = await makeBooking('H1'); orderIds.push(h1.id)
      await makePayment({ orderId: h1.id }, `${PREFIX}-h1`, 25000)
      const loc1 = await viaReturnRoute(approved(`${PREFIX}-h1`, 25000))
      check('guest checkout → /payment/result?status=success (no kind)', /\/payment\/result\?status=success$/.test(loc1), loc1)

      const h2 = await makeBooking('H2'); orderIds.push(h2.id)
      await makePayment({ orderId: h2.id }, `${PREFIX}-h2`, 5000, `${h2.id}-topup-zz`)
      const loc2 = await viaReturnRoute(approved(`${PREFIX}-h2`, 5000))
      check('admin-link booking → ?status=success&kind=link', /\/payment\/result\?status=success&kind=link$/.test(loc2), loc2)
      const loc2b = await viaReturnRoute(approved(`${PREFIX}-h2`, 5000))
      check('…and when the webhook already settled it (second delivery) → still kind=link', /status=success&kind=link$/.test(loc2b), loc2b)

      const h3 = await makeBooking('H3'); orderIds.push(h3.id)
      await makePayment({ orderId: h3.id }, `${PREFIX}-h3`, 5000, `${h3.id}-topup-zz`)
      const loc3 = await viaReturnRoute({ payment_id: `${PREFIX}-h3`, order_status: 'declined', amount: 5000, currency: 'GEL' })
      check('declined admin link → ?status=failed (no kind)', /\/payment\/result\?status=failed$/.test(loc3), loc3)

      const wh = await db.wineOrder.create({
        data: { tenantId: TENANT, businessName: `ZZ ${PREFIX}h`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0', contactEmail: 'zz-t321@example.invalid', totalAmount: 3000, deliveryFee: 1500, deliveryZoneName: 'ZZ Zone' },
      })
      wineIds.push(wh.id)
      await makePayment({ wineOrderId: wh.id }, `${PREFIX}-h4`, 1500, `${wh.id}-topup-zz`)
      const loc4 = await viaReturnRoute(approved(`${PREFIX}-h4`, 1500))
      check('wine fee link → ?status=success (no kind, wording unchanged)', /\/payment\/result\?status=success$/.test(loc4), loc4)
      // `after()` runs the notification just after the response; give it time before the rows are deleted.
      await new Promise(r => setTimeout(r, 6000))
      console.log('\n  Mail attempts show in the dev server log as "[flitt:return] notification failed — Missing API key":')
      console.log('  expect exactly TWO per run — the guest checkout (H1) and the wine link — and none for the admin-link booking.')
    }
  } finally {
    // payments cascade with their order / wine order
    await db.order.deleteMany({ where: { id: { in: orderIds } } })
    await db.wineOrder.deleteMany({ where: { id: { in: wineIds } } })
    const left = await db.payment.count({ where: { providerPaymentId: { startsWith: PREFIX } } })
    const leftO = await db.order.count({ where: { id: { in: orderIds } } })
    const leftW = await db.wineOrder.count({ where: { id: { in: wineIds } } })
    check('cleanup: no throwaway rows remain', left === 0 && leftO === 0 && leftW === 0, `payments=${left} orders=${leftO} wine=${leftW}`)
  }

  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error('ERROR:', e); process.exitCode = 1 }).finally(() => db.$disconnect())
