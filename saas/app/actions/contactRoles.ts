'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import type { ContactScope, ContactApplies } from '@prisma/client'

/**
 * CRUD for ContactRole — the tenant-configurable list of contact kinds
 * ("Guide", "Contact Person", later "CEO"). See vault/Plan-ContactRoles.md.
 *
 * The point of this file existing at all is Max's requirement that adding a contact type is an
 * admin action rather than a migration. Everything else in the feature reads roles; only this
 * file writes them.
 */

export type ContactRoleInput = {
  labelEn: string
  labelKa: string
  scope: ContactScope
  appliesTo: ContactApplies
  sortOrder?: number
}

/**
 * Derive a stable machine key from the English label. `key` is what code matches on
 * (`'guide'`, `'contact_person'`), which is exactly why labels stay renameable: renaming a role
 * must never change what it *is*. So the key is generated once, at creation, and never updated.
 */
function keyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export async function listContactRoles() {
  const tenantId = await getTenantId()
  return withTenantDb(tenantId, tx =>
    tx.contactRole.findMany({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }] })
  )
}

export async function createContactRole(data: ContactRoleInput) {
  await requireAdmin()
  if (!data.labelEn.trim()) return { error: 'English label is required.' }
  if (!data.labelKa.trim()) return { error: 'Georgian label is required.' }

  const base = keyFromLabel(data.labelEn)
  if (!base) return { error: 'Label must contain at least one letter or number.' }

  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    // Keys are unique per tenant. Rather than rejecting a second "Guide", suffix it — an admin
    // naming two roles similarly is a labelling choice, not an error worth blocking on.
    let key = base
    for (let n = 2; n < 50; n++) {
      const clash = await tx.contactRole.findFirst({ where: { tenantId, key } })
      if (!clash) break
      key = `${base}_${n}`
    }
    const role = await tx.contactRole.create({
      data: {
        tenantId,
        key,
        labelEn: data.labelEn.trim(),
        labelKa: data.labelKa.trim(),
        scope: data.scope,
        appliesTo: data.appliesTo,
        sortOrder: data.sortOrder ?? 100,
        isSystem: false,
      },
    })
    return { success: true as const, role }
  })
  revalidatePath('/admin/companies')
  revalidatePath('/admin/settings')
  return result
}

/**
 * Labels, ordering and applicability are editable on any role, including a system one — they
 * are display concerns and `key` is untouched, so nothing that matches on the role breaks.
 *
 * `scope` is NOT editable. Flipping a role from PER_ORDER to COMPANY_LEVEL would strand every
 * OrderContact already pointing at it — rows describing a per-order choice for a role that
 * claims never to be chosen per order. Make a new role instead.
 */
export async function updateContactRole(
  id: string,
  data: { labelEn: string; labelKa: string; appliesTo: ContactApplies; sortOrder?: number }
) {
  await requireAdmin()
  if (!data.labelEn.trim()) return { error: 'English label is required.' }
  if (!data.labelKa.trim()) return { error: 'Georgian label is required.' }

  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.contactRole.updateMany({
      where: { id, tenantId },
      data: {
        labelEn: data.labelEn.trim(),
        labelKa: data.labelKa.trim(),
        appliesTo: data.appliesTo,
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    })
  )
  if (result.count === 0) return { error: 'Role not found.' }
  revalidatePath('/admin/companies')
  revalidatePath('/admin/settings')
  return { success: true as const }
}

/**
 * Deactivating is the supported way to retire a role — it disappears from the pickers and from
 * Edit Company while every historical OrderContact stays readable.
 */
export async function setContactRoleActive(id: string, isActive: boolean) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.contactRole.updateMany({ where: { id, tenantId }, data: { isActive } })
  )
  if (result.count === 0) return { error: 'Role not found.' }
  revalidatePath('/admin/companies')
  revalidatePath('/admin/settings')
  return { success: true as const }
}

/**
 * Deleting is deliberately narrow. A system role can never be deleted, and neither can one that
 * still has people or order contacts attached — the database enforces the latter with
 * `onDelete: Restrict`, but failing here with a sentence an admin can act on beats surfacing a
 * foreign-key error.
 */
export async function deleteContactRole(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const role = await tx.contactRole.findFirst({ where: { id, tenantId } })
    if (!role) return { error: 'Role not found.' }
    if (role.isSystem) {
      return { error: 'Built-in roles cannot be deleted. Turn the role off instead.' }
    }
    const [people, contacts] = await Promise.all([
      tx.companyPerson.count({ where: { roleId: id } }),
      tx.orderContact.count({ where: { roleId: id } }),
    ])
    if (people > 0 || contacts > 0) {
      return {
        error:
          `This role is still in use (${people} ${people === 1 ? 'person' : 'people'}, ` +
          `${contacts} on past orders). Turn it off instead of deleting it.`,
      }
    }
    await tx.contactRole.delete({ where: { id } })
    return { success: true as const }
  })
  if (!('error' in result)) {
    revalidatePath('/admin/companies')
    revalidatePath('/admin/settings')
  }
  return result
}
