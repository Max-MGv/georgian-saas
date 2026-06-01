'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'

export async function addMasterclassLine(
  orderId: string,
  data: { masterclassItemId: string; quantity: number }
): Promise<{ success: true; lineId: string } | { error: string }> {
  await requireAdmin()
  const item = await db.masterclassItem.findUnique({
    where: { id: data.masterclassItemId },
  })
  if (!item) return { error: 'Masterclass item not found' }

  const created = await db.orderMasterclass.create({
    data: {
      orderId,
      masterclassItemId: data.masterclassItemId,
      quantity: data.quantity,
      pricePerUnit: item.pricePerUnit, // price snapshot
    },
  })

  await recalcOrderTotal(orderId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true, lineId: created.id }
}

export async function removeMasterclassLine(
  lineId: string,
  orderId: string
): Promise<{ success: true }> {
  await requireAdmin()
  await db.orderMasterclass.delete({ where: { id: lineId } })
  await recalcOrderTotal(orderId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
