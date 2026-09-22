'use server'

import { cookies } from 'next/headers'
import { applyPercent, asTetri } from '@/lib/money'
import { withTenantDb } from '@/lib/db'
import { buildOrderContactRows } from '@/lib/orderContacts'
import { getTenantId } from '@/lib/tenant'
import { shouldTakePayment } from '@/lib/payments/shouldTakePayment'
import { startCheckout } from '@/lib/payments/startCheckout'
import { checkDemoRateLimit, DEMO_WINE_ORDER_LIMIT } from '@/lib/demoRateLimit'
import { NEW_ORDER_COLUMNS } from '@/lib/statusWrite'

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
  const address = formData.get('address') as string
  const workingHours = formData.get('workingHours') as string | null
  const contactName = formData.get('contactName') as string
  const contactPhone = formData.get('contactPhone') as string
  const contactEmail = (formData.get('contactEmail') as string | null)?.trim() || null
  const winesJson = formData.get('wines') as string
  const companyId = (formData.get('companyId') as string | null)?.trim() || null
  // One entry per contact role, JSON like `wines` above (Plan-ContactRoles Chunk 8).
  // **Parsed and not yet written** — Chunk 9 owns the OrderContact write path and will
  // re-verify every personId against the company under the tenant before trusting it. Parsed
  // here rather than left to that chunk so a malformed value fails now, on the form that sent
  // it, instead of surfacing later as a write-path bug.
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

  if (!businessName || !address || !contactName || !contactPhone || !winesJson) {
    return { error: 'Please fill in all required fields.' }
  }

  const wines: WineSelection[] = JSON.parse(winesJson)
  const selectedWines = wines.filter(w => w.quantity > 0)

  if (selectedWines.length === 0) {
    return { error: 'Please select at least one wine.' }
  }

  const tenantId = await getTenantId()

  // Guard: abuse on the public demo sandbox. A no-op for real tenants —
  // see lib/demoRateLimit.ts for why this is deliberately demo-only.
  const rate = await checkDemoRateLimit(tenantId, 'wine-order', DEMO_WINE_ORDER_LIMIT)
  if (rate.limited) {
    return {
      error: `That's a lot of orders in a short time. This is a shared demo, so it caps how fast orders can be placed — try again in about ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s).`,
    }
  }

  // Re-fetch real prices and the company's real discount from the DB —
  // never trust the client's `price`/`discountPercent` for the amount
  // actually charged/recorded. See KnownBugs.md #22.
  const vintageIds = [...new Set(selectedWines.map(w => w.vintageId))]
  const [realVintages, realCompany] = await withTenantDb(tenantId, tx => Promise.all([
    tx.wineVintage.findMany({ where: { id: { in: vintageIds }, tenantId }, select: { id: true, price: true } }),
    companyId
      ? tx.company.findFirst({ where: { id: companyId, tenantId }, select: { wineDiscountPercent: true } })
      : Promise.resolve(null),
  ]))
  const priceMap = Object.fromEntries(realVintages.map(v => [v.id, v.price]))

  if (selectedWines.some(w => !(w.vintageId in priceMap))) {
    return { error: 'One or more selected wines are no longer available. Please refresh and try again.' }
  }

  const discountPercent = realCompany?.wineDiscountPercent && realCompany.wineDiscountPercent > 0
    ? Math.min(realCompany.wineDiscountPercent, 100)
    : null

  const subtotal = selectedWines.reduce((sum, w) => sum + w.quantity * priceMap[w.vintageId], 0)
  // `Math.round(x * (1 - p/100) * 100) / 100` lived here until 2026-09-18. It
  // meant "round to two decimals of lari" and was correct while subtotal was a
  // Float of lari. Against tetri it rounds at the wrong scale and leaves a
  // fraction — 4550 at 15% gave 3867.5, which an Int column rejects, so every
  // discounted company's wine order failed to save (bug #44). applyPercent
  // rounds at tetri scale and always returns a whole number.
  const totalAmount = discountPercent
    ? applyPercent(asTetri(subtotal), discountPercent)
    : asTetri(subtotal)

  // Wine orders always show the customer their total, so unlike company
  // bookings there's no hidden-price case to exclude here (§7.4).
  const gate = await shouldTakePayment({
    tenantId,
    totalPrice: totalAmount,
    priceShown: true,
    section: 'WINE_ORDER',
    companyId: companyId || null,
  })

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
          address,
          workingHours: workingHours || null,
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
          priceSnapshot: priceMap[w.vintageId],
          quantity: w.quantity,
        })),
      })
      // Who to contact about this order, one row per role, with snapshots. The Contact
      // Person's details are also in WineOrder.contactName/contactPhone/contactEmail above,
      // for the same reason bookings keep Order.name/surname/phone/email — see the note in
      // createBooking.ts, which is the one place that special case is explained.
      const contactRows = await buildOrderContactRows(tx, {
        tenantId,
        companyId: companyId || null,
        module: 'WINE_ORDER',
        contacts,
      })
      if (contactRows.length > 0) {
        await tx.orderContact.createMany({
          data: contactRows.map(r => ({ ...r, wineOrderId: order.id })),
        })
      }
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
        amount: asTetri(totalAmount),
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
