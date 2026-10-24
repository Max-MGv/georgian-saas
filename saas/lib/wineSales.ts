import type { Prisma } from '@prisma/client'
import { NOT_ABANDONED, NOT_CANCELLED } from '@/lib/orderFilters'
import { wineLineAmount } from '@/lib/winePricing'

/**
 * Wine sold, across every place it is sold (T-22, vault/Plan-AddOnsAndWine.md §4.6) — the ONE reader of "wine sold".
 *
 * Wine reaches the winery's books three ways, and a bottle line (WineOrderItem) belongs to a wine order OR to a booking:
 *  - `order`  : a wine order (B2B delivery / pickup)                       — dated by createdAt, as before.
 *  - `guest`  : a wine order recorded from a visit (sourceOrderId set)       — a guest bought bottles on the day.
 *  - `table`  : wine for the table, a line on a booking (invoice includes it) — dated by the VISIT day.
 * Anything that reports wine sold reads this, never WineOrderItem directly, or it silently misses a source
 * (MaintenanceNotes §40). Amounts are tetri and are each line's own `lineTotal` — nobody multiplies a price by a quantity again.
 *
 * Booking revenue and wine revenue overlap by design (table wine is inside a booking's total): the statistics never add the two.
 * Each parent's own exclusion rule applies — abandoned checkouts and cancelled orders are not sales.
 */
export type WineSaleSource = 'order' | 'guest' | 'table'

export type WineSaleLine = {
  /** Vintage id (so two languages / a renamed wine stay one wine); the snapshot label when the vintage is gone. */
  id: string
  name: string
  quantity: number
  /** Tetri this line cost. */
  amount: number
}

export type WineSale = {
  /** The wine order's id, or the booking's id for table wine. */
  id: string
  source: WineSaleSource
  customer: string
  /** ISO. createdAt for wine orders, the visit day (noon UTC, so no time zone moves it) for table wine. */
  date: string
  /** Delivery stage of a wine order; null for table wine (nothing is delivered). */
  stage: string | null
  lines: WineSaleLine[]
  /** Sum of the lines, tetri. */
  amount: number
  /** For a guest purchase: the booking it came from. */
  bookingId: string | null
}

/**
 * What to select on a booking to know the wine around it — spread into an `include`/`select` of `order.findMany`, then read with
 * `bookingWine()`. This (with loadWineSales) is the only place that knows a booking's wine comes from two parents.
 */
export const BOOKING_WINE_SELECT = {
  wineLines: { select: { quantity: true, priceSnapshot: true, lineTotal: true } },
  guestPurchases: {
    where: { abandonedAt: null, stage: { not: 'CANCELLED' as const } },
    select: { totalAmount: true, discountPercent: true, wineItems: { select: { quantity: true, priceSnapshot: true, lineTotal: true } } },
  },
} as const

type LineAmountInput = { quantity: number; priceSnapshot: number; lineTotal: number | null }

/** Tetri of wine for the table on a booking (inside its total), and of guest purchases from its visit (outside it). */
export function bookingWine(o: {
  wineLines: LineAmountInput[]
  guestPurchases: { totalAmount: number | null; discountPercent: number | null; wineItems: LineAmountInput[] }[]
}): { tableWine: number; guestWine: number } {
  return {
    tableWine: o.wineLines.reduce((s, l) => s + wineLineAmount(l), 0),
    guestWine: o.guestPurchases.reduce((s, p) => s + (p.totalAmount ?? p.wineItems.reduce((t, l) => t + wineLineAmount(l, p.discountPercent), 0)), 0),
  }
}

type Reader = Pick<Prisma.TransactionClient, 'wineOrder' | 'order'>

export async function loadWineSales(
  tx: Reader,
  tenantId: string,
  opts: { wineOrders: boolean; bookings: boolean; individualLabel: string },
): Promise<WineSale[]> {
  const lineOf = (i: { wineVintageId: string | null; id: string; wineNameSnapshot: string; vintageYearSnapshot: number; quantity: number; priceSnapshot: number; lineTotal: number | null }, pct?: number | null): WineSaleLine => ({
    id: i.wineVintageId ?? `${i.wineNameSnapshot}|${i.vintageYearSnapshot}`,
    name: `${i.wineNameSnapshot} ${i.vintageYearSnapshot}`,
    quantity: i.quantity,
    amount: wineLineAmount(i, pct),
  })

  const [wineOrders, bookings] = await Promise.all([
    opts.wineOrders
      ? tx.wineOrder.findMany({
          where: { tenantId, ...NOT_ABANDONED, ...NOT_CANCELLED },
          include: { wineItems: true },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    // Table wine only exists where bookings and wine are both on; a booking without wine lines is skipped in the query.
    opts.bookings && opts.wineOrders
      ? tx.order.findMany({
          where: { tenantId, ...NOT_ABANDONED, ...NOT_CANCELLED, wineLines: { some: {} } },
          include: { wineLines: true, company: { select: { name: true } } },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([]),
  ])

  const sales: WineSale[] = []
  for (const o of wineOrders) {
    const lines = o.wineItems.map(i => lineOf(i, o.discountPercent))
    sales.push({
      id: o.id,
      source: o.sourceOrderId ? 'guest' : 'order',
      customer: o.businessName,
      date: o.createdAt.toISOString(),
      stage: o.stage,
      lines,
      // The stored order total when it has one (it is the wines only — delivery is kept apart), else the lines.
      amount: o.totalAmount ?? lines.reduce((s, l) => s + l.amount, 0),
      bookingId: o.sourceOrderId ?? null,
    })
  }
  for (const b of bookings) {
    const lines = b.wineLines.map(i => lineOf(i))
    const day = new Date(b.date)
    sales.push({
      id: b.id,
      source: 'table',
      customer: b.bookingType === 'COMPANY' && b.company ? b.company.name : opts.individualLabel,
      date: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12)).toISOString(),
      stage: null,
      lines,
      amount: lines.reduce((s, l) => s + l.amount, 0),
      bookingId: b.id,
    })
  }
  return sales
}
