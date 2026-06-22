import { withTenantDb } from '@/lib/db'
import { findTier } from '@/lib/pricingUtils'

export async function recalcOrderTotal(orderId: string, tenantId: string): Promise<void> {
  await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
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
      const tier = findTier(prices, totalPayingGuests)
      if (!tier) return
      totalPrice =
        tastingGuests * tier.pricePerPerson +
        lunchGuests * tier.tastingLunchPricePerPerson +
        tier.registrationPrice +
        masterclassAmt +
        extrasAmt
    } else if (prices.length > 0) {
      const guestCount = order.guestCount
      const tier = findTier(prices, guestCount)
      if (!tier) return
      const rate =
        order.visitType === 'TASTING_LUNCH'
          ? tier.tastingLunchPricePerPerson || tier.pricePerPerson
          : tier.pricePerPerson
      totalPrice = guestCount * rate + tier.registrationPrice + masterclassAmt + extrasAmt
    } else {
      return
    }

    await tx.order.update({ where: { id: orderId }, data: { totalPrice } })
  })
}
