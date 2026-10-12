import { asTetri, type Tetri } from '@/lib/money'

/**
 * What a wine order's customer owes, in one place (T-8, vault/Plan-WineOrderFeatures.md).
 *
 * Max's rule (2026-10-12): `WineOrder.totalAmount` stays the **wines** total — statistics and
 * packing read it as wine revenue — and `deliveryFee` sits beside it. Every surface that shows
 * or charges "the total" (checkout, cards, emails, CSV) goes through these, so no screen adds
 * the two by hand and drifts — MaintenanceNotes §22's nine-price-sites lesson, applied early.
 */
export type WineOrderMoneyFields = {
  totalAmount: number | null
  deliveryFee: number | null
}

/** Wines + delivery fee. Null only when there is no wines total at all. */
export function wineOrderAmountDue(order: WineOrderMoneyFields): Tetri | null {
  if (order.totalAmount === null) return null
  return asTetri(order.totalAmount + (order.deliveryFee ?? 0))
}
