/**
 * Why a status change was refused — T-318 (R2).
 *
 * The server actions `changeBookingStatus` / `changeWineOrderStatus` return a
 * `code` beside their English `error`, so a screen can show the reason in the
 * admin's own language instead of the raw string (or, as before, nothing at
 * all). Lives in lib/, not in an `app/actions/*` file: a `'use server'` module
 * may export async functions only (MaintenanceNotes §24).
 *
 * - `NO_PRICE`        — the total is not set (booking) or the wines come to 0 (wine order).
 * - `NOTHING_TO_PAY`  — a booking whose total is set and is exactly 0 ₾ (Q-12).
 */
export type StatusRefusalCode = 'NO_PRICE' | 'NOTHING_TO_PAY'

export type StatusChangeResult =
  | { success: true }
  | { error: string; code?: StatusRefusalCode }

/**
 * Whether a booking's total allows a payment / invoice step.
 * `null` total = price not set yet; 0 = genuinely free (Q-11 / Q-12).
 */
export function bookingMoneyRefusal(
  totalPrice: number | null,
  change: { kind: string; value?: boolean },
): { error: string; code: StatusRefusalCode } | null {
  const takesMoney = change.kind === 'paid' || change.kind === 'invoiceSent'
  if (!takesMoney || change.value !== true) return null
  if (totalPrice == null) {
    // An invoice on an unpriced booking is allowed today (the invoice flow has its
    // own checks); only "Paid" is blocked for it.
    return change.kind === 'paid' ? { error: 'Set the price first.', code: 'NO_PRICE' } : null
  }
  if (totalPrice === 0) return { error: 'Nothing to pay on this booking.', code: 'NOTHING_TO_PAY' }
  return null
}

/** A wine order is "paid" for wines + delivery fee; nothing priced = nothing to mark. */
export function wineMoneyRefusal(
  amountDue: number | null,
  change: { kind: string; value?: boolean },
): { error: string; code: StatusRefusalCode } | null {
  if (change.kind !== 'paid' || change.value !== true) return null
  return amountDue == null || amountDue <= 0 ? { error: 'Set the price first.', code: 'NO_PRICE' } : null
}
