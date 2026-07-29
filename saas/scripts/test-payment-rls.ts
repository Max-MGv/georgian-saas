/**
 * Cross-tenant isolation test for the Payment table (Plan-OnlinePayment phase 1).
 *
 * `test-rls.ts` skips its cross-tenant section whenever the DB has only one
 * tenant, which is the normal state of the dev database — so the isolation
 * guarantee for a brand-new table goes unexercised precisely when it matters
 * most. Payment holds money records: a leak here is the worst case in the
 * schema. This script creates two throwaway tenants, proves isolation both
 * ways, and cleans up after itself.
 *
 * Run: npx tsx scripts/test-payment-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-payment-rls-a'
const B = 'zz-test-payment-rls-b'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  ✅  ${label}`)
  } else {
    failed++
    console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function cleanup() {
  // Payments first — FK-free but tenant-scoped; delete as superuser.
  await db.payment.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── Payment cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Test A', domain: 'zz-test-a.invalid', slug: A },
      { id: B, name: 'ZZ Test B', domain: 'zz-test-b.invalid', slug: B },
    ],
  })

  // Write one payment under each tenant's RLS context.
  await withTenantDb(A, tx =>
    tx.payment.create({
      data: { tenantId: A, provider: 'flitt', providerPaymentId: 'zz-a-1', amount: 10, status: 'created' },
    })
  )
  await withTenantDb(B, tx =>
    tx.payment.create({
      data: { tenantId: B, provider: 'flitt', providerPaymentId: 'zz-b-1', amount: 20, status: 'created' },
    })
  )
  check('Payment.create works under withTenantDb for both tenants', true)

  // Each tenant sees exactly its own row.
  const aRows = await withTenantDb(A, tx => tx.payment.findMany())
  const bRows = await withTenantDb(B, tx => tx.payment.findMany())
  check('Tenant A sees exactly 1 payment', aRows.length === 1, `saw ${aRows.length}`)
  check('Tenant B sees exactly 1 payment', bRows.length === 1, `saw ${bRows.length}`)
  check('Tenant A sees only its own row', aRows.every(r => r.tenantId === A))
  check('Tenant B sees only its own row', bRows.every(r => r.tenantId === B))

  // The real test: B's row queried by id under A's context must return nothing.
  const bId = bRows[0]?.id
  const leak = await withTenantDb(A, tx => tx.payment.findUnique({ where: { id: bId } }))
  check("Tenant B's payment is invisible to tenant A by direct id", leak === null)

  // And a write attempt against the other tenant's row must not take effect.
  const wrote = await withTenantDb(A, tx =>
    tx.payment.updateMany({ where: { id: bId }, data: { status: 'approved' } })
  )
  check('Tenant A cannot update tenant B\'s payment', wrote.count === 0, `updated ${wrote.count}`)
  const bStill = await db.payment.findUnique({ where: { id: bId } })
  check("Tenant B's payment status is untouched", bStill?.status === 'created', `status=${bStill?.status}`)

  // Unique constraint: the callback handler relies on it for idempotency.
  let dupRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.payment.create({
        data: { tenantId: A, provider: 'flitt', providerPaymentId: 'zz-a-1', amount: 10, status: 'created' },
      })
    )
  } catch {
    dupRejected = true
  }
  check('Duplicate (provider, providerPaymentId) is rejected', dupRejected)

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch(async e => {
    console.error('ERROR:', e.message)
    await cleanup().catch(() => {})
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
