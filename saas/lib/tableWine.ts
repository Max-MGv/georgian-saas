// ─── Wine for the table: validate and price the bottles added to a booking (T-22) ───────────────────────────
//
// ONE function for every write path that stores wine on a booking — the public form (`createBooking`), the admin New Order
// (`createOrderAdmin`) and the order page's add / change actions — so they cannot price it differently, and so none of them
// takes a price, a name or a discount from the browser. The rules are the wine order's (lib/winePricing.ts):
//   * only a wine the winery switched on for bookings (`bookable`), active, in an active wine;
//   * the company's agreed price replaces the standard one, its % applies to the rest — but ONLY for a company the caller has
//     already proven (access code on the public form; trusted on admin screens). An individual, or a company that was merely
//     named, pays the website price (Plan-AddOnsAndWine E13 / MaintenanceNotes §35);
//   * each line is rounded on its own (C-1) and carries what it cost.
//
// Server-only: takes the caller's transaction.

import type { TxClient } from '@/lib/db'
import { priceWineOrder, type PricedLine } from '@/lib/winePricing'
import { wineDisplayName } from '@/lib/wineName'

/** Whole bottles per line, 1…999 (the forms stop at far less; this is the crafted-request bound). */
export const MAX_TABLE_BOTTLES = 999

export type TableWineError = 'not_a_list' | 'bad_quantity' | 'duplicate' | 'unavailable'

/** A stored-ready line: everything `WineOrderItem` needs for a booking, minus the parent. */
export type TableWineRow = {
  wineVintageId: string
  wineNameSnapshot: string
  vintageYearSnapshot: number
  priceSnapshot: number
  quantity: number
  negotiated: boolean
  discountPercent: number | null
  lineTotal: number
}

export async function priceTableWine(
  tx: TxClient,
  tenantId: string,
  args: {
    /** What the request said: [{ vintageId, quantity }]. Anything else is refused. */
    lines: unknown
    /** The company whose terms apply — pass it ONLY once the caller has proven it. null = website prices. */
    termsCompanyId: string | null
    /** The language the wine's name is stored in (the guest's; admin screens pass 'en'). */
    locale: string
  },
): Promise<{ ok: true; rows: TableWineRow[]; total: number } | { ok: false; error: TableWineError }> {
  if (args.lines === undefined || args.lines === null) return { ok: true, rows: [], total: 0 }
  if (!Array.isArray(args.lines)) return { ok: false, error: 'not_a_list' }
  const wanted: { vintageId: string; quantity: number }[] = []
  const seen = new Set<string>()
  for (const raw of args.lines as { vintageId?: unknown; quantity?: unknown }[]) {
    const vintageId = typeof raw?.vintageId === 'string' ? raw.vintageId : ''
    const q = raw?.quantity
    if (!vintageId) return { ok: false, error: 'unavailable' }
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_TABLE_BOTTLES) return { ok: false, error: 'bad_quantity' }
    if (seen.has(vintageId)) return { ok: false, error: 'duplicate' }
    seen.add(vintageId)
    wanted.push({ vintageId, quantity: q })
  }
  if (wanted.length === 0) return { ok: true, rows: [], total: 0 }

  const ids = wanted.map(w => w.vintageId)
  const [vintages, company] = await Promise.all([
    tx.wineVintage.findMany({
      where: { id: { in: ids }, tenantId, active: true, bookable: true, wine: { active: true } },
      select: { id: true, price: true, year: true, wine: { select: { name: true, nameKa: true } } },
    }),
    args.termsCompanyId
      ? tx.company.findFirst({
          where: { id: args.termsCompanyId, tenantId },
          select: { wineDiscountPercent: true, winePrices: { where: { wineVintageId: { in: ids } }, select: { wineVintageId: true, price: true } } },
        })
      : Promise.resolve(null),
  ])
  const byId = new Map(vintages.map(v => [v.id, v]))
  if (wanted.some(w => !byId.has(w.vintageId))) return { ok: false, error: 'unavailable' }

  const pricing = priceWineOrder(
    wanted.map(w => ({ vintageId: w.vintageId, quantity: w.quantity, standardPrice: byId.get(w.vintageId)!.price })),
    Object.fromEntries((company?.winePrices ?? []).map(p => [p.wineVintageId, p.price])),
    company?.wineDiscountPercent ?? null,
  )
  const rows = pricing.lines.map((l: PricedLine) => {
    const v = byId.get(l.vintageId)!
    return {
      wineVintageId: l.vintageId,
      wineNameSnapshot: wineDisplayName(v.wine, args.locale),
      vintageYearSnapshot: v.year,
      priceSnapshot: l.unitPrice,
      quantity: l.quantity,
      negotiated: l.negotiated,
      discountPercent: l.discountPercent,
      lineTotal: l.lineTotal,
    }
  })
  return { ok: true, rows, total: pricing.total }
}
