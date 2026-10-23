'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { checkMasterclassLines } from '@/lib/bookingInput'

export async function addMasterclassLine(
  orderId: string,
  data: { masterclassItemId: string; quantity: number }
): Promise<{ success: true; lineId: string } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const [order, item] = await Promise.all([
      tx.order.findFirst({ where: { id: orderId, tenantId } }),
      tx.masterclassItem.findFirst({ where: { id: data.masterclassItemId, tenantId } }),
    ])
    if (!order) return { error: 'Order not found.' } as const
    if (!item) return { error: 'Masterclass item not found' } as const
    // The public form's rule (#93): active item, whole quantity 1…999, FLAT = 1, price from the catalogue.
    // Without it a negative or fractional quantity here lowered the order's total.
    const checked = checkMasterclassLines([{ masterclassItemId: item.id, quantity: data.quantity }], [item])
    if (!checked.ok) {
      return { error: checked.error.code === 'inactive_item' ? 'This masterclass item is switched off.' : 'Quantity must be a whole number from 1 to 999.' } as const
    }
    const line = checked.lines[0]!
    const created = await tx.orderMasterclass.create({
      data: {
        orderId,
        masterclassItemId: line.masterclassItemId,
        quantity: line.quantity,
        pricePerUnit: line.pricePerUnit,
      },
    })
    return { success: true as const, lineId: created.id, amount: line.quantity * line.pricePerUnit }
  })
  if ('error' in result) return result

  // The delta matters only to an order with no frozen rates and no price table (lib/pricing.ts).
  await recalcOrderTotal(orderId, tenantId, result.amount)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return result
}

export async function removeMasterclassLine(
  lineId: string,
  orderId: string
): Promise<{ success: true }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const found = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return null
    // Scoped to this order: a line id from another order must not be deleted, nor this order re-priced for it
    // (blind review, Chunk 11 — the delete used to go by id alone).
    const line = await tx.orderMasterclass.findFirst({ where: { id: lineId, orderId } })
    if (!line) return null
    await tx.orderMasterclass.delete({ where: { id: lineId } })
    return line.quantity * line.pricePerUnit
  })
  if (found != null) await recalcOrderTotal(orderId, tenantId, -found)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
