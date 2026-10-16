/**
 * companyCodeMatches (lib/contactResolution.ts, KnownBugs #78): the submit-time re-check that the
 * code the guest confirmed still proves the company the order names. It must accept exactly what
 * the resolver accepts — so every case is also asked of resolveCompanyContactsFor, and the two
 * answers have to agree.
 * Run: npx tsx scripts/test-company-code-check.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'
import { companyCodeMatches, companyCodeProof, listableCompaniesFor, resolveCompanyContactsFor } from '../lib/contactResolution'

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
    // Max, 2026-10-14: no code = unknown company — naming it is not enough, on either form.
    check('A company with no access code, named without a code → refused',
      (await matches(open, null)) === false && (await matches(open, 'ANYTHING')) === false)
    check('…and the form\'s lookup refuses it too (nothing filled in)',
      'error' in await resolveCompanyContactsFor(T, { module: 'WINE_ORDER', companyId: open.id }))
  }

  // ── How the company was proven (decides whether its negotiated prices counted as shown) ──
  console.log('\n  proof type\n')
  await person(open.id, contactRole.id, 'ZZOPENP1') // a person at the company WITHOUT an access code
  const proof = (c: { id: string; accessCode: string | null }, code: string | null) =>
    withTenantDb(T, tx => companyCodeProof(tx, T, c, code, 'WINE_ORDER'))
  await setCodes(true)
  check("Company code → 'company'", (await proof(coded, 'zzcoded1')) === 'company')
  check("Person code at a coded company → 'person'", (await proof(coded, 'ZZKETI01')) === 'person')
  check("Person code at a code-less company → 'person' (the form showed its prices)", (await proof(open, 'ZZOPENP1')) === 'person')
  const formShows = await resolveCompanyContactsFor(T, { module: 'WINE_ORDER', code: 'ZZOPENP1' })
  check('…and the form really did show them (resolver returns prices, not null)',
    !('error' in formShows) && formShows.company.winePrices !== null)
  check("Code-less company, no code → 'named' (prices withheld)", (await proof(open, null)) === 'named')
  check("Code-less company, a wrong code → still only 'named'", (await proof(open, 'ZZNOPE')) === 'named')
  check('Coded company, wrong code → null (refused)', (await proof(coded, 'ZZNOPE')) === null)
  await setCodes(false)
  check("Codes off: the code-less company's person code no longer counts → 'named'", (await proof(open, 'ZZOPENP1')) === 'named')

  // ── Which companies a public form may list (Max, 2026-10-14) ──
  console.log('\n  public company list\n')
  const listed = async (module: 'BOOKING' | 'WINE_ORDER') => (await listableCompaniesFor(T, module)).map(c => c.name).sort()
  const bare = await db.company.create({ data: { tenantId: T, name: 'ZZ Bare', isWineOrderCompany: true, isBookingCompany: true } })
  await setCodes(false)
  check('Codes off: only companies with an access code are listed (wine)', JSON.stringify(await listed('WINE_ORDER')) === JSON.stringify(['ZZ Coded', 'ZZ Other']),
    JSON.stringify(await listed('WINE_ORDER')))
  await setCodes(true)
  check("Codes on: a code-less company whose person has a code is listed too", (await listed('WINE_ORDER')).includes('ZZ Open'))
  check('…but never a company nobody can prove', !(await listed('WINE_ORDER')).includes('ZZ Bare'))
  // A code-less company whose only coded person is a booking-only guide: provable on bookings only.
  const guideOnly = await db.company.create({ data: { tenantId: T, name: 'ZZ GuideOnly', isWineOrderCompany: true, isBookingCompany: true } })
  await person(guideOnly.id, guideRole.id, 'ZZGONLY1')
  check("A guide's code (booking-only role) lists the company on the booking form…", (await listed('BOOKING')).includes('ZZ GuideOnly'))
  check('…but not on the wine form, where that code would not resolve', !(await listed('WINE_ORDER')).includes('ZZ GuideOnly'))
  await db.companyPerson.deleteMany({ where: { companyId: guideOnly.id } })
  await db.company.delete({ where: { id: guideOnly.id } })
  const listRow = (await listableCompaniesFor(T, 'WINE_ORDER'))[0]!
  check('The list carries a name and an id — nothing else', JSON.stringify(Object.keys(listRow).sort()) === JSON.stringify(['id', 'name']))
  await db.company.delete({ where: { id: bare.id } })

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}
main().catch(async e => { console.error('ERROR:', e.message); await cleanup().catch(() => {}); process.exitCode = 1 }).finally(() => db.$disconnect())
