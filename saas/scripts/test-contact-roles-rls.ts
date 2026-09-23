/**
 * Cross-tenant isolation test for ContactRole, CompanyPerson and OrderContact
 * (vault/Plan-ContactRoles.md, Chunk 2). Replaces `test-guides-reps-rls.ts`, whose tables no
 * longer exist.
 *
 * Why this exists rather than trusting `check-rls.ts`: that script only confirms a policy row
 * is present and RLS is switched on, and `test-rls.ts` skips its whole cross-tenant section on
 * a one-tenant database — which is the dev DB's normal state. See MaintenanceNotes #10.
 *
 * It caught a real defect on the day it was written. `ContactRole` and `OrderContact` had been
 * added to `setup-rls.ts`'s `writableTables` (which switches RLS **on**) but not to
 * `tenantedTables` (which creates the **policy**). RLS enabled with no policy makes Postgres
 * default-deny every row: reads return empty, nothing throws, and an existence check still
 * reports the table as fine — the same silent shape as MaintenanceNotes #27. The three
 * "sees exactly N" assertions below are what surfaced it.
 *
 * Covers all three policy shapes this feature introduced:
 *   ContactRole    — direct tenantId
 *   CompanyPerson  — JOIN to Company (no tenantId of its own, same as Price)
 *   OrderContact   — direct tenantId, on a child of Order/WineOrder
 *
 * Run: npx tsx scripts/test-contact-roles-rls.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import { withTenantDb } from '../lib/db'

const db = new PrismaClient()

const A = 'zz-test-contact-roles-a'
const B = 'zz-test-contact-roles-b'

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
  // Children before parents. OrderContact cascades from Order, but these test rows have no
  // order at all (the polymorphic columns are both null), so they need deleting by tenantId.
  await db.orderContact.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.companyPerson.deleteMany({ where: { company: { tenantId: { in: [A, B] } } } })
  await db.contactRole.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.company.deleteMany({ where: { tenantId: { in: [A, B] } } })
  await db.tenant.deleteMany({ where: { id: { in: [A, B] } } })
}

async function main() {
  console.log('\n── ContactRole / CompanyPerson / OrderContact cross-tenant isolation ──\n')

  await cleanup() // in case a previous run died mid-way

  await db.tenant.createMany({
    data: [
      { id: A, name: 'ZZ Contact A', domain: 'zz-contact-a.invalid', slug: A },
      { id: B, name: 'ZZ Contact B', domain: 'zz-contact-b.invalid', slug: B },
    ],
  })

  // ── Set up one company + one role + one person + one contact row per tenant ──
  const made: Record<string, { companyId: string; roleId: string; personId: string; contactId: string }> = {}

  for (const t of [A, B]) {
    const company = await withTenantDb(t, tx =>
      tx.company.create({ data: { name: `ZZ Co ${t}`, tenantId: t } })
    )
    const role = await withTenantDb(t, tx =>
      tx.contactRole.create({
        data: {
          tenantId: t, key: 'guide', labelEn: 'Guide', labelKa: 'გიდი',
          scope: 'PER_ORDER', appliesTo: 'BOOKING', isSystem: true,
        },
      })
    )
    const person = await withTenantDb(t, tx =>
      tx.companyPerson.create({
        data: { companyId: company.id, roleId: role.id, name: `ZZ Person ${t}`, phone: '+995 000' },
      })
    )
    const contact = await withTenantDb(t, tx =>
      tx.orderContact.create({
        data: { tenantId: t, roleId: role.id, personId: person.id, nameSnapshot: `ZZ Person ${t}` },
      })
    )
    made[t] = { companyId: company.id, roleId: role.id, personId: person.id, contactId: contact.id }
  }
  check('All four row types create cleanly under withTenantDb for both tenants', true)

  // ── Each tenant sees exactly its own rows ──
  // These are the assertions that catch "RLS enabled but no policy": a default-denied table
  // returns 0 here, not an error.
  for (const [t, other] of [[A, B], [B, A]] as const) {
    const roles = await withTenantDb(t, tx => tx.contactRole.findMany())
    const people = await withTenantDb(t, tx => tx.companyPerson.findMany())
    const contacts = await withTenantDb(t, tx => tx.orderContact.findMany())
    check(`${t}: sees exactly 1 ContactRole`, roles.length === 1, `saw ${roles.length}`)
    check(`${t}: sees exactly 1 CompanyPerson`, people.length === 1, `saw ${people.length}`)
    check(`${t}: sees exactly 1 OrderContact`, contacts.length === 1, `saw ${contacts.length}`)
    check(`${t}: none of them belong to ${other}`,
      roles.every(r => r.tenantId === t) &&
      people.every(p => p.id === made[t].personId) &&
      contacts.every(c => c.tenantId === t))
  }

  // ── The real test: the other tenant's rows by direct id must come back null ──
  const roleLeak = await withTenantDb(A, tx => tx.contactRole.findUnique({ where: { id: made[B].roleId } }))
  check("B's ContactRole is invisible to A by direct id", roleLeak === null)

  const personLeak = await withTenantDb(A, tx => tx.companyPerson.findUnique({ where: { id: made[B].personId } }))
  check("B's CompanyPerson is invisible to A by direct id (JOIN-to-Company policy)", personLeak === null)

  const contactLeak = await withTenantDb(A, tx => tx.orderContact.findUnique({ where: { id: made[B].contactId } }))
  check("B's OrderContact is invisible to A by direct id", contactLeak === null)

  // ── Cross-tenant writes must affect nothing ──
  const wroteRole = await withTenantDb(A, tx =>
    tx.contactRole.updateMany({ where: { id: made[B].roleId }, data: { labelEn: 'HIJACKED' } })
  )
  check("A cannot update B's ContactRole", wroteRole.count === 0, `updated ${wroteRole.count}`)

  const wrotePerson = await withTenantDb(A, tx =>
    tx.companyPerson.updateMany({ where: { id: made[B].personId }, data: { name: 'HIJACKED' } })
  )
  check("A cannot update B's CompanyPerson", wrotePerson.count === 0, `updated ${wrotePerson.count}`)

  const wroteContact = await withTenantDb(A, tx =>
    tx.orderContact.updateMany({ where: { id: made[B].contactId }, data: { nameSnapshot: 'HIJACKED' } })
  )
  check("A cannot update B's OrderContact", wroteContact.count === 0, `updated ${wroteContact.count}`)

  const bRoleStill = await db.contactRole.findUnique({ where: { id: made[B].roleId } })
  const bPersonStill = await db.companyPerson.findUnique({ where: { id: made[B].personId } })
  const bContactStill = await db.orderContact.findUnique({ where: { id: made[B].contactId } })
  check("B's rows are all untouched as seen by the superuser client",
    bRoleStill?.labelEn === 'Guide' && bPersonStill?.name === `ZZ Person ${B}` &&
    bContactStill?.nameSnapshot === `ZZ Person ${B}`)

  // ── A cannot attach one of its own people to another tenant's company ──
  // The WITH CHECK half of CompanyPerson's policy, which a USING-only policy would miss.
  let crossInsertRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.companyPerson.create({
        data: { companyId: made[B].companyId, roleId: made[A].roleId, name: 'ZZ Smuggled' },
      })
    )
  } catch {
    crossInsertRejected = true
  }
  check("A cannot create a CompanyPerson on B's company (WITH CHECK)", crossInsertRejected)

  // ── The code pool's new DB-level guarantee (Chunk 1, step 10) ──
  let dupCodeRejected = false
  try {
    await withTenantDb(A, tx =>
      tx.companyPerson.create({
        data: { companyId: made[A].companyId, roleId: made[A].roleId, name: 'ZZ Dup 1', code: 'ZZDUPE01' },
      })
    )
    await withTenantDb(A, tx =>
      tx.companyPerson.create({
        data: { companyId: made[A].companyId, roleId: made[A].roleId, name: 'ZZ Dup 2', code: 'ZZDUPE01' },
      })
    )
  } catch {
    dupCodeRejected = true
  }
  check('A duplicate CompanyPerson.code is rejected by the database, not just by app code',
    dupCodeRejected)

  // ── Deleting a role must not silently delete its people (onDelete: Restrict) ──
  let roleDeleteBlocked = false
  try {
    await withTenantDb(A, tx => tx.contactRole.delete({ where: { id: made[A].roleId } }))
  } catch {
    roleDeleteBlocked = true
  }
  check('Deleting a ContactRole that still has people is refused (Restrict, not Cascade)',
    roleDeleteBlocked)

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
