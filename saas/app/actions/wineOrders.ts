'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateWineOrderStatus(id: string, status: string) {
  await db.wineOrder.update({ where: { id }, data: { status } })
  revalidatePath('/admin/wine-orders')
}
