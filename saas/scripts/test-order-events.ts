/**
 * Proves the OrderEvent table holds (chunk 5 of vault/DataModel/Plan-DataModel.md).
 *
 * Three things, in order of how badly they fail if wrong:
 *
 * 1. **RLS isolation.** A missing or wrong policy on a new table does not
 *    error — it silently hides every row from every tenant, or worse, shows one
 *    tenant another's. `Plan-StatusModel.md` records this failing silently once
 *    already, which is why it is checked first and from a real tenant context
 *    rather than as superuser.
 * 2. **Cascade.** History belongs to its order; an event whose order is gone is
 *    unreadable anyway.
 * 3. **The timeline itself** — that events land, carry their actor, and read
 *    back in order.
 *
 * Creates its own throwaway data and deletes it.
 *
 *   npx tsx scripts/test-order-events.ts
 */
import { db, withTenantDb } from '../lib/db'
import { recordOrderEvent } from '../lib/orderEvents'

const TENANT_A = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery
const TENANT_B = 'cmtvgl6e60000vl6w9se65t86' // Vineworks Demo

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) { passed++; console.log(`  ok   ${label}`); return }
  failed++
  console.error(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function makeOrder(tenantId: string, surname: string) {
  return db.order.create({
    data: {
      tenantId, bookingType: 'INDIVIDUAL', visitType: 'TASTING',
      date: new Date('2030-06-01'), timeSlot: '12:00',
      guestCount: 2, name: 'ZZ', surname, totalPrice: 10000,
    },
  })
}

async function main() {
  const orderA = await makeOrder(TENANT_A, 'EventsA')
  const orderB = await makeOrder(TENANT_B, 'EventsB')

  // Events written through a real tenant context, as the app does.
  await withTenantDb(TENANT_A, tx => recordOrderEvent(tx, {
    tenantId: TENANT_A, orderId: orderA.id, type: 'CREATED',
    actorType: 'GUEST', toStage: 'NEW',
  }))
  await withTenantDb(TENANT_A, tx => recordOrderEvent(tx, {
    tenantId: TENANT_A, orderId: orderA.id, type: 'STAGE_CHANGED',
    actorType: 'ADMIN', actorId: 'probe-admin', fromStage: 'NEW', toStage: 'CONFIRMED',
  }))
  await withTenantDb(TENANT_B, tx => recordOrderEvent(tx, {
    tenantId: TENANT_B, orderId: orderB.id, type: 'CREATED',
    actorType: 'GUEST', toStage: 'NEW',
  }))

  // ── 1. RLS ────────────────────────────────────────────────────────────────
  const ownRows = await withTenantDb(TENANT_A, tx =>
    tx.orderEvent.findMany({ where: { orderId: orderA.id }, orderBy: { occurredAt: 'asc' } }))
  check('a tenant sees its own events', ownRows.length, 2)

  const crossRows = await withTenantDb(TENANT_A, tx =>
    tx.orderEvent.findMany({ where: { orderId: orderB.id } }))
  check('a tenant CANNOT see another tenant\'s events', crossRows.length, 0)

  // The inverse of the silent-failure mode: policy present but matching nothing.
  check('...and that is isolation, not a blanket-empty table', ownRows.length > 0, true)

  // ── 2. The timeline ───────────────────────────────────────────────────────
  check('first event is the creation', ownRows[0]?.type, 'CREATED')
  check('creation has no admin behind it', ownRows[0]?.actorId, null)
  check('second event is the stage change', ownRows[1]?.type, 'STAGE_CHANGED')
  check('it records where it came from', ownRows[1]?.fromStage, 'NEW')
  check('it records where it went', ownRows[1]?.toStage, 'CONFIRMED')
  check('it records who did it', ownRows[1]?.actorId, 'probe-admin')

  // ── 3. Cascade ────────────────────────────────────────────────────────────
  await db.order.delete({ where: { id: orderA.id } })
  check('events go with their order',
    await db.orderEvent.count({ where: { orderId: orderA.id } }), 0)
  check('another order\'s events are untouched',
    await db.orderEvent.count({ where: { orderId: orderB.id } }), 1)

  await db.order.delete({ where: { id: orderB.id } })
  check('cleanup leaves nothing behind',
    await db.orderEvent.count({ where: { orderId: { in: [orderA.id, orderB.id] } } }), 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async err => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
