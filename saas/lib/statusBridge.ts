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

// ── Reverse maps: vocabulary code → legacy value (chunk 4) ───────────────
//
// Chunk 4 moves *reads* onto the two new axes while writes keep going through
// `updateWineOrderStatus` / `updateOrderStatus`, which already dual-write. So
// the UI speaks vocabulary codes and translates back here at the moment of
// writing, rather than a second write path existing alongside the first.
//
// The translation is deliberately partial. A code with no legacy equivalent
// returns null, and the caller renders that step as non-clickable instead of
// guessing — a tenant-inserted status ("Packed" at sortOrder 250) is exactly
// the case the dimension tables exist to allow, and silently writing the
// nearest legacy value would put the row in a state nobody asked for. Nothing
// creates tenant rows today, so this is a guard rather than a live path; the
// limitation disappears in chunk 5 when writes go code-first.

/**
 * Legacy values an admin may set by hand. The payment-limbo values are
 * machine-set only — they mean "went to the card gateway and never came back",
 * and a human writing one would claim a payment attempt that never happened.
 * No vocabulary code maps to them, which is what the narrowing records.
 */
export type SettableWineOrderStatus = Exclude<LegacyWineOrderStatus, 'pending_payment' | 'payment_failed'>
export type SettableOrderStatus = Exclude<LegacyOrderStatus, 'PENDING_PAYMENT'>

export function legacyWineStatusForCode(code: string): SettableWineOrderStatus | null {
  switch (code) {
    case 'new':       return 'pending'
    case 'confirmed': return 'confirmed'
    case 'delivered': return 'delivered'
    case 'cancelled': return 'cancelled'
    case 'paid':      return 'paid'
    default:          return null
  }
}

export function legacyOrderStatusForCode(code: string): SettableOrderStatus | null {
  switch (code) {
    case 'new':       return 'NEW'
    case 'confirmed': return 'CONFIRMED'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    case 'paid':      return 'PAID'
    case 'invoiced':  return 'INVOICE_SENT'
    default:          return null
  }
}

const PROCESS_CODE_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PROCESS_STATUS).map(([code, id]) => [id, code])
)
const FINANCIAL_CODE_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(FINANCIAL_STATUS).map(([code, id]) => [id, code])
)

/** A patch restated in vocabulary codes, which is what the UI renders from. */
export type StatusCodePatch = {
  processCode?: string
  financialCode?: string
  paidAt?: Date
  paidAtStage?: string
}

/**
 * The same patch the server will write, expressed in codes — so a client can
 * apply it optimistically and see the flow-line move before the round trip.
 *
 * Derived from the id patch rather than re-implementing the mapping, because
 * two copies of "which axis does this legacy value move" is exactly the drift
 * the bridge exists to prevent. Partial in, partial out: an absent axis stays
 * absent, so the caller's spread leaves the existing value alone.
 */
export function statusPatchCodes(patch: StatusPatch): StatusCodePatch {
  return {
    ...(patch.processStatusId ? { processCode: PROCESS_CODE_BY_ID[patch.processStatusId] } : {}),
    ...(patch.financialStatusId ? { financialCode: FINANCIAL_CODE_BY_ID[patch.financialStatusId] } : {}),
    ...(patch.paidAt ? { paidAt: patch.paidAt } : {}),
    ...(patch.paidAtStage ? { paidAtStage: patch.paidAtStage } : {}),
  }
}
