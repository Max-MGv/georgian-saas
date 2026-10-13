/**
 * companyCodeMatches (lib/contactResolution.ts, KnownBugs #78): the submit-time re-check that the
 * code the guest confirmed still proves the company the order names. It must accept exactly what
 * the resolver accepts — so every case is also asked of resolveCompanyContactsFor, and the two
 * answers have to agree.
 * Run: npx tsx scripts/test-company-code-check.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'
import { companyCodeMatches, resolveCompanyContactsFor } from '../lib/contactResolution'

const db = new PrismaClient()
const T = 'zz-test-company-code'
let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
async function setCodes(on: boolean) {
  await db.setting.upsert({
    where: { key_tenantId: { key: 'person_codes_enabled', tenantId: T } },
    create: { key: 'person_codes_enabled', value: on ? 'true' : 'false', tenantId: T },
    update: { value: on ? 'true' : 'false' },
  })
}
async function cleanup() {
  await db.companyPerson.deleteMany({ where: { company: { tenantId: T } } })
  await db.contactRole.deleteMany({ where: { tenantId: T } })
  await db.company.deleteMany({ where: { tenantId: T } })
  await db.setting.deleteMany({ where: { tenantId: T } })
  await db.tenant.deleteMany({ where: { id: T } })
}

async function main() {
  console.log('\n── companyCodeMatches ──\n')
  await cleanup()
  await db.tenant.create({ data: { id: T, name: 'ZZ Code check', domain: 'zz-code-check.invalid', slug: T } })

  const coded = await db.company.create({ data: { tenantId: T, name: 'ZZ Coded', accessCode: 'ZZCODED1', isWineOrderCompany: true, isBookingCompany: true } })
  const other = await db.company.create({ data: { tenantId: T, name: 'ZZ Other', accessCode: 'ZZOTHER1', isWineOrderCompany: true, isBookingCompany: true } })
  const open = await db.company.create({ data: { tenantId: T, name: 'ZZ Open', isWineOrderCompany: true } })

  const role = (key: string, scope: 'PER_ORDER' | 'COMPANY_LEVEL', appliesTo: 'BOOKING' | 'WINE_ORDER' | 'BOTH') =>
    db.contactRole.create({ data: { tenantId: T, key, labelEn: key, labelKa: key, scope, appliesTo } })
  const contactRole = await role('contact_person', 'PER_ORDER', 'BOTH')
  const guideRole = await role('guide', 'PER_ORDER', 'BOOKING')
  const ceoRole = await role('ceo', 'COMPANY_LEVEL', 'BOTH')
  const person = (companyId: string, roleId: string, code: string, isActive = true) =>
    db.companyPerson.create({ data: { companyId, roleId, name: code, code, isActive } })
  await person(coded.id, contactRole.id, 'ZZKETI01')
  await person(coded.id, guideRole.id, 'ZZGUIDE1')        // booking-only role
  await person(coded.id, ceoRole.id, 'ZZCEO001')          // company-level role
  await person(coded.id, contactRole.id, 'ZZGONE01', false) // inactive
  await person(other.id, contactRole.id, 'ZZOTHERP')      // a person at ANOTHER company

  const matches = (c: { id: string; accessCode: string | null }, code: string | null, module: 'BOOKING' | 'WINE_ORDER' = 'WINE_ORDER') =>
    withTenantDb(T, tx => companyCodeMatches(tx, T, c, code, module))
  // What the form accepted when the guest typed the code (the dropdown path: company + code).
  const resolverAccepts = async (companyId: string, code: string, module: 'BOOKING' | 'WINE_ORDER' = 'WINE_ORDER') =>
    !('error' in await resolveCompanyContactsFor(T, { module, companyId, code }))

  async function same(label: string, c: { id: string; accessCode: string | null }, code: string, expected: boolean, module: 'BOOKING' | 'WINE_ORDER' = 'WINE_ORDER') {
    const got = await matches(c, code, module)
    const form = await resolverAccepts(c.id, code, module)
    check(`${label} → ${expected ? 'accepted' : 'refused'} (form agrees)`, got === expected && form === expected,
      `check=${got}, form=${form}`)
  }

  for (const codesOn of [false, true]) {
    await setCodes(codesOn)
    console.log(`\n  person_codes_enabled = ${codesOn}\n`)
    await same('Company code', coded, 'ZZCODED1', true)
    await same('Company code, lower case + spaces', coded, '  zzcoded1 ', true)
    await same('Wrong code', coded, 'ZZWRONG1', false)
    await same("Another company's code", coded, 'ZZOTHER1', false)
    await same('Contact person\'s own code', coded, 'ZZKETI01', codesOn)
    await same('A person at another company', coded, 'ZZOTHERP', false)
    await same('Booking-only guide on a wine order', coded, 'ZZGUIDE1', false)
    await same('Booking-only guide on a booking', coded, 'ZZGUIDE1', codesOn, 'BOOKING')
    await same('Company-level (CEO) code', coded, 'ZZCEO001', false)
    await same('Inactive person\'s code', coded, 'ZZGONE01', false)
    check('No code at all for a coded company → refused', (await matches(coded, null)) === false && (await matches(coded, '   ')) === false)
    check('A company with no access code → accepted without one (only named; prices stay hidden)',
      (await matches(open, null)) === true && (await matches(open, 'ANYTHING')) === true)
  }

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}
main().catch(async e => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exitCode = 1 }).finally(() => db.$disconnect())
