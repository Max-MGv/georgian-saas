'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { checkMasterclassLines, MASTERCLASS_CATALOGUE_SELECT } from '@/lib/bookingInput'
import { lineAmount, lineIdentity } from '@/lib/orderLines'

export async function addMasterclassLine(
  orderId: string,
  data: { masterclassItemId: string; quantity: number }
): Promise<{ success: true; lineId: string } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const [order, item] = await Promise.all([
      tx.order.findFirst({ where: { id: orderId, tenantId } }),
      tx.masterclassItem.findFirst({ where: { id: data.masterclassItemId, tenantId }, select: MASTERCLASS_CATALOGUE_SELECT }),
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
    const created = await tx.orderMasterclass.create({ data: { orderId, ...line } })
    return { success: true as const, lineId: created.id, amount: lineAmount(line) }
  })
  if ('error' in result) return result

  // The delta matters only to an order with no frozen rates and no price table (lib/pricing.ts).
  await recalcOrderTotal(orderId, tenantId, result.amount)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return result
}

/**
 * Change an existing line's quantity in place (T-215 part 2) — instead of remove + re-add. The line keeps the price it
 * was sold at (`pricePerUnit`); the quantity follows the same rule as adding one (whole 1…999, FLAT stays 1). Only the
 * difference reaches the total, exactly like add / remove.
 */
export async function updateMasterclassLine(
  lineId: string,
  orderId: string,
  quantity: number
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return { error: 'Order not found.' } as const
    const line = await tx.orderMasterclass.findFirst({ where: { id: lineId, orderId }, include: { masterclassItem: true } })
    if (!line) return { error: 'This line is no longer on the order.' } as const
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: 'Quantity must be a whole number from 1 to 999.' } as const
    const newQty = lineIdentity(line).unit === 'FLAT' ? 1 : quantity
    if (newQty === line.quantity) return { success: true as const, delta: 0 }
    await tx.orderMasterclass.update({ where: { id: lineId }, data: { quantity: newQty } })
    return { success: true as const, delta: lineAmount({ quantity: newQty, pricePerUnit: line.pricePerUnit }) - lineAmount(line) }
  })
  if ('error' in result) return result
  if (result.delta !== 0) await recalcOrderTotal(orderId, tenantId, result.delta)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
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
    return lineAmount(line)
  })
  if (found != null) await recalcOrderTotal(orderId, tenantId, -found)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
