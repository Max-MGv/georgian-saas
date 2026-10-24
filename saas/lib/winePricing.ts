import { applyPercent, asTetri, type Tetri } from '@/lib/money'

/**
 * What a bottle order costs (T-12, vault/Plan-WineOrderFeatures.md Chunk 9; per-line since T-22) — the one place this is
 * worked out, for the public form, the admin form, both wine-order write paths AND wine for the table on bookings
 * (vault/Plan-AddOnsAndWine.md). Pure and client-safe. Tetri throughout.
 *
 * Max's rules (2026-10-12):
 * - A **negotiated** price (CompanyWinePrice) replaces the standard price for that vintage, and
 *   the company's % discount is **not** applied on top of it.
 * - Every other vintage is the standard price, and the company's % applies to those lines.
 *
 * Rounding (Max, 2026-10-24, C-1 "all as recommended"): **per line.** Each line is `quantity × price`, less the % when it is a
 * standard line, rounded to whole tetri on its own; the order's wines total is the sum of its lines. So a bottle line can be
 * shown, invoiced and counted in the statistics as exactly what it cost, and a wine order and the same wine on a booking can
 * never calculate differently. Before this the % was taken once on the sum of the standard lines, so an order's total could
 * differ by up to a tetri per line from this (the lines of orders already placed were backfilled to add up to their stored total).
 */
export type PricedLineInput = { vintageId: string; quantity: number; standardPrice: number }

export type PricedLine = PricedLineInput & {
  /** Per bottle, before the company % (which only touches standard lines). */
  unitPrice: number
  negotiated: boolean
  /** The % taken off THIS line (null on a negotiated line, or when the company has none). */
  discountPercent: number | null
  /** What this line costs, whole tetri, rounded on its own. */
  lineTotal: number
}

export type WinePricing = {
  lines: PricedLine[]
  /** Sum of the negotiated lines — no % on these. */
  negotiatedTotal: Tetri
  /** Sum of the standard lines, before the %. */
  standardSubtotal: Tetri
  /** The % actually applied (null when it applies to nothing). */
  discountPercent: number | null
  /** Wines total: the sum of the line totals. This is WineOrder.totalAmount. */
  total: Tetri
}

export function priceWineOrder(
  lines: PricedLineInput[],
  negotiated: Record<string, number>,
  discountPercent: number | null
): WinePricing {
  const hasPrice = (id: string) => Object.prototype.hasOwnProperty.call(negotiated, id)
  const base = lines.map(l => ({ ...l, unitPrice: hasPrice(l.vintageId) ? negotiated[l.vintageId]! : l.standardPrice, negotiated: hasPrice(l.vintageId) }))
  const standardSubtotal = asTetri(base.filter(l => !l.negotiated).reduce((s, l) => s + l.unitPrice * l.quantity, 0))
  const negotiatedTotal = asTetri(base.filter(l => l.negotiated).reduce((s, l) => s + l.unitPrice * l.quantity, 0))
  const pct = discountPercent && discountPercent > 0 && standardSubtotal > 0 ? Math.min(discountPercent, 100) : null
  const priced: PricedLine[] = base.map(l => {
    const gross = asTetri(l.unitPrice * l.quantity)
    const linePct = !l.negotiated && pct ? pct : null
    return { ...l, discountPercent: linePct, lineTotal: linePct ? applyPercent(gross, linePct) : gross }
  })
  return {
    lines: priced,
    negotiatedTotal,
    standardSubtotal,
    discountPercent: pct,
    total: asTetri(priced.reduce((s, l) => s + l.lineTotal, 0)),
  }
}

/**
 * What a stored line costs at another quantity, on the terms it was sold on (its own bottle price, agreed or not, and its %),
 * rounded exactly as when it was added. Used where a quantity is changed in place (order page, T-22).
 */
export function wineLineTotalFor(l: { priceSnapshot: number; negotiated: boolean; discountPercent: number | null }, quantity: number): number {
  const gross = asTetri(quantity * l.priceSnapshot)
  return !l.negotiated && l.discountPercent ? applyPercent(gross, l.discountPercent) : gross
}

/**
 * What a stored wine line cost: its own `lineTotal` when it has one, else bottle price × quantity less the order's % (a line
 * nothing has written since the T-22 migration — every existing line was backfilled, so this is only a safety net).
 */
export function wineLineAmount(
  l: { quantity: number; priceSnapshot: number; lineTotal?: number | null },
  orderDiscountPercent?: number | null,
): number {
  if (l.lineTotal != null) return l.lineTotal
  const gross = asTetri(l.quantity * l.priceSnapshot)
  return orderDiscountPercent && orderDiscountPercent > 0 ? applyPercent(gross, Math.min(orderDiscountPercent, 100)) : gross
}
