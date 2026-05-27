import { db } from '@/lib/db'
import { findTier } from '@/lib/pricingUtils'

/**
 * Re-fetches an order with its company prices, masterclass lines, and extras,
 * then writes the recalculated totalPrice back to the DB.
 *
 * - Split counts set (tastingGuestCount + lunchGuestCount > 0): uses enhanced formula
 * - Split counts not set (0): falls back to guestCount × original tier rate (company orders only)
 * - Individual orders (no company prices): leaves totalPrice unchanged
 */
export async function recalcOrderTotal(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      company: { include: { prices: true } },
      masterclassLines: true,
      extras: true,
    },
  })
  if (!order) return

  const masterclassAmt = order.masterclassLines.reduce(
    (sum, l) => sum + l.quantity * l.pricePerUnit,
    0
  )
  const extrasAmt = order.extras.reduce((sum, e) => sum + e.amount, 0)
  const prices = order.company?.prices ?? []

  const tastingGuests = order.tastingGuestCount
  const lunchGuests = order.lunchGuestCount
  const totalPayingGuests = tastingGuests + lunchGuests

  let totalPrice: number

  if (totalPayingGuests > 0) {
    // Enhanced pricing: tier and price driven by paying guests only
    const tier = findTier(prices, totalPayingGuests)
    if (!tier) return
    totalPrice =
      tastingGuests * tier.pricePerPerson +
      lunchGuests * tier.tastingLunchPricePerPerson +
      tier.registrationPrice +
      masterclassAmt +
      extrasAmt
  } else if (prices.length > 0) {
    // Pre-enhancement company order: derive base from original guestCount + visitType
    const guestCount = order.guestCount
    const tier = findTier(prices, guestCount)
    if (!tier) return
    const rate =
      order.visitType === 'TASTING_LUNCH'
        ? tier.tastingLunchPricePerPerson || tier.pricePerPerson
        : tier.pricePerPerson
    totalPrice = guestCount * rate + tier.registrationPrice + masterclassAmt + extrasAmt
  } else {
    // Individual order — no price tiers to recalculate from; leave total unchanged
    return
  }

  await db.order.update({
    where: { id: orderId },
    data: { totalPrice },
  })
}
