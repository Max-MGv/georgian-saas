'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { cleanAddOnName, cleanOptionalAddOnName, normalizeVisitTypes } from '@/lib/addOns'

// Groups of add-ons (T-7, vault/Plan-AddOnsAndWine.md). Every action checks its input on the server — the admin form
// only mirrors these rules — and works inside the winery's own tenant scope (RLS), so a group id from another winery
// simply is not found.

const refresh = () => {
  revalidatePath('/admin/add-ons')
  revalidatePath('/admin/orders')
}

export async function createAddOnGroup(data: { nameEn: string; nameKa?: string | null }) {
  await requireAdmin()
  const nameEn = cleanAddOnName(data.nameEn)
  const nameKa = cleanOptionalAddOnName(data.nameKa)
  if (!nameEn || nameKa === undefined) return { error: 'Enter a name (1–80 characters).' } as const
  const tenantId = await getTenantId()
  const created = await withTenantDb(tenantId, async tx => {
    const last = await tx.addOnGroup.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
    return tx.addOnGroup.create({ data: { tenantId, nameEn, nameKa, sortOrder: (last?.sortOrder ?? -1) + 1 } })
  })
  refresh()
  return { success: true, group: created } as const
}

export async function updateAddOnGroup(id: string, data: {
  nameEn?: string
  nameKa?: string | null
  showToCompanies?: boolean
  showToIndividuals?: boolean
  /** The visit types ticked in the admin screen; all three ticked is stored as "every visit type". */
  visitTypes?: string[]
  active?: boolean
  sortOrder?: number
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const patch: Record<string, unknown> = {}
  if (data.nameEn !== undefined) {
    const n = cleanAddOnName(data.nameEn)
    if (!n) return { error: 'Enter a name (1–80 characters).' } as const
    patch.nameEn = n
  }
  if (data.nameKa !== undefined) {
    const n = cleanOptionalAddOnName(data.nameKa)
    if (n === undefined) return { error: 'The Georgian name is too long (80 characters at most).' } as const
    patch.nameKa = n
  }
  if (data.showToCompanies !== undefined) patch.showToCompanies = !!data.showToCompanies
  if (data.showToIndividuals !== undefined) patch.showToIndividuals = !!data.showToIndividuals
  if (data.visitTypes !== undefined) {
    const v = normalizeVisitTypes(data.visitTypes)
    if (!v) return { error: 'Pick at least one visit type.' } as const
    patch.visitTypes = v
  }
  if (data.active !== undefined) patch.active = !!data.active
  if (data.sortOrder !== undefined) {
    if (!Number.isInteger(data.sortOrder) || data.sortOrder < 0 || data.sortOrder > 9999) return { error: 'The order must be a whole number from 0 to 9999.' } as const
    patch.sortOrder = data.sortOrder
  }
  const result = await withTenantDb(tenantId, tx => tx.addOnGroup.updateMany({ where: { id, tenantId }, data: patch }))
  if (result.count === 0) return { error: 'This group no longer exists.' } as const
  refresh()
  return { success: true } as const
}

/**
 * A group with items cannot be deleted (the database refuses too — ON DELETE RESTRICT): move or delete its items
 * first. Orders that used the group keep its name — every line carries a snapshot (E5).
 */
export async function deleteAddOnGroup(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const group = await tx.addOnGroup.findFirst({ where: { id, tenantId }, select: { id: true, kind: true } })
    if (!group) return { error: 'This group no longer exists.' } as const
    // "Wine for the table" is created by switching a wine on; deleting it would leave bookable wines with no row to appear in.
    if (group.kind === 'WINE') return { error: 'The wine group cannot be deleted — switch it off instead.' } as const
    const items = await tx.masterclassItem.count({ where: { groupId: id, tenantId } })
    if (items > 0) return { error: 'This group still has items. Move or delete them first.' } as const
    await tx.addOnGroup.deleteMany({ where: { id, tenantId } })
    return { success: true } as const
  })
  if ('success' in result) refresh()
  return result
}
