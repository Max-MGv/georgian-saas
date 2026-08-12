/**
 * Cross-tenant isolation test for the WineOrderItem table.
 *
 * WineOrderItem has no `tenantId` column of its own — its RLS policy JOINs
 * to WineOrder (see RLS-Architecture.md's "Tables and policies" table:
 * `EXISTS (WineOrder WHERE tenantId = ...)`, same JOIN shape as OrderExtra/
 * OrderMasterclass's JOIN to Order and Price's JOIN to Company).
 * `test-rls.ts` skips its cross-tenant section whenever the DB has only one
 * tenant, which is the normal state of the dev database, so this JOIN-based
 * policy has never actually been exercised by an automated test — see
 * MaintenanceNotes.md §10 and ArchitectureReview-2026-08-12.md section 8.
 *
 * This script proves the underlying WineOrderItem RLS policy correctly
 * blocks cross-tenant reads/writes/inserts when queries go through
 * withTenantDb. `wineVintageId` is left null (it's optional, onDelete:
 * SetNull) since exercising that second FK isn't needed to test the
 * orderId-based policy.
 *
 * Run: npx tsx scripts/test-wineorderitem-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-woitem-rls-a'
const B = 'zz-test-woitem-rls-b'

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
  // WineOrderItem cascades from WineOrder (onDelete: Cascade), but delete it
  // explicitly first anyway in case a previous run died mid-way.
  await db.wineOrderItem.deleteMany({ where: { wineOrder: { tenantId: { in: [A, B] } } } })
  await db.wineOrder.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── WineOrderItem cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Test A', domain: 'zz-test-woitem-a.invalid', slug: A },
      { id: B, name: 'ZZ Test B', domain: 'zz-test-woitem-b.invalid', slug: B },
    ],
  })

  const wineOrderA = await withTenantDb(A, tx =>
    tx.wineOrder.create({
      data: { businessName: 'ZZ Biz A', address: 'ZZ Address A', contactName: 'ZZ Contact A', contactPhone: '000', tenantId: A },
    })
  )
  const wineOrderB = await withTenantDb(B, tx =>
    tx.wineOrder.create({
      data: { businessName: 'ZZ Biz B', address: 'ZZ Address B', contactName: 'ZZ Contact B', contactPhone: '000', tenantId: B },
    })
  )
  check('WineOrder.create works under withTenantDb for both tenants', true)

  const itemA = await withTenantDb(A, tx =>
    tx.wineOrderItem.create({
      data: { wineOrderId: wineOrderA.id, wineNameSnapshot: 'ZZ Wine A', vintageYearSnapshot: 2020, priceSnapshot: 10, quantity: 2 },
    })
  )
  const itemB = await withTenantDb(B, tx =>
    tx.wineOrderItem.create({
      data: { wineOrderId: wineOrderB.id, wineNameSnapshot: 'ZZ Wine B', vintageYearSnapshot: 2021, priceSnapshot: 20, quantity: 3 },
    })
  )
  check('WineOrderItem.create works under withTenantDb for both tenants (JOIN-to-WineOrder policy allows same-tenant writes)', true)

  // B's item queried by id under A's context must return nothing.
  const leak = await withTenantDb(A, tx => tx.wineOrderItem.findUnique({ where: { id: itemB.id } }))
  check("Tenant B's WineOrderItem is invisible to tenant A by direct id (RLS)", leak === null)

  // A write attempt against the other tenant's row must not take effect.
  const wrote = await withTenantDb(A, tx =>
    tx.wineOrderItem.updateMany({ where: { id: itemB.id }, data: { quantity: 999 } })
  )
  check("Tenant A cannot update tenant B's WineOrderItem via updateMany (RLS)", wrote.count === 0, `updated ${wrote.count}`)
  const bStill = await db.wineOrderItem.findUnique({ where: { id: itemB.id } })
  check("Tenant B's WineOrderItem is untouched", bStill?.quantity === 3, `quantity=${bStill?.quantity}`)

  // An insert against tenant B's wineOrderId, run under tenant A's role, must
  // be rejected by the WITH CHECK clause (JOIN-to-WineOrder fails since
  // WineOrder B's tenantId != A).
  let crossTenantInsertRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.wineOrderItem.create({
        data: { wineOrderId: wineOrderB.id, wineNameSnapshot: 'Cross', vintageYearSnapshot: 2022, priceSnapshot: 1, quantity: 1 },
      })
    )
  } catch {
    crossTenantInsertRejected = true
  }
  check('Cross-tenant WineOrderItem.create (wineOrderId belongs to tenant B, role is tenant A) is rejected by RLS WITH CHECK', crossTenantInsertRejected)

  // A cannot delete B's row either.
  const deleted = await withTenantDb(A, tx => tx.wineOrderItem.deleteMany({ where: { id: itemB.id } }))
  check("Tenant A cannot delete tenant B's WineOrderItem via deleteMany (RLS)", deleted.count === 0, `deleted ${deleted.count}`)
  const bStillExists = await db.wineOrderItem.findUnique({ where: { id: itemB.id } })
  check("Tenant B's WineOrderItem still exists after the rejected cross-tenant delete attempt", bStillExists !== null)

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
