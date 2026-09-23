/**
 * How a status change becomes columns (Feature 191).
 *
 * One place, rather than the same rules inlined at the server action, the
 * optimistic client update and the seed scripts — which is how those three
 * drift, and an optimistic mirror is exactly where drift is invisible.
 *
 * Pure and DB-free, so the client can apply the same patch the server is about
 * to write and see the flow-line move before the round trip.
 *
 * Replaces `lib/statusBridge.ts`, which translated a legacy single-column
 * status into two axes. There is no legacy column left to translate from.
 */
import type { BookingStage, WineOrderStage } from '@prisma/client'
import { BOOKING_STAGES, WINE_ORDER_STAGES } from '@/lib/statusFlow'

/** What a patch needs to know about the row, so it can preserve rather than re-stamp. */
export type CurrentDates = {
  confirmedAt: Date | null
  /** `completedAt` on a booking, `deliveredAt` on a wine order. */
  finishedAt: Date | null
  invoiceSentAt?: Date | null
  paidAt: Date | null
}

export type StagePatch = {
  confirmedAt?: Date | null
  completedAt?: Date | null
  deliveredAt?: Date | null
}

/**
 * Runtime guards. A stage arrives from a dropdown as a string, and TypeScript
 * cannot stop a wrong one at runtime — which is the exact shape of the bug this
 * whole redesign was opened for: an unvalidated `status: string` that neither
 * the app nor the database rejected.
 *
 * Postgres would now also refuse an invalid enum value, so this is the second
 * of two nets rather than the only one. It exists to turn that into a friendly
 * error instead of a 500.
 */
export function isBookingStage(v: string): v is BookingStage {
  return (BOOKING_STAGES as readonly string[]).includes(v)
}

export function isWineOrderStage(v: string): v is WineOrderStage {
  return (WINE_ORDER_STAGES as readonly string[]).includes(v)
}

/**
 * The stage columns for a booking moving to `stage`.
 *
 * Three rules, each deliberate:
 *
 * 1. **An existing date is never re-stamped.** Re-confirming an order keeps the
 *    moment it was really confirmed; otherwise the date drifts forward every
 *    time someone touches the row.
 * 2. **Moving backwards clears what you moved back past.** Undoing a completion
 *    has to remove `completedAt`, or the row keeps claiming a completion that
 *    was taken back — and the flow-line would draw a date beside a step it also
 *    shows as not done.
 * 3. **Cancelling touches no dates at all.** A cancelled order that was
 *    delivered was still delivered, and one that was paid was still paid.
 *    Cancelling is an exit from the flow, not a rewrite of what happened.
 */
export function bookingStagePatch(
  stage: BookingStage,
  current: CurrentDates,
  now: Date
): StagePatch & { stage: BookingStage } {
  switch (stage) {
    case 'NEW':
      return { stage, confirmedAt: null, completedAt: null }
    case 'CONFIRMED':
      return { stage, confirmedAt: current.confirmedAt ?? now, completedAt: null }
    case 'COMPLETED':
      return { stage, completedAt: current.finishedAt ?? now }
    case 'CANCELLED':
      return { stage }
  }
}

/** The wine-order equivalent. DELIVERED where a booking says COMPLETED. */
export function wineOrderStagePatch(
  stage: WineOrderStage,
  current: CurrentDates,
  now: Date
): StagePatch & { stage: WineOrderStage } {
  switch (stage) {
    case 'NEW':
      return { stage, confirmedAt: null, deliveredAt: null }
    case 'CONFIRMED':
      return { stage, confirmedAt: current.confirmedAt ?? now, deliveredAt: null }
    case 'DELIVERED':
      return { stage, deliveredAt: current.finishedAt ?? now }
    case 'CANCELLED':
      return { stage }
  }
}

/**
 * Marking an order paid, or reversing that.
 *
 * Reversing nulls the date and nothing else. Under the previous design this was
 * a genuine dilemma — the financial status had to move to *some* other rung,
 * and whichever you picked lost information. Independent dates have no such
 * problem: `invoiceSentAt` is untouched, so reversing a payment still leaves
 * the record that an invoice was sent.
 *
 * `abandonedAt` is cleared because money arriving is the clearest possible
 * evidence that the order was not abandoned — and the database enforces it
 * (`Order_abandoned_is_unpaid`), so a paid write that left it set would fail.
 */
export function paidPatch(paid: boolean, current: CurrentDates, now: Date) {
  return paid
    ? { paidAt: current.paidAt ?? now, abandonedAt: null }
    : { paidAt: null }
}

/** Sending an invoice, or reversing that. Says nothing about the stage. */
export function invoiceSentPatch(sent: boolean, current: CurrentDates, now: Date) {
  return { invoiceSentAt: sent ? (current.invoiceSentAt ?? now) : null }
}

/** A fresh order: at the start, nothing paid, not abandoned. */
export const NEW_ORDER_COLUMNS = { stage: 'NEW' } as const

/**
 * Columns for a row being seeded at a known stage, where there is no prior row
 * to preserve and the dates should sit near the order's own `createdAt` rather
 * than at the moment the seed script ran.
 */
export function seedStageColumns(
  kind: 'booking',
  stage: BookingStage,
  at: Date
): { stage: BookingStage; confirmedAt: Date | null; completedAt: Date | null }
export function seedStageColumns(
  kind: 'wineOrder',
  stage: WineOrderStage,
  at: Date
): { stage: WineOrderStage; confirmedAt: Date | null; deliveredAt: Date | null }
export function seedStageColumns(kind: 'booking' | 'wineOrder', stage: string, at: Date) {
  const empty: CurrentDates = { confirmedAt: null, finishedAt: null, paidAt: null }
  if (kind === 'booking') {
    const p = bookingStagePatch(stage as BookingStage, empty, at)
    return { stage: p.stage, confirmedAt: p.confirmedAt ?? null, completedAt: p.completedAt ?? null }
  }
  const p = wineOrderStagePatch(stage as WineOrderStage, empty, at)
  return { stage: p.stage, confirmedAt: p.confirmedAt ?? null, deliveredAt: p.deliveredAt ?? null }
}

/**
 * Every hand-made change to an order's status, as one tagged union per order
 * type.
 *
 * Defined HERE and not beside the server action that takes it: a `'use server'`
 * file may export async functions and nothing else, not even a type. Exporting
 * one leaves a dangling reference that crashes every action in the same bundle
 * at module load — MaintenanceNotes §24 / KnownBugs #33.
 *
 * `stage` is a bare `string` rather than the enum on purpose. It arrives from a
 * dropdown and is a string at runtime whatever the call site's type says, so
 * the action narrows it with `isBookingStage` / `isWineOrderStage` before use.
 * Typing it as the enum here would hide exactly the assumption that caused the
 * original bug.
 *
 * `restore` is the way back out of the abandoned list, for someone who never
 * completed card checkout and then paid another way or turned up anyway.
 *
 * `method` only applies when `value` is true — how the admin says the money
 * actually arrived (CARD is never hand-picked; that's only ever set by a real
 * Flitt settlement, see lib/payments/settle.ts). Omitted, it falls back to
 * MANUAL in recordManualPayment — for a caller that was never asked how the
 * money arrived.
 */
export type BookingStatusChange =
  | { kind: 'stage'; stage: string }
  | { kind: 'paid'; value: boolean; method?: 'BANK_TRANSFER' | 'CASH' }
  | { kind: 'invoiceSent'; value: boolean }
  | { kind: 'restore' }

/** The wine-order equivalent. No invoice-send flow exists for wine orders. */
export type WineOrderStatusChange =
  | { kind: 'stage'; stage: string }
  | { kind: 'paid'; value: boolean; method?: 'BANK_TRANSFER' | 'CASH' }
  | { kind: 'restore' }
