/**
 * A wine order's delivery-fee card top-up settles correctly (T-8, Plan-WineOrderFeatures Chunk 6b):
 * the wine was paid by card, the fee was set afterwards, the customer pays the fee through a
 * second Flitt checkout — and a real signed `settlePayment` callback must then
 *   - settle that second Payment row,
 *   - leave nothing owed (wines + fee − payments = 0),
 *   - NOT move the order's first `paidAt` (KnownBugs #65's guard, wine half),
 *   - leave `totalAmount` (wines only) untouched.
 * Model: scripts/test-settle-double-payment.ts (the booking version).
 *
 * Run: npx tsx scripts/test-settle-wine-fee-topup.ts   (dev database only)
 */
import { db, withTenantDb } from '../lib/db'
import { settlePayment } from '../lib/payments/settle'
import { buildSignature } from '../lib/payments/flitt'
import { wineOrderBalance } from '../lib/payments/manualPayment'

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-winefee-' + Date.now()

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
const signed = (fields: Record<string, string | number>, secret: string) => ({ ...fields, signature: buildSignature(fields, secret) })

async function main() {
  const secret = (await db.tenant.findUnique({ where: { id: TENANT }, select: { flittSecretKey: true } }))?.flittSecretKey
  if (!secret) throw new Error('Staging Winery has no flittSecretKey configured — cannot build valid signatures')
  console.log('\n── settlePayment: wine delivery-fee top-up ──\n')

  const order = await db.wineOrder.create({
    data: {
      tenantId: TENANT, businessName: `ZZ ${PREFIX}`, address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
      totalAmount: 3000, deliveryZoneName: 'ZZ Zone',
    },
  })
  try {
    // 1. The wine, paid online.
    await db.payment.create({ data: { tenantId: TENANT, wineOrderId: order.id, provider: 'flitt', providerPaymentId: `${PREFIX}-1`, amount: 3000, status: 'created' } })
    const r1 = await settlePayment(signed({ payment_id: `${PREFIX}-1`, order_status: 'approved', amount: 3000, currency: 'GEL' }, secret))
    check('wine payment settles', r1.ok && r1.outcome === 'settled', JSON.stringify(r1))
    const firstPaidAt = (await db.wineOrder.findUnique({ where: { id: order.id } }))?.paidAt ?? null
    check('order paidAt set by the first settlement', firstPaidAt != null)

    // 2. The winery sets a 15₾ fee afterwards → 15₾ owed.
    await db.wineOrder.update({ where: { id: order.id }, data: { deliveryFee: 1500 } })
    const owed = await withTenantDb(TENANT, tx => wineOrderBalance(tx, { wineOrderId: order.id, tenantId: TENANT }))
    check('15₾ is owed once the fee is set', !('error' in owed) && owed.balance === 1500, JSON.stringify(owed))

    // 3. The fee, paid through the card link (a second, independent Flitt payment).
    await new Promise(r => setTimeout(r, 1100))
    await db.payment.create({ data: { tenantId: TENANT, wineOrderId: order.id, provider: 'flitt', providerPaymentId: `${PREFIX}-2`, flittOrderId: `${order.id}-topup-zz`, amount: 1500, status: 'created' } })
    const r2 = await settlePayment(signed({ payment_id: `${PREFIX}-2`, order_status: 'approved', amount: 1500, currency: 'GEL' }, secret))
    check('fee top-up settles', r2.ok && r2.outcome === 'settled', JSON.stringify(r2))

    const after = await db.wineOrder.findUnique({ where: { id: order.id } })
    check("order's first paidAt did not move", after?.paidAt?.getTime() === firstPaidAt?.getTime(),
      `${firstPaidAt?.toISOString()} → ${after?.paidAt?.toISOString()}`)
    check('totalAmount still wines-only', after?.totalAmount === 3000)
    const left = await withTenantDb(TENANT, tx => wineOrderBalance(tx, { wineOrderId: order.id, tenantId: TENANT }))
    check('nothing owed after the top-up settles', !('error' in left) && left.balance === 0, JSON.stringify(left))

    // 4. A tampered amount is refused (settle's own amount gate).
    await db.payment.create({ data: { tenantId: TENANT, wineOrderId: order.id, provider: 'flitt', providerPaymentId: `${PREFIX}-3`, amount: 1500, status: 'created' } })
    const r3 = await settlePayment(signed({ payment_id: `${PREFIX}-3`, order_status: 'approved', amount: 1, currency: 'GEL' }, secret))
    check('a callback for a different amount is refused', !r3.ok, JSON.stringify(r3))
  } finally {
    await db.wineOrder.delete({ where: { id: order.id } }) // payments cascade
    const leftovers = await db.payment.count({ where: { providerPaymentId: { startsWith: PREFIX } } })
    check('cleanup: no throwaway rows remain', leftovers === 0, `payments=${leftovers}`)
  }
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error('ERROR:', e); process.exitCode = 1 }).finally(() => db.$disconnect())
