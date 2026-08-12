/**
 * Cross-tenant isolation test for the OrderMasterclass table.
 *
 * OrderMasterclass has no `tenantId` column of its own — its RLS policy
 * JOINs to Order (see RLS-Architecture.md's "Tables and policies" table:
 * `EXISTS (Order WHERE tenantId = ...)`, same shape as OrderExtra and Price).
 * `test-rls.ts` skips its cross-tenant section whenever the DB has only one
 * tenant, which is the normal state of the dev database, so this JOIN-based
 * policy has never actually been exercised by an automated test — see
 * MaintenanceNotes.md §10 and ArchitectureReview-2026-08-12.md section 8.
 *
 * This script proves the underlying OrderMasterclass RLS policy correctly
 * blocks cross-tenant reads/writes/inserts when queries go through
 * withTenantDb. Each tenant also needs its own MasterclassItem row (the
 * other FK on OrderMasterclass) — created per-tenant here since
 * MasterclassItem itself is a `tenantId`-scoped table.
 *
 * Run: npx tsx scripts/test-ordermasterclass-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-ordermc-rls-a'
const B = 'zz-test-ordermc-rls-b'

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
  // OrderMasterclass cascades from Order (onDelete: Cascade), but delete it
  // explicitly first anyway in case a previous run died mid-way.
  await db.orderMasterclass.deleteMany({ where: { order: { tenantId: { in: [A, B] } } } })
  await db.order.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.masterclassItem.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── OrderMasterclass cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Test A', domain: 'zz-test-ordermc-a.invalid', slug: A },
      { id: B, name: 'ZZ Test B', domain: 'zz-test-ordermc-b.invalid', slug: B },
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

  const itemA = await withTenantDb(A, tx =>
    tx.masterclassItem.create({ data: { name: 'ZZ Item A', pricePerUnit: 15, tenantId: A } })
  )
  const itemB = await withTenantDb(B, tx =>
    tx.masterclassItem.create({ data: { name: 'ZZ Item B', pricePerUnit: 25, tenantId: B } })
  )
  check('Order.create and MasterclassItem.create work under withTenantDb for both tenants', true)

  const lineA = await withTenantDb(A, tx =>
    tx.orderMasterclass.create({ data: { orderId: orderA.id, masterclassItemId: itemA.id, quantity: 1, pricePerUnit: 15 } })
  )
  const lineB = await withTenantDb(B, tx =>
    tx.orderMasterclass.create({ data: { orderId: orderB.id, masterclassItemId: itemB.id, quantity: 1, pricePerUnit: 25 } })
  )
  check('OrderMasterclass.create works under withTenantDb for both tenants (JOIN-to-Order policy allows same-tenant writes)', true)

  // B's line queried by id under A's context must return nothing.
  const leak = await withTenantDb(A, tx => tx.orderMasterclass.findUnique({ where: { id: lineB.id } }))
  check("Tenant B's OrderMasterclass is invisible to tenant A by direct id (RLS)", leak === null)

  // A write attempt against the other tenant's row must not take effect.
  const wrote = await withTenantDb(A, tx =>
    tx.orderMasterclass.updateMany({ where: { id: lineB.id }, data: { quantity: 999 } })
  )
  check("Tenant A cannot update tenant B's OrderMasterclass via updateMany (RLS)", wrote.count === 0, `updated ${wrote.count}`)
  const bStill = await db.orderMasterclass.findUnique({ where: { id: lineB.id } })
  check("Tenant B's OrderMasterclass is untouched", bStill?.quantity === 1, `quantity=${bStill?.quantity}`)

  // An insert against tenant B's orderId, run under tenant A's role, must be
  // rejected by the WITH CHECK clause (JOIN-to-Order fails since Order B's
  // tenantId != A). masterclassItemId points at A's own item — the policy
  // is defined purely against orderId, so this isolates that check.
  let crossTenantInsertRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.orderMasterclass.create({ data: { orderId: orderB.id, masterclassItemId: itemA.id, quantity: 1, pricePerUnit: 1 } })
    )
  } catch {
    crossTenantInsertRejected = true
  }
  check('Cross-tenant OrderMasterclass.create (orderId belongs to tenant B, role is tenant A) is rejected by RLS WITH CHECK', crossTenantInsertRejected)

  // A cannot delete B's row either.
  const deleted = await withTenantDb(A, tx => tx.orderMasterclass.deleteMany({ where: { id: lineB.id } }))
  check("Tenant A cannot delete tenant B's OrderMasterclass via deleteMany (RLS)", deleted.count === 0, `deleted ${deleted.count}`)
  const bStillExists = await db.orderMasterclass.findUnique({ where: { id: lineB.id } })
  check("Tenant B's OrderMasterclass still exists after the rejected cross-tenant delete attempt", bStillExists !== null)

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
