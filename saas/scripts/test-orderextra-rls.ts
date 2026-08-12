/**
 * Cross-tenant isolation test for the OrderExtra table.
 *
 * OrderExtra has no `tenantId` column of its own — its RLS policy JOINs to
 * Order (see RLS-Architecture.md's "Tables and policies" table: `EXISTS
 * (Order WHERE tenantId = ...)`, the same shape as Price's JOIN to Company).
 * `test-rls.ts` skips its cross-tenant section whenever the DB has only one
 * tenant, which is the normal state of the dev database, so this JOIN-based
 * policy has never actually been exercised by an automated test — see
 * MaintenanceNotes.md §10 and ArchitectureReview-2026-08-12.md section 8.
 *
 * This script proves the underlying OrderExtra RLS policy correctly blocks
 * cross-tenant reads/writes/inserts when queries go through withTenantDb.
 *
 * Run: npx tsx scripts/test-orderextra-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-orderextra-rls-a'
const B = 'zz-test-orderextra-rls-b'

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
  // OrderExtra cascades from Order (onDelete: Cascade), but delete it
  // explicitly first anyway in case a previous run died mid-way.
  await db.orderExtra.deleteMany({ where: { order: { tenantId: { in: [A, B] } } } })
  await db.order.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── OrderExtra cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Test A', domain: 'zz-test-orderextra-a.invalid', slug: A },
      { id: B, name: 'ZZ Test B', domain: 'zz-test-orderextra-b.invalid', slug: B },
    ],
  })

  const orderA = await withTenantDb(A, tx =>
    tx.order.create({
      data: { visitType: 'TASTING', date: new Date(), timeSlot: '10:00', guestCount: 2, name: 'ZZ', surname: 'A', tenantId: A },
    })
  )
  const orderB = await withTenantDb(B, tx =>
    tx.order.create({
      data: { visitType: 'TASTING', date: new Date(), timeSlot: '10:00', guestCount: 2, name: 'ZZ', surname: 'B', tenantId: B },
    })
  )
  check('Order.create works under withTenantDb for both tenants', true)

  const extraA = await withTenantDb(A, tx =>
    tx.orderExtra.create({ data: { orderId: orderA.id, label: 'Extra A', amount: 10 } })
  )
  const extraB = await withTenantDb(B, tx =>
    tx.orderExtra.create({ data: { orderId: orderB.id, label: 'Extra B', amount: 20 } })
  )
  check('OrderExtra.create works under withTenantDb for both tenants (JOIN-to-Order policy allows same-tenant writes)', true)

  // B's extra queried by id under A's context must return nothing.
  const leak = await withTenantDb(A, tx => tx.orderExtra.findUnique({ where: { id: extraB.id } }))
  check("Tenant B's OrderExtra is invisible to tenant A by direct id (RLS)", leak === null)

  // A write attempt against the other tenant's row must not take effect.
  const wrote = await withTenantDb(A, tx =>
    tx.orderExtra.updateMany({ where: { id: extraB.id }, data: { amount: 999 } })
  )
  check("Tenant A cannot update tenant B's OrderExtra via updateMany (RLS)", wrote.count === 0, `updated ${wrote.count}`)
  const bStill = await db.orderExtra.findUnique({ where: { id: extraB.id } })
  check("Tenant B's OrderExtra is untouched", bStill?.amount === 20, `amount=${bStill?.amount}`)

  // An insert against tenant B's orderId, run under tenant A's role, must be
  // rejected by the WITH CHECK clause (JOIN-to-Order fails since Order B's
  // tenantId != A).
  let crossTenantInsertRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.orderExtra.create({ data: { orderId: orderB.id, label: 'Cross', amount: 1 } })
    )
  } catch {
    crossTenantInsertRejected = true
  }
  check('Cross-tenant OrderExtra.create (orderId belongs to tenant B, role is tenant A) is rejected by RLS WITH CHECK', crossTenantInsertRejected)

  // A cannot delete B's row either.
  const deleted = await withTenantDb(A, tx => tx.orderExtra.deleteMany({ where: { id: extraB.id } }))
  check("Tenant A cannot delete tenant B's OrderExtra via deleteMany (RLS)", deleted.count === 0, `deleted ${deleted.count}`)
  const bStillExists = await db.orderExtra.findUnique({ where: { id: extraB.id } })
  check("Tenant B's OrderExtra still exists after the rejected cross-tenant delete attempt", bStillExists !== null)

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
