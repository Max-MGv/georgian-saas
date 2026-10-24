'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { recordOrderEvent } from '@/lib/orderEvents'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { checkMasterclassLines, MASTERCLASS_CATALOGUE_SELECT } from '@/lib/bookingInput'
import { lineAmount, lineIdentity } from '@/lib/orderLines'
import { countsOf, payingGuests } from '@/lib/pricingUtils'

// The order page's Add-ons card (T-7; the lines are still `OrderMasterclass` rows). Every change leaves a line in the
// booking's history and moves the total by exactly what the line is worth (lib/pricing.ts).
//
// A PER_PERSON line is not typed: its quantity IS the order's paying guests and follows them when the guests change
// (lib/addOnLines.ts). A FLAT line is always 1. Only a PER_PIECE line has a quantity an admin chooses.

export async function addMasterclassLine(
  orderId: string,
  data: { masterclassItemId: string; quantity: number }
): Promise<{ success: true; lineId: string } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const [order, item] = await Promise.all([
      tx.order.findFirst({ where: { id: orderId, tenantId } }),
      tx.masterclassItem.findFirst({ where: { id: data.masterclassItemId, tenantId }, select: MASTERCLASS_CATALOGUE_SELECT }),
    ])
    if (!order) return { error: 'Order not found.' } as const
    if (!item) return { error: 'Add-on not found.' } as const
    const paying = payingGuests(countsOf(order))
    if (item.unitType === 'PER_PERSON' && paying < 1) {
      return { error: 'This order has no paying guests yet, so a per-person add-on cannot be added.' } as const
    }
    // The public form's rule (#93): active item, whole quantity 1…999, FLAT = 1, per person = the paying guests, price
    // from the catalogue. Without it a negative or fractional quantity here lowered the order's total.
    // Admins may add an item of any group, whatever the group shows to guests (E6) — no visibility check.
    const checked = checkMasterclassLines([{ masterclassItemId: item.id, quantity: data.quantity }], [item], { payingGuests: paying })
    if (!checked.ok) {
      return { error: checked.error.code === 'inactive_item' ? 'This add-on is switched off.' : 'Quantity must be a whole number from 1 to 999.' } as const
    }
    const line = checked.lines[0]!
    const created = await tx.orderMasterclass.create({ data: { orderId, ...line } })
    await recordOrderEvent(tx, {
      tenantId, orderId, type: 'ADDON_ADDED', actorType: 'ADMIN', actorId: actor?.id ?? null,
      payload: { name: line.nameSnapshot, group: line.groupNameSnapshot, quantity: line.quantity, amount: lineAmount(line) },
    })
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
 * was sold at (`pricePerUnit`). Only a per-piece line can change: per person follows the guests, flat stays 1. Only the
 * difference reaches the total, exactly like add / remove.
 */
export async function updateMasterclassLine(
  lineId: string,
  orderId: string,
  quantity: number
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return { error: 'Order not found.' } as const
    const line = await tx.orderMasterclass.findFirst({ where: { id: lineId, orderId }, include: { masterclassItem: true } })
    if (!line) return { error: 'This line is no longer on the order.' } as const
    const who = lineIdentity(line)
    if (who.unit === 'PER_PERSON') return { error: 'A per-person add-on follows the number of paying guests — change the guests instead.' } as const
    if (who.unit === 'FLAT') return { success: true as const, delta: 0 }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { error: 'Quantity must be a whole number from 1 to 999.' } as const
    if (quantity === line.quantity) return { success: true as const, delta: 0 }
    await tx.orderMasterclass.update({ where: { id: lineId }, data: { quantity } })
    const base = { tenantId, orderId, actorType: 'ADMIN' as const, actorId: actor?.id ?? null }
    await recordOrderEvent(tx, { ...base, type: 'ADDON_REMOVED', payload: { name: who.name, quantity: line.quantity, amount: lineAmount(line), edited: true } })
    await recordOrderEvent(tx, { ...base, type: 'ADDON_ADDED', payload: { name: who.name, quantity, amount: lineAmount({ quantity, pricePerUnit: line.pricePerUnit }), edited: true } })
    return { success: true as const, delta: lineAmount({ quantity, pricePerUnit: line.pricePerUnit }) - lineAmount(line) }
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
  const actor = await requireAdmin()
  const tenantId = await getTenantId()

  const found = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } })
    if (!order) return null
    // Scoped to this order: a line id from another order must not be deleted, nor this order re-priced for it
    // (blind review, Chunk 11 — the delete used to go by id alone).
    const line = await tx.orderMasterclass.findFirst({ where: { id: lineId, orderId }, include: { masterclassItem: true } })
    if (!line) return null
    await tx.orderMasterclass.delete({ where: { id: lineId } })
    await recordOrderEvent(tx, {
      tenantId, orderId, type: 'ADDON_REMOVED', actorType: 'ADMIN', actorId: actor?.id ?? null,
      payload: { name: lineIdentity(line).name, quantity: line.quantity, amount: lineAmount(line) },
    })
    return lineAmount(line)
  })
  if (found != null) await recalcOrderTotal(orderId, tenantId, -found)
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { success: true }
}
