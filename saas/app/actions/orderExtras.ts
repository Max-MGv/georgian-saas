'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function addOrderExtra(
  orderId: string,
  data: { label: string; amount: number }
): Promise<{ success: true; extraId: string } | { error: string }> {
  await requireAdmin()
  if (!data.label.trim()) return { error: 'Label is required' }
  if (data.amount <= 0) return { error: 'Amount must be greater than 0' }

  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return { error: 'Order not found.' } as const
    const created = await tx.orderExtra.create({
      data: { orderId, label: data.label.trim(), amount: data.amount },
    })
    return { success: true as const, extraId: created.id }
  })
  if ('error' in result) return result

  await recalcOrderTotal(orderId, tenantId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return result
}

export async function removeOrderExtra(
  extraId: string,
  orderId: string
): Promise<{ success: true }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  const found = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return false
    await tx.orderExtra.delete({ where: { id: extraId } })
    return true
  })
  if (found) await recalcOrderTotal(orderId, tenantId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
