/**
 * End-to-end test of the Flitt callback path against a RUNNING dev server
 * (Plan-OnlinePayment phase 3).
 *
 * Exercises the full inbound chain — proxy bypass → route handler → body
 * parsing → settlePayment gates — the way Flitt actually will: as an external
 * HTTP POST. Needs `npm run dev` on :3000 and the dev database.
 *
 * Sets a throwaway Flitt secret on the DEFAULT_TENANT_ID tenant, creates a
 * pending Order + Payment, fires forged and genuine callbacks at the server,
 * and checks the DB after each. Cleans up everything it made, including the
 * secret.
 *
 * Run: npx tsx scripts/test-payment-flow.ts
 */
import { PrismaClient, OrderStatus } from '@prisma/client'
import { buildSignature } from '../lib/payments/flitt'

const db = new PrismaClient()
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const SECRET = 'zz-test-secret-' + Date.now()
/** Throwaway second tenant, for the cross-tenant isolation check. */
const OTHER = 'zz-flow-other-tenant'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) }
  else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** A signed callback body the way Flitt would send it. */
function signedBody(fields: Record<string, string | number>, secret: string) {
  return { ...fields, signature: buildSignature(fields, secret) }
}

async function postCallback(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/payments/flitt/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) as { status?: string; outcome?: string } | null }
}

async function main() {
  const tenantId = process.env.DEFAULT_TENANT_ID
  if (!tenantId) throw new Error('DEFAULT_TENANT_ID not set in .env')

  // Reachability first, so a dead server fails with a clear message.
  const up = await fetch(`${BASE}/api/payments/flitt/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null)
  if (!up) {
    console.log(`\nDev server not reachable at ${BASE} — start it with: npm run dev\n`)
    process.exitCode = 1
    return
  }

  console.log('\n── Flitt callback flow (live dev server) ──\n')

  const prevSecret = (await db.tenant.findUnique({ where: { id: tenantId }, select: { flittSecretKey: true } }))?.flittSecretKey ?? null
  await db.tenant.update({ where: { id: tenantId }, data: { flittSecretKey: SECRET } })

  const order = await db.order.create({
    data: {
      status: OrderStatus.PENDING_PAYMENT,
      visitType: 'TASTING',
      date: new Date('2030-01-01'),
      timeSlot: '11:00',
      guestCount: 4,
      name: 'ZZ', surname: 'Test',
      totalPrice: 200,
      tenantId,
    },
  })
  const pid = 'zz-flow-' + Date.now()
  const payment = await db.payment.create({
    data: { tenantId, orderId: order.id, provider: 'flitt', providerPaymentId: pid, amount: 200, status: 'created' },
  })

  try {
    // 1. Proxy bypass: the endpoint answers JSON, not a 3xx to /welcome or
    //    /coming-soon. (fetch follows redirects — a redirect would surface as
    //    res.url pointing at the welcome page and non-JSON content.)
    const r0 = await postCallback({})
    check('endpoint reachable through the proxy (JSON answer, no redirect)', r0.json !== null)
    check('empty body is rejected', r0.json?.status === 'rejected')

    // 2. Forged approval — right payment_id, wrong signature. The exact attack
    //    the old site allowed.
    const r1 = await postCallback({ payment_id: pid, order_status: 'approved', amount: 20000, currency: 'GEL', signature: 'a'.repeat(40) })
    check('forged signature is rejected', r1.json?.status === 'rejected')
    let o = await db.order.findUnique({ where: { id: order.id } })
    check('order untouched after forged callback', o?.status === OrderStatus.PENDING_PAYMENT, `status=${o?.status}`)

    // 3. Valid signature, tampered amount (1 tetri instead of 20000).
    const r2 = await postCallback(signedBody({ payment_id: pid, order_status: 'approved', amount: 1, currency: 'GEL' }, SECRET))
    check('amount mismatch is rejected', r2.json?.status === 'rejected')
    o = await db.order.findUnique({ where: { id: order.id } })
    check('order untouched after tampered amount', o?.status === OrderStatus.PENDING_PAYMENT)

    // 4. Genuine approval.
    const good = signedBody({ payment_id: pid, order_status: 'approved', amount: 20000, currency: 'GEL' }, SECRET)
    const r3 = await postCallback(good)
    check('genuine callback settles', r3.json?.status === 'ok' && r3.json?.outcome === 'settled', JSON.stringify(r3.json))
    o = await db.order.findUnique({ where: { id: order.id } })
    check('order is PAID', o?.status === OrderStatus.PAID, `status=${o?.status}`)
    const p = await db.payment.findUnique({ where: { id: payment.id } })
    check('payment settledAt set + raw body stored', p?.settledAt != null && p?.rawResponse != null)

    // 5. Same callback again — idempotency.
    const r4 = await postCallback(good)
    check('duplicate callback reports already-settled', r4.json?.outcome === 'already-settled', JSON.stringify(r4.json))

    // 6. Form-encoded delivery of the same shape (the return_url content type).
    const pid2 = pid + '-form'
    const order2 = await db.order.create({ data: { status: OrderStatus.PENDING_PAYMENT, visitType: 'TASTING', date: new Date('2030-01-02'), timeSlot: '11:00', guestCount: 4, name: 'ZZ', surname: 'Test2', totalPrice: 50, tenantId } })
    await db.payment.create({ data: { tenantId, orderId: order2.id, provider: 'flitt', providerPaymentId: pid2, amount: 50, status: 'created' } })
    const fields = signedBody({ payment_id: pid2, order_status: 'approved', amount: 5000, currency: 'GEL' }, SECRET)
    const form = new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)]))
    const res = await fetch(`${BASE}/api/payments/flitt/callback`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() })
    const j = await res.json().catch(() => null) as { outcome?: string } | null
    check('form-encoded callback settles too', j?.outcome === 'settled', JSON.stringify(j))
    const o2 = await db.order.findUnique({ where: { id: order2.id } })
    check('form-encoded order is PAID', o2?.status === OrderStatus.PAID)

    // 7. Wine orders (phase 5). A different table with a different status
    //    convention — WineOrder.status is a bare String, not the enum — so it
    //    needs its own coverage rather than being assumed from the booking path.
    const wo = await db.wineOrder.create({
      data: {
        businessName: 'ZZ Test Bar', address: 'ZZ', contactName: 'ZZ', contactPhone: '000',
        contactEmail: 'zz@example.invalid', totalAmount: 120, status: 'pending_payment', tenantId,
      },
    })
    const pid3 = pid + '-wine'
    await db.payment.create({ data: { tenantId, wineOrderId: wo.id, provider: 'flitt', providerPaymentId: pid3, amount: 120, status: 'created' } })
    const r5 = await postCallback(signedBody({ payment_id: pid3, order_status: 'approved', amount: 12000, currency: 'GEL' }, SECRET))
    check('wine order callback settles', r5.json?.outcome === 'settled', JSON.stringify(r5.json))
    const woAfter = await db.wineOrder.findUnique({ where: { id: wo.id } })
    check('wine order status is paid', woAfter?.status === 'paid', `status=${woAfter?.status}`)

    // 8. Cross-tenant. A payment belonging to another tenant must not settle
    //    just because the caller signed with a secret we happen to hold — the
    //    secret is looked up from the payment's OWN tenant, so this must fail.
    await db.tenant.create({
      data: { id: OTHER, name: 'ZZ Other', domain: 'zz-other.invalid', slug: OTHER, flittSecretKey: 'zz-other-secret' },
    })
    const woOther = await db.wineOrder.create({
      data: { businessName: 'ZZ Other Bar', address: 'ZZ', contactName: 'ZZ', contactPhone: '000', totalAmount: 90, status: 'pending_payment', tenantId: OTHER },
    })
    const pid4 = pid + '-cross'
    await db.payment.create({ data: { tenantId: OTHER, wineOrderId: woOther.id, provider: 'flitt', providerPaymentId: pid4, amount: 90, status: 'created' } })
    // Signed with THIS tenant's secret, aimed at the other tenant's payment.
    const r6 = await postCallback(signedBody({ payment_id: pid4, order_status: 'approved', amount: 9000, currency: 'GEL' }, SECRET))
    check('cross-tenant callback is rejected', r6.json?.status === 'rejected', JSON.stringify(r6.json))
    const woOtherAfter = await db.wineOrder.findUnique({ where: { id: woOther.id } })
    check("other tenant's wine order untouched", woOtherAfter?.status === 'pending_payment', `status=${woOtherAfter?.status}`)
  } finally {
    await db.payment.deleteMany({ where: { providerPaymentId: { startsWith: 'zz-flow-' } } })
    await db.order.deleteMany({ where: { name: 'ZZ', surname: { in: ['Test', 'Test2'] } } })
    await db.wineOrder.deleteMany({ where: { businessName: { in: ['ZZ Test Bar', 'ZZ Other Bar'] } } })
    await db.tenant.deleteMany({ where: { id: OTHER } })
    await db.tenant.update({ where: { id: tenantId }, data: { flittSecretKey: prevSecret } })
  }

  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch(e => { console.error('ERROR:', e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())
