/**
 * Translates a legacy single-column status write into the two-axis columns
 * (Plan-StatusModel chunk 3).
 *
 * During the transition every write sets BOTH the old `status` column and the
 * new columns. The old one stays authoritative because ~40 read sites still
 * depend on it; the new ones are kept accurate in parallel so that flipping
 * reads over in chunk 4 needs no backfill.
 *
 * The important rule, and the whole point of the split: **a legacy value only
 * determines one axis, so only that axis is returned.** Setting a wine order to
 * `delivered` says nothing about whether it was paid, so `financialStatusId` is
 * absent from the patch and the existing value survives. Setting it to `paid`
 * says nothing about fulfilment, so `processStatusId` is absent. Returning a
 * complete pair either way is what the old single column did wrong.
 *
 * Ids are the stable seeded strings from `20260917063954_add_status_dimensions`
 * (and the `ps_new` rename that followed). They are deliberately readable
 * rather than cuids so they can be referenced from code and SQL alike.
 */

export const PROCESS_STATUS = {
  new: 'ps_new',
  confirmed: 'ps_confirmed',
  delivered: 'ps_delivered',
  completed: 'ps_completed',
  cancelled: 'ps_cancelled',
} as const

export const FINANCIAL_STATUS = {
  unpaid: 'fs_unpaid',
  invoiced: 'fs_invoiced',
  paid: 'fs_paid',
} as const

/** Legacy `WineOrder.status` values. Previously an unvalidated bare string. */
export type LegacyWineOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'delivered'
  | 'cancelled'
  | 'pending_payment'
  | 'payment_failed'

/** Legacy `Order.status` values — mirrors the Prisma `OrderStatus` enum. */
export type LegacyOrderStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'INVOICE_SENT'
  | 'PAID'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PENDING_PAYMENT'

/** What the row already holds, so a patch can preserve rather than clobber. */
export type CurrentStatusState = {
  /** `processStatus.code`, or null on a row not yet backfilled. */
  processCode: string | null
  paidAt: Date | null
}

export type StatusPatch = {
  processStatusId?: string
  financialStatusId?: string
  paidAt?: Date
  paidAtStage?: string
}

/**
 * The payment side of a patch, shared by both order types.
 *
 * `paidAt` is only stamped if absent — a second write must not move the date
 * the money actually arrived. `paidAtStage` snapshots whichever process stage
 * was current at that moment, which is what lets the UI place the Paid step
 * where it genuinely happened instead of a fixed slot. It falls back to `new`
 * for a row whose process axis was never backfilled, since that is where an
 * un-progressed order sits.
 */
function paidPatch(current: CurrentStatusState): StatusPatch {
  return {
    financialStatusId: FINANCIAL_STATUS.paid,
    paidAt: current.paidAt ?? new Date(),
    paidAtStage: current.processCode ?? 'new',
  }
}

export function wineOrderStatusPatch(
  status: LegacyWineOrderStatus,
  current: CurrentStatusState
): StatusPatch {
  switch (status) {
    // Payment limbo is pre-fulfilment, not a stage of its own — an abandoned
    // card checkout leaves the order exactly where it started.
    case 'pending':
    case 'pending_payment':
    case 'payment_failed':
      return { processStatusId: PROCESS_STATUS.new }
    case 'confirmed':
      return { processStatusId: PROCESS_STATUS.confirmed }
    case 'delivered':
      return { processStatusId: PROCESS_STATUS.delivered }
    case 'cancelled':
      return { processStatusId: PROCESS_STATUS.cancelled }
    case 'paid':
      return paidPatch(current)
  }
}

export function orderStatusPatch(
  status: LegacyOrderStatus,
  current: CurrentStatusState
): StatusPatch {
  switch (status) {
    case 'NEW':
    case 'PENDING_PAYMENT':
      return { processStatusId: PROCESS_STATUS.new }
    case 'CONFIRMED':
      return { processStatusId: PROCESS_STATUS.confirmed }
    case 'COMPLETED':
      return { processStatusId: PROCESS_STATUS.completed }
    case 'CANCELLED':
      return { processStatusId: PROCESS_STATUS.cancelled }
    // Billing milestone, not a fulfilment stage: it records that we have asked
    // for money, which is why it moves the financial axis and leaves process
    // untouched. Retired from the process axis entirely in chunk 5.
    case 'INVOICE_SENT':
      return { financialStatusId: FINANCIAL_STATUS.invoiced }
    case 'PAID':
      return paidPatch(current)
  }
}

/** The columns a freshly created order starts with: not begun, not paid. */
export const NEW_ORDER_STATUS_COLUMNS = {
  processStatusId: PROCESS_STATUS.new,
  financialStatusId: FINANCIAL_STATUS.unpaid,
} as const

/**
 * Complete (not partial) columns for a row being created from a known legacy
 * status — seed and demo data, where there is no prior row to preserve.
 *
 * Note what falls out of this naturally, and is correct rather than a bug: a
 * `COMPLETED` booking seeds as process=completed **financial=unpaid**, and a
 * `PAID` one as financial=paid **process=new**. Those are precisely the two
 * shapes the old single column could not represent — the visit that happened
 * before the invoice cleared, and the individual who paid upfront.
 *
 * `at` dates the payment, so seeded history gets a `paidAt` near its own
 * `createdAt` instead of the moment the seed script ran.
 */
export type SeededStatusColumns = {
  processStatusId: string
  financialStatusId: string
  paidAt: Date | null
  paidAtStage: string | null
}

export function seedStatusColumns(
  kind: 'order',
  legacy: LegacyOrderStatus,
  at: Date
): SeededStatusColumns
export function seedStatusColumns(
  kind: 'wineOrder',
  legacy: LegacyWineOrderStatus,
  at: Date
): SeededStatusColumns
export function seedStatusColumns(
  kind: 'order' | 'wineOrder',
  legacy: string,
  at: Date
): SeededStatusColumns {
  const base: CurrentStatusState = { processCode: 'new', paidAt: null }
  const patch =
    kind === 'order'
      ? orderStatusPatch(legacy as LegacyOrderStatus, base)
      : wineOrderStatusPatch(legacy as LegacyWineOrderStatus, base)

  return {
    processStatusId: patch.processStatusId ?? NEW_ORDER_STATUS_COLUMNS.processStatusId,
    financialStatusId: patch.financialStatusId ?? NEW_ORDER_STATUS_COLUMNS.financialStatusId,
    // Only a paid patch carries these; everything else leaves the row unpaid.
    paidAt: patch.paidAt ? at : null,
    paidAtStage: patch.paidAtStage ?? null,
  }
}
