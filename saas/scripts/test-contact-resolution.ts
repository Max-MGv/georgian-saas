/**
 * Behavioural test for `resolveCompanyContactsFor()` — the single contact resolver
 * (vault/Plan-ContactRoles.md Chunk 3, decision 10).
 *
 * This function replaced four overlapping ones, two of which had silently disagreed with each
 * other for five days (MaintenanceNotes #26). The whole argument for collapsing them is that one
 * function cannot contradict itself — so it is worth proving the one function actually answers
 * correctly in every mode, rather than trusting that it typechecks.
 *
 * It is also why the logic lives in `lib/contactResolution.ts` rather than in the `'use server'`
 * file: `getTenantId()` needs a request context, so a server action cannot be exercised from a
 * script at all.
 *
 * Stands up a throwaway tenant, proves both `person_codes_enabled` modes, and cleans up.
 *
 * Run: npx tsx scripts/test-contact-resolution.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { resolveCompanyContactsFor, companyLevelContactsFor } from '../lib/contactResolution'

const db = new PrismaClient()
const T = 'zz-test-contact-resolution'

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

async function setCodes(on: boolean) {
  await db.setting.upsert({
    where: { key_tenantId: { key: 'person_codes_enabled', tenantId: T } },
    create: { key: 'person_codes_enabled', value: on ? 'true' : 'false', tenantId: T },
    update: { value: on ? 'true' : 'false' },
  })
}

async function cleanup() {
  await db.orderContact.deleteMany({ where: { tenantId: T } })
  await db.companyPerson.deleteMany({ where: { company: { tenantId: T } } })
  await db.contactRole.deleteMany({ where: { tenantId: T } })
  await db.company.deleteMany({ where: { tenantId: T } })
  await db.setting.deleteMany({ where: { tenantId: T } })
  await db.tenant.deleteMany({ where: { id: T } })
}

async function main() {
  console.log('\n── resolveCompanyContacts ──\n')
  await cleanup()

  await db.tenant.create({
    data: { id: T, name: 'ZZ Resolution', domain: 'zz-resolution.invalid', slug: T },
  })

  const company = await db.company.create({
    data: {
      name: 'ZZ Tours', tenantId: T, accessCode: 'ZZCOMPANY',
      isBookingCompany: true, isWineOrderCompany: true,
    },
  })

  const mk = (key: string, en: string, scope: 'PER_ORDER' | 'COMPANY_LEVEL',
              appliesTo: 'BOOKING' | 'WINE_ORDER' | 'BOTH', sortOrder: number) =>
    db.contactRole.create({
      data: { tenantId: T, key, labelEn: en, labelKa: en, scope, appliesTo, sortOrder, isSystem: true },
    })

  const contactRole = await mk('contact_person', 'Contact Person', 'PER_ORDER', 'BOTH', 10)
  const guideRole = await mk('guide', 'Guide', 'PER_ORDER', 'BOOKING', 20)
  const ceoRole = await mk('ceo', 'CEO', 'COMPANY_LEVEL', 'BOTH', 30)
  const offRole = await mk('retired', 'Retired', 'PER_ORDER', 'BOTH', 40)
  await db.contactRole.update({ where: { id: offRole.id }, data: { isActive: false } })

  const person = (roleId: string, name: string, code: string | null, active = true) =>
    db.companyPerson.create({
      data: {
        companyId: company.id, roleId, name, code, isActive: active,
        phone: `+995 ${name.length}`, email: `${name.replace(/\W/g, '')}@zz.invalid`,
      },
    })

  const keti = await person(contactRole.id, 'Keti Contact', 'ZZCONTACT')
  const nika = await person(guideRole.id, 'Nika Guide', 'ZZGUIDE')
  await person(ceoRole.id, 'Zaza CEO', 'ZZCEO001')
  await person(offRole.id, 'Nobody Retired', null)
  await person(contactRole.id, 'Gone Person', null, false) // inactive

  // ── person codes OFF (the default) ──────────────────────────────────────
  await setCodes(false)
  console.log('  person_codes_enabled = false\n')

  /**
   * ⚠️ THE ACCESS-CODE GATE. This block used to assert the opposite.
   *
   * It read "Known company resolves with no code at all" and passed — which is precisely the
   * bug. `resolveCompanyContacts` is an unauthenticated server action and company ids are in
   * the public homepage's HTML, so naming a company with no code returned that company's
   * entire staff directory: names, phones, emails. An audit reproduced it against the running
   * dev server on 2026-09-22.
   *
   * The test agreed with the code, so the suite could never have caught it. Worth remembering:
   * a test written from the implementation asserts what the code does, not what it should.
   */
  const noCode = await resolveCompanyContactsFor(T, { module: 'BOOKING', companyId: company.id })
  check('A company WITH a code is refused when no code is given',
    'error' in noCode, `got ${JSON.stringify(noCode).slice(0, 80)}`)
  const wrongCode = await resolveCompanyContactsFor(T, {
    module: 'BOOKING', companyId: company.id, code: 'NOTTHECODE',
  })
  check('…and refused with the wrong code', 'error' in wrongCode)
  const leaked = JSON.stringify(noCode) + JSON.stringify(wrongCode)
  check('…and neither refusal leaks a single person',
    !leaked.includes('ZZ Contact') && !leaked.includes('ZZ Guide'))

  // An admin screen has already proved itself and may skip the code — the one exception,
  // and one a browser cannot ask for (the public action never forwards `trusted`).
  const asAdmin = await resolveCompanyContactsFor(T, {
    module: 'BOOKING', companyId: company.id, trusted: true,
  })
  check('A trusted caller resolves the same company without a code', 'success' in asAdmin)

  const byId = await resolveCompanyContactsFor(T, {
    module: 'BOOKING', companyId: company.id, code: 'ZZCOMPANY',
  })
  check('Known company resolves with its own code', 'success' in byId)
  if ('success' in byId) {
    check('…returns both per-order roles', byId.roleChoices.length === 2,
      `got ${byId.roleChoices.map(r => r.key).join(',')}`)
    check('…COMPANY_LEVEL role (ceo) is excluded',
      !byId.roleChoices.some(r => r.key === 'ceo'))
    check('…inactive role is excluded', !byId.roleChoices.some(r => r.key === 'retired'))
    check('…inactive person is excluded',
      !byId.roleChoices.flatMap(r => r.people).some(p => p.name === 'Gone Person'))
    check('…contact_person sorts before guide',
      byId.roleChoices[0]?.key === 'contact_person')
    check('…no person code is present anywhere in the payload',
      !JSON.stringify(byId).includes('ZZCONTACT') && !JSON.stringify(byId).includes('ZZGUIDE'))
  }

  const wineOff = await resolveCompanyContactsFor(T, { module: 'WINE_ORDER', companyId: company.id, code: 'ZZCOMPANY' })
  check('WINE_ORDER excludes the BOOKING-only guide role',
    'success' in wineOff && !wineOff.roleChoices.some(r => r.key === 'guide'),
    'success' in wineOff ? wineOff.roleChoices.map(r => r.key).join(',') : 'errored')

  const byCompanyCode = await resolveCompanyContactsFor(T, { module: 'BOOKING', code: 'zzcompany' })
  check('Company code alone resolves the company, case-insensitively',
    'success' in byCompanyCode && byCompanyCode.company.id === company.id)
  check('…and still offers the pickers',
    'success' in byCompanyCode && byCompanyCode.roleChoices.length === 2)

  const personCodeWhileOff = await resolveCompanyContactsFor(T, { module: 'BOOKING', code: 'ZZGUIDE' })
  check('A person code does NOT work while person codes are off',
    'error' in personCodeWhileOff)

  // ── person codes ON ─────────────────────────────────────────────────────
  await setCodes(true)
  console.log('\n  person_codes_enabled = true\n')

  const byPerson = await resolveCompanyContactsFor(T, { module: 'BOOKING', code: 'zzguide' })
  check('A person code resolves that person', 'success' in byPerson &&
    byPerson.matchType === 'person' && byPerson.matchedPerson?.id === nika.id)
  check('…and returns NO colleague list (the privacy requirement)',
    'success' in byPerson && byPerson.roleChoices.length === 0)

  const byCompanyOn = await resolveCompanyContactsFor(T, { module: 'BOOKING', code: 'ZZCOMPANY' })
  check('The company code still works with person codes on',
    'success' in byCompanyOn && byCompanyOn.matchType === 'company')
  check('…but the picker is suppressed (nobody sees colleagues)',
    'success' in byCompanyOn && byCompanyOn.roleChoices.length === 0)

  const scoped = await resolveCompanyContactsFor(T,
    { module: 'BOOKING', companyId: company.id, code: 'ZZCONTACT' })
  check('Dropdown-then-code: a person code for THAT company matches',
    'success' in scoped && scoped.matchedPerson?.id === keti.id)

  const wrong = await resolveCompanyContactsFor(T,
    { module: 'BOOKING', companyId: company.id, code: 'NOPE1234' })
  check('Dropdown-then-code: a wrong code is rejected as "Incorrect code."',
    'error' in wrong && wrong.error === 'Incorrect code.',
    'error' in wrong ? wrong.error : 'succeeded')

  const guideViaWine = await resolveCompanyContactsFor(T, { module: 'WINE_ORDER', code: 'ZZGUIDE' })
  check('A BOOKING-only guide code is not accepted on the wine module',
    'error' in guideViaWine)

  // The `scope` half of the same fix. A COMPANY_LEVEL person is company reference data and must
  // never resolve on an order form, even holding a valid code — that is what scope is for.
  const ceoOnForm = await resolveCompanyContactsFor(T, { module: 'BOOKING', code: 'ZZCEO001' })
  check('A COMPANY_LEVEL code never resolves on an order form',
    'error' in ceoOnForm, 'success' in ceoOnForm ? `matched ${ceoOnForm.matchedPerson?.name}` : '')
  const ceoOnWine = await resolveCompanyContactsFor(T, { module: 'WINE_ORDER', code: 'ZZCEO001' })
  check('…on the wine module either', 'error' in ceoOnWine)

  // ── COMPANY_LEVEL data is reachable, but only on its own path ───────────
  const ceo = await companyLevelContactsFor(T, company.id)
  check('companyLevelContacts returns the CEO role',
    ceo.length === 1 && ceo[0].key === 'ceo', `got ${ceo.map(r => r.key).join(',')}`)

  // ── An empty company must not error ─────────────────────────────────────
  const empty = await db.company.create({
    data: { name: 'ZZ Empty', tenantId: T, accessCode: 'ZZEMPTY1', isBookingCompany: true },
  })
  await setCodes(false)
  const none = await resolveCompanyContactsFor(T, { module: 'BOOKING', companyId: empty.id, code: 'ZZEMPTY1' })
  check('A company with nobody configured succeeds with an empty list, not an error',
    'success' in none && none.roleChoices.length === 0)

  await cleanup()
  console.log('\n──────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch(async e => {
    console.error('ERROR:', e)
    await cleanup().catch(() => {})
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
