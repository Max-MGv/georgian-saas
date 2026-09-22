import type { TxClient } from '@/lib/db'

/**
 * Recording who was contacted about an order — the write half of contact roles.
 *
 * Deliberately separate from `lib/contactResolution.ts`, which answers "who *can* be picked".
 * That one reads, this one validates and writes, and keeping them apart means a form cannot
 * accidentally reach a write path through a lookup.
 *
 * A plain module, not `'use server'`: it takes an explicit `tenantId` and a transaction client,
 * and a server action is callable by the browser (MaintenanceNotes #24 / hurdle H9).
 */

/** What a form sends. Every field here arrived from a client and none of it is trusted. */
export type IncomingContact = {
  roleId: string
  /** Absent when the person typed their own details — "I am not on this list". */
  personId?: string
  name: string
  phone: string | null
  email: string | null
}

/** What actually gets written, once verified. */
export type OrderContactRow = {
  tenantId: string
  roleId: string
  personId: string | null
  nameSnapshot: string
  phoneSnapshot: string | null
  emailSnapshot: string | null
}

/**
 * Turn a client-sent `contacts` array into rows that are safe to write.
 *
 * **Nothing here is taken on trust.** A server action is callable by the browser, so a crafted
 * request could name any role or any person in the database. Four checks, each closing a real
 * hole rather than a theoretical one:
 *
 * 1. **The role must belong to this tenant**, be active, be `PER_ORDER`, and apply to this
 *    kind of order. Filtering only the person and not the role is exactly the bug the Chunk 3
 *    resolver test caught — a BOOKING-only guide resolving on a wine order, and a
 *    COMPANY_LEVEL person reachable from a public form, which is the thing `scope` exists to
 *    prevent. **Filter where the value is used, not only where it is displayed.**
 * 2. **The person must belong to the order's company**, under this tenant, and hold that role.
 *    This is the `verifiedGuideId` pattern from the old `createBooking`, generalised.
 * 3. **A person who fails that check loses the link, not the facts.** The row is still written
 *    with its snapshots. Dropping it instead would discard contact details the customer
 *    actually gave us, and finding F2 is the whole reason snapshots exist.
 * 4. **One row per role** — `@@unique([orderId, roleId])` would otherwise reject the whole
 *    write, taking the order down with it. Decision 9: one person per role per order.
 *
 * Entries with a blank name are dropped: a nameless OrderContact row is worse than none.
 */
export async function buildOrderContactRows(
  tx: TxClient,
  opts: {
    tenantId: string
    /** The order's company. Null means no company, and then nobody can be linked. */
    companyId: string | null
    module: 'BOOKING' | 'WINE_ORDER'
    contacts: IncomingContact[] | undefined
  }
): Promise<OrderContactRow[]> {
  const incoming = opts.contacts ?? []
  if (incoming.length === 0) return []

  // One row per role, first mention wins (check 4).
  const byRole = new Map<string, IncomingContact>()
  for (const c of incoming) {
    if (!c?.roleId || typeof c.name !== 'string' || !c.name.trim()) continue
    if (!byRole.has(c.roleId)) byRole.set(c.roleId, c)
  }
  if (byRole.size === 0) return []

  // Check 1 — roles this tenant actually has, for this kind of order.
  const validRoles = await tx.contactRole.findMany({
    where: {
      id: { in: [...byRole.keys()] },
      tenantId: opts.tenantId,
      isActive: true,
      scope: 'PER_ORDER',
      appliesTo: { in: [opts.module, 'BOTH'] },
    },
    select: { id: true },
  })
  const validRoleIds = new Set(validRoles.map(r => r.id))

  // Check 2 — people who really belong to this company, in the role claimed for them.
  const claimedPersonIds = [...byRole.values()]
    .filter(c => c.personId && validRoleIds.has(c.roleId))
    .map(c => c.personId!)
  const verifiedPeople = opts.companyId && claimedPersonIds.length > 0
    ? await tx.companyPerson.findMany({
        where: {
          id: { in: claimedPersonIds },
          companyId: opts.companyId,
          isActive: true,
          company: { tenantId: opts.tenantId },
        },
        select: { id: true, roleId: true },
      })
    : []
  const verifiedByPersonId = new Map(verifiedPeople.map(p => [p.id, p.roleId]))

  const rows: OrderContactRow[] = []
  for (const [roleId, c] of byRole) {
    if (!validRoleIds.has(roleId)) continue
    // Check 3 — keep the link only if the person checks out *and* holds this very role.
    const personId = c.personId && verifiedByPersonId.get(c.personId) === roleId ? c.personId : null
    rows.push({
      // Never leave this null. OrderContact has a direct-tenantId RLS policy, so a NULL row is
      // invisible to every tenant-scoped read afterwards — the same silent shape as
      // MaintenanceNotes #27, and the Chunk 3 note that called it out.
      tenantId: opts.tenantId,
      roleId,
      personId,
      nameSnapshot: c.name.trim(),
      phoneSnapshot: c.phone?.trim() || null,
      emailSnapshot: c.email?.trim() || null,
    })
  }
  return rows
}
