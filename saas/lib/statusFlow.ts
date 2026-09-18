/**
 * The merged one-line flow (Feature 191).
 *
 * An order carries two independent kinds of fact: a **stage** saying where it
 * is (an enum, forward-only) and a set of **milestone dates** saying when money
 * things happened. The admin is shown one line, with those dates placed where
 * they actually fall — not a fulfilment stepper with a payment badge bolted
 * beside it, which Max explicitly rejected: payment has to be a real step in
 * the same line.
 *
 * So an individual who paid at checkout reads
 *
 *     New → Paid → Confirmed → Delivered
 *
 * and a restaurant on invoice terms reads
 *
 *     New → Confirmed → Delivered → Invoice sent → Paid
 *
 * from the same function. The difference is entirely the timestamps.
 *
 * **Why dates rather than a payment status.** The previous design had a
 * financial ladder (`unpaid → invoiced → paid`), which meant climbing it
 * overwrote the rung below: marking an invoiced order paid erased the fact that
 * an invoice had ever been sent, and that is exactly the bug that shipped and
 * had to be patched with a marker. Two independent dates cannot overwrite each
 * other. It also retired `paidAtStage`, a snapshotted status code that existed
 * only to place the Paid step; a comparison between two timestamps says the
 * same thing and cannot go stale when a status is renamed.
 *
 * Deliberately pure and DB-free — both order types share it, and it is testable
 * without a database.
 */

/** Terminal, and not a position on the line — see `isCancelled`. */
export const CANCELLED = 'CANCELLED'

/**
 * The stage sequences, one per order type. Two lists rather than one shared
 * vocabulary: a booking is never DELIVERED and a wine order is never COMPLETED,
 * and the enums make that unrepresentable rather than merely unoffered.
 */
export const BOOKING_STAGES = ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const
export const WINE_ORDER_STAGES = ['NEW', 'CONFIRMED', 'DELIVERED', 'CANCELLED'] as const

export type BookingStageCode = (typeof BOOKING_STAGES)[number]
export type WineOrderStageCode = (typeof WINE_ORDER_STAGES)[number]
export type StageCode = BookingStageCode | WineOrderStageCode

/**
 * The money milestones. Not stages — they are things that happened *to* an
 * order, which is why they are dates and why they can be true at the same time
 * as each other and as any stage.
 */
export const PAID = 'PAID'
export const INVOICE_SENT = 'INVOICE_SENT'

export type FlowStep = {
  code: string
  /** `stage` sits on the spine; `event` is placed among it by its date. */
  kind: 'stage' | 'event'
  done: boolean
  /**
   * Where the order currently sits. Always a stage, never an event: "where is
   * this order" is a question about fulfilment, and an order that has been paid
   * and delivered is *at* delivered. An event is only ever done or not yet.
   */
  active: boolean
  /** When it happened, when that is known. Null for anything not yet reached. */
  at: Date | null
}

/** Everything the line needs from one order. */
export type FlowState = {
  stage: string
  /** The NEW milestone — every order has one, so this is never null. */
  createdAt: Date | string
  confirmedAt: Date | string | null
  /** `completedAt` on a booking, `deliveredAt` on a wine order. */
  finishedAt: Date | string | null
  /** Bookings only; wine orders have no invoice-send flow. */
  invoiceSentAt?: Date | string | null
  paidAt: Date | string | null
}

function asDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null
  return v instanceof Date ? v : new Date(v)
}

export function isCancelled(state: FlowState): boolean {
  return state.stage === CANCELLED
}

/**
 * The spine: the stages that are genuine positions on the line.
 *
 * CANCELLED is excluded. It is a real stage and the dropdown needs it, but a
 * cancelled order has not *progressed* to the end of the flow — it left it, and
 * drawing it as the final step would read as success.
 */
export function flowSpine(stages: readonly string[]): string[] {
  return stages.filter(s => s !== CANCELLED)
}

/** The stage timestamp for each spine position, in the same order. */
function spineDates(state: FlowState): (Date | null)[] {
  return [asDate(state.createdAt), asDate(state.confirmedAt), asDate(state.finishedAt)]
}

/**
 * The flow-line for one order.
 *
 * A cancelled order gets the spine with nothing marked done — the caller greys
 * the whole line and offers the undo affordance instead.
 *
 * **Done is decided by stage position, not by whether a date is present.** An
 * admin entering a walk-in order that is already complete never passed through
 * Confirmed, so `confirmedAt` is legitimately null while the step is behind it.
 * Inventing a date there would be a lie, and treating the step as not-done
 * would draw a finished order as unfinished.
 *
 * Events are placed chronologically: after the last spine step that had already
 * happened when the event did. An event with no date trails the line as the one
 * thing still outstanding — the pay-later default.
 */
export function buildFlowLine(stages: readonly string[], state: FlowState): FlowStep[] {
  const spine = flowSpine(stages)
  const dates = spineDates(state)
  const cancelled = isCancelled(state)
  const currentIndex = cancelled ? -1 : spine.indexOf(state.stage)

  const steps: FlowStep[] = spine.map((code, i) => ({
    code,
    kind: 'stage' as const,
    done: currentIndex >= 0 && i <= currentIndex,
    active: currentIndex >= 0 && i === currentIndex,
    at: dates[i] ?? null,
  }))

  // Invoice-sent first so that when neither has a date they trail in the order
  // they would naturally occur: you ask for money before you receive it.
  const events: { code: string; at: Date | null }[] = []
  if (state.invoiceSentAt !== undefined) {
    const invoicedAt = asDate(state.invoiceSentAt)
    // An invoice that WAS sent always shows — it happened, and a paid order
    // that was invoiced first should still say so. An invoice that was never
    // sent only shows while the money is still outstanding: once an order is
    // paid, "we have not asked for money yet" has stopped being a step anyone
    // is waiting on, and drawing it left a settled order looking unfinished.
    if (invoicedAt != null || asDate(state.paidAt) == null) {
      events.push({ code: INVOICE_SENT, at: invoicedAt })
    }
  }
  events.push({ code: PAID, at: asDate(state.paidAt) })

  for (const event of events) {
    const step: FlowStep = {
      code: event.code,
      kind: 'event',
      done: event.at != null,
      active: false,
      at: event.at,
    }
    if (event.at == null) {
      steps.push(step)
      continue
    }
    // How many spine steps had already happened by then. Always at least one:
    // an order has to exist before there is anything to invoice or pay, so
    // createdAt is never after the event, and an event can never be step 1.
    let insertAt = steps.length
    for (let i = 0; i < steps.length; i++) {
      const at = steps[i].at
      if (steps[i].kind === 'stage' && (at == null || at > event.at)) {
        insertAt = i
        break
      }
    }
    steps.splice(insertAt, 0, step)
  }

  return steps
}

/**
 * The stages this order has not reached yet, for the status dropdown.
 *
 * The menu used to be a fixed list where every value was always selectable,
 * which is how an already-completed order could be marked Confirmed again and
 * how the menu could contradict the line beside it. Offering only what is still
 * ahead keeps the two agreeing.
 *
 * Cancel is always offered and always last — it is an exit from the flow, not a
 * position in it. Reverting a step stays a deliberate correction through the
 * flow-line's own undo affordance, not an everyday menu entry.
 */
export function unreachedStages(stages: readonly string[], state: FlowState): string[] {
  const spine = flowSpine(stages)
  if (isCancelled(state)) return spine
  const currentIndex = spine.indexOf(state.stage)
  return [...spine.slice(currentIndex + 1), CANCELLED]
}
