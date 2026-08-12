'use server'

import { cookies } from 'next/headers'
import { withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { shouldTakePayment } from '@/lib/payments/shouldTakePayment'
import { startCheckout } from '@/lib/payments/startCheckout'

export type WineSelection = {
  vintageId: string
  name: string
  year: number
  quantity: number
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
  const discountPercentRaw = formData.get('discountPercent') as string | null
  const discountPercent = discountPercentRaw ? parseFloat(discountPercentRaw) : null

  if (!businessName || !address || !contactName || !contactPhone || !winesJson) {
    return { error: 'Please fill in all required fields.' }
  }

  const wines: WineSelection[] = JSON.parse(winesJson)
  const selectedWines = wines.filter(w => w.quantity > 0)

  if (selectedWines.length === 0) {
    return { error: 'Please select at least one wine.' }
  }

  const subtotal = selectedWines.reduce((sum, w) => sum + w.quantity * w.price, 0)
  const totalAmount = discountPercent && discountPercent > 0
    ? Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100
    : subtotal
  const tenantId = await getTenantId()

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
        },
      })
      await tx.wineOrderItem.createMany({
        data: selectedWines.map(w => ({
          wineOrderId: order.id,
          wineVintageId: w.vintageId,
          wineNameSnapshot: w.name,
          vintageYearSnapshot: w.year,
          priceSnapshot: w.price,
          quantity: w.quantity,
        })),
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
        amount: totalAmount,
        // Built from the real order, not a hardcoded site name like the old site.
        orderDesc: `Wine order — ${bottles} bottle${bottles === 1 ? '' : 's'}, ${businessName}`,
        locale,
      })

      if (checkoutUrl) {
        // Only once a checkout really exists, so a failed one leaves a plain
        // "pending" order. settle.ts advances this to 'paid' on approval.
        // WineOrder.status is a bare String, not the OrderStatus enum.
        await withTenantDb(tenantId, tx => tx.wineOrder.update({
          where: { id: createdOrder.id },
          data: { status: 'pending_payment' },
        }))
        return { success: true, checkoutUrl }
      }
      // fall through: checkout unavailable → reservation-only, exactly as today
    }

    return { success: true }
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }
}
