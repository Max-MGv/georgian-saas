/**
 * Behavioural test for `resolveOrderAddress()` (lib/orderAddress.ts, T-13) — the server-side
 * check both wine-order write paths run before trusting a `companyAddressId` from a browser.
 *
 * The UI can only ever send an id it was shown; this proves a crafted request cannot do better:
 * another company's address, another tenant's address, an inactive one, or an id with no
 * company are all refused, and a valid one's text comes from the DB, not from the request.
 *
 * Run: npx tsx scripts/test-order-address.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'
import { resolveOrderAddress } from '../lib/orderAddress'

const db = new PrismaClient()
const A = 'zz-test-order-address-a'
const B = 'zz-test-order-address-b'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function cleanup() {
  await db.companyAddress.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── resolveOrderAddress ──\n')
  await cleanup()
  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Order Address A', domain: 'zz-order-address-a.invalid', slug: A },
      { id: B, name: 'ZZ Order Address B', domain: 'zz-order-address-b.invalid', slug: B },
    ],
  })
  const mk = (tenantId: string, name: string, addresses: { label?: string; address: string; workingHours?: string; isActive?: boolean }[]) =>
    db.company.create({
      data: { name, tenantId, isWineOrderCompany: true, addresses: { create: addresses } },
      include: { addresses: true },
    })
  const a1 = await mk(A, 'ZZ A1', [{ label: 'Vake', address: 'A1 street', workingHours: '10-22' }, { address: 'A1 old', isActive: false }])
  const a2 = await mk(A, 'ZZ A2', [{ address: 'A2 street' }])
  const b1 = await mk(B, 'ZZ B1', [{ address: 'B1 street' }])
  const a1Active = a1.addresses.find(x => x.isActive)!
  const a1Inactive = a1.addresses.find(x => !x.isActive)!

  const run = (tenantId: string, input: Parameters<typeof resolveOrderAddress>[2]) =>
    withTenantDb(tenantId, tx => resolveOrderAddress(tx, tenantId, input))

  const ok = await run(A, { companyId: a1.id, companyAddressId: a1Active.id, typedAddress: 'TAMPERED', typedWorkingHours: 'TAMPERED' })
  check('A valid saved address is accepted', !('error' in ok))
  check('…and its text comes from the DB, not the request',
    !('error' in ok) && ok.address === 'A1 street' && ok.workingHours === '10-22' && ok.addressLabel === 'Vake' && ok.companyAddressId === a1Active.id,
    JSON.stringify(ok))

  const otherCompany = await run(A, { companyId: a1.id, companyAddressId: a2.addresses[0]!.id, typedAddress: null, typedWorkingHours: null })
  check("Another company's address (same tenant) is refused", 'error' in otherCompany)

  const otherTenant = await run(A, { companyId: b1.id, companyAddressId: b1.addresses[0]!.id, typedAddress: null, typedWorkingHours: null })
  check("Another tenant's company + address is refused", 'error' in otherTenant)

  const inactive = await run(A, { companyId: a1.id, companyAddressId: a1Inactive.id, typedAddress: null, typedWorkingHours: null })
  check('An inactive address is refused', 'error' in inactive)

  const noCompany = await run(A, { companyId: null, companyAddressId: a1Active.id, typedAddress: null, typedWorkingHours: null })
  check('An address id with no company is refused', 'error' in noCompany)

  const typed = await run(A, { companyId: a1.id, companyAddressId: null, typedAddress: '  Typed 5  ', typedWorkingHours: '  ' })
  check('A typed address is stored as typed (trimmed), with no link and no name',
    !('error' in typed) && typed.address === 'Typed 5' && typed.workingHours === null && typed.companyAddressId === null && typed.addressLabel === null,
    JSON.stringify(typed))

  const empty = await run(A, { companyId: null, companyAddressId: null, typedAddress: '   ', typedWorkingHours: null })
  check('Neither a saved nor a typed address is refused', 'error' in empty)

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch(async e => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exitCode = 1 })
  .finally(() => db.$disconnect())
