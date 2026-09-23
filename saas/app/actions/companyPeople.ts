'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { generateUniqueTenantCode, codeExistsInTenant } from './companies'

/**
 * CRUD for CompanyPerson — one person, at one company, in one role.
 * Replaces `companyGuides.ts` (vault/Plan-ContactRoles.md, Chunk 3).
 *
 * **This file is the argument for the whole rework in miniature.** Its predecessor had ten
 * functions: `createGuide`/`updateGuide`/`deleteGuide`/`regenerateGuideCode`/`setGuideCode` and
 * then the same five again for representatives, differing only in which table they touched and
 * whether the shape had an `email`. Adding a third contact type meant a third copy. Here there
 * are five, and adding a type means inserting a `ContactRole` row.
 *
 * Every write re-verifies the person's company belongs to the caller's tenant before touching
 * the row, even though RLS already scopes it — the same defence-in-depth `prices.ts` uses.
 */

type PersonInput = { name: string; phone?: string; email?: string }

/** Shared guard: resolve a person and prove it belongs to this tenant, or explain why not. */
async function findOwnedPerson(
  tx: Parameters<Parameters<typeof withTenantDb>[1]>[0],
  id: string,
  companyId: string,
  tenantId: string
) {
  const person = await tx.companyPerson.findFirst({
    where: { id, companyId },
    select: { id: true, code: true, company: { select: { tenantId: true } } },
  })
  if (!person || person.company.tenantId !== tenantId) return null
  return person
}

export async function createPerson(companyId: string, roleId: string, data: PersonInput) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async tx => {
    const [company, role] = await Promise.all([
      tx.company.findFirst({ where: { id: companyId, tenantId } }),
      tx.contactRole.findFirst({ where: { id: roleId, tenantId } }),
    ])
    if (!company) return { error: 'Company not found.' }
    // Checked rather than assumed: a roleId from another tenant would otherwise create a person
    // in a role their own winery cannot see.
    if (!role) return { error: 'Contact type not found.' }

    // A code is only minted when the tenant actually uses person codes. Generating one while
    // the feature is off would put a live-looking credential in the admin panel that nothing
    // accepts — the KnownBugs #55 trap in reverse.
    const codesOn = await personCodesEnabled(tx, tenantId)
    const code = codesOn ? await generateUniqueTenantCode(tx, tenantId) : null

    const person = await tx.companyPerson.create({
      data: {
        companyId,
        roleId,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        code,
      },
    })
    return { success: true as const, person }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function updatePerson(id: string, companyId: string, data: PersonInput) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async tx => {
    const person = await findOwnedPerson(tx, id, companyId, tenantId)
    if (!person) return { error: 'Not found.' }
    await tx.companyPerson.update({
      where: { id },
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
      },
    })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

/**
 * Deleting a person is safe for history, which is the entire point of this rework.
 * `OrderContact.personId` is `onDelete: SetNull`, and every OrderContact row carries its own
 * name/phone/email snapshot — so a past order keeps showing who was on it even after the person
 * is gone. Under the old `Order.guideId` this same action silently erased the attribution on
 * every past order ([[KnownBugs]] #56).
 */
export async function deletePerson(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const person = await findOwnedPerson(tx, id, companyId, tenantId)
    if (!person) return { error: 'Not found.' }
    await tx.companyPerson.delete({ where: { id } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function regeneratePersonCode(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const person = await findOwnedPerson(tx, id, companyId, tenantId)
    if (!person) return { error: 'Not found.' }
    const code = await generateUniqueTenantCode(tx, tenantId)
    await tx.companyPerson.update({ where: { id }, data: { code } })
    return { success: true as const, code }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

/**
 * A duplicate code that only the DATABASE can see.
 *
 * `codeExistsInTenant()` checks per tenant and runs as `app_user`, so RLS makes other tenants'
 * codes structurally invisible to it. The unique indexes added in Chunk 1 are **global**. So a
 * code already held by a different tenant passes every app-level check and then fails at the
 * constraint — as an unhandled P2002 stack trace rather than a sentence an admin can act on.
 *
 * Vanishingly unlikely for generated codes (8 chars from a 32-char alphabet). Entirely likely
 * for typed ones, and for seeded ones: `lib/demoSeed.ts` hard-codes `KAKHETI07`, `SILKROAD55`
 * and friends and applies them to every non-demo tenant, so a second real tenant collides by
 * construction. Found by the 2026-09-22 audit.
 *
 * Narrowed to P2002 deliberately: any other failure is still a bug and should still surface.
 */
function isDuplicateCodeError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

export async function setPersonCode(id: string, companyId: string, code: string) {
  await requireAdmin()
  if (!code.trim()) return { error: 'Code cannot be empty.' }
  const tenantId = await getTenantId()
  const normalized = code.trim().toUpperCase()

  const result = await withTenantDb(tenantId, async tx => {
    const person = await findOwnedPerson(tx, id, companyId, tenantId)
    if (!person) return { error: 'Not found.' }
    if (person.code !== normalized && (await codeExistsInTenant(tx, tenantId, normalized))) {
      return { error: 'That code is already in use.' }
    }
    try {
      await tx.companyPerson.update({ where: { id }, data: { code: normalized } })
    } catch (e) {
      if (isDuplicateCodeError(e)) return { error: 'That code is already in use.' }
      throw e
    }
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

/**
 * Read `person_codes_enabled` inside an existing transaction.
 *
 * Not `getSetting()`, which opens its own `withTenantDb` — calling that from inside one would
 * nest transactions. Kept local rather than exported because a `'use server'` file may only
 * export async functions ([[MaintenanceNotes]] #24) and this one takes a `tx`.
 */
async function personCodesEnabled(
  tx: Parameters<Parameters<typeof withTenantDb>[1]>[0],
  tenantId: string
): Promise<boolean> {
  const row = await tx.setting.findUnique({
    where: { key_tenantId: { key: 'person_codes_enabled', tenantId } },
  })
  return (row?.value ?? 'false') === 'true'
}
