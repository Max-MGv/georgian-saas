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

/**
 * Build and insert an order's contact rows — **the one place any order records who to
 * contact**, whether the order came from a public form or an admin screen.
 *
 * Both entry points call this rather than each assembling their own write, because the two
 * already drifted once: `createBooking` wrote `OrderContact` rows while `createOrderAdmin`
 * wrote only the denormalised `Order.name/surname/phone/email` columns, so an admin-created
 * booking had an empty source of truth. An audit found it. The fix is not to remember harder
 * in two places; it is to have one place.
 *
 * `fallbackContactPerson` is what makes that work for a screen with no picker on it yet. When
 * the caller supplies no explicit `contact_person` entry, the details typed into the form
 * become one, with **no `personId`** — exactly the shape the public form produces when a guest
 * picks "I am not on this list". That is a record of what the admin typed, not an invented
 * attribution: nobody is linked to a real person they did not choose.
 *
 * Deliberately NOT applied to `assignOrderCompany()`, which links a company to an order that
 * already exists. There the details were typed before any company was involved, so minting a
 * contact row would assert an attribution that was never made. Creating and linking are
 * different acts.
 */
export async function writeOrderContacts(
  tx: TxClient,
  opts: {
    tenantId: string
    /** Exactly one, matching OrderContact's own shape. */
    target: { orderId: string } | { wineOrderId: string }
    companyId: string | null
    module: 'BOOKING' | 'WINE_ORDER'
    contacts: IncomingContact[] | undefined
    fallbackContactPerson?: { name: string; phone: string | null; email: string | null }
  }
): Promise<number> {
  let contacts = opts.contacts ?? []

  if (opts.fallbackContactPerson && opts.companyId) {
    const contactRole = await tx.contactRole.findFirst({
      where: {
        tenantId: opts.tenantId,
        key: 'contact_person',
        isActive: true,
        scope: 'PER_ORDER',
        appliesTo: { in: [opts.module, 'BOTH'] },
      },
      select: { id: true },
    })
    // Matched on `key`, not label — labels are display-only and renameable, `key` is what code
    // matches on (Plan-ContactRoles Chunk 0). A tenant that deleted or deactivated the role
    // simply gets no fallback row, which is correct rather than an error.
    if (contactRole && !contacts.some(c => c.roleId === contactRole.id)) {
      contacts = [...contacts, { roleId: contactRole.id, ...opts.fallbackContactPerson }]
    }
  }

  const rows = await buildOrderContactRows(tx, {
    tenantId: opts.tenantId,
    companyId: opts.companyId,
    module: opts.module,
    contacts,
  })
  if (rows.length === 0) return 0

  await tx.orderContact.createMany({ data: rows.map(r => ({ ...r, ...opts.target })) })
  return rows.length
}

/**
 * Keep an order's `contact_person` snapshot in step when an admin edits the denormalised
 * `Order.name/surname/phone/email` columns.
 *
 * Decision 4 makes `OrderContact` the source of truth and those four columns a copy of one of
 * its rows. Editing the copy and leaving the original stale makes the two disagree permanently,
 * with nothing to reconcile them — which is precisely the drift this rework exists to end, so
 * it would be a poor place to reintroduce it.
 *
 * Only ever updates an existing row: no row means this order never had a contact recorded
 * (every INDIVIDUAL booking, every pre-migration order), and an edit is not the moment to
 * invent one. `personId` is left alone deliberately — the admin corrected a spelling, they did
 * not say it is now a different person.
 */
export async function syncOrderContactPerson(
  tx: TxClient,
  opts: {
    tenantId: string
    orderId: string
    name: string
    phone: string | null
    email: string | null
  }
): Promise<boolean> {
  const existing = await tx.orderContact.findFirst({
    where: {
      orderId: opts.orderId,
      tenantId: opts.tenantId,
      role: { key: 'contact_person' },
    },
    select: { id: true },
  })
  if (!existing) return false

  await tx.orderContact.update({
    where: { id: existing.id },
    data: {
      nameSnapshot: opts.name.trim(),
      phoneSnapshot: opts.phone?.trim() || null,
      emailSnapshot: opts.email?.trim() || null,
    },
  })
  return true
}
