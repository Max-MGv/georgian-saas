/**
 * `recordAdditionalWinePayment` / `wineOrderBalance` (lib/payments/manualPayment.ts, T-8 Chunk 6):
 * the balance is wines + delivery fee − live payments, and a top-up can never exceed it.
 *
 * Run: npx tsx scripts/test-wine-fee-payment.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'
import { recordAdditionalWinePayment, wineOrderBalance } from '../lib/payments/manualPayment'
import { asTetri } from '../lib/money'

const db = new PrismaClient()
const T = 'zz-test-wine-fee-payment'
let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
async function cleanup() {
  await db.wineOrder.deleteMany({ where: { tenantId: T } })
  await db.tenant.deleteMany({ where: { id: T } })
}

async function main() {
  console.log('\n── wine-order balance + additional payment ──\n')
  await cleanup()
  await db.tenant.create({ data: { id: T, name: 'ZZ Fee', domain: 'zz-fee.invalid', slug: T } })
  const o = await db.wineOrder.create({
    data: {
      tenantId: T, businessName: 'ZZ', address: 'ZZ', contactName: 'ZZ', contactPhone: '0',
      totalAmount: 3000, deliveryFee: 1500, paidAt: new Date(),
      payments: { create: [
        { tenantId: T, provider: 'flitt', method: 'CARD', status: 'approved', amount: 3000, settledAt: new Date() },
        // A reversed and an unsettled row must not count as paid.
        { tenantId: T, provider: 'manual', method: 'CASH', status: 'recorded', amount: 999, settledAt: new Date(), reversedAt: new Date() },
        { tenantId: T, provider: 'flitt', method: 'CARD', status: 'created', amount: 1500 },
      ] },
    },
  })
  const run = <R>(fn: Parameters<typeof withTenantDb<R>>[1]) => withTenantDb(T, fn)

  const b = await run(tx => wineOrderBalance(tx, { wineOrderId: o.id, tenantId: T }))
  check('Balance = wines + fee − live settled payments (reversed / unsettled ignored)', !('error' in b) && b.balance === 1500, JSON.stringify(b))

  const tooMuch = await run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: asTetri(1501), at: new Date(), method: 'CASH' }))
  check('More than the balance is refused', 'error' in tooMuch)
  const zero = await run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: asTetri(0), at: new Date(), method: 'CASH' }))
  check('Zero is refused', 'error' in zero)
  // QA 2026-10-14 F8: 12.5 used to be stored as 12; a string reached the database.
  const frac = await run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: 12.5 as never, at: new Date(), method: 'CASH' }))
  check('A fraction of a tetri is refused', 'error' in frac)
  const str = await run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: '100' as never, at: new Date(), method: 'CASH' }))
  check('A string amount is refused', 'error' in str)
  const otherTenant = await withTenantDb('zz-someone-else', tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: 'zz-someone-else', amount: asTetri(100), at: new Date(), method: 'CASH' }))
  check("Another tenant cannot record against this order", 'error' in otherTenant)
  const part = await run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: asTetri(500), at: new Date(), method: 'BANK_TRANSFER' }))
  check('A part payment is accepted', !('error' in part))
  const b2 = await run(tx => wineOrderBalance(tx, { wineOrderId: o.id, tenantId: T }))
  check('…and the balance drops to 10₾', !('error' in b2) && b2.balance === 1000, JSON.stringify(b2))
  const rest = await run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: asTetri(1000), at: new Date(), method: 'CASH' }))
  const b3 = await run(tx => wineOrderBalance(tx, { wineOrderId: o.id, tenantId: T }))
  check('Paying exactly the rest leaves nothing owed', !('error' in rest) && !('error' in b3) && b3.balance === 0)

  // QA 2026-10-14 F9: two admins recording the same owed amount at the same instant — the row lock
  // makes the second one see the first, so only one is accepted (both were, before).
  await db.wineOrder.update({ where: { id: o.id }, data: { deliveryFee: 2500 } }) // owes 10₾ again
  const both = await Promise.all([1, 2, 3].map(() => run(tx => recordAdditionalWinePayment(tx, { wineOrderId: o.id, tenantId: T, amount: asTetri(1000), at: new Date(), method: 'CASH' }))))
  const b4 = await run(tx => wineOrderBalance(tx, { wineOrderId: o.id, tenantId: T }))
  check('Three simultaneous recordings of the same 10₾: exactly one accepted, nothing overpaid',
    both.filter(r => !('error' in r)).length === 1 && !('error' in b4) && b4.balance === 0, JSON.stringify(b4))

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}
main().catch(async e => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exitCode = 1 }).finally(() => db.$disconnect())
