/**
 * The merged one-line flow (Plan-StatusModel chunk 4).
 *
 * The database keeps process and payment as two independent axes, because that
 * is the only way each stays correct on its own. The admin is shown **one**
 * line, with the Paid step sitting where it actually happened — not a
 * fulfilment stepper with a payment badge bolted beside it, which Max
 * explicitly rejected: payment has to be a real step in the same line.
 *
 * So an individual who paid at checkout reads
 *
 *     new → paid → confirmed → delivered
 *
 * and a restaurant on invoice terms reads
 *
 *     new → confirmed → delivered → paid
 *
 * from the same function, off the same two columns. The difference is entirely
 * `paidAtStage`: the process stage that was current the instant the money
 * landed, snapshotted at write time by `lib/statusBridge.ts`.
 *
 * Deliberately pure and DB-free — it takes the vocabulary as an argument
 * rather than fetching it, so both order types share it, the server fetches
 * once per page, and it is testable without a database.
 */
import type { StatusOption } from '@/lib/statusVocabulary'

/**
 * Terminal, and not a position on the line. It comes back from
 * `getProcessStatuses` like any other row (it is a real process status and the
 * dropdown needs it), but a cancelled order has not *progressed* to the end of
 * the flow — it left it. Rendering it as the final step would read as success.
 */
export const CANCELLED_CODE = 'cancelled'

/** The synthetic step. It has no ProcessStatus row — it is the financial axis. */
export const PAID_STEP_CODE = 'paid'

export type FlowStep = {
  /** A process status code, or `paid` for the payment step. */
  code: string
  kind: 'process' | 'paid'
  done: boolean
  /**
   * Where the order currently sits. Always a process step, never Paid:
   * "where is this order" is a question about fulfilment, and an order that
   * has been paid and delivered is *at* delivered. Paid is only ever done or
   * not yet done.
   */
  active: boolean
}

/** What a single order contributes. Both axes, plus the placement snapshot. */
export type FlowState = {
  /** `processStatus.code`, or null on a row that was never backfilled. */
  processCode: string | null
  paidAt: Date | string | null
  paidAtStage: string | null
}

/** The spine: process steps that are genuine positions on the line. */
export function flowSpine(processSteps: StatusOption[]): StatusOption[] {
  return processSteps.filter(s => s.code !== CANCELLED_CODE)
}

export function isCancelled(state: FlowState): boolean {
  return state.processCode === CANCELLED_CODE
}

/**
 * The flow-line for one order.
 *
 * A cancelled order (or one whose process axis was never backfilled) gets the
 * spine with nothing marked done — the caller greys the whole line and offers
 * the undo affordance, which is what the wine stepper already did.
 *
 * Paid is placed, not slotted: if `paidAtStage` names a step that is no longer
 * in the vocabulary, the step is appended rather than dropped. Losing the
 * placement is a display imperfection; losing the fact that money arrived
 * would be a lie.
 */
export function buildFlowLine(processSteps: StatusOption[], state: FlowState): FlowStep[] {
  const spine = flowSpine(processSteps)
  const current = isCancelled(state)
    ? undefined
    : spine.find(s => s.code === state.processCode)

  const steps: FlowStep[] = spine.map(s => ({
    code: s.code,
    kind: 'process' as const,
    done: current != null && s.sortOrder <= current.sortOrder,
    active: current != null && s.code === current.code,
  }))

  const paid = state.paidAt != null
  const paidStep: FlowStep = { code: PAID_STEP_CODE, kind: 'paid', done: paid, active: false }

  if (!paid) {
    // The pay-later default: nothing says when payment will land, so it
    // trails the line as the one thing still outstanding.
    steps.push(paidStep)
    return steps
  }

  const at = steps.findIndex(s => s.code === state.paidAtStage)
  // Insert *after* the stage it landed at — payment happened once that stage
  // was already true. Which is also why Paid can never be step 1: an order has
  // to exist before there is anything to pay for.
  steps.splice(at >= 0 ? at + 1 : steps.length, 0, paidStep)
  return steps
}

/**
 * The steps this order has not reached yet, in flow order, for the status
 * dropdown (Plan-StatusModel decision 9).
 *
 * The menu used to be a fixed list where every value was always selectable,
 * which is how an already-paid order could be marked paid again and how the
 * menu could contradict the line beside it. Offering only what is still ahead
 * is what keeps the two agreeing.
 *
 * Cancel is always last and always available — it is an exit from the flow,
 * not a position in it. Reverting a step stays a deliberate correction through
 * the flow-line's own undo affordance, not an everyday menu entry.
 */
export function unreachedSteps(processSteps: StatusOption[], state: FlowState): FlowStep[] {
  const ahead = buildFlowLine(processSteps, state).filter(s => !s.done)
  if (isCancelled(state)) return ahead
  return [...ahead, { code: CANCELLED_CODE, kind: 'process', done: false, active: false }]
}

/**
 * Financial states this order has not reached, for the dropdown.
 *
 * The flow-line owns `paid` — it is a step in the line, placed where payment
 * happened — but the financial axis can have states *before* it, and those have
 * nowhere else to be offered. Today that means bookings' `invoiced`: the
 * winery has asked for money but not received it, which is a real thing an
 * admin sets by hand when they send the invoice themselves rather than through
 * `sendOrderInvoice`.
 *
 * Driven by the vocabulary rather than naming `invoiced`, so a financial state
 * inserted later appears here without a code change. Wine orders pass a list
 * that holds only `unpaid` and `paid`, so this correctly returns nothing for
 * them — no call site has to know which order type has an invoice flow.
 */
export function unreachedFinancialSteps(
  financialSteps: StatusOption[],
  currentCode: string | null,
  paidAt: Date | string | null
): StatusOption[] {
  // Once money has arrived, "we have asked for money" is behind us.
  if (paidAt != null) return []
  const current = financialSteps.find(s => s.code === currentCode)
  return financialSteps.filter(
    s => s.code !== PAID_STEP_CODE && (current == null || s.sortOrder > current.sortOrder)
  )
}
