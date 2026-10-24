// ─── Line sums — the ONE place that adds up what is on top of a booking's visit price ──────────────────────
//
// A booking's total is  visit price (priceCounts)  +  masterclass / add-on lines  +  extras.  Before this file
// every screen, action and document added those lines up by hand (14 copies of `l.quantity * l.pricePerUnit`),
// so adding a new kind of line (add-ons, table wine — Plan-AddOnsAndWine, T-7 / T-22) would have meant finding
// all of them, and a missed copy is a silent wrong total on an invoice.
//
// A new kind of line is added HERE (and to LineTotals in pricingUtils.ts) or it is missed everywhere at once.
// See vault/MaintenanceNotes.md §38.

import type { LineTotals } from '@/lib/pricingUtils'

/** One priced line: a unit price in tetri and how many. Masterclass / add-on lines have this shape. */
export type QuantityLine = { quantity: number; pricePerUnit: number }

/** One extra charge: a typed label and an amount in tetri. */
export type AmountLine = { amount: number }

/** What one line costs, tetri. */
export const lineAmount = (l: QuantityLine): number => l.quantity * l.pricePerUnit

/** Sum of masterclass / add-on lines, tetri. */
export const sumQuantityLines = (lines: readonly QuantityLine[]): number =>
  lines.reduce((sum, l) => sum + lineAmount(l), 0)

/** Sum of extra charges, tetri. */
export const sumAmountLines = (lines: readonly AmountLine[]): number =>
  lines.reduce((sum, e) => sum + e.amount, 0)

/** The lines of an order (or of a draft that looks like one), added up the way `priceCounts` wants them. */
export function lineTotals(o: { masterclassLines: readonly QuantityLine[]; extras: readonly AmountLine[] }): LineTotals {
  return { masterclass: sumQuantityLines(o.masterclassLines), extras: sumAmountLines(o.extras) }
}
