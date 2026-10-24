'use server'

import { db, withTenantDb } from '@/lib/db'
import { writeOrderContacts } from '@/lib/orderContacts'
import { isIsoDate } from '@/lib/isoDate'
import { asTetri } from '@/lib/money'
import { recordManualPayment, reverseManualPayments, recordAdditionalWinePayment } from '@/lib/payments/manualPayment'
import { wineOrderAmountDue } from '@/lib/wineOrderMoney'
import { priceWineOrder } from '@/lib/winePricing'
import { startWineTopUpCheckout } from '@/lib/payments/topUpCheckout'
import type { Tetri } from '@/lib/money'
import { recordOrderEvent, eventTypeForChange } from '@/lib/orderEvents'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { resolveOrderAddress, type OrderAddress } from '@/lib/orderAddress'
import { resolveOrderDelivery } from '@/lib/orderDelivery'
import { loadWineOrderDeliveryTx } from '@/lib/wineOrderDelivery'
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
        // `deliveryFee` too since T-8: "paid" means wines + delivery fee (lib/wineOrderMoney.ts).
        select: { stage: true, totalAmount: true, deliveryFee: true, confirmedAt: true, deliveredAt: true, paidAt: true },
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
              tenantId, wineOrderId: id, amount: wineOrderAmountDue(current) ?? asTetri(0), at: now,
              method: change.method,
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
export async function createWineOrderAdmin(input: {
  /** T-9 — INDIVIDUAL drops the company, LLC and saved address; the name doubles as the
   *  business name. Defaults to COMPANY, the shape every admin entry had before T-9. */
  customerType?: 'INDIVIDUAL' | 'COMPANY'
  companyId: string | null
  businessName: string
  llcName: string | null
  llcId: string | null
  /** A saved CompanyAddress (T-13). When set, `address`/`workingHours` are ignored and the
   *  saved row's text is used — see lib/orderAddress.ts. */
  companyAddressId?: string | null
  /** T-8 — 'DELIVERY' (default) or 'PICKUP'; a zone id, 'other' (fee set later), or null. */
  fulfilment?: 'DELIVERY' | 'PICKUP'
  zoneChoice?: string | null
  /** T-14 — YYYY-MM-DD, optional for admin entry and not held to the lead time / Closed Days
   *  (an admin tool, like bookings: phone orders for "today" are real). */
  preferredDate?: string | null
  address: string
  workingHours: string | null
  contactName: string
  contactPhone: string
  contactEmail: string | null
  /**
   * One entry per contact role, built by `buildContacts()` in NewWineOrderForm.tsx.
   *
   * `personId` is absent when the admin typed the details rather than picking someone on
   * file, which is why the name and details travel alongside it: Chunk 9 stores them as
   * snapshots, so deleting a person later loses the link and never the facts (finding F2).
   *
   * Written via `writeOrderContacts()`, the one base every order-creation path shares, which
   * re-verifies every `roleId` and `personId` against `companyId` under the tenant first.
   */
  contacts?: {
    roleId: string
    personId?: string
    name: string
    phone: string | null
    email: string | null
  }[]
  wines: { vintageId: string; quantity: number }[]
  /**
   * T-22 guest purchase — bottles a guest bought during a booking's visit, recorded as an ordinary wine order (so every rule
   * above applies to it: website price, per-line rounding, statistics) linked to that booking. Forces an INDIVIDUAL pickup, makes
   * the phone optional (Max, D-20: it is a sale over the counter, not a delivery to chase) and never touches the booking's total
   * or invoice. The booking is verified under the tenant here, not trusted from the caller.
   */
  sourceOrderId?: string | null
}): Promise<{ orderId: string } | { error: string }> {
  const actor = await requireAdmin()
  const sourceOrderId = input.sourceOrderId || null
  const isIndividual = input.customerType === 'INDIVIDUAL' || sourceOrderId != null
  const data = isIndividual
    ? { ...input, companyId: null, companyAddressId: null, llcName: null, llcId: null, contacts: undefined,
        businessName: input.businessName.trim() || input.contactName,
        ...(sourceOrderId ? { fulfilment: 'PICKUP' as const, zoneChoice: null, preferredDate: null } : {}) }
    : input
  if (!data.businessName.trim()) return { error: 'Business / customer name is required.' }
  const isPickup = data.fulfilment === 'PICKUP'
  if (!isPickup && !data.address.trim() && !data.companyAddressId) return { error: 'Address is required.' }
  if (data.preferredDate && !isIsoDate(data.preferredDate)) return { error: 'Please enter a valid date.' }
  if (!data.contactName.trim()) return { error: 'Contact name is required.' }
  if (!sourceOrderId && !data.contactPhone.trim()) return { error: 'Contact phone is required.' }

  // Whole bottles only (same rule as the public form) — a fraction crashed the pricing.
  if (data.wines.some(w => !Number.isInteger(w.quantity) || w.quantity < 0 || w.quantity > 1000)) {
    return { error: 'Please check the number of bottles.' }
  }
  const selectedWines = data.wines.filter(w => w.quantity > 0)
  if (selectedWines.length === 0) return { error: 'Please select at least one wine.' }

  const tenantId = await getTenantId()

  const vintageIds = [...new Set(selectedWines.map(w => w.vintageId))]
  const pickupAddress: OrderAddress = { companyAddressId: null, address: '', workingHours: null, addressLabel: null, deliveryZoneId: null }
  const [vintages, company, orderAddress, deliverySetup] = await withTenantDb(tenantId, tx => Promise.all([
    tx.wineVintage.findMany({ where: { id: { in: vintageIds }, tenantId }, include: { wine: true } }),
    data.companyId
      ? tx.company.findFirst({
          where: { id: data.companyId, tenantId },
          select: {
            wineDiscountPercent: true,
            // T-12 — negotiated prices for these vintages, same rule as the public path.
            winePrices: { where: { wineVintageId: { in: vintageIds } }, select: { wineVintageId: true, price: true } },
          },
        })
      : Promise.resolve(null),
    // Same helper as the public path: requireAdmin() proves who is calling, not that the
    // address id belongs to this company.
    isPickup
      ? Promise.resolve(pickupAddress)
      : resolveOrderAddress(tx, tenantId, {
          companyId: data.companyId,
          companyAddressId: data.companyAddressId ?? null,
          typedAddress: data.address,
          typedWorkingHours: data.workingHours,
        }),
    loadWineOrderDeliveryTx(tx, tenantId),
  ]))
  if ('error' in orderAddress) return { error: orderAddress.error }
  // Same helper as the public path; `admin` allows a pickup the public form may not offer.
  const delivery = resolveOrderDelivery(deliverySetup, { fulfilment: data.fulfilment ?? null, zoneChoice: data.zoneChoice ?? null }, { admin: true })
  if ('error' in delivery) return { error: delivery.error }
  const vintageMap = Object.fromEntries(vintages.map(v => [v.id, v]))

  if (selectedWines.some(w => !(w.vintageId in vintageMap))) {
    return { error: 'One or more selected wines are no longer available. Please refresh and try again.' }
  }

  // Same function as the public path and the form (lib/winePricing.ts): negotiated prices
  // replace the standard ones, the company % applies to the rest.
  const pricing = priceWineOrder(
    selectedWines.map(w => ({ vintageId: w.vintageId, quantity: w.quantity, standardPrice: vintageMap[w.vintageId].price })),
    Object.fromEntries((company?.winePrices ?? []).map(p => [p.wineVintageId, p.price])),
    company?.wineDiscountPercent ?? null,
  )
  const unitPrice = Object.fromEntries(pricing.lines.map(l => [l.vintageId, l.unitPrice]))
  const pricedLine = new Map(pricing.lines.map(l => [l.vintageId, l]))
  const discountPercent = pricing.discountPercent
  const totalAmount = pricing.total

  const orderId = await withTenantDb(tenantId, async (tx) => {
    if (sourceOrderId) {
      // The visit this was bought on: must be this winery's own booking, and a live one (a cancelled or abandoned booking has no
      // visit to sell on).
      const visit = await tx.order.findFirst({ where: { id: sourceOrderId, tenantId, abandonedAt: null, stage: { not: 'CANCELLED' } }, select: { id: true } })
      if (!visit) return null
    }
    const order = await tx.wineOrder.create({
      data: {
        sourceOrderId,
        businessName: data.businessName.trim(),
        llcName: data.llcName?.trim() || null,
        llcId: data.llcId?.trim() || null,
        address: orderAddress.address,
        workingHours: orderAddress.workingHours,
        addressLabel: orderAddress.addressLabel,
        companyAddressId: orderAddress.companyAddressId,
        ...delivery,
        customerType: isIndividual ? 'INDIVIDUAL' : 'COMPANY',
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
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
        priceSnapshot: unitPrice[w.vintageId],
        quantity: w.quantity,
        negotiated: pricedLine.get(w.vintageId)!.negotiated,
        discountPercent: pricedLine.get(w.vintageId)!.discountPercent,
        lineTotal: pricedLine.get(w.vintageId)!.lineTotal,
      })),
    })
    // Same rows the public wine path writes — one write path per order type, shared
    // verification. An admin-sent personId is no more trustworthy than a guest-sent one:
    // requireAdmin() proves who is calling, not that the ids in the payload are real.
    await writeOrderContacts(tx, {
      tenantId,
      target: { wineOrderId: order.id },
      companyId: data.companyId || null,
      module: 'WINE_ORDER',
      contacts: data.contacts,
      fallbackContactPerson: {
        name: data.contactName.trim(),
        phone: data.contactPhone.trim() || null,
        email: data.contactEmail?.trim() || null,
      },
    })
    if (sourceOrderId) {
      // On the booking's history, so the visit shows what was sold on it (written only once this code is live — see the
      // enum migration note in vault/Plan-AddOnsAndWine.md §4.8).
      await recordOrderEvent(tx, {
        tenantId,
        orderId: sourceOrderId,
        type: 'GUEST_PURCHASE_LINKED',
        actorType: 'ADMIN',
        actorId: actor?.id ?? null,
        payload: { wineOrderId: order.id, amount: totalAmount, bottles: selectedWines.reduce((s, w) => s + w.quantity, 0) },
      })
    }
    return order.id
  })
  if (orderId === null) return { error: 'That booking is no longer open for sales.' }

  revalidatePath('/admin/wine-orders')
  revalidatePath('/admin/statistics')
  if (sourceOrderId) revalidatePath(`/admin/orders/${sourceOrderId}`)
  return { orderId }
}

/**
 * Set or change a wine order's delivery fee after it was placed (T-8,
 * vault/Plan-WineOrderFeatures.md Chunk 6) — the follow-up to a customer who picked "Other — we
 * will contact you about delivery", or a correction. Clears `deliveryFeePending`.
 *
 * The fee is a separate column, never folded into `totalAmount` (wines only, Max 2026-10-12). If
 * the wine was already paid, the fee becomes a balance due — shown on the card and collected with
 * `recordWineOrderFeePayment` below; nothing here touches existing payments.
 */
export async function setWineOrderDeliveryFee(
  id: string,
  fee: Tetri
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  if (!Number.isInteger(fee) || fee < 0 || fee > 100_000_00) return { error: 'Enter a valid fee.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const order = await tx.wineOrder.findFirst({
      where: { id, tenantId },
      select: { fulfilment: true, deliveryFee: true },
    })
    if (!order) return { error: 'Wine order not found.' }
    // The database refuses it too (WineOrder_pickup_has_no_delivery); this is the readable version.
    if (order.fulfilment === 'PICKUP') return { error: 'This order is a pickup — it has no delivery fee.' }
    await tx.wineOrder.update({ where: { id }, data: { deliveryFee: fee, deliveryFeePending: false } })
    await recordOrderEvent(tx, {
      tenantId,
      wineOrderId: id,
      type: 'DELIVERY_FEE_SET',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { from: order.deliveryFee, to: fee },
    })
    return { success: true as const }
  })
  if ('error' in result) return result
  revalidatePath('/admin/wine-orders')
  return result
}

/**
 * Record cash or a bank transfer against what is still owed on a wine order (in practice: a
 * delivery fee set after the wine was paid). Validated against the balance inside the same
 * transaction — see `recordAdditionalWinePayment`.
 */
export async function recordWineOrderFeePayment(
  id: string,
  data: { amount: Tetri; method: 'BANK_TRANSFER' | 'CASH' }
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  if (data.method !== 'BANK_TRANSFER' && data.method !== 'CASH') return { error: 'Choose how it was paid.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const recorded = await recordAdditionalWinePayment(tx, {
      wineOrderId: id, tenantId, amount: data.amount, method: data.method, at: new Date(),
    })
    if ('error' in recorded) return recorded
    await recordOrderEvent(tx, {
      tenantId,
      wineOrderId: id,
      type: 'ADDITIONAL_PAYMENT_RECORDED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { amount: data.amount, method: data.method },
    })
    return { success: true as const }
  })
  if ('error' in result) return result
  revalidatePath('/admin/wine-orders')
  return result
}

/**
 * A card-payment link for what a paid wine order still owes (T-8, Plan-WineOrderFeatures
 * Chunk 6b) — the card sibling of `recordWineOrderFeePayment`. Returns the link for the admin to
 * copy or show as a QR code; nothing is sent to the customer from here. The balance only moves
 * when Flitt's signed callback settles the payment (settle.ts), like every other checkout.
 */
export async function startWineOrderFeeCheckout(
  id: string,
  data: { amount: Tetri }
): Promise<{ success: true; checkoutUrl: string; paymentId: string } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  const order = await withTenantDb(tenantId, tx => tx.wineOrder.findFirst({
    where: { id, tenantId },
    select: { businessName: true, deliveryZoneName: true },
  }))
  if (!order) return { error: 'Wine order not found.' }
  return startWineTopUpCheckout({
    wineOrderId: id,
    tenantId,
    amount: data.amount,
    orderDesc: `Wine order balance${order.deliveryZoneName ? ` (delivery ${order.deliveryZoneName})` : ''}, ${order.businessName}`,
  })
}


/**
 * Change (or clear) a wine order's preferred delivery / pickup date (T-14, Chunk 7) — the winery
 * agreeing a different day with the customer. Not held to the lead time or Closed Days: the admin
 * is recording what was agreed. Logged as PREFERRED_DATE_CHANGED with the old and new day.
 */
export async function setWineOrderPreferredDate(
  id: string,
  date: string | null
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  if (date !== null && !isIsoDate(date)) return { error: 'Please enter a valid date.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const order = await tx.wineOrder.findFirst({ where: { id, tenantId }, select: { preferredDate: true } })
    if (!order) return { error: 'Wine order not found.' }
    await tx.wineOrder.update({ where: { id }, data: { preferredDate: date ? new Date(date) : null } })
    await recordOrderEvent(tx, {
      tenantId,
      wineOrderId: id,
      type: 'PREFERRED_DATE_CHANGED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { from: order.preferredDate?.toISOString().slice(0, 10) ?? null, to: date },
    })
    return { success: true as const }
  })
  if ('error' in result) return result
  revalidatePath('/admin/wine-orders')
  return result
}
