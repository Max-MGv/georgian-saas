/**
 * Cross-tenant isolation test for CompanyGuide / CompanyRepresentative
 * (Plan-CompanyGuidesAndReps Chunk 2).
 *
 * Both tables are JOIN-to-Company RLS (no own tenantId), the same shape as Price.
 * MaintenanceNotes #10: `test-rls.ts`'s cross-tenant section skips itself on a
 * one-tenant DB, so this script proves isolation directly with two throwaway
 * tenants, copying `test-payment-rls.ts`'s pattern.
 *
 * Run: npx tsx scripts/test-guides-reps-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-guides-rls-a'
const B = 'zz-test-guides-rls-b'

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
  await db.companyGuide.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.companyRepresentative.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── CompanyGuide / CompanyRepresentative cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Test A', domain: 'zz-test-guides-a.invalid', slug: A },
      { id: B, name: 'ZZ Test B', domain: 'zz-test-guides-b.invalid', slug: B },
    ],
  })

  const companyA = await withTenantDb(A, tx => tx.company.create({ data: { name: 'Company A', tenantId: A } }))
  const companyB = await withTenantDb(B, tx => tx.company.create({ data: { name: 'Company B', tenantId: B } }))

  const guideA = await withTenantDb(A, tx =>
    tx.companyGuide.create({ data: { companyId: companyA.id, name: 'Guide A', code: 'ZZGUIDEA' } })
  )
  const guideB = await withTenantDb(B, tx =>
    tx.companyGuide.create({ data: { companyId: companyB.id, name: 'Guide B', code: 'ZZGUIDEB' } })
  )
  const repA = await withTenantDb(A, tx =>
    tx.companyRepresentative.create({ data: { companyId: companyA.id, name: 'Rep A', code: 'ZZREPAAA' } })
  )
  check('CompanyGuide.create and CompanyRepresentative.create work under withTenantDb', true)

  // Each tenant sees exactly its own guide.
  const aGuides = await withTenantDb(A, tx => tx.companyGuide.findMany())
  const bGuides = await withTenantDb(B, tx => tx.companyGuide.findMany())
  check('Tenant A sees exactly 1 guide', aGuides.length === 1, `saw ${aGuides.length}`)
  check('Tenant B sees exactly 1 guide', bGuides.length === 1, `saw ${bGuides.length}`)

  // The real test: B's guide queried by id under A's context must return nothing.
  const leak = await withTenantDb(A, tx => tx.companyGuide.findUnique({ where: { id: guideB.id } }))
  check("Tenant B's guide is invisible to tenant A by direct id", leak === null)

  // A write attempt against the other tenant's guide must not take effect.
  const wrote = await withTenantDb(A, tx =>
    tx.companyGuide.updateMany({ where: { id: guideB.id }, data: { name: 'Hacked' } })
  )
  check("Tenant A cannot update tenant B's guide", wrote.count === 0, `updated ${wrote.count}`)
  const bGuideStill = await db.companyGuide.findUnique({ where: { id: guideB.id } })
  check("Tenant B's guide name is untouched", bGuideStill?.name === 'Guide B', `name=${bGuideStill?.name}`)

  // Same two checks for CompanyRepresentative.
  const repLeak = await withTenantDb(B, tx => tx.companyRepresentative.findUnique({ where: { id: repA.id } }))
  check("Tenant A's representative is invisible to tenant B by direct id", repLeak === null)
  const repWrote = await withTenantDb(B, tx =>
    tx.companyRepresentative.updateMany({ where: { id: repA.id }, data: { name: 'Hacked' } })
  )
  check("Tenant B cannot update tenant A's representative", repWrote.count === 0, `updated ${repWrote.count}`)

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
