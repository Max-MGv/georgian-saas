'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { MasterclassUnit } from '@/lib/masterclass'
import { requireAdmin } from '@/lib/requireAdmin'

export async function createMasterclassItem(data: {
  name: string
  unitType: MasterclassUnit
  pricePerUnit: number
  sortOrder?: number
}) {
  await requireAdmin()
  await db.masterclassItem.create({
    data: {
      name: data.name.trim(),
      unitType: data.unitType,
      pricePerUnit: data.pricePerUnit,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  revalidatePath('/admin/masterclass')
}

export async function updateMasterclassItem(id: string, data: {
  name?: string
  unitType?: MasterclassUnit
  pricePerUnit?: number
  active?: boolean
  sortOrder?: number
}) {
  await requireAdmin()
  await db.masterclassItem.update({
    where: { id },
    data: {
      ...(data.name !== undefined        ? { name: data.name.trim() }       : {}),
      ...(data.unitType !== undefined    ? { unitType: data.unitType }       : {}),
      ...(data.pricePerUnit !== undefined ? { pricePerUnit: data.pricePerUnit } : {}),
      ...(data.active !== undefined      ? { active: data.active }           : {}),
      ...(data.sortOrder !== undefined   ? { sortOrder: data.sortOrder }     : {}),
    },
  })
  revalidatePath('/admin/masterclass')
}

export async function deleteMasterclassItem(id: string) {
  await requireAdmin()
  await db.masterclassItem.delete({ where: { id } })
  revalidatePath('/admin/masterclass')
}
