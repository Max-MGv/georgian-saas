import { withTenantDb } from '@/lib/db'
import { countsOf, notOffered, priceCounts, ratesForCounts, ratesFromProductSnapshot } from '@/lib/pricingUtils'
import { lineTotals } from '@/lib/orderLines'

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
 * Since Plan-PricingModel Chunk 7 (2026-10-21) this is the product model: the order's
 * four boxes × its three frozen product rates (`priceCounts`), so a Lunch only order
 * prices correctly. Every existing order re-prices to its stored total this way
 * (scripts/test-pricing-model.ts equivalence: dev 428/428, prod 2/2).
 *
 * All amounts are tetri, and integer arithmetic keeps them there.
 *
 * `linesDelta` — how much the line that was just added (+) or removed (−) is worth. It is used only by an order
 * with no frozen rates AND no price table (a "price later" order, or an old one): its total then moves by exactly
 * that amount instead of staying put — before the blind review of Chunk 11 such an order kept its old total, so a
 * ₾20 extra was never billed. Moving by the delta, not recomputing "total = lines", keeps any base price an old
 * order carries.
 */
export async function recalcOrderTotal(orderId: string, tenantId: string, linesDelta?: number): Promise<void> {
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

    const lines = lineTotals(order)
    const { masterclass: masterclassAmt, extras: extrasAmt } = lines

    const counts = countsOf(order)

    // ── The normal path: price from what this order was actually sold at ──────
    const snapshotRates = ratesFromProductSnapshot(order)
    if (snapshotRates) {
      const missing = notOffered(snapshotRates, counts)
      if (missing.length) {
        // A box with guests but no frozen rate cannot be priced; never invent ₾0 for it.
        console.warn(`[pricing] order ${orderId}: no frozen rate for ${missing.join(', ')}; total left unchanged`)
        return
      }
      await tx.order.update({
        where: { id: orderId },
        data: { totalPrice: priceCounts(snapshotRates, counts, lines) },
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
      if (linesDelta != null && linesDelta !== 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { totalPrice: Math.max(0, (order.totalPrice ?? 0) + linesDelta) },
        })
        return
      }
      console.warn(
        `[pricing] order ${orderId}: no snapshot and no company tiers; total left unchanged`
      )
      return
    }

    // Each product looks up its own row by its own count (Plan-PricingModel D-2).
    const liveRates = ratesForCounts(prices, counts, order.company?.isIndividual ? 0 : order.company?.registrationFee ?? 0)
    const missing = notOffered(liveRates, counts)
    if (missing.length) {
      // Previously a bare `return` — a silent no-op that left the total
      // untouched and gave the caller no reason to think anything had gone
      // wrong. It still cannot invent a price, but it no longer hides.
      console.warn(`[pricing] order ${orderId}: the company's tiers do not price ${missing.join(', ')}; total left unchanged`)
      return
    }

    await tx.order.update({
      where: { id: orderId },
      data: { totalPrice: priceCounts(liveRates, counts, lines) },
    })
  })
}
