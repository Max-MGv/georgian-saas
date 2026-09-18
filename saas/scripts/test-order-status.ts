/**
 * Proves the order-status model holds (Feature 191).
 *
 * Replaces `test-status-bridge.ts` and `check-status-backfill.ts`, both of
 * which tested machinery that no longer exists: a bridge translating a legacy
 * status column into two axes, and the RLS/scoping of two reference tables.
 * There is no legacy column and there are no reference tables.
 *
 * What is worth testing now is different, and narrower:
 *
 *  1. **The axes move independently.** Delivering does not pay; paying does not
 *     fulfil. This is the property the whole redesign exists for.
 *  2. **The database refuses what the model forbids**, rather than the app
 *     merely avoiding it. Three CHECK constraints and two enums, exercised by
 *     trying to violate them. A constraint nobody has ever seen reject anything
 *     is a constraint nobody knows works.
 *  3. **Milestone dates are independent**, which is the specific bug the old
 *     payment ladder had: marking an invoiced order paid erased the invoice.
 *  4. **Abandoned orders are excluded from every order query**, via the shared
 *     `NOT_ABANDONED` fragment — the one thing here that fails silently.
 *
 * Runs on a throwaway tenant and deletes it afterwards.
 *
 * Run: npx tsx scripts/test-order-status.ts   (dev database only)
 */
import { PrismaClient } from '@prisma/client'
import {
  bookingStagePatch,
  wineOrderStagePatch,
  paidPatch,
  invoiceSentPatch,
  isBookingStage,
  isWineOrderStage,
} from '../lib/statusWrite'
import { NOT_ABANDONED, ONLY_ABANDONED, paymentFilterWhere, paymentStateOf } from '../lib/orderFilters'

const db = new PrismaClient()
const TENANT = 'zz-test-orderstatus'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/** Asserts the database rejects a write, rather than the app just not making it. */
async function refuses(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    check(label, false, 'the write was ACCEPTED')
  } catch {
    check(label, true)
  }
}

const NOW = new Date()
const EMPTY = { confirmedAt: null, finishedAt: null, invoiceSentAt: null, paidAt: null }

async function newBooking(extra: Record<string, unknown> = {}) {
  return db.order.create({
    data: {
      tenantId: TENANT, visitType: 'TASTING', date: new Date('2030-06-01'),
      timeSlot: '12:00', guestCount: 2, name: 'ZZ', surname: 'Status', totalPrice: 100,
      ...extra,
    },
  })
}

async function newWineOrder(extra: Record<string, unknown> = {}) {
  return db.wineOrder.create({
    data: {
      tenantId: TENANT, businessName: 'ZZ Bar', address: 'ZZ',
      contactName: 'ZZ', contactPhone: '000', totalAmount: 200,
      ...extra,
    },
  })
}

async function main() {
  await db.tenant.deleteMany({ where: { id: TENANT } })
  await db.tenant.create({
    data: { id: TENANT, name: 'ZZ Status Test', domain: 'zz-status.invalid', slug: TENANT },
  })

  try {
    console.log('\n=== A. Pay-later: the case the old single column could not express ===')
    {
      const o = await newWineOrder()
      check('starts at NEW, unpaid', o.stage === 'NEW' && o.paidAt === null)

      const delivered = await db.wineOrder.update({
        where: { id: o.id },
        data: wineOrderStagePatch('DELIVERED', EMPTY, NOW),
      })
      check('delivering moves the stage', delivered.stage === 'DELIVERED')
      check('delivering leaves it unpaid — the B2B case', delivered.paidAt === null)
      check('delivering stamps its own date', delivered.deliveredAt !== null)

      const later = new Date(NOW.getTime() + 86400000 * 30)
      const paid = await db.wineOrder.update({
        where: { id: o.id },
        data: paidPatch(true, { ...EMPTY, finishedAt: delivered.deliveredAt }, later),
      })
      check('paying later does NOT reset fulfilment', paid.stage === 'DELIVERED')
      check('paying later records the payment', paid.paidAt !== null)
      check('the payment date is after the delivery date',
        paid.paidAt! > paid.deliveredAt!, `${paid.paidAt?.toISOString()} > ${paid.deliveredAt?.toISOString()}`)
    }

    console.log('\n=== B. Pay-first: paid before anything else, then progresses ===')
    {
      const o = await newBooking()
      const paid = await db.order.update({
        where: { id: o.id }, data: paidPatch(true, EMPTY, NOW),
      })
      check('paying does not move the stage', paid.stage === 'NEW')

      const later = new Date(NOW.getTime() + 86400000)
      const confirmed = await db.order.update({
        where: { id: o.id },
        data: bookingStagePatch('CONFIRMED', { ...EMPTY, paidAt: paid.paidAt }, later),
      })
      check('confirming does not clear the payment', confirmed.paidAt !== null)
      check('confirming does not move the payment date',
        confirmed.paidAt!.getTime() === paid.paidAt!.getTime())
      check('the payment predates the confirmation — Paid draws second on the line',
        confirmed.paidAt! < confirmed.confirmedAt!)
    }

    console.log('\n=== C. Milestone dates are independent (the old ladder overwrote them) ===')
    {
      const o = await newBooking()
      const invoiced = await db.order.update({
        where: { id: o.id }, data: invoiceSentPatch(true, EMPTY, NOW),
      })
      check('invoicing moves no stage', invoiced.stage === 'NEW')
      check('invoicing stamps its own date', invoiced.invoiceSentAt !== null)

      const paid = await db.order.update({
        where: { id: o.id },
        data: paidPatch(true, { ...EMPTY, invoiceSentAt: invoiced.invoiceSentAt }, NOW),
      })
      // The bug this replaces: on the `unpaid → invoiced → paid` ladder,
      // climbing to paid erased that an invoice had ever been sent, which is
      // why "Invoice Sent" silently vanished from every screen in chunk 4.
      check('paying an invoiced order KEEPS the invoice record', paid.invoiceSentAt !== null)
      check('and it reads as paid, not invoiced', paymentStateOf(paid) === 'paid')

      const reversed = await db.order.update({
        where: { id: o.id },
        data: paidPatch(false, { ...EMPTY, paidAt: paid.paidAt }, NOW),
      })
      check('reversing a payment clears only the payment', reversed.paidAt === null)
      check('reversing leaves the invoice record intact', reversed.invoiceSentAt !== null)
      check('and it reads as invoiced again', paymentStateOf(reversed) === 'invoiced')
    }

    console.log('\n=== D. Cancelling is an exit, not a rewrite of what happened ===')
    {
      const o = await newWineOrder()
      await db.wineOrder.update({ where: { id: o.id }, data: wineOrderStagePatch('DELIVERED', EMPTY, NOW) })
      const current = await db.wineOrder.findUniqueOrThrow({ where: { id: o.id } })
      await db.wineOrder.update({ where: { id: o.id }, data: paidPatch(true, { ...EMPTY, finishedAt: current.deliveredAt }, NOW) })
      const cancelled = await db.wineOrder.update({
        where: { id: o.id },
        data: wineOrderStagePatch('CANCELLED', EMPTY, NOW),
      })
      check('cancelling does not erase that it was paid', cancelled.paidAt !== null)
      check('cancelling does not erase that it was delivered', cancelled.deliveredAt !== null)
    }

    console.log('\n=== E. Moving backwards clears what was moved back past ===')
    {
      const o = await newBooking()
      await db.order.update({ where: { id: o.id }, data: bookingStagePatch('COMPLETED', EMPTY, NOW) })
      const back = await db.order.update({
        where: { id: o.id },
        data: bookingStagePatch('NEW', EMPTY, NOW),
      })
      check('undoing a completion removes its date', back.completedAt === null,
        `completedAt=${back.completedAt}`)
    }

    console.log('\n=== F. The database refuses what the model forbids ===')
    await refuses('a booking cannot hold the wine-only DELIVERED', () =>
      db.$executeRawUnsafe(`UPDATE "Order" SET "stage" = 'DELIVERED' WHERE "tenantId" = '${TENANT}'`))
    await refuses('a wine order cannot hold the bookings-only COMPLETED', () =>
      db.$executeRawUnsafe(`UPDATE "WineOrder" SET "stage" = 'COMPLETED' WHERE "tenantId" = '${TENANT}'`))

    {
      const o = await newBooking()
      await refuses('a CONFIRMED booking must carry its own date', () =>
        db.$executeRawUnsafe(`UPDATE "Order" SET "stage" = 'CONFIRMED', "confirmedAt" = NULL WHERE id = '${o.id}'`))
      await refuses('an order cannot be both abandoned and paid', () =>
        db.$executeRawUnsafe(`UPDATE "Order" SET "abandonedAt" = NOW(), "paidAt" = NOW() WHERE id = '${o.id}'`))
    }
    {
      const w = await newWineOrder()
      await refuses('a DELIVERED wine order must carry its own date', () =>
        db.$executeRawUnsafe(`UPDATE "WineOrder" SET "stage" = 'DELIVERED', "deliveredAt" = NULL WHERE id = '${w.id}'`))
    }

    console.log('\n=== G. Stage strings are validated before they reach the database ===')
    check('a real stage is accepted', isBookingStage('COMPLETED'))
    check('a retired value is rejected', !isBookingStage('PAID'))
    check('a legacy limbo value is rejected', !isBookingStage('PENDING_PAYMENT'))
    check('a typo is rejected', !isBookingStage('COMPLETD'))
    check("the wine guard rejects a booking's word", !isWineOrderStage('COMPLETED'))
    check('and accepts its own', isWineOrderStage('DELIVERED'))

    console.log('\n=== H. Abandoned orders are held out of every order query ===')
    {
      const abandoned = await newBooking({ abandonedAt: NOW })
      const real = await db.order.count({ where: { tenantId: TENANT, ...NOT_ABANDONED } })
      const all = await db.order.count({ where: { tenantId: TENANT } })
      const only = await db.order.count({ where: { tenantId: TENANT, ...ONLY_ABANDONED } })
      check('NOT_ABANDONED excludes it', real === all - only, `${real} of ${all}, ${only} abandoned`)
      check('ONLY_ABANDONED finds it', only >= 1)
      check('the two partition the table exactly', real + only === all)

      // The specific trap: an abandoned order sits at stage NEW like a fresh
      // one, so a stage filter that forgot NOT_ABANDONED would hand the winery
      // abandoned checkouts as work waiting to be done.
      const newAndReal = await db.order.count({
        where: { tenantId: TENANT, stage: 'NEW', ...NOT_ABANDONED },
      })
      const newAll = await db.order.count({ where: { tenantId: TENANT, stage: 'NEW' } })
      check('a stage filter with NOT_ABANDONED hides it', newAndReal < newAll,
        `${newAndReal} vs ${newAll}`)
      void abandoned
    }

    console.log('\n=== I. The payment filter and the row marker agree ===')
    {
      const rows = await db.order.findMany({ where: { tenantId: TENANT, ...NOT_ABANDONED } })
      for (const state of ['paid', 'invoiced', 'unpaid'] as const) {
        const viaQuery = await db.order.count({
          where: { tenantId: TENANT, ...NOT_ABANDONED, ...paymentFilterWhere(state) },
        })
        const viaMarker = rows.filter(r => paymentStateOf(r) === state).length
        check(`"${state}" counts the same in SQL and on the row`, viaQuery === viaMarker,
          `query=${viaQuery} marker=${viaMarker}`)
      }
      const total = await db.order.count({ where: { tenantId: TENANT, ...NOT_ABANDONED } })
      const sum = (await Promise.all((['paid', 'invoiced', 'unpaid'] as const).map(st =>
        db.order.count({ where: { tenantId: TENANT, ...NOT_ABANDONED, ...paymentFilterWhere(st) } })
      ))).reduce((a, b) => a + b, 0)
      // The counts have to partition, not overlap — the old screen reported
      // 31 for 21 bookings because limbo was counted twice.
      check('the three payment filters partition the total', sum === total, `${sum} vs ${total}`)
    }
  } finally {
    await db.order.deleteMany({ where: { tenantId: TENANT } })
    await db.wineOrder.deleteMany({ where: { tenantId: TENANT } })
    await db.tenant.deleteMany({ where: { id: TENANT } })
  }

  console.log(failures === 0
    ? '\n🟢 Stage and payment move independently, and the database enforces it.\n'
    : `\n🔴 ${failures} check(s) failed.\n`)
  process.exitCode = failures === 0 ? 0 : 1
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
