'use server'

import { db, withTenantDb } from '@/lib/db'
import { recordOrderEvent } from '@/lib/orderEvents'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function addOrderExtra(
  orderId: string,
  data: { label: string; amount: number }
): Promise<{ success: true; extraId: string } | { error: string }> {
  const actor = await requireAdmin()
  if (!data.label.trim()) return { error: 'Label is required' }
  if (data.amount <= 0) return { error: 'Amount must be greater than 0' }

  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return { error: 'Order not found.' } as const
    const created = await tx.orderExtra.create({
      data: { orderId, label: data.label.trim(), amount: data.amount },
    })
    // An extra is the line most often added days after the booking, and it
    // moves the total — so who added it, and when, is worth keeping.
    await recordOrderEvent(tx, {
      tenantId, orderId,
      type: 'EXTRA_ADDED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { label: data.label.trim(), amount: data.amount },
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
  const actor = await requireAdmin()
  const tenantId = await getTenantId()
  const found = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return false
    // Read before deleting: the row is gone afterwards, and "a 40 GEL charge
    // called X was removed" is the useful record, not "something was removed".
    const extra = await tx.orderExtra.findUnique({ where: { id: extraId } })
    await tx.orderExtra.delete({ where: { id: extraId } })
    await recordOrderEvent(tx, {
      tenantId, orderId,
      type: 'EXTRA_REMOVED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { label: extra?.label ?? null, amount: extra?.amount ?? null },
    })
    return true
  })
  if (found) await recalcOrderTotal(orderId, tenantId)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
