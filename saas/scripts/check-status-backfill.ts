/**
 * Verifies the status-dimension migration (Plan-StatusModel chunk 2).
 *
 * Three things, in order of how badly they fail silently:
 *
 * 1. **The RLS read path.** The dimension tables use a "global OR own" policy
 *    instead of the plain `tenantId = current_setting(...)` every other
 *    tenanted table uses. If that policy were written the usual way, every
 *    seeded row (tenantId NULL) would be invisible to every tenant — Postgres
 *    evaluates `NULL = 'some-tenant'` as NULL, not true — and the app would
 *    silently see an empty status vocabulary rather than erroring. A missing
 *    GRANT fails differently but just as importantly: any
 *    `include: { processStatus: true }` inside withTenantDb would throw
 *    "permission denied", because that transaction runs as app_user.
 *
 * 2. **Cross-tenant isolation**, exercised with two throwaway tenant-specific
 *    rows. MaintenanceNotes §10: check-rls.ts only proves a policy *exists*,
 *    never that it holds, and it skips its cross-tenant section on a
 *    one-tenant database. Same two-throwaway pattern as test-payment-rls.ts.
 *
 * 3. **Unresolved backfill rows.** The migration deliberately leaves one axis
 *    NULL wherever the old single status column could not say what it was
 *    (a 'paid' wine order cannot say which fulfilment stage it was at; a
 *    'COMPLETED' booking cannot say whether it was ever paid). Those rows are
 *    harmless today — nothing reads these columns yet — but every one of them
 *    must be resolved before chunks 3-5 make the new columns authoritative.
 *
 * Run: npx tsx scripts/check-status-backfill.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const EXPECTED_PROCESS = ['new', 'confirmed', 'delivered', 'completed', 'cancelled']
const EXPECTED_FINANCIAL = ['unpaid', 'invoiced', 'paid']

const TENANT_A = 'zz-test-statusdim-a'
const TENANT_B = 'zz-test-statusdim-b'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  console.log('\n=== 1. Global rows readable through withTenantDb (as app_user) ===')
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } })
  if (tenants.length === 0) {
    check('at least one tenant exists to test with', false)
  }

  for (const t of tenants) {
    const [process, financial] = await Promise.all([
      withTenantDb(t.id, tx => tx.processStatus.findMany({ orderBy: { sortOrder: 'asc' } })),
      withTenantDb(t.id, tx => tx.financialStatus.findMany({ orderBy: { sortOrder: 'asc' } })),
    ])
    const pCodes = process.map(p => p.code).sort()
    const fCodes = financial.map(f => f.code).sort()
    check(
      `${t.name}: sees all ${EXPECTED_PROCESS.length} process statuses`,
      pCodes.join(',') === [...EXPECTED_PROCESS].sort().join(','),
      `got [${pCodes.join(', ')}]`
    )
    check(
      `${t.name}: sees all ${EXPECTED_FINANCIAL.length} financial statuses`,
      fCodes.join(',') === [...EXPECTED_FINANCIAL].sort().join(','),
      `got [${fCodes.join(', ')}]`
    )
  }

  console.log('\n=== 2. Cross-tenant isolation of tenant-specific rows ===')
  try {
    await db.processStatus.createMany({
      data: [
        { id: 'zz_ps_a', tenantId: TENANT_A, code: 'zz-packed-a', sortOrder: 250 },
        { id: 'zz_ps_b', tenantId: TENANT_B, code: 'zz-packed-b', sortOrder: 250 },
      ],
    })

    const asA = await withTenantDb(TENANT_A, tx => tx.processStatus.findMany())
    const aCodes = asA.map(r => r.code)
    check('tenant A sees its own custom row', aCodes.includes('zz-packed-a'))
    check("tenant A does NOT see tenant B's custom row", !aCodes.includes('zz-packed-b'))
    check(
      'tenant A still sees the global rows alongside its own',
      EXPECTED_PROCESS.every(c => aCodes.includes(c))
    )

    const leaked = await withTenantDb(TENANT_A, tx =>
      tx.processStatus.findUnique({ where: { id: 'zz_ps_b' } })
    )
    check("direct lookup of tenant B's row id under tenant A returns null", leaked === null)

    console.log('\n=== 3. Writes are refused for app_user (reference data is superuser-only) ===')
    let writeRefused = false
    try {
      await withTenantDb(TENANT_A, tx =>
        tx.processStatus.create({ data: { tenantId: TENANT_A, code: 'zz-should-fail', sortOrder: 999 } })
      )
    } catch {
      writeRefused = true
    }
    check('app_user cannot INSERT a status (no GRANT)', writeRefused)
  } finally {
    await db.processStatus.deleteMany({ where: { id: { in: ['zz_ps_a', 'zz_ps_b'] } } })
    await db.processStatus.deleteMany({ where: { code: 'zz-should-fail' } })
  }

  console.log('\n=== 4. Unresolved backfill rows (must be settled before chunks 3-5) ===')
  const wineGaps = await db.$queryRawUnsafe<Array<{ status: string; missing_process: bigint; missing_financial: bigint }>>(`
    SELECT "status",
           COUNT(*) FILTER (WHERE "processStatusId"   IS NULL) AS missing_process,
           COUNT(*) FILTER (WHERE "financialStatusId" IS NULL) AS missing_financial
    FROM "WineOrder" GROUP BY "status" ORDER BY "status";
  `)
  const bookingGaps = await db.$queryRawUnsafe<Array<{ status: string; missing_process: bigint; missing_financial: bigint }>>(`
    SELECT "status"::text AS status,
           COUNT(*) FILTER (WHERE "processStatusId"   IS NULL) AS missing_process,
           COUNT(*) FILTER (WHERE "financialStatusId" IS NULL) AS missing_financial
    FROM "Order" GROUP BY "status" ORDER BY "status";
  `)

  const report = (rows: typeof wineGaps, label: string) => {
    console.log(`\n  ${label}`)
    let any = false
    for (const r of rows) {
      // COUNT() comes back as BigInt; the project's TS target predates BigInt
      // literals, so compare as Number rather than against 0n.
      const noProcess = Number(r.missing_process)
      const noFinancial = Number(r.missing_financial)
      if (noProcess === 0 && noFinancial === 0) continue
      any = true
      const parts = []
      if (noProcess > 0) parts.push(`${noProcess} without process`)
      if (noFinancial > 0) parts.push(`${noFinancial} without financial`)
      console.log(`    ${r.status.padEnd(18)} ${parts.join(', ')}`)
    }
    if (!any) console.log('    (none — fully backfilled)')
  }
  report(wineGaps, 'WineOrder:')
  report(bookingGaps, 'Order:')

  console.log(
    failures === 0
      ? '\n🟢 All structural checks passed.\n'
      : `\n🔴 ${failures} structural check(s) failed.\n`
  )
  if (failures > 0) process.exit(1)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
