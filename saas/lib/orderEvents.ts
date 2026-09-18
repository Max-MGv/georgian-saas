/**
 * Order history — one row per thing that happened (chunk 5, 2026-09-18).
 *
 * ## Why
 *
 * The milestone columns say where an order *is*. They cannot say what it went
 * through. Un-paying an order by hand left no trace at all, because a manual
 * payment has no `Payment` row to survive as the record — that gap was logged
 * as open in `Plan-StatusModel.md` and this closes it. It also answers "who
 * cancelled this and when", and "how long do orders sit in CONFIRMED".
 *
 * ## The rules
 *
 * - **Append-only.** Nothing here is ever updated or deleted. A row that could
 *   be edited is not evidence.
 * - **Written inside the caller's transaction**, so an event can never claim a
 *   change that got rolled back, and a change can never happen unrecorded.
 * - **Never load-bearing.** Screens read the columns, not this table. If a
 *   write here failed it would be a lost record, not a broken order — so it
 *   deliberately does not gate anything.
 *
 * ## What this is not
 *
 * Not event sourcing. `paidAt` remains the state, read on every board render;
 * this is the history beside it. Deriving state by replaying events would be a
 * much larger idea than this project needs.
 */
import type { TxClient } from '@/lib/db'
import type { OrderEventType, ActorType, Prisma } from '@prisma/client'

type RecordEventInput = {
  tenantId: string | null
  /** Exactly one of these — the same convention `Payment` already uses. */
  orderId?: string | null
  wineOrderId?: string | null
  type: OrderEventType
  actorType: ActorType
  /** Supabase user id for an ADMIN action; null for guests, the system, the gateway. */
  actorId?: string | null
  fromStage?: string | null
  toStage?: string | null
  payload?: Prisma.InputJsonValue
}

/**
 * Append one event.
 *
 * Takes the transaction client rather than opening its own, so the event and
 * the change it describes commit or fail together.
 */
export async function recordOrderEvent(tx: TxClient, input: RecordEventInput): Promise<void> {
  await tx.orderEvent.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId ?? null,
      wineOrderId: input.wineOrderId ?? null,
      type: input.type,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      fromStage: input.fromStage ?? null,
      toStage: input.toStage ?? null,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    },
  })
}

/**
 * The event type for a status change, given the tagged union the admin screens
 * send.
 *
 * Kept here beside the table rather than at the two call sites, so bookings and
 * wine orders cannot drift into describing the same action differently — which
 * is exactly how a history table stops being queryable.
 */
export function eventTypeForChange(
  change: { kind: string; value?: boolean }
): OrderEventType {
  switch (change.kind) {
    case 'stage':
      return 'STAGE_CHANGED'
    case 'paid':
      return change.value ? 'PAID' : 'UNPAID'
    case 'invoiceSent':
      return change.value ? 'INVOICE_SENT' : 'INVOICE_UNSENT'
    case 'restore':
      return 'RESTORED'
    default:
      // Unreachable through the union, but a new variant must not silently
      // record itself as something it is not.
      return 'STAGE_CHANGED'
  }
}
