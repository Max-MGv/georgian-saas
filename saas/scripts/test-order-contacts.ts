/**
 * Chunk 9 — the OrderContact write path.
 *
 * Exercises `buildOrderContactRows()` directly against a throwaway tenant, because that is
 * where every guard lives. A green `tsc` proves the shape compiles; it proves nothing about
 * whether a crafted payload can attach a person from another company to an order, which is
 * the only question worth asking about a write path a browser can reach.
 *
 * Two tenants, so cross-tenant leakage is a scenario the test can actually fail on — hurdle
 * H6 and MaintenanceNotes #10: a one-tenant fixture makes the isolation assertions vacuous
 * and they pass without testing anything.
 *
 * Run: npx tsx scripts/test-order-contacts.ts
 */
import { db } from '@/lib/db'
import { buildOrderContactRows, writeOrderContacts, syncOrderContactPerson } from '@/lib/orderContacts'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ✅  ${label}`)
  } else {
    failed++
    console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const stamp = Date.now()
  const tenantA = await db.tenant.create({
    data: { name: `oc-test-a-${stamp}`, slug: `oc-test-a-${stamp}`, domain: `oc-a-${stamp}.invalid` },
  })
  const tenantB = await db.tenant.create({
    data: { name: `oc-test-b-${stamp}`, slug: `oc-test-b-${stamp}`, domain: `oc-b-${stamp}.invalid` },
  })

  try {
    // ── Fixture ──────────────────────────────────────────────────────────────
    const roleContact = await db.contactRole.create({
      data: {
        tenantId: tenantA.id, key: 'contact_person', labelEn: 'Contact Person',
        labelKa: 'საკონტაქტო პირი', scope: 'PER_ORDER', appliesTo: 'BOTH', sortOrder: 10,
      },
    })
    const roleGuide = await db.contactRole.create({
      data: {
        tenantId: tenantA.id, key: 'guide', labelEn: 'Guide', labelKa: 'გიდი',
        scope: 'PER_ORDER', appliesTo: 'BOOKING', sortOrder: 20,
      },
    })
    const roleCeo = await db.contactRole.create({
      data: {
        tenantId: tenantA.id, key: 'ceo', labelEn: 'CEO', labelKa: 'დირექტორი',
        scope: 'COMPANY_LEVEL', appliesTo: 'BOTH', sortOrder: 30,
      },
    })
    const roleInactive = await db.contactRole.create({
      data: {
        tenantId: tenantA.id, key: 'retired', labelEn: 'Retired', labelKa: 'გაუქმებული',
        scope: 'PER_ORDER', appliesTo: 'BOTH', sortOrder: 40, isActive: false,
      },
    })
    // Tenant B's own role — must never be writable from tenant A.
    const roleOther = await db.contactRole.create({
      data: {
        tenantId: tenantB.id, key: 'contact_person', labelEn: 'Contact Person',
        labelKa: 'საკონტაქტო პირი', scope: 'PER_ORDER', appliesTo: 'BOTH', sortOrder: 10,
      },
    })

    const companyA = await db.company.create({
      data: { name: 'Company A', tenantId: tenantA.id, isBookingCompany: true, isWineOrderCompany: true },
    })
    const companyA2 = await db.company.create({
      data: { name: 'Company A2', tenantId: tenantA.id, isBookingCompany: true },
    })
    const companyB = await db.company.create({
      data: { name: 'Company B', tenantId: tenantB.id, isBookingCompany: true },
    })

    const personA = await db.companyPerson.create({
      data: { companyId: companyA.id, roleId: roleContact.id, name: 'Ana A', phone: '+995 1', email: 'ana@a.example' },
    })
    const guideA = await db.companyPerson.create({
      data: { companyId: companyA.id, roleId: roleGuide.id, name: 'Gia Guide', phone: '+995 2' },
    })
    const personA2 = await db.companyPerson.create({
      data: { companyId: companyA2.id, roleId: roleContact.id, name: 'Other Company Person', phone: '+995 3' },
    })
    const personB = await db.companyPerson.create({
      data: { companyId: companyB.id, roleId: roleOther.id, name: 'Bad Actor', phone: '+995 4' },
    })
    const inactiveA = await db.companyPerson.create({
      data: { companyId: companyA.id, roleId: roleContact.id, name: 'Left The Company', isActive: false },
    })

    const build = (contacts: Parameters<typeof buildOrderContactRows>[1]['contacts'], opts?: { companyId?: string | null; module?: 'BOOKING' | 'WINE_ORDER' }) =>
      buildOrderContactRows(db, {
        tenantId: tenantA.id,
        companyId: opts?.companyId !== undefined ? opts.companyId : companyA.id,
        module: opts?.module ?? 'BOOKING',
        contacts,
      })

    console.log('\n── The happy path ──────────────────────────────────────────')

    const happy = await build([
      { roleId: roleContact.id, personId: personA.id, name: 'Ana A', phone: '+995 1', email: 'ana@a.example' },
      { roleId: roleGuide.id, personId: guideA.id, name: 'Gia Guide', phone: '+995 2', email: null },
    ])
    check('both picked people are written', happy.length === 2, `got ${happy.length}`)
    check('the link is kept for a verified person', happy.every(r => r.personId !== null))
    check('snapshots carry the facts', happy[0]?.nameSnapshot === 'Ana A' && happy[0]?.phoneSnapshot === '+995 1')
    check('tenantId is set on every row — a NULL is invisible to every later read',
      happy.every(r => r.tenantId === tenantA.id))

    console.log('\n── Typed-in details, nobody picked ─────────────────────────')

    const typed = await build([
      { roleId: roleGuide.id, name: 'Not On The List', phone: '+995 9', email: null },
    ])
    check('a typed-in person is still recorded', typed.length === 1)
    check('…with no personId', typed[0]?.personId === null)
    check('…and their facts intact', typed[0]?.nameSnapshot === 'Not On The List' && typed[0]?.phoneSnapshot === '+995 9')

    console.log('\n── Things a crafted request would try ──────────────────────')

    const crossCompany = await build([
      { roleId: roleContact.id, personId: personA2.id, name: 'Other Company Person', phone: '+995 3', email: null },
    ])
    check('a person from another company of the SAME tenant loses the link',
      crossCompany.length === 1 && crossCompany[0]?.personId === null)
    check('…but their typed facts survive — the link goes, never the facts (F2)',
      crossCompany[0]?.nameSnapshot === 'Other Company Person')

    const crossTenant = await build([
      { roleId: roleContact.id, personId: personB.id, name: 'Bad Actor', phone: '+995 4', email: null },
    ])
    check('a person from ANOTHER TENANT loses the link',
      crossTenant.length === 1 && crossTenant[0]?.personId === null)

    const otherTenantRole = await build([
      { roleId: roleOther.id, personId: personB.id, name: 'Bad Actor', phone: null, email: null },
    ])
    check('another tenant\'s role is refused outright', otherTenantRole.length === 0)

    const companyLevel = await build([
      { roleId: roleCeo.id, name: 'The CEO', phone: null, email: null },
    ])
    check('a COMPANY_LEVEL role never reaches an order — what `scope` exists for',
      companyLevel.length === 0)

    const wrongModule = await build(
      [{ roleId: roleGuide.id, personId: guideA.id, name: 'Gia Guide', phone: null, email: null }],
      { module: 'WINE_ORDER' }
    )
    check('a BOOKING-only role is refused on a wine order', wrongModule.length === 0)

    const inactiveRole = await build([
      { roleId: roleInactive.id, name: 'Somebody', phone: null, email: null },
    ])
    check('a deactivated role is refused', inactiveRole.length === 0)

    const inactivePerson = await build([
      { roleId: roleContact.id, personId: inactiveA.id, name: 'Left The Company', phone: null, email: null },
    ])
    check('a deactivated person loses the link but keeps the snapshot',
      inactivePerson.length === 1 && inactivePerson[0]?.personId === null)

    const roleMismatch = await build([
      // guideA is real and in this company, but claimed under the contact_person role.
      { roleId: roleContact.id, personId: guideA.id, name: 'Gia Guide', phone: null, email: null },
    ])
    check('a real person claimed under the WRONG role loses the link',
      roleMismatch.length === 1 && roleMismatch[0]?.personId === null)

    const noCompany = await build(
      [{ roleId: roleContact.id, personId: personA.id, name: 'Ana A', phone: null, email: null }],
      { companyId: null }
    )
    check('with no company on the order, nobody can be linked',
      noCompany.length === 1 && noCompany[0]?.personId === null)

    console.log('\n── Shapes that would break the insert ──────────────────────')

    const dupes = await build([
      { roleId: roleContact.id, personId: personA.id, name: 'Ana A', phone: null, email: null },
      { roleId: roleContact.id, personId: guideA.id, name: 'Second Try', phone: null, email: null },
    ])
    check('two people for one role collapse to one — @@unique would reject the whole write',
      dupes.length === 1 && dupes[0]?.nameSnapshot === 'Ana A')

    const blank = await build([
      { roleId: roleContact.id, name: '   ', phone: '+995 5', email: null },
    ])
    check('a blank name is dropped rather than written nameless', blank.length === 0)

    const empty = await build(undefined)
    check('an absent contacts array is simply no rows', empty.length === 0)

    console.log('\n── It really inserts ───────────────────────────────────────')

    const order = await db.order.create({
      data: {
        tenantId: tenantA.id, companyId: companyA.id, bookingType: 'COMPANY', visitType: 'TASTING',
        date: new Date(), timeSlot: '12:00', guestCount: 4,
        name: 'Ana', surname: 'A', email: 'ana@a.example', phone: '+995 1', totalPrice: 0,
      },
    })
    const rows = await build([
      { roleId: roleContact.id, personId: personA.id, name: 'Ana A', phone: '+995 1', email: 'ana@a.example' },
      { roleId: roleGuide.id, name: 'Typed Guide', phone: '+995 7', email: null },
    ])
    await db.orderContact.createMany({ data: rows.map(r => ({ ...r, orderId: order.id })) })
    const written = await db.orderContact.findMany({
      where: { orderId: order.id }, orderBy: { nameSnapshot: 'asc' },
    })
    check('both rows land in the database', written.length === 2, `got ${written.length}`)
    check('the linked one keeps its personId', written.some(r => r.personId === personA.id))
    check('the typed one has none', written.some(r => r.personId === null && r.nameSnapshot === 'Typed Guide'))
    check('every written row carries tenantId', written.every(r => r.tenantId === tenantA.id))

    // The whole point of snapshots (F2 / KnownBugs #56).
    await db.companyPerson.delete({ where: { id: personA.id } })
    const afterDelete = await db.orderContact.findMany({ where: { orderId: order.id } })
    check('deleting the person leaves both rows standing', afterDelete.length === 2)
    check('…the link is gone', afterDelete.every(r => r.personId !== personA.id))
    check('…and the facts are NOT — this is what Order.guideId got wrong',
      afterDelete.some(r => r.nameSnapshot === 'Ana A' && r.phoneSnapshot === '+995 1'))

    console.log('\n── The shared base: one write path for public and admin ────')

    // An admin screen with no picker on it yet sends no `contacts` at all. Before the shared
    // base existed, createOrderAdmin wrote the denormalised columns and no OrderContact rows,
    // so an admin-created booking had an empty source of truth while a guest-created one had
    // a full one. Two write paths, one forgotten — exactly the drift the base exists to stop.
    const adminOrder = await db.order.create({
      data: {
        tenantId: tenantA.id, companyId: companyA.id, bookingType: 'COMPANY', visitType: 'TASTING',
        date: new Date(), timeSlot: '13:00', guestCount: 2,
        name: 'Admin', surname: 'Typed', email: 'typed@a.example', phone: '+995 8', totalPrice: 0,
      },
    })
    const wrote = await writeOrderContacts(db, {
      tenantId: tenantA.id,
      target: { orderId: adminOrder.id },
      companyId: companyA.id,
      module: 'BOOKING',
      contacts: undefined,
      fallbackContactPerson: { name: 'Admin Typed', phone: '+995 8', email: 'typed@a.example' },
    })
    check('a path that sends no contacts still records one from what was typed', wrote === 1)
    const adminRows = await db.orderContact.findMany({ where: { orderId: adminOrder.id } })
    check('…as a contact_person with NO personId — typed, not attributed',
      adminRows.length === 1 && adminRows[0]?.personId === null)
    check('…carrying the typed facts', adminRows[0]?.nameSnapshot === 'Admin Typed')

    // An explicit contact_person must win over the fallback, or a picked person would be
    // silently overwritten by whatever happened to be in the form's boxes.
    const explicitOrder = await db.order.create({
      data: {
        tenantId: tenantA.id, companyId: companyA.id, bookingType: 'COMPANY', visitType: 'TASTING',
        date: new Date(), timeSlot: '14:00', guestCount: 2,
        name: 'Ignored', surname: 'Fallback', totalPrice: 0,
      },
    })
    await writeOrderContacts(db, {
      tenantId: tenantA.id,
      target: { orderId: explicitOrder.id },
      companyId: companyA.id,
      module: 'BOOKING',
      contacts: [{ roleId: roleContact.id, personId: guideA.id, name: 'Explicit Pick', phone: null, email: null }],
      fallbackContactPerson: { name: 'Ignored Fallback', phone: null, email: null },
    })
    const explicitRows = await db.orderContact.findMany({ where: { orderId: explicitOrder.id } })
    check('an explicit contact_person beats the fallback',
      explicitRows.length === 1 && explicitRows[0]?.nameSnapshot === 'Explicit Pick')

    // No company means nobody to attribute to, so no fallback row either.
    const soloOrder = await db.order.create({
      data: {
        tenantId: tenantA.id, bookingType: 'INDIVIDUAL', visitType: 'TASTING',
        date: new Date(), timeSlot: '15:00', guestCount: 2,
        name: 'Solo', surname: 'Guest', totalPrice: 0,
      },
    })
    const soloWrote = await writeOrderContacts(db, {
      tenantId: tenantA.id,
      target: { orderId: soloOrder.id },
      companyId: null,
      module: 'BOOKING',
      contacts: undefined,
      fallbackContactPerson: { name: 'Solo Guest', phone: null, email: null },
    })
    check('an order with no company gets no fallback row', soloWrote === 0)

    console.log('\n── Editing the columns keeps the snapshot in step ──────────')

    const synced = await syncOrderContactPerson(db, {
      tenantId: tenantA.id, orderId: adminOrder.id,
      name: 'Corrected Spelling', phone: '+995 8 NEW', email: 'corrected@a.example',
    })
    check('syncing an order that HAS a contact row reports true', synced === true)
    const afterSync = await db.orderContact.findFirst({ where: { orderId: adminOrder.id } })
    check('…the snapshot now matches the edited columns',
      afterSync?.nameSnapshot === 'Corrected Spelling' && afterSync?.phoneSnapshot === '+995 8 NEW')

    const noRow = await syncOrderContactPerson(db, {
      tenantId: tenantA.id, orderId: soloOrder.id, name: 'Nobody', phone: null, email: null,
    })
    check('…and an order with NO contact row is left alone, not given one', noRow === false)
    check('…still none afterwards',
      (await db.orderContact.count({ where: { orderId: soloOrder.id } })) === 0)

    console.log('\n──────────────────────────────────────────────────')
    console.log(`Results: ${passed} passed, ${failed} failed`)
  } finally {
    // Leave nothing behind, in either tenant.
    for (const t of [tenantA.id, tenantB.id]) {
      await db.orderContact.deleteMany({ where: { tenantId: t } })
      await db.order.deleteMany({ where: { tenantId: t } })
      await db.companyPerson.deleteMany({ where: { company: { tenantId: t } } })
      await db.company.deleteMany({ where: { tenantId: t } })
      await db.contactRole.deleteMany({ where: { tenantId: t } })
      await db.tenant.delete({ where: { id: t } })
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
