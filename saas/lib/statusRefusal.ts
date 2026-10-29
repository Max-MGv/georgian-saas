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
  /** `reopenedPaid`: a cancelled order was reopened and, because card money already covers it, marked Paid again. */
  | { success: true; reopenedPaid?: true }
  | { error: string; code?: StatusRefusalCode }

/**
 * A change arrives from the browser, so its shape is checked at runtime, not trusted from the type:
 * a truthy non-boolean `value` (e.g. 1) would slip past the "=== true" refusals below while the write
 * path treats it as true, and an unknown `kind` would fall through to "clear abandonedAt".
 * Returns an error string, or null when the change is well-formed.
 */
export function malformedChange(change: { kind?: unknown; value?: unknown }, kinds: readonly string[]): string | null {
  if (typeof change?.kind !== 'string' || !kinds.includes(change.kind)) return 'Unknown status.'
  if ((change.kind === 'paid' || change.kind === 'invoiceSent') && typeof change.value !== 'boolean') return 'Unknown status.'
  return null
}

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
