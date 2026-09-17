/**
 * The only place the status vocabulary is read (Plan-StatusModel chunk 3.5).
 *
 * Two filters have to be applied together on every vocabulary read, and getting
 * either wrong fails quietly:
 *
 * 1. **Scope** — `appliesTo IN (kind, 'BOTH')`. Both order types share
 *    new/confirmed/cancelled, but `delivered` is wine-only and `completed` is
 *    bookings-only. Query unfiltered and a wine order's flow-line offers
 *    "Completed" as a step it can never reach.
 *
 * 2. **Tenant** — global rows plus this tenant's own. The RLS policy already
 *    enforces this at the database level, so the `where` below is defence in
 *    depth rather than the only guard, matching the codebase's habit of writing
 *    `where: { tenantId }` even under RLS.
 *
 * Call sites — the flow-line, the status dropdown, the board's columns, the
 * filter pills — ask for "the steps for this order type, in order" and never
 * filter themselves. Same shape as `getAllSettings(tenantId)` and
 * `getAllContent(tenantId, locale)`.
 *
 * NOT for reading a single order's own status: that follows the row's foreign
 * key (`include: { processStatus: true }`) and is already unambiguous.
 *
 * Deliberately uncached. These are two tiny tables and this project has a
 * documented lesson about building for a performance problem before measuring
 * one (Plan-Performance). Per-request dedup via React `cache()` is the obvious
 * move if a page ever turns out to ask repeatedly.
 */
import { withTenantDb } from '@/lib/db'
import type { StatusScope } from '@prisma/client'

/**
 * Which order type is asking. `BOTH` is a property a *row* can have, never a
 * question a caller asks — hence the narrowing.
 */
export type OrderKind = Exclude<StatusScope, 'BOTH'>

export type StatusOption = {
  id: string
  code: string
  sortOrder: number
  /** True for a row this tenant defined rather than a shared global one. */
  isTenantSpecific: boolean
}

function scopes(kind: OrderKind): StatusScope[] {
  return [kind, 'BOTH']
}

/**
 * The fulfilment steps for one order type, in flow order.
 *
 * Ordered by `sortOrder` then `code`: the ordering column is gap-seeded and
 * shared across scopes (`delivered` and `completed` both sit at 300), so the
 * tiebreak keeps the result deterministic even though scope filtering means
 * only one of them can appear in any single call.
 */
export async function getProcessStatuses(
  tenantId: string,
  kind: OrderKind
): Promise<StatusOption[]> {
  const rows = await withTenantDb(tenantId, tx =>
    tx.processStatus.findMany({
      where: {
        appliesTo: { in: scopes(kind) },
        OR: [{ tenantId: null }, { tenantId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, sortOrder: true, tenantId: true },
    })
  )
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    sortOrder: r.sortOrder,
    isTenantSpecific: r.tenantId !== null,
  }))
}

/** The payment states available to one order type, in escalation order. */
export async function getFinancialStatuses(
  tenantId: string,
  kind: OrderKind
): Promise<StatusOption[]> {
  const rows = await withTenantDb(tenantId, tx =>
    tx.financialStatus.findMany({
      where: {
        appliesTo: { in: scopes(kind) },
        OR: [{ tenantId: null }, { tenantId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, sortOrder: true, tenantId: true },
    })
  )
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    sortOrder: r.sortOrder,
    isTenantSpecific: r.tenantId !== null,
  }))
}
