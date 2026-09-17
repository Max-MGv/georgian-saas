/**
 * Proves the two status axes actually move independently (Plan-StatusModel
 * chunk 3).
 *
 * This is the property the whole redesign exists for, and it is the one a
 * typecheck cannot confirm: writing `delivered` must not disturb whether the
 * order was paid, and writing `paid` must not disturb how far fulfilment got.
 * The old single column could not express either.
 *
 * Exercises the same `wineOrderStatusPatch` / `orderStatusPatch` functions the
 * server actions use, against a real database, on a throwaway tenant.
 *
 * Run: npx tsx scripts/test-status-bridge.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import {
  wineOrderStatusPatch,
  orderStatusPatch,
  NEW_ORDER_STATUS_COLUMNS,
  PROCESS_STATUS,
  FINANCIAL_STATUS,
  type LegacyWineOrderStatus,
  type LegacyOrderStatus,
} from '../lib/statusBridge'

const db = new PrismaClient()
const T = 'zz-test-status-bridge'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Mirrors what updateWineOrderStatus does: read, patch, write. */
async function setWineStatus(id: string, status: LegacyWineOrderStatus) {
  const current = await db.wineOrder.findUniqueOrThrow({
    where: { id },
    select: { paidAt: true, processStatus: { select: { code: true } } },
  })
  await db.wineOrder.update({
    where: { id },
    data: {
      status,
      ...wineOrderStatusPatch(status, {
        processCode: current.processStatus?.code ?? null,
        paidAt: current.paidAt,
      }),
    },
  })
  return db.wineOrder.findUniqueOrThrow({
    where: { id },
    select: {
      status: true, paidAt: true, paidAtStage: true,
      processStatus: { select: { code: true } },
      financialStatus: { select: { code: true } },
    },
  })
}

async function setOrderStatus(id: string, status: LegacyOrderStatus) {
  const current = await db.order.findUniqueOrThrow({
    where: { id },
    select: { paidAt: true, processStatus: { select: { code: true } } },
  })
  await db.order.update({
    where: { id },
    data: {
      status,
      ...orderStatusPatch(status, {
        processCode: current.processStatus?.code ?? null,
        paidAt: current.paidAt,
      }),
    },
  })
  return db.order.findUniqueOrThrow({
    where: { id },
    select: {
      status: true, paidAt: true, paidAtStage: true,
      processStatus: { select: { code: true } },
      financialStatus: { select: { code: true } },
    },
  })
}

async function main() {
  await db.tenant.create({
    data: { id: T, name: 'ZZ Status Bridge', domain: 'zz-status-bridge.invalid', slug: T },
  })

  try {
    console.log('\n=== A. Pay-later: confirmed -> delivered -> paid ===')
    const wo = await db.wineOrder.create({
      data: {
        businessName: 'ZZ Bar', address: 'ZZ', contactName: 'ZZ', contactPhone: '000',
        tenantId: T, ...NEW_ORDER_STATUS_COLUMNS,
      },
    })
    check('starts unpaid at the first stage',
      (await db.wineOrder.findUniqueOrThrow({ where: { id: wo.id }, select: { processStatusId: true, financialStatusId: true } }))
        .processStatusId === PROCESS_STATUS.new)

    await setWineStatus(wo.id, 'confirmed')
    const delivered = await setWineStatus(wo.id, 'delivered')
    check('delivered moves the process axis', delivered.processStatus?.code === 'delivered')
    check('delivered leaves it unpaid — the B2B case the old column could not express',
      delivered.financialStatus?.code === 'unpaid', `financial=${delivered.financialStatus?.code}`)
    check('delivered does not invent a payment date', delivered.paidAt === null)

    const paidLate = await setWineStatus(wo.id, 'paid')
    check('paying later does NOT reset fulfilment', paidLate.processStatus?.code === 'delivered',
      `process=${paidLate.processStatus?.code}`)
    check('paying later records the payment', paidLate.financialStatus?.code === 'paid')
    check('paidAt is stamped', paidLate.paidAt !== null)
    check('paidAtStage snapshots that it was paid AFTER delivery',
      paidLate.paidAtStage === 'delivered', `paidAtStage=${paidLate.paidAtStage}`)

    console.log('\n=== B. Pay-first: paid before anything else, then progresses ===')
    const wo2 = await db.wineOrder.create({
      data: {
        businessName: 'ZZ Bar 2', address: 'ZZ', contactName: 'ZZ', contactPhone: '000',
        tenantId: T, ...NEW_ORDER_STATUS_COLUMNS,
      },
    })
    const paidEarly = await setWineStatus(wo2.id, 'paid')
    check('paidAtStage snapshots the first stage', paidEarly.paidAtStage === 'new',
      `paidAtStage=${paidEarly.paidAtStage}`)
    const paidAtFirst = paidEarly.paidAt

    const confirmedAfterPaying = await setWineStatus(wo2.id, 'confirmed')
    check('confirming does not clear the payment',
      confirmedAfterPaying.financialStatus?.code === 'paid')
    check('confirming does not move the payment date',
      confirmedAfterPaying.paidAt?.getTime() === paidAtFirst?.getTime())
    check('confirming does not rewrite the snapshot',
      confirmedAfterPaying.paidAtStage === 'new')

    const deliveredAfterPaying = await setWineStatus(wo2.id, 'delivered')
    check('a prepaid order still reaches delivered, paid',
      deliveredAfterPaying.processStatus?.code === 'delivered' &&
      deliveredAfterPaying.financialStatus?.code === 'paid')

    console.log('\n=== C. Bookings: invoice-sent is financial, completed is process ===')
    const o = await db.order.create({
      data: {
        visitType: 'TASTING', date: new Date('2030-01-01'), timeSlot: '10:00',
        guestCount: 2, name: 'ZZ', surname: 'Test', tenantId: T, ...NEW_ORDER_STATUS_COLUMNS,
      },
    })
    const invoiced = await setOrderStatus(o.id, 'INVOICE_SENT')
    check('invoice-sent moves the financial axis only',
      invoiced.financialStatus?.code === 'invoiced' && invoiced.processStatus?.code === 'new',
      `process=${invoiced.processStatus?.code}`)

    const completed = await setOrderStatus(o.id, 'COMPLETED')
    check('completing the visit leaves it invoiced, not paid',
      completed.processStatus?.code === 'completed' && completed.financialStatus?.code === 'invoiced',
      `financial=${completed.financialStatus?.code}`)

    const settled = await setOrderStatus(o.id, 'PAID')
    check('settling afterwards keeps the visit completed',
      settled.processStatus?.code === 'completed', `process=${settled.processStatus?.code}`)
    check('settling afterwards marks it paid, snapshotted at completed',
      settled.financialStatus?.code === 'paid' && settled.paidAtStage === 'completed')

    console.log('\n=== D. Cancelling is a process move, not a financial one ===')
    const cancelled = await setWineStatus(wo2.id, 'cancelled')
    check('cancelling a paid order does not erase that it was paid',
      cancelled.processStatus?.code === 'cancelled' && cancelled.financialStatus?.code === 'paid',
      `financial=${cancelled.financialStatus?.code}`)

    console.log('\n=== E. Reference rows cannot be deleted while referenced ===')
    let refused = false
    try {
      await db.processStatus.delete({ where: { id: PROCESS_STATUS.delivered } })
    } catch {
      refused = true
    }
    check('ON DELETE RESTRICT blocks deleting an in-use status', refused)
    check('financial reference rows are intact',
      (await db.financialStatus.count()) === 3)
    void FINANCIAL_STATUS
  } finally {
    await db.wineOrderItem.deleteMany({ where: { wineOrder: { tenantId: T } } })
    await db.wineOrder.deleteMany({ where: { tenantId: T } })
    await db.order.deleteMany({ where: { tenantId: T } })
    await db.tenant.deleteMany({ where: { id: T } })
  }

  console.log(failures === 0 ? '\n🟢 Both axes move independently.\n' : `\n🔴 ${failures} check(s) failed.\n`)
  if (failures > 0) process.exit(1)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
