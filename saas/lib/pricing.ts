import { withTenantDb } from '@/lib/db'
import { priceBooking, ratesForParty, ratesFromSnapshot } from '@/lib/pricingUtils'

/**
 * Recompute an order's total after its lines change.
 *
 * **Prices come from the order's own snapshot, not from the company's current
 * tiers.** That is the whole point of this module since chunk 4 (2026-09-18):
 * it used to re-read the live `Price` rows, so changing a company's rates in
 * March and then adding a ₾20 extra to their February booking silently
 * re-priced the entire booking at March rates. Nobody would have seen it
 * happen — the total simply became a different number.
 *
 * All amounts are tetri, and integer arithmetic keeps them there.
 */
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

    const guests = {
      guestCount: order.guestCount,
      tastingGuests: order.tastingGuestCount,
      lunchGuests: order.lunchGuestCount,
    }
    const lines = { masterclass: masterclassAmt, extras: extrasAmt }

    // ── The normal path: price from what this order was actually sold at ──────
    const snapshotRates = ratesFromSnapshot(order)
    if (snapshotRates) {
      await tx.order.update({
        where: { id: orderId },
        data: { totalPrice: priceBooking(snapshotRates, guests, order.visitType, lines) },
      })
      return
    }

    // ── Fallback: orders predating the snapshot columns ──────────────────────
    // Keeps the old live-tier behaviour rather than refusing to recalculate,
    // but says so, because this is the path that can reprice a booking.
    console.warn(
      `[pricing] order ${orderId} has no rate snapshot — falling back to the company's current tiers, ` +
        `which may reprice it if those tiers have changed since the booking was made`
    )

    const prices = order.company?.prices ?? []
    if (prices.length === 0) {
      console.warn(
        `[pricing] order ${orderId}: no snapshot and no company tiers; total left unchanged`
      )
      return
    }

    // The tier comes from the party size, so this is one lookup rather than the
    // two branches it used to be (2026-09-19 — see pricingUtils.ratesForParty).
    const liveRates = ratesForParty(prices, order.guestCount)
    if (!liveRates) {
      // Previously a bare `return` — a silent no-op that left the total
      // untouched and gave the caller no reason to think anything had gone
      // wrong. It still cannot invent a price, but it no longer hides.
      console.warn(
        `[pricing] order ${orderId}: no price tier matches a party of ${order.guestCount}; total left unchanged`
      )
      return
    }

    await tx.order.update({
      where: { id: orderId },
      data: { totalPrice: priceBooking(liveRates, guests, order.visitType, lines) },
    })
  })
}
