'use server'

import { cookies } from 'next/headers'
import { withTenantDb } from '@/lib/db'
import { writeOrderContacts } from '@/lib/orderContacts'
import { getTenantId } from '@/lib/tenant'
import { shouldTakePayment } from '@/lib/payments/shouldTakePayment'
import { startCheckout } from '@/lib/payments/startCheckout'
import { checkWriteRateLimit } from '@/lib/writeRateLimit'
import { NEW_ORDER_COLUMNS } from '@/lib/statusWrite'
import { resolveOrderAddress, type OrderAddress } from '@/lib/orderAddress'
import { resolveOrderDelivery, minimumOrderError } from '@/lib/orderDelivery'
import { loadWineOrderDeliveryTx } from '@/lib/wineOrderDelivery'
import { wineOrderAmountDue } from '@/lib/wineOrderMoney'
import { checkPreferredDate } from '@/lib/wineOrderDate'
import { priceWineOrder } from '@/lib/winePricing'

export type WineSelection = {
  vintageId: string
  name: string
  year: number
  quantity: number
  // Client-supplied — display-only. Never trusted for pricing; the server
  // re-fetches the real WineVintage.price for every line before computing
  // any total. See KnownBugs.md #22.
  price: number
}

export type WineOrderResult =
  /**
   * `checkoutUrl` present means the tenant takes online payment and the client
   * should redirect there. Its absence is the ordinary reservation flow — an
   * order that never completes checkout still exists for the winery to chase.
   */
  | { success: true; checkoutUrl?: string }
  | { error: string }

export async function submitWineOrder(formData: FormData): Promise<WineOrderResult> {
  const businessName = formData.get('businessName') as string
  const llcName = formData.get('llcName') as string | null
  const llcId = formData.get('llcId') as string | null
  // A saved company address sends only its id; a typed one sends text. lib/orderAddress.ts
  // decides which and re-reads a saved one from the DB (T-13).
  const typedAddress = formData.get('address') as string | null
  const typedWorkingHours = formData.get('workingHours') as string | null
  const companyAddressId = (formData.get('companyAddressId') as string | null)?.trim() || null
  // Delivery or pickup, and which delivery zone (T-8). Re-checked against the winery's own setup
  // below (lib/orderDelivery.ts) — the browser only says which, never what it costs.
  const fulfilmentInput = formData.get('fulfilment') as string | null
  const zoneChoice = formData.get('deliveryZone') as string | null
  const isPickup = fulfilmentInput === 'PICKUP'
  // Preferred delivery / pickup day (T-14), YYYY-MM-DD. Required here; checked below against the
  // lead time and Closed Days the winery set — the same rules the form greys days out with.
  const preferredDateInput = (formData.get('preferredDate') as string | null)?.trim() || null
  const contactName = formData.get('contactName') as string
  const contactPhone = formData.get('contactPhone') as string
  const contactEmail = (formData.get('contactEmail') as string | null)?.trim() || null
  const winesJson = formData.get('wines') as string
  const companyId = (formData.get('companyId') as string | null)?.trim() || null
  // One entry per contact role, JSON like `wines` above (Plan-ContactRoles Chunk 8).
  // Written below via writeOrderContacts(), which re-verifies every roleId and personId
  // against the company under the tenant before trusting any of it. Parsed here, separately,
  // so a malformed value fails on the form that sent it rather than deeper in the write.
  const contactsJson = formData.get('contacts') as string | null
  let contacts: { roleId: string; personId?: string; name: string; phone: string | null; email: string | null }[] = []
  if (contactsJson) {
    try {
      const parsed = JSON.parse(contactsJson)
      if (Array.isArray(parsed)) contacts = parsed
    } catch {
      return { error: 'Please fill in all required fields.' }
    }
  }

  // A pickup needs no address (T-8); a delivery needs a saved or typed one.
  const hasAddress = isPickup || !!typedAddress?.trim() || !!companyAddressId
  if (!businessName || !hasAddress || !contactName || !contactPhone || !winesJson) {
    return { error: 'Please fill in all required fields.' }
  }

  const wines: WineSelection[] = JSON.parse(winesJson)
  const selectedWines = wines.filter(w => w.quantity > 0)

  if (selectedWines.length === 0) {
    return { error: 'Please select at least one wine.' }
  }

  const tenantId = await getTenantId()

  // Guard: abuse on public write actions. Every tenant is throttled — see
  // lib/writeRateLimit.ts for the demo-vs-real thresholds.
  const rate = await checkWriteRateLimit(tenantId, 'wine-order')
  if (rate.limited) {
    return {
      error: `That's a lot of orders in a short time — please wait about ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s) and try again.`,
    }
  }

  // Re-fetch real prices and the company's real discount from the DB —
  // never trust the client's `price`/`discountPercent` for the amount
  // actually charged/recorded. See KnownBugs.md #22.
  const vintageIds = [...new Set(selectedWines.map(w => w.vintageId))]
  const pickupAddress: OrderAddress = { companyAddressId: null, address: '', workingHours: null, addressLabel: null }
  const [realVintages, realCompany, orderAddress, deliverySetup] = await withTenantDb(tenantId, tx => Promise.all([
    tx.wineVintage.findMany({ where: { id: { in: vintageIds }, tenantId }, select: { id: true, price: true } }),
    companyId
      ? tx.company.findFirst({
          where: { id: companyId, tenantId },
          select: {
            wineDiscountPercent: true,
            accessCode: true,
            // Negotiated prices for the vintages in this cart (T-12) — re-read here, never taken
            // from the browser, which may not even have been shown them.
            winePrices: { where: { wineVintageId: { in: vintageIds } }, select: { wineVintageId: true, price: true } },
          },
        })
      : Promise.resolve(null),
    // A pickup stores no address: the customer collects from the winery.
    isPickup
      ? Promise.resolve(pickupAddress)
      : resolveOrderAddress(tx, tenantId, { companyId, companyAddressId, typedAddress, typedWorkingHours }),
    loadWineOrderDeliveryTx(tx, tenantId),
  ]))
  if ('error' in orderAddress) return { error: orderAddress.error }
  const delivery = resolveOrderDelivery(deliverySetup, { fulfilment: fulfilmentInput, zoneChoice })
  if ('error' in delivery) return { error: delivery.error }
  const dateProblem = checkPreferredDate(preferredDateInput, deliverySetup.dateRules)
  if (dateProblem) {
    return {
      error: dateProblem === 'missing' ? 'Please choose a preferred date.'
        : dateProblem === 'closed' ? 'We are closed on that day — please choose another date.'
        : dateProblem === 'too_soon' ? 'That date is too soon — please choose a later date.'
        : 'Please choose a valid date.',
    }
  }
  const priceMap = Object.fromEntries(realVintages.map(v => [v.id, v.price]))

  if (selectedWines.some(w => !(w.vintageId in priceMap))) {
    return { error: 'One or more selected wines are no longer available. Please refresh and try again.' }
  }

  // Negotiated prices replace the standard price outright; the company % applies to the rest
  // (lib/winePricing.ts — the same function the form shows its total with). Rounding at tetri
  // scale inside applyPercent is what keeps this an Int (bug #44's lesson).
  const negotiated = Object.fromEntries((realCompany?.winePrices ?? []).map(p => [p.wineVintageId, p.price]))
  const pricing = priceWineOrder(
    selectedWines.map(w => ({ vintageId: w.vintageId, quantity: w.quantity, standardPrice: priceMap[w.vintageId] })),
    negotiated,
    realCompany?.wineDiscountPercent ?? null,
  )
  const unitPrice = Object.fromEntries(pricing.lines.map(l => [l.vintageId, l.unitPrice]))
  const discountPercent = pricing.discountPercent
  const totalAmount = pricing.total
  // A company with no access code was only picked from the public list, so its negotiated prices
  // were never shown (T-12). Charging a total the customer did not see is the same chargeback
  // risk bookings already refuse (§7.4): take it as a reservation instead.
  const pricesShown = !(pricing.negotiatedTotal > 0 && !realCompany?.accessCode)

  // Minimum order (T-8) — on the wines total after company pricing, never the delivery fee,
  // and for pickup too. The form shows the same rule first; this is the one that counts.
  const bottleCount = selectedWines.reduce((n, w) => n + w.quantity, 0)
  const belowMinimum = minimumOrderError(deliverySetup.rules.minOrder, bottleCount, totalAmount)
  if (belowMinimum) return { error: belowMinimum }

  // What the customer is charged: wines + delivery fee, added in one place (lib/wineOrderMoney.ts).
  // `totalAmount` itself stays wines-only (Max, 2026-10-12).
  const amountDue = wineOrderAmountDue({ totalAmount, deliveryFee: delivery.deliveryFee })!

  // Normally the customer saw their total; the one exception is negotiated prices withheld from
  // a code-less company (`pricesShown` above), which blocks payment like a hidden booking price.
  const sectionGate = await shouldTakePayment({
    tenantId,
    totalPrice: amountDue,
    priceShown: pricesShown,
    section: 'WINE_ORDER',
    companyId: companyId || null,
  })
  // "Other – we'll contact you" leaves the fee unknown. The winery chose (Settings) whether the
  // customer still pays for the wine now, or the order is taken as a reservation.
  const reservationBecauseFeeUnknown =
    delivery.deliveryFeePending && deliverySetup.rules.unknownZonePayment === 'reservation'
  const gate = reservationBecauseFeeUnknown ? { ...sectionGate, takePayment: false as const } : sectionGate

  // A B2B buyer who pays online needs something in writing for their books, and
  // WineOrder has no other address to send it to. Required only on the paying
  // path — demanding it of reservation-only tenants would change a flow that
  // works today (§7.1). The form marks it required too; this is the backstop.
  if (gate.takePayment && !contactEmail) {
    return { error: 'Please provide an email address so we can send your receipt.' }
  }

  try {
    const createdOrder = await withTenantDb(tenantId, async (tx) => {
      const order = await tx.wineOrder.create({
        data: {
          businessName,
          llcName: llcName || null,
          llcId: llcId || null,
          address: orderAddress.address,
          workingHours: orderAddress.workingHours,
          addressLabel: orderAddress.addressLabel,
          companyAddressId: orderAddress.companyAddressId,
          ...delivery,
          preferredDate: new Date(preferredDateInput!),
          contactName,
          contactPhone,
          contactEmail,
          totalAmount,
          discountPercent: discountPercent || null,
          tenantId,
          companyId: companyId || null,
          ...NEW_ORDER_COLUMNS,
        },
      })
      await tx.wineOrderItem.createMany({
        data: selectedWines.map(w => ({
          wineOrderId: order.id,
          wineVintageId: w.vintageId,
          wineNameSnapshot: w.name,
          vintageYearSnapshot: w.year,
          // The price actually charged per bottle: negotiated, or standard (the % sits on the order).
          priceSnapshot: unitPrice[w.vintageId],
          quantity: w.quantity,
        })),
      })
      // Who to contact about this order, one row per role, with snapshots. The Contact
      // Person's details are also in WineOrder.contactName/contactPhone/contactEmail above,
      // for the same reason bookings keep Order.name/surname/phone/email — see the note in
      // createBooking.ts, which is the one place that special case is explained.
      await writeOrderContacts(tx, {
        tenantId,
        target: { wineOrderId: order.id },
        companyId: companyId || null,
        module: 'WINE_ORDER',
        contacts,
        fallbackContactPerson: { name: contactName, phone: contactPhone, email: contactEmail },
      })
      return order
    })

    // ── Online payment branch ──────────────────────────────────────────────
    // Only after the order safely exists. Every failure below degrades to the
    // ordinary reservation flow rather than blocking the customer.
    if (gate.takePayment) {
      const locale = (await cookies()).get('site_locale')?.value
      const bottles = selectedWines.reduce((n, w) => n + w.quantity, 0)
      const checkoutUrl = await startCheckout({
        tenantId,
        merchantId: gate.merchantId,
        secretKey: gate.secretKey,
        wineOrderId: createdOrder.id,
        // Already tetri — see the equivalent note in createBooking.ts.
        // Wines + delivery fee (just the wines when the fee is still to be agreed).
        amount: amountDue,
        // Built from the real order, not a hardcoded site name like the old site.
        orderDesc: `Wine order — ${bottles} bottle${bottles === 1 ? '' : 's'}, ${businessName}`,
        locale,
      })

      if (checkoutUrl) {
        // Only once a checkout really exists, so a failed one leaves a plain
        // NEW order rather than one filed under abandoned. settle.ts clears
        // this on approval; until then the row is not an order and shows only
        // on /admin/abandoned.
        await withTenantDb(tenantId, tx => tx.wineOrder.update({
          where: { id: createdOrder.id },
          data: { abandonedAt: new Date() },
        }))
        return { success: true, checkoutUrl }
      }
      // fall through: checkout unavailable → reservation-only, exactly as today
    }

    return { success: true }
  } catch (err) {
    // This catch swallowed bug #44 in silence for as long as it shipped: every
    // discounted company's order failed on the Int write and the customer saw
    // only "Something went wrong", with nothing anywhere saying why. The
    // message to the customer stays vague on purpose; the log does not.
    console.error('[submitWineOrder] failed to place wine order', err)
    return { error: 'Something went wrong. Please try again.' }
  }
}
