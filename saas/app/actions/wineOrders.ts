'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import {
  wineOrderStatusPatch,
  NEW_ORDER_STATUS_COLUMNS,
  type LegacyWineOrderStatus,
} from '@/lib/statusBridge'

/**
 * `status` was a bare `string` until chunk 3 — nothing in the app or the
 * database rejected a typo or a retired value, which is why the status split
 * would otherwise have failed silently here (Plan-StatusModel's silent-failure
 * table). It is now the legacy union.
 *
 * Writes both the old column and the two new axes. Reads the row first so the
 * patch can preserve whichever axis this status says nothing about, and so a
 * paid write can snapshot the stage it landed at.
 */
export async function updateWineOrderStatus(id: string, status: LegacyWineOrderStatus) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, async tx => {
    const current = await tx.wineOrder.findFirst({
      where: { id, tenantId },
      select: { paidAt: true, processStatus: { select: { code: true } } },
    })
    if (!current) return
    await tx.wineOrder.updateMany({
      where: { id, tenantId },
      data: {
        status,
        ...wineOrderStatusPatch(status, {
          processCode: current.processStatus?.code ?? null,
          paidAt: current.paidAt,
        }),
      },
    })
  })
  revalidatePath('/admin/wine-orders')
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
  const totalAmount = discountPercent
    ? Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100
    : subtotal

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
        ...NEW_ORDER_STATUS_COLUMNS,
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
