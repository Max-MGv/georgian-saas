'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createMasterclassItem(data: {
  name: string
  unit: string
  pricePerUnit: number
  sortOrder?: number
}) {
  await db.masterclassItem.create({
    data: {
      name: data.name.trim(),
      unit: data.unit.trim(),
      pricePerUnit: data.pricePerUnit,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  revalidatePath('/admin/masterclass')
}

export async function updateMasterclassItem(id: string, data: {
  name?: string
  unit?: string
  pricePerUnit?: number
  active?: boolean
  sortOrder?: number
}) {
  await db.masterclassItem.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.unit !== undefined ? { unit: data.unit.trim() } : {}),
      ...(data.pricePerUnit !== undefined ? { pricePerUnit: data.pricePerUnit } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  })
  revalidatePath('/admin/masterclass')
}

export async function deleteMasterclassItem(id: string) {
  await db.masterclassItem.delete({ where: { id } })
  revalidatePath('/admin/masterclass')
}
