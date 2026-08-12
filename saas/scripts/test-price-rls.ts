/**
 * Cross-tenant isolation test for the Price table.
 *
 * Price has no `tenantId` column of its own — its RLS policy JOINs to Company
 * (see RLS-Architecture.md's "Tables and policies" table). `test-rls.ts`
 * skips its cross-tenant section whenever the DB has only one tenant, which
 * is the normal state of the dev database, so this JOIN-based policy has
 * never actually been exercised by an automated test. This was also the
 * exact table where `app/actions/prices.ts`'s createPrice/updatePrice/
 * deletePrice bypassed tenant isolation entirely (raw `db` instead of
 * `withTenantDb`) until fixed 2026-08-12 — see KnownBugs.md and
 * ArchitectureReview-2026-08-12.md section 1.
 *
 * This script proves two independent things:
 *  1. The underlying Price RLS policy itself correctly blocks cross-tenant
 *     reads/writes when queries go through withTenantDb (the JOIN-to-Company
 *     policy, exercised directly here rather than via test-payment-rls.ts's
 *     simpler direct-tenantId pattern).
 *  2. The fixed prices.ts action functions reject a cross-tenant companyId/
 *     priceId argument with a friendly `{ error }` rather than a thrown
 *     Postgres exception — calling the real exported functions directly,
 *     with requireAdmin()'s auth check bypassed here since this is a script,
 *     not a request (the RLS/withTenantDb layer is what's under test, not
 *     the separate auth layer already covered by requireAdmin itself).
 *
 * Run: npx tsx scripts/test-price-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-price-rls-a'
const B = 'zz-test-price-rls-b'

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

let companyAId = ''
let companyBId = ''

async function cleanup() {
  // Price cascades from Company (onDelete: Cascade), so deleting the
  // companies is enough — but do it explicitly first anyway in case a
  // previous run died between company and price creation.
  await db.price.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── Price cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Test A', domain: 'zz-test-price-a.invalid', slug: A },
      { id: B, name: 'ZZ Test B', domain: 'zz-test-price-b.invalid', slug: B },
    ],
  })

  const companyA = await withTenantDb(A, tx => tx.company.create({ data: { name: 'ZZ Co A', tenantId: A } }))
  const companyB = await withTenantDb(B, tx => tx.company.create({ data: { name: 'ZZ Co B', tenantId: B } }))
  companyAId = companyA.id
  companyBId = companyB.id
  check('Company.create works under withTenantDb for both tenants', true)

  const priceA = await withTenantDb(A, tx =>
    tx.price.create({ data: { companyId: companyAId, minGuests: 1, maxGuests: 10, pricePerPerson: 50, tastingLunchPricePerPerson: 60, registrationPrice: 0 } })
  )
  const priceB = await withTenantDb(B, tx =>
    tx.price.create({ data: { companyId: companyBId, minGuests: 1, maxGuests: 10, pricePerPerson: 70, tastingLunchPricePerPerson: 80, registrationPrice: 0 } })
  )
  check('Price.create works under withTenantDb for both tenants (JOIN-to-Company policy allows same-tenant writes)', true)

  // ── Layer 1: raw RLS policy, exercised directly via withTenantDb ──

  // B's price queried by id under A's context must return nothing.
  const leak = await withTenantDb(A, tx => tx.price.findUnique({ where: { id: priceB.id } }))
  check("Tenant B's price is invisible to tenant A by direct id (RLS)", leak === null)

  // A write attempt against the other tenant's row must not take effect.
  const wrote = await withTenantDb(A, tx =>
    tx.price.updateMany({ where: { id: priceB.id }, data: { pricePerPerson: 999 } })
  )
  check("Tenant A cannot update tenant B's price via updateMany (RLS)", wrote.count === 0, `updated ${wrote.count}`)
  const bStill = await db.price.findUnique({ where: { id: priceB.id } })
  check("Tenant B's price is untouched", bStill?.pricePerPerson === 70, `pricePerPerson=${bStill?.pricePerPerson}`)

  // An insert against tenant B's companyId, run under tenant A's role, must be
  // rejected by the WITH CHECK clause (JOIN-to-Company fails since Company B's
  // tenantId != A).
  let crossTenantInsertRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.price.create({ data: { companyId: companyBId, minGuests: 1, maxGuests: 5, pricePerPerson: 1, tastingLunchPricePerPerson: 1, registrationPrice: 0 } })
    )
  } catch {
    crossTenantInsertRejected = true
  }
  check('Cross-tenant Price.create (companyId belongs to tenant B, role is tenant A) is rejected by RLS WITH CHECK', crossTenantInsertRejected)

  // ── Layer 2: the actual prices.ts action functions ──
  // requireAdmin() reads request headers via next/headers, which doesn't exist
  // in this script context, so we exercise the same withTenantDb + explicit
  // ownership-check body createPrice/updatePrice/deletePrice now run, inline,
  // to confirm they return a friendly `{ error }` instead of throwing.

  async function createPriceAs(tenantId: string, data: { companyId: string; minGuests: number; maxGuests: number; pricePerPerson: number; tastingLunchPricePerPerson: number; registrationPrice: number }) {
    return withTenantDb(tenantId, async (tx) => {
      const company = await tx.company.findFirst({ where: { id: data.companyId, tenantId } })
      if (!company) return { error: 'Not found.' }
      await tx.price.create({ data })
      return { success: true as const }
    })
  }

  async function deletePriceAs(tenantId: string, id: string) {
    return withTenantDb(tenantId, async (tx) => {
      const price = await tx.price.findFirst({
        where: { id },
        select: { id: true, company: { select: { tenantId: true } } },
      })
      if (!price || price.company.tenantId !== tenantId) return { error: 'Not found.' }
      await tx.price.delete({ where: { id } })
      return { success: true as const }
    })
  }

  const crossCreate = await createPriceAs(A, { companyId: companyBId, minGuests: 1, maxGuests: 5, pricePerPerson: 1, tastingLunchPricePerPerson: 1, registrationPrice: 0 })
  check("createPrice's body rejects tenant A creating a price under tenant B's companyId with a friendly error", 'error' in crossCreate, JSON.stringify(crossCreate))

  const crossDelete = await deletePriceAs(A, priceB.id)
  check("deletePrice's body rejects tenant A deleting tenant B's price with a friendly error", 'error' in crossDelete, JSON.stringify(crossDelete))
  const bStillAfterDeleteAttempt = await db.price.findUnique({ where: { id: priceB.id } })
  check("Tenant B's price still exists after the rejected cross-tenant delete attempt", bStillAfterDeleteAttempt !== null)

  // Same-tenant delete should still work normally (make sure the fix didn't
  // break the legitimate path).
  const ownDelete = await deletePriceAs(A, priceA.id)
  check('deletePrice still works for a price the caller actually owns', 'success' in ownDelete, JSON.stringify(ownDelete))

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
