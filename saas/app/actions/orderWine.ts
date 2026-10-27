'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { recordOrderEvent } from '@/lib/orderEvents'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { wineLineTotalFor } from '@/lib/winePricing'
import { priceTableWine, MAX_TABLE_BOTTLES } from '@/lib/tableWine'
import { wineLineCost } from '@/lib/orderLines'

// The order page's "Wine for the table" card (T-22). Staff can add bottles during the dinner, change a quantity or take a
// line off. Everything is priced on the server by lib/tableWine.ts — the same rules as the public form and a wine order — and
// the order's company terms apply (an admin screen is trusted: the company is the order's own). Each change leaves a line in
// the booking's history and moves the total by exactly what the line is worth (lib/pricing.ts), including on an order that
// was already paid: the difference then shows as a balance due or a credit, as for extras.

const refresh = (orderId: string) => {
  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin/statistics')
}

export async function addOrderWineLine(
  orderId: string,
  data: { vintageId: string; quantity: number },
): Promise<{ success: true; lineId: string; lineTotal: number } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true, companyId: true, bookingType: true } })
    if (!order) return { error: 'Order not found.' } as const
    const already = await tx.wineOrderItem.findFirst({ where: { orderId, wineVintageId: data.vintageId }, select: { id: true } })
    if (already) return { error: 'This wine is already on the order — change its quantity instead.' } as const
    const priced = await priceTableWine(tx, tenantId, {
      lines: [{ vintageId: data.vintageId, quantity: data.quantity }],
      termsCompanyId: order.bookingType === 'COMPANY' ? order.companyId : null,
      locale: 'en',
    })
    if (!priced.ok) {
      return { error: priced.error === 'bad_quantity' ? `Quantity must be a whole number from 1 to ${MAX_TABLE_BOTTLES}.` : 'This wine is not offered on bookings (switch it on in Wines).' } as const
    }
    const row = priced.rows[0]!
    const created = await tx.wineOrderItem.create({ data: { orderId, ...row } })
    await recordOrderEvent(tx, {
      tenantId, orderId, type: 'WINE_ADDED', actorType: 'ADMIN', actorId: actor?.id ?? null,
      payload: { wine: row.wineNameSnapshot, year: row.vintageYearSnapshot, quantity: row.quantity, amount: row.lineTotal, negotiated: row.negotiated, discountPercent: row.discountPercent },
    })
    return { success: true as const, lineId: created.id, lineTotal: row.lineTotal }
  })
  if ('error' in result) return result
  await recalcOrderTotal(orderId, tenantId, result.lineTotal)
  refresh(orderId)
  return result
}

/**
 * Change a line's quantity in place. The line keeps the terms it was sold on (its own bottle price, agreed or not, and its %):
 * only the quantity moves, and the line total is rounded again exactly as when it was added.
 */
export async function updateOrderWineLine(
  lineId: string,
  orderId: string,
  quantity: number,
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true } })
    if (!order) return { error: 'Order not found.' } as const
    const line = await tx.wineOrderItem.findFirst({ where: { id: lineId, orderId } })
    if (!line) return { error: 'This line is no longer on the order.' } as const
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TABLE_BOTTLES) return { error: `Quantity must be a whole number from 1 to ${MAX_TABLE_BOTTLES}.` } as const
    if (quantity === line.quantity) return { success: true as const, delta: 0 }
    const lineTotal = wineLineTotalFor(line, quantity)
    const before = wineLineCost(line)
    await tx.wineOrderItem.update({ where: { id: lineId }, data: { quantity, lineTotal } })
    const base = { tenantId, orderId, actorType: 'ADMIN' as const, actorId: actor?.id ?? null }
    await recordOrderEvent(tx, { ...base, type: 'WINE_REMOVED', payload: { wine: line.wineNameSnapshot, year: line.vintageYearSnapshot, quantity: line.quantity, amount: before, edited: true } })
    await recordOrderEvent(tx, { ...base, type: 'WINE_ADDED', payload: { wine: line.wineNameSnapshot, year: line.vintageYearSnapshot, quantity, amount: lineTotal, edited: true } })
    return { success: true as const, delta: lineTotal - before }
  })
  if ('error' in result) return result
  if (result.delta !== 0) await recalcOrderTotal(orderId, tenantId, result.delta)
  refresh(orderId)
  return { success: true }
}

export async function removeOrderWineLine(lineId: string, orderId: string): Promise<{ success: true }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()
  const removed = await withTenantDb(tenantId, async tx => {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true } })
    if (!order) return null
    // Scoped to this order: a line id from another order must not be deleted, nor this order re-priced for it.
    const line = await tx.wineOrderItem.findFirst({ where: { id: lineId, orderId } })
    if (!line) return null
    await tx.wineOrderItem.delete({ where: { id: lineId } })
    const amount = wineLineCost(line)
    await recordOrderEvent(tx, {
      tenantId, orderId, type: 'WINE_REMOVED', actorType: 'ADMIN', actorId: actor?.id ?? null,
      payload: { wine: line.wineNameSnapshot, year: line.vintageYearSnapshot, quantity: line.quantity, amount },
    })
    return amount
  })
  if (removed != null) await recalcOrderTotal(orderId, tenantId, -removed)
  refresh(orderId)
  return { success: true }
}
