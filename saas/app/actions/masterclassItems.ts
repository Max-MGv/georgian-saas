'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { MasterclassUnit } from '@/lib/masterclass'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

// Returns the created row — additive, mirrors createWine()'s precedent. Existing
// callers ignore the return value already, so this changes nothing for them; the
// onboarding wizard's BookingDetailsStep needs the id to build its added-list.
export async function createMasterclassItem(data: {
  name: string
  unitType: MasterclassUnit
  pricePerUnit: number
  sortOrder?: number
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const created = await withTenantDb(tenantId, tx =>
    tx.masterclassItem.create({
      data: {
        name: data.name.trim(),
        unitType: data.unitType,
        pricePerUnit: data.pricePerUnit,
        sortOrder: data.sortOrder ?? 0,
        tenantId,
      },
    })
  )
  revalidatePath('/admin/masterclass')
  return created
}

export async function updateMasterclassItem(id: string, data: {
  name?: string
  unitType?: MasterclassUnit
  pricePerUnit?: number
  active?: boolean
  sortOrder?: number
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.masterclassItem.updateMany({
      where: { id, tenantId },
      data: {
        ...(data.name !== undefined         ? { name: data.name.trim() }          : {}),
        ...(data.unitType !== undefined     ? { unitType: data.unitType }          : {}),
        ...(data.pricePerUnit !== undefined ? { pricePerUnit: data.pricePerUnit }  : {}),
        ...(data.active !== undefined       ? { active: data.active }              : {}),
        ...(data.sortOrder !== undefined    ? { sortOrder: data.sortOrder }        : {}),
      },
    })
  )
  revalidatePath('/admin/masterclass')
}

export async function deleteMasterclassItem(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.masterclassItem.deleteMany({ where: { id, tenantId } })
  )
  revalidatePath('/admin/masterclass')
}
