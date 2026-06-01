'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'

export async function updateWineOrderStatus(id: string, status: string) {
  await requireAdmin()
  await db.wineOrder.update({ where: { id }, data: { status } })
  revalidatePath('/admin/wine-orders')
}
