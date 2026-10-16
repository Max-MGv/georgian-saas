/**
 * Cross-tenant isolation test for CompanyAddress (T-13, vault/Plan-WineOrderFeatures.md Chunk 1),
 * plus the WineOrder → CompanyAddress link's SetNull guarantee.
 *
 * Same reasoning as test-contact-roles-rls.ts: `check-rls.ts` only proves a policy row exists,
 * and the dev DB normally has one real tenant, so the "sees exactly N" assertions below are what
 * would catch RLS switched on with no policy (MaintenanceNotes §26 H18 — reads come back empty,
 * nothing throws).
 *
 * Run: npx tsx scripts/test-company-addresses-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-company-addresses-a'
const B = 'zz-test-company-addresses-b'

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
  await db.wineOrder.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.companyAddress.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── CompanyAddress cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Address A', domain: 'zz-address-a.invalid', slug: A },
      { id: B, name: 'ZZ Address B', domain: 'zz-address-b.invalid', slug: B },
    ],
  })

  const made: Record<string, { companyId: string; addressId: string }> = {}
  for (const t of [A, B]) {
    const company = await withTenantDb(t, tx =>
      tx.company.create({ data: { name: `ZZ Co ${t}`, tenantId: t, isWineOrderCompany: true } })
    )
    const address = await withTenantDb(t, tx =>
      tx.companyAddress.create({
        data: { companyId: company.id, label: 'Vake branch', address: `ZZ street ${t}` },
      })
    )
    made[t] = { companyId: company.id, addressId: address.id }
  }
  check('A CompanyAddress creates cleanly under withTenantDb for both tenants', true)

  for (const [t, other] of [[A, B], [B, A]] as const) {
    const rows = await withTenantDb(t, tx => tx.companyAddress.findMany())
    check(`${t}: sees exactly 1 CompanyAddress`, rows.length === 1, `saw ${rows.length}`)
    check(`${t}: it is not ${other}'s`, rows.every(r => r.id === made[t].addressId))
  }

  const leak = await withTenantDb(A, tx => tx.companyAddress.findUnique({ where: { id: made[B].addressId } }))
  check("B's address is invisible to A by direct id (JOIN-to-Company policy)", leak === null)

  const wrote = await withTenantDb(A, tx =>
    tx.companyAddress.updateMany({ where: { id: made[B].addressId }, data: { address: 'HIJACKED' } })
  )
  check("A cannot update B's address", wrote.count === 0, `updated ${wrote.count}`)

  const removed = await withTenantDb(A, tx =>
    tx.companyAddress.deleteMany({ where: { id: made[B].addressId } })
  )
  check("A cannot delete B's address", removed.count === 0, `deleted ${removed.count}`)

  const bStill = await db.companyAddress.findUnique({ where: { id: made[B].addressId } })
  check("B's address is untouched as seen by the superuser client", bStill?.address === `ZZ street ${B}`)

  let crossInsertRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.companyAddress.create({ data: { companyId: made[B].companyId, address: 'ZZ Smuggled' } })
    )
  } catch {
    crossInsertRejected = true
  }
  check("A cannot create an address on B's company (WITH CHECK)", crossInsertRejected)

  // ── Deleting an address must not touch a past order's snapshot (SetNull, not Cascade) ──
  const order = await withTenantDb(A, tx =>
    tx.wineOrder.create({
      data: {
        tenantId: A, companyId: made[A].companyId, companyAddressId: made[A].addressId,
        businessName: 'ZZ Co', address: `ZZ street ${A}`, addressLabel: 'Vake branch',
        contactName: 'ZZ', contactPhone: '+995 000',
      },
    })
  )
  await withTenantDb(A, tx => tx.companyAddress.delete({ where: { id: made[A].addressId } }))
  const after = await db.wineOrder.findUnique({ where: { id: order.id } })
  check('Deleting an address keeps the order (link goes null)',
    after !== null && after.companyAddressId === null, `link=${after?.companyAddressId}`)
  check("…and the order's address snapshot is unchanged",
    after?.address === `ZZ street ${A}` && after?.addressLabel === 'Vake branch')

  // ── Deleting a company removes its addresses (Cascade) ──
  await db.company.delete({ where: { id: made[B].companyId } })
  const orphan = await db.companyAddress.findUnique({ where: { id: made[B].addressId } })
  check("Deleting a company deletes its addresses (Cascade)", orphan === null)

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
