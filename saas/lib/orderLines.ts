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

/** A stored add-on line as the database returns it: its own snapshots, plus the (possibly deleted) item. */
export type StoredAddOnLine = {
  nameSnapshot?: string | null
  nameKaSnapshot?: string | null
  unitSnapshot?: 'PER_PERSON' | 'PER_PIECE' | 'FLAT' | null
  groupNameSnapshot?: string | null
  groupNameKaSnapshot?: string | null
  masterclassItem?: { name: string; nameKa?: string | null; unitType: 'PER_PERSON' | 'PER_PIECE' | 'FLAT' } | null
}

/**
 * What a stored add-on line was called and how it is charged — read from the line's own snapshot first (so renaming
 * or deleting the item later never rewrites an invoice, Plan-AddOnsAndWine E5 / KnownBugs #94), then from the item.
 * A line that has neither (written by pre-T-7 code after its item was deleted) reads as "Removed add-on".
 */
export function lineIdentity(l: StoredAddOnLine): {
  name: string
  nameKa: string | null
  unit: 'PER_PERSON' | 'PER_PIECE' | 'FLAT'
  groupName: string | null
  groupNameKa: string | null
} {
  return {
    name: l.nameSnapshot ?? l.masterclassItem?.name ?? 'Removed add-on',
    nameKa: l.nameKaSnapshot ?? l.masterclassItem?.nameKa ?? null,
    unit: l.unitSnapshot ?? l.masterclassItem?.unitType ?? 'PER_PIECE',
    groupName: l.groupNameSnapshot ?? null,
    groupNameKa: l.groupNameKaSnapshot ?? null,
  }
}

/** The lines of an order (or of a draft that looks like one), added up the way `priceCounts` wants them. */
export function lineTotals(o: { masterclassLines: readonly QuantityLine[]; extras: readonly AmountLine[] }): LineTotals {
  return { masterclass: sumQuantityLines(o.masterclassLines), extras: sumAmountLines(o.extras) }
}
