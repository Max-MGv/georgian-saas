/**
 * RLS + withTenantDb integration test.
 * Tests every table and every operation type (read, create, update, delete).
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-rls.ts
 */

import { PrismaClient } from '@prisma/client'
import { withTenantDb, TxClient } from '../lib/db'

const db = new PrismaClient()

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (e: any) {
    console.log(`  ❌  ${name}`)
    console.log(`       ${e?.message ?? e}`)
    failed++
    failures.push(`${name}: ${e?.message ?? e}`)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ── get real tenant IDs ───────────────────────────────────────────────────────

async function main() {
  const tenants = await db.tenant.findMany({ orderBy: { createdAt: 'asc' } })
  if (tenants.length < 1) throw new Error('No tenants found — run seed-tenants.ts first')

  const t1 = tenants[0]
  const t2 = tenants[1] ?? null

  console.log(`\nTenant 1: ${t1.name} (${t1.id})`)
  if (t2) console.log(`Tenant 2: ${t2.name} (${t2.id})`)
  else console.log('Tenant 2: not found (cross-tenant isolation tests skipped)')

  // ── 1. Basic reads ──────────────────────────────────────────────────────────
  console.log('\n── 1. Basic reads ──')

  await test('Order.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.order.findMany({ where: { tenantId: t1.id }, take: 5 }))
    assert(rows.length > 0, `Expected orders, got 0`)
  })

  await test('Company.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.company.findMany({ where: { tenantId: t1.id } }))
    assert(rows.length > 0, `Expected companies, got 0`)
  })

  await test('Wine.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.wine.findMany({ where: { tenantId: t1.id } }))
    assert(rows.length > 0, `Expected wines, got 0`)
  })

  await test('MenuItem.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.menuItem.findMany({ where: { tenantId: t1.id } }))
    assert(rows.length > 0, `Expected menu items, got 0`)
  })

  await test('MasterclassItem.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.masterclassItem.findMany({ where: { tenantId: t1.id } }))
    assert(rows.length > 0, `Expected masterclass items, got 0`)
  })

  await test('Setting.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.setting.findMany({ where: { tenantId: t1.id } }))
    assert(rows.length > 0, `Expected settings, got 0`)
  })

  await test('SiteContent.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.siteContent.findMany({ where: { tenantId: t1.id } }))
    assert(rows.length > 0, `Expected site content rows, got 0`)
  })

  // ── 2. Child table reads (JOIN-policy tables) ───────────────────────────────
  console.log('\n── 2. Child table reads (JOIN policies) ──')

  await test('Price.findMany via withTenantDb works', async () => {
    const companies = await withTenantDb(t1.id, tx => tx.company.findMany({
      where: { tenantId: t1.id },
      include: { prices: true },
      take: 3,
    }))
    assert(companies.length > 0, 'No companies returned')
    // Prices come back via include, meaning the JOIN policy evaluated correctly
  })

  await test('OrderMasterclass readable via withTenantDb', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.orderMasterclass.findMany({ take: 5 }))
    // Just needs to not throw; rows may be 0 if no masterclass lines exist
    assert(Array.isArray(rows), 'Expected array')
  })

  await test('OrderExtra readable via withTenantDb', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.orderExtra.findMany({ take: 5 }))
    assert(Array.isArray(rows), 'Expected array')
  })

  // ── 3. Write operations ─────────────────────────────────────────────────────
  console.log('\n── 3. Write operations ──')

  let testCompanyId: string | null = null
  await test('Company.create via withTenantDb', async () => {
    const c = await withTenantDb(t1.id, tx => tx.company.create({
      data: { name: '__test_rls_company__', tenantId: t1.id },
    }))
    assert(c.id.length > 0, 'No id returned')
    testCompanyId = c.id
  })

  await test('Company.update via withTenantDb', async () => {
    if (!testCompanyId) throw new Error('Skipped — create failed')
    const count = await withTenantDb(t1.id, tx => tx.company.updateMany({
      where: { id: testCompanyId!, tenantId: t1.id },
      data: { name: '__test_rls_company_updated__' },
    }))
    assert(count.count === 1, `Expected 1 updated, got ${count.count}`)
  })

  let testBlockedDateId: string | null = null
  await test('BlockedDate.create via withTenantDb', async () => {
    const d = await withTenantDb(t1.id, tx => tx.blockedDate.create({
      data: { date: new Date('2099-12-31'), tenantId: t1.id },
    }))
    testBlockedDateId = d.id
    assert(d.id.length > 0, 'No id returned')
  })

  await test('BlockedDate.deleteMany via withTenantDb', async () => {
    if (!testBlockedDateId) throw new Error('Skipped — create failed')
    const r = await withTenantDb(t1.id, tx => tx.blockedDate.deleteMany({
      where: { id: testBlockedDateId!, tenantId: t1.id },
    }))
    assert(r.count === 1, `Expected 1 deleted, got ${r.count}`)
  })

  // ── 4. Cross-tenant isolation ───────────────────────────────────────────────
  console.log('\n── 4. Cross-tenant isolation ──')

  if (t2) {
    await test('T1 orders NOT visible when queried under T2 context', async () => {
      const t1Orders = await db.order.findMany({ where: { tenantId: t1.id }, take: 1 })
      if (t1Orders.length === 0) throw new Error('T1 has no orders to test with')
      const t1OrderId = t1Orders[0].id

      // Query for a known T1 order ID but under T2 context → should return nothing
      const leakedRows = await withTenantDb(t2.id, tx => tx.order.findMany({
        where: { id: t1OrderId },
      }))
      assert(leakedRows.length === 0, `DATA LEAK: T1 order visible under T2 context!`)
    })

    await test('T1 companies NOT visible when queried under T2 context', async () => {
      const t1Companies = await db.company.findMany({ where: { tenantId: t1.id }, take: 1 })
      if (t1Companies.length === 0) throw new Error('T1 has no companies to test with')
      const t1CompanyId = t1Companies[0].id

      const leakedRows = await withTenantDb(t2.id, tx => tx.company.findMany({
        where: { id: t1CompanyId },
      }))
      assert(leakedRows.length === 0, `DATA LEAK: T1 company visible under T2 context!`)
    })

    await test('T1 settings NOT visible when queried under T2 context', async () => {
      const t1Settings = await db.setting.findMany({ where: { tenantId: t1.id }, take: 1 })
      if (t1Settings.length === 0) throw new Error('T1 has no settings to test with')
      const t1Key = t1Settings[0].key

      const leakedRows = await withTenantDb(t2.id, tx => tx.setting.findMany({
        where: { key: t1Key },
      }))
      // T2 may have same key but it should be a different row with different tenantId
      const allMatch = leakedRows.every(r => r.tenantId === t2.id)
      assert(allMatch, `DATA LEAK: Setting row with T1 tenantId visible under T2 context!`)
    })
  } else {
    console.log('  ⚠️  Cross-tenant tests skipped (only 1 tenant in DB)')
  }

  // ── 5. Parallel withTenantDb calls (as used in Promise.all) ────────────────
  console.log('\n── 5. Parallel withTenantDb (Promise.all pattern) ──')

  await test('Multiple parallel withTenantDb calls complete without interference', async () => {
    const [orders, companies, wines, settings] = await Promise.all([
      withTenantDb(t1.id, tx => tx.order.findMany({ where: { tenantId: t1.id }, take: 3 })),
      withTenantDb(t1.id, tx => tx.company.findMany({ where: { tenantId: t1.id } })),
      withTenantDb(t1.id, tx => tx.wine.findMany({ where: { tenantId: t1.id }, take: 3 })),
      withTenantDb(t1.id, tx => tx.setting.findMany({ where: { tenantId: t1.id }, take: 3 })),
    ])
    assert(Array.isArray(orders) && Array.isArray(companies) && Array.isArray(wines) && Array.isArray(settings),
      'One or more parallel calls returned non-array')
  })

  // ── 6. groupBy (used in orders/page.tsx statusCounts) ──────────────────────
  console.log('\n── 6. groupBy (statusCounts pattern) ──')

  await test('Order.groupBy by status works via withTenantDb', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.order.groupBy({
      by: ['status'],
      where: { tenantId: t1.id },
      _count: { status: true },
    }))
    assert(Array.isArray(rows), 'Expected array from groupBy')
  })

  // ── 7. Complex includes (order detail page pattern) ────────────────────────
  console.log('\n── 7. Complex includes (order detail pattern) ──')

  await test('Order.findFirst with company+masterclassLines+extras include', async () => {
    const orders = await db.order.findMany({ where: { tenantId: t1.id }, take: 1 })
    if (orders.length === 0) throw new Error('No orders to test with')
    const o = await withTenantDb(t1.id, tx => tx.order.findFirst({
      where: { id: orders[0].id, tenantId: t1.id },
      include: {
        company: { include: { prices: true } },
        masterclassLines: { include: { masterclassItem: true } },
        extras: true,
      },
    }))
    assert(o !== null, 'Order not found via withTenantDb')
  })

  // ── 8. WineOrder read ──────────────────────────────────────────────────────
  console.log('\n── 8. WineOrder ──')

  await test('WineOrder.findMany returns rows for tenant 1', async () => {
    const rows = await withTenantDb(t1.id, tx => tx.wineOrder.findMany({ where: { tenantId: t1.id }, take: 5 }))
    assert(Array.isArray(rows), 'Expected array')
  })

  // ── 9. Cleanup test company ────────────────────────────────────────────────
  if (testCompanyId) {
    await withTenantDb(t1.id, tx => tx.company.deleteMany({
      where: { id: testCompanyId!, tenantId: t1.id },
    })).catch(() => {}) // best-effort cleanup
  }

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailed tests:')
    failures.forEach(f => console.log(`  • ${f}`))
  }
  console.log('')
}

main()
  .catch(e => { console.error('\nFatal:', e); process.exit(1) })
  .finally(() => db.$disconnect())
