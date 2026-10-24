/**
 * What "booking revenue" counts (T-22, vault/Plan-AddOnsAndWine.md §4.6, D-8) — a three-level switch on the Orders revenue strip and
 * the booking statistics, so wine sold around a visit is never silently mixed into (or missing from) the number someone is reading:
 *
 *  - `visit` : the booking without any wine — what the visit itself (guests, add-ons, extras) earned.
 *  - `table` : + wine for the table, which IS on the booking's invoice and total. This is what every booking figure meant before
 *              wine existed on bookings, and what an invoice says — so it is the default.
 *  - `guest` : + guest purchases from the visit (bottles guests bought on the day; separate wine orders, NOT on the invoice).
 *
 * Booking revenue and wine revenue overlap by design (table wine is inside a booking's total and also in the wine statistics), so
 * nothing ever adds the two statistics together — this switch is the only place the two meet, and it says which is included.
 * Pure and client-safe; the amounts come from lib/wineSales.ts (bookingWine).
 */
export const REVENUE_LEVELS = ['visit', 'table', 'guest'] as const
export type RevenueLevel = (typeof REVENUE_LEVELS)[number]
export const DEFAULT_REVENUE_LEVEL: RevenueLevel = 'table'

export function parseRevenueLevel(v: unknown): RevenueLevel {
  return (REVENUE_LEVELS as readonly unknown[]).includes(v) ? (v as RevenueLevel) : DEFAULT_REVENUE_LEVEL
}

/** A booking's revenue at a level, tetri. `totalPrice` is the invoiced total (already includes table wine). */
export function revenueAt(level: RevenueLevel, o: { totalPrice: number; tableWine: number; guestWine: number }): number {
  if (level === 'visit') return o.totalPrice - o.tableWine
  if (level === 'guest') return o.totalPrice + o.guestWine
  return o.totalPrice
}
