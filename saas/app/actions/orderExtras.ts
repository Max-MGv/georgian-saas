'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'

export async function addOrderExtra(
  orderId: string,
  data: { label: string; amount: number }
): Promise<{ success: true; extraId: string } | { error: string }> {
  if (!data.label.trim()) return { error: 'Label is required' }
  if (data.amount <= 0) return { error: 'Amount must be greater than 0' }

  const created = await db.orderExtra.create({
    data: {
      orderId,
      label: data.label.trim(),
      amount: data.amount,
    },
  })

  await recalcOrderTotal(orderId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true, extraId: created.id }
}

export async function removeOrderExtra(
  extraId: string,
  orderId: string
): Promise<{ success: true }> {
  await db.orderExtra.delete({ where: { id: extraId } })
  await recalcOrderTotal(orderId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
