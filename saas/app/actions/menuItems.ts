'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createMenuItem(data: {
  name: string
  type: 'VEGETABLE' | 'MEAT'
  sortOrder?: number
}) {
  await db.menuItem.create({
    data: {
      name: data.name.trim(),
      type: data.type,
      sortOrder: data.sortOrder ?? 0,
    },
  })
  revalidatePath('/admin/menu-items')
}

export async function updateMenuItem(id: string, data: {
  name?: string
  type?: 'VEGETABLE' | 'MEAT'
  active?: boolean
  sortOrder?: number
}) {
  await db.menuItem.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  })
  revalidatePath('/admin/menu-items')
}

export async function deleteMenuItem(id: string) {
  await db.menuItem.delete({ where: { id } })
  revalidatePath('/admin/menu-items')
}
