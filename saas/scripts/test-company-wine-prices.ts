/**
 * CompanyWinePrice (T-12): cross-tenant isolation, the DB money guard, cascades, and the
 * resolver's rule — negotiated prices only to a PROVEN company (its code, or an admin screen).
 * Run: npx tsx scripts/test-company-wine-prices.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'
import { resolveCompanyContactsFor } from '../lib/contactResolution'

const db = new PrismaClient()
const A = 'zz-test-wine-prices-a'
const B = 'zz-test-wine-prices-b'
let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
async function rejects(fn: () => Promise<unknown>) { try { await fn(); return false } catch { return true } }
async function cleanup() {
  await db.companyWinePrice.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.wine.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── CompanyWinePrice ──\n')
  await cleanup()
  await db.tenant.createMany({ data: [
    { id: A, name: 'ZZ Prices A', domain: 'zz-prices-a.invalid', slug: A },
    { id: B, name: 'ZZ Prices B', domain: 'zz-prices-b.invalid', slug: B },
  ] })
  const made: Record<string, { coded: string; open: string; vintage: string; price: string }> = {}
  for (const t of [A, B]) {
    const wine = await db.wine.create({ data: { tenantId: t, name: 'ZZ Saperavi', vintages: { create: { tenantId: t, year: 2022, price: 3000 } } }, include: { vintages: true } })
    const coded = await db.company.create({ data: { tenantId: t, name: `ZZ Coded ${t}`, isWineOrderCompany: true, accessCode: `ZZ${t.slice(-1).toUpperCase()}CODE1` } })
    const open = await db.company.create({ data: { tenantId: t, name: `ZZ Open ${t}`, isWineOrderCompany: true } })
    const p = await withTenantDb(t, tx => tx.companyWinePrice.create({ data: { companyId: coded.id, wineVintageId: wine.vintages[0]!.id, price: 2500 } }))
    await withTenantDb(t, tx => tx.companyWinePrice.create({ data: { companyId: open.id, wineVintageId: wine.vintages[0]!.id, price: 2400 } }))
    made[t] = { coded: coded.id, open: open.id, vintage: wine.vintages[0]!.id, price: p.id }
  }

  for (const t of [A, B]) {
    const rows = await withTenantDb(t, tx => tx.companyWinePrice.findMany())
    check(`${t}: sees exactly its own 2 prices`, rows.length === 2, `saw ${rows.length}`)
  }
  check("B's price invisible to A by id", (await withTenantDb(A, tx => tx.companyWinePrice.findUnique({ where: { id: made[B]!.price } }))) === null)
  const upd = await withTenantDb(A, tx => tx.companyWinePrice.updateMany({ where: { id: made[B]!.price }, data: { price: 1 } }))
  check("A cannot change B's price", upd.count === 0)
  check("A cannot add a price to B's company (WITH CHECK)",
    await rejects(() => withTenantDb(A, tx => tx.companyWinePrice.create({ data: { companyId: made[B]!.open, wineVintageId: made[A]!.vintage, price: 1 } }))))
  check('A negative price is refused by the database',
    await rejects(() => db.companyWinePrice.update({ where: { id: made[A]!.price }, data: { price: -1 } })))
  check('One price per company per vintage (unique)',
    await rejects(() => db.companyWinePrice.create({ data: { companyId: made[A]!.coded, wineVintageId: made[A]!.vintage, price: 9 } })))

  // ── The resolver's visibility rule ──
  const viaDropdownNoCode = await resolveCompanyContactsFor(A, { module: 'WINE_ORDER', companyId: made[A]!.open })
  check('Code-less company named from the dropdown: prices withheld, flag set',
    !('error' in viaDropdownNoCode) && viaDropdownNoCode.company.winePrices === null && viaDropdownNoCode.company.hasNegotiatedPrices,
    JSON.stringify(!('error' in viaDropdownNoCode) && viaDropdownNoCode.company))
  const withCode = await resolveCompanyContactsFor(A, { module: 'WINE_ORDER', companyId: made[A]!.coded, code: 'ZZACODE1' })
  check('Company proven by its code: prices shown',
    !('error' in withCode) && withCode.company.winePrices?.[made[A]!.vintage] === 2500)
  const noCodeForCoded = await resolveCompanyContactsFor(A, { module: 'WINE_ORDER', companyId: made[A]!.coded })
  check('Coded company without its code: refused entirely (nothing leaks)', 'error' in noCodeForCoded)
  const trusted = await resolveCompanyContactsFor(A, { module: 'WINE_ORDER', companyId: made[A]!.open, trusted: true })
  check('Admin (trusted) sees a code-less company\'s prices',
    !('error' in trusted) && trusted.company.winePrices?.[made[A]!.vintage] === 2400)

  // ── Cascades ──
  await db.company.delete({ where: { id: made[B]!.open } })
  check("Deleting a company removes its prices", (await db.companyWinePrice.count({ where: { companyId: made[B]!.open } })) === 0)

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}
main().catch(async e => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exitCode = 1 }).finally(() => db.$disconnect())
