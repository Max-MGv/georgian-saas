'use server'

import { withTenantDb } from '@/lib/db'
import type { Tetri } from '@/lib/money'
import { revalidatePath } from 'next/cache'
import type { MasterclassUnit } from '@/lib/masterclass'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { cleanAddOnName, cleanOptionalAddOnName } from '@/lib/addOns'

// These are the winery's add-on ITEMS (still called MasterclassItem in the code — Plan-AddOnsAndWine). Every item lives
// in a group (AddOnGroup); one created without saying which goes into the winery's first group, which is created on
// the spot ("Masterclass") when the winery has none — so the onboarding wizard and old callers keep working.

const refresh = () => {
  revalidatePath('/admin/add-ons')
  revalidatePath('/admin/orders')
}

type Tx = Parameters<Parameters<typeof withTenantDb>[1]>[0]

async function defaultGroupId(tx: Tx, tenantId: string): Promise<string> {
  const first = await tx.addOnGroup.findFirst({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
  if (first) return first.id
  const created = await tx.addOnGroup.create({ data: { tenantId, nameEn: 'Masterclass', nameKa: 'მასტერკლასი' } })
  return created.id
}

// Returns the created row — additive, mirrors createWine()'s precedent. Existing
// callers ignore the return value already, so this changes nothing for them; the
// onboarding wizard's BookingDetailsStep needs the id to build its added-list.
export async function createMasterclassItem(data: {
  name: string
  nameKa?: string | null
  unitType: MasterclassUnit
  /** TETRI — the form converts what the admin typed (chunk 3). */
  pricePerUnit: Tetri
  sortOrder?: number
  /** Which group; omitted → the winery's first group. */
  groupId?: string
}) {
  await requireAdmin()
  const name = cleanAddOnName(data.name)
  const nameKa = cleanOptionalAddOnName(data.nameKa)
  if (!name || nameKa === undefined) throw new Error('Enter a name (1–80 characters).')
  if (!Number.isInteger(data.pricePerUnit) || data.pricePerUnit < 0) throw new Error('The price must be a whole number of tetri, 0 or more.')
  const tenantId = await getTenantId()
  const created = await withTenantDb(tenantId, async tx => {
    let groupId = data.groupId
    if (groupId) {
      const own = await tx.addOnGroup.findFirst({ where: { id: groupId, tenantId }, select: { id: true } })
      if (!own) throw new Error('That group no longer exists.')
    } else {
      groupId = await defaultGroupId(tx, tenantId)
    }
    return tx.masterclassItem.create({
      data: {
        name,
        nameKa,
        unitType: data.unitType,
        pricePerUnit: data.pricePerUnit,
        sortOrder: data.sortOrder ?? 0,
        tenantId,
        groupId,
      },
    })
  })
  refresh()
  return created
}

export async function updateMasterclassItem(id: string, data: {
  name?: string
  nameKa?: string | null
  unitType?: MasterclassUnit
  /** TETRI — the form converts what the admin typed (chunk 3). */
  pricePerUnit?: Tetri
  active?: boolean
  sortOrder?: number
  groupId?: string
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) {
    const n = cleanAddOnName(data.name)
    if (!n) return { error: 'Enter a name (1–80 characters).' } as const
    patch.name = n
  }
  if (data.nameKa !== undefined) {
    const n = cleanOptionalAddOnName(data.nameKa)
    if (n === undefined) return { error: 'The Georgian name is too long (80 characters at most).' } as const
    patch.nameKa = n
  }
  if (data.unitType !== undefined) patch.unitType = data.unitType
  if (data.pricePerUnit !== undefined) {
    if (!Number.isInteger(data.pricePerUnit) || data.pricePerUnit < 0) return { error: 'The price must be a whole number of tetri, 0 or more.' } as const
    patch.pricePerUnit = data.pricePerUnit
  }
  if (data.active !== undefined) patch.active = data.active
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  const result = await withTenantDb(tenantId, async tx => {
    if (data.groupId !== undefined) {
      const own = await tx.addOnGroup.findFirst({ where: { id: data.groupId, tenantId }, select: { id: true } })
      if (!own) return { error: 'That group no longer exists.' } as const
      patch.groupId = data.groupId
    }
    const r = await tx.masterclassItem.updateMany({ where: { id, tenantId }, data: patch })
    return r.count === 0 ? ({ error: 'This item no longer exists.' } as const) : ({ success: true } as const)
  })
  if ('success' in result) refresh()
  return result
}

/**
 * Deleting an item that was ever booked is allowed (KnownBugs #94): its order lines keep the name, unit and price they
 * were sold with (snapshots), and only lose the link.
 */
export async function deleteMasterclassItem(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.masterclassItem.deleteMany({ where: { id, tenantId } })
  )
  refresh()
}
