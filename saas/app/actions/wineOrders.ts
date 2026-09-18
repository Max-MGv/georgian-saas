'use server'

import { db, withTenantDb } from '@/lib/db'
import { applyPercent, asTetri } from '@/lib/money'
import { recordManualPayment, reverseManualPayments } from '@/lib/payments/manualPayment'
import { recordOrderEvent, eventTypeForChange } from '@/lib/orderEvents'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import {
  wineOrderStagePatch,
  paidPatch,
  isWineOrderStage,
  NEW_ORDER_COLUMNS,
} from '@/lib/statusWrite'
// Types come from lib/, never from a 'use server' file — MaintenanceNotes §24.
import type { WineOrderStatusChange } from '@/lib/statusWrite'
import type { WineOrderStage } from '@prisma/client'

/**
 * Every hand-made change to a wine order's status.
 *
 * Replaces `updateWineOrderStatus(id, status: string)` — the unvalidated bare
 * string that was the root cause this whole redesign was opened for. Stage and
 * payment are two separate things now, so a single value that moves whichever
 * one it feels like has nowhere left to hide.
 */
export async function changeWineOrderStatus(
  id: string,
  change: WineOrderStatusChange
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()

  // A stage arrives from a dropdown and is a string at runtime however
  // well-typed the call site looks. Postgres would refuse an invalid enum value
  // too; this turns that into a friendly error rather than a 500.
  if (change.kind === 'stage' && !isWineOrderStage(change.stage)) {
    return { error: 'Unknown status.' }
  }

  try {
    // Read first so a patch preserves a date that already exists rather than
    // re-stamping it — when an order was really confirmed must not drift
    // forward every time someone touches the row.
    const result = await withTenantDb(tenantId, async tx => {
      const current = await tx.wineOrder.findFirst({
        where: { id, tenantId },
        // `stage` is selected for the history row's fromStage, not for the patch.
        // `totalAmount` is read for the ledger row a manual payment writes (chunk 6).
        select: { stage: true, totalAmount: true, confirmedAt: true, deliveredAt: true, paidAt: true },
      })
      if (!current) return { count: 0 }
      const now = new Date()
      const dates = {
        confirmedAt: current.confirmedAt,
        finishedAt: current.deliveredAt,
        paidAt: current.paidAt,
      }
      const data =
        change.kind === 'stage'
          ? wineOrderStagePatch(change.stage as WineOrderStage, dates, now)
          : change.kind === 'paid'
            ? paidPatch(change.value, dates, now)
            : { abandonedAt: null }
      const updated = await tx.wineOrder.updateMany({ where: { id, tenantId }, data })
      if (updated.count > 0) {
        if (change.kind === 'paid') {
          if (change.value) {
            await recordManualPayment(tx, {
              tenantId, wineOrderId: id, amount: asTetri(current.totalAmount ?? 0), at: now,
            })
          } else {
            await reverseManualPayments(tx, { wineOrderId: id, at: now })
          }
        }
        await recordOrderEvent(tx, {
          tenantId,
          wineOrderId: id,
          type: eventTypeForChange(change),
          actorType: 'ADMIN',
          actorId: actor?.id ?? null,
          fromStage: change.kind === 'stage' ? current.stage : null,
          toStage: change.kind === 'stage' ? change.stage : null,
        })
      }
      return updated
    })
    if (result.count === 0) return { error: 'Wine order not found.' }
    revalidatePath('/admin/wine-orders')
    revalidatePath('/admin/abandoned')
    return { success: true }
  } catch {
    return { error: 'Failed to update status.' }
  }
}

/**
 * Admin-entered wine order — for a phone/walk-in customer who didn't use the
 * public site. Mirrors createOrderAdmin() (app/actions/orders.ts) for
 * bookings: no online-payment branch (this path is deliberately outside
 * Flitt checkout, same reasoning as the booking equivalent), and re-fetches
 * real WineVintage.price / Company.wineDiscountPercent server-side rather
 * than trusting client-computed numbers, same discipline as the public
 * submitWineOrder.ts (see KnownBugs.md #22 — the bug that discipline fixed).
 * Discount is strictly tied to a linked company's own wineDiscountPercent,
 * same as the public flow — no manual override, on Max's explicit call.
 */
export async function createWineOrderAdmin(data: {
  companyId: string | null
  businessName: string
  llcName: string | null
  llcId: string | null
  address: string
  workingHours: string | null
  contactName: string
  contactPhone: string
  contactEmail: string | null
  wines: { vintageId: string; quantity: number }[]
}): Promise<{ orderId: string } | { error: string }> {
  await requireAdmin()
  if (!data.businessName.trim()) return { error: 'Business / customer name is required.' }
  if (!data.address.trim()) return { error: 'Address is required.' }
  if (!data.contactName.trim()) return { error: 'Contact name is required.' }
  if (!data.contactPhone.trim()) return { error: 'Contact phone is required.' }

  const selectedWines = data.wines.filter(w => w.quantity > 0)
  if (selectedWines.length === 0) return { error: 'Please select at least one wine.' }

  const tenantId = await getTenantId()

  const vintageIds = [...new Set(selectedWines.map(w => w.vintageId))]
  const [vintages, company] = await withTenantDb(tenantId, tx => Promise.all([
    tx.wineVintage.findMany({ where: { id: { in: vintageIds }, tenantId }, include: { wine: true } }),
    data.companyId
      ? tx.company.findFirst({ where: { id: data.companyId, tenantId }, select: { wineDiscountPercent: true } })
      : Promise.resolve(null),
  ]))
  const vintageMap = Object.fromEntries(vintages.map(v => [v.id, v]))

  if (selectedWines.some(w => !(w.vintageId in vintageMap))) {
    return { error: 'One or more selected wines are no longer available. Please refresh and try again.' }
  }

  const discountPercent = company?.wineDiscountPercent && company.wineDiscountPercent > 0
    ? Math.min(company.wineDiscountPercent, 100)
    : null

  const subtotal = selectedWines.reduce((sum, w) => sum + w.quantity * vintageMap[w.vintageId].price, 0)
  // Same stale major-unit rounding as submitWineOrder.ts carried — see the
  // comment there. Rounding at tetri scale is what keeps this an integer (#44).
  const totalAmount = discountPercent
    ? applyPercent(asTetri(subtotal), discountPercent)
    : asTetri(subtotal)

  const orderId = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.wineOrder.create({
      data: {
        businessName: data.businessName.trim(),
        llcName: data.llcName?.trim() || null,
        llcId: data.llcId?.trim() || null,
        address: data.address.trim(),
        workingHours: data.workingHours?.trim() || null,
        contactName: data.contactName.trim(),
        contactPhone: data.contactPhone.trim(),
        contactEmail: data.contactEmail?.trim() || null,
        totalAmount,
        discountPercent: discountPercent || null,
        tenantId,
        companyId: data.companyId || null,
        ...NEW_ORDER_COLUMNS,
      },
    })
    await tx.wineOrderItem.createMany({
      data: selectedWines.map(w => ({
        wineOrderId: order.id,
        wineVintageId: w.vintageId,
        wineNameSnapshot: vintageMap[w.vintageId].wine.name,
        vintageYearSnapshot: vintageMap[w.vintageId].year,
        priceSnapshot: vintageMap[w.vintageId].price,
        quantity: w.quantity,
      })),
    })
    return order.id
  })

  revalidatePath('/admin/wine-orders')
  revalidatePath('/admin/statistics')
  return { orderId }
}
