'use server'

import { db, withTenantDb } from '@/lib/db'
import { recordOrderEvent } from '@/lib/orderEvents'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import type { Tetri } from '@/lib/money'

/**
 * `amount` is TETRI, not lari.
 *
 * It was typed `number` until 2026-09-18, and the admin screen passed it a raw
 * `parseFloat()` of a field labelled "Amount (₾)" — so typing 20 stored ₾0.20
 * (bug #45). The brand is the fix: a caller now has to say `fromMajor()` out
 * loud, and a major-unit value no longer compiles.
 */
export async function addOrderExtra(
  orderId: string,
  data: { label: string; amount: Tetri }
): Promise<{ success: true; extraId: string } | { error: string }> {
  const actor = await requireAdmin()
  if (!data.label.trim()) return { error: 'Label is required' }
  if (!Number.isInteger(data.amount) || data.amount <= 0) return { error: 'Amount must be greater than 0' }

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

  // The delta matters only to an order with no frozen rates and no price table (lib/pricing.ts).
  await recalcOrderTotal(orderId, tenantId, data.amount)
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
    if (!order) return null
    // Read before deleting: the row is gone afterwards, and "a 40 GEL charge
    // called X was removed" is the useful record, not "something was removed".
    // Scoped to this order: an extra id from another order must not be deleted, nor this order re-priced for it
    // (blind review, Chunk 11 — the delete used to go by id alone).
    const extra = await tx.orderExtra.findFirst({ where: { id: extraId, orderId } })
    if (!extra) return null
    await tx.orderExtra.delete({ where: { id: extraId } })
    await recordOrderEvent(tx, {
      tenantId, orderId,
      type: 'EXTRA_REMOVED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { label: extra.label, amount: extra.amount },
    })
    return extra.amount
  })
  if (found != null) await recalcOrderTotal(orderId, tenantId, -found)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
