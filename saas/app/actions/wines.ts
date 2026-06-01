'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'

export async function createWine(data: {
  name: string; type: string; description?: string; price: number; color: string
}) {
  await requireAdmin()
  const maxOrder = await db.wine.aggregate({ _max: { sortOrder: true } })
  await db.wine.create({
    data: {
      ...data,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath('/admin/wines')
  revalidatePath('/wines')
}

export async function updateWine(id: string, data: {
  name?: string; type?: string; description?: string; price?: number; color?: string; imagePath?: string | null; active?: boolean; sortOrder?: number
}) {
  await requireAdmin()
  await db.wine.update({ where: { id }, data })
  revalidatePath('/admin/wines')
  revalidatePath('/wines')
}

export async function deleteWine(id: string) {
  await requireAdmin()
  await db.wine.delete({ where: { id } })
  revalidatePath('/admin/wines')
  revalidatePath('/wines')
}
