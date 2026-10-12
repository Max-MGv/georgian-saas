import { applyPercent, asTetri, type Tetri } from '@/lib/money'

/**
 * What a wine order's bottles cost (T-12, vault/Plan-WineOrderFeatures.md Chunk 9) — the one
 * place this is worked out, for the public form, the admin form and both server write paths.
 * Pure and client-safe. Tetri throughout.
 *
 * Max's rules (2026-10-12):
 * - A **negotiated** price (CompanyWinePrice) replaces the standard price for that vintage, and
 *   the company's % discount is **not** applied on top of it.
 * - Every other vintage is the standard price, and the company's % applies to those lines.
 *
 * The % is applied once to the sum of the standard lines (not per line), exactly as the single-%
 * total was always computed (`applyPercent(subtotal, %)`), so an order with no negotiated prices
 * totals to the same tetri it did before T-12.
 */
export type PricedLineInput = { vintageId: string; quantity: number; standardPrice: number }

export type PricedLine = PricedLineInput & {
  /** Per bottle, before the company % (which only touches standard lines). */
  unitPrice: number
  negotiated: boolean
}

export type WinePricing = {
  lines: PricedLine[]
  /** Sum of the negotiated lines — no % on these. */
  negotiatedTotal: Tetri
  /** Sum of the standard lines, before the %. */
  standardSubtotal: Tetri
  /** The % actually applied (null when it applies to nothing). */
  discountPercent: number | null
  /** Wines total: negotiated + standard less the %. This is WineOrder.totalAmount. */
  total: Tetri
}

export function priceWineOrder(
  lines: PricedLineInput[],
  negotiated: Record<string, number>,
  discountPercent: number | null
): WinePricing {
  const priced = lines.map(l => {
    const n = negotiated[l.vintageId]
    return { ...l, unitPrice: n ?? l.standardPrice, negotiated: n !== undefined }
  })
  const negotiatedTotal = asTetri(priced.filter(l => l.negotiated).reduce((s, l) => s + l.unitPrice * l.quantity, 0))
  const standardSubtotal = asTetri(priced.filter(l => !l.negotiated).reduce((s, l) => s + l.unitPrice * l.quantity, 0))
  const pct = discountPercent && discountPercent > 0 && standardSubtotal > 0 ? Math.min(discountPercent, 100) : null
  const standardTotal = pct ? applyPercent(standardSubtotal, pct) : standardSubtotal
  return {
    lines: priced,
    negotiatedTotal,
    standardSubtotal,
    discountPercent: pct,
    total: asTetri(negotiatedTotal + standardTotal),
  }
}
