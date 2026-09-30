import * as dotenv from 'dotenv'
import path from 'path'
// saas/tests/helpers/orderMoneyDb.ts -> saas/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'

/**
 * Direct DB read of the one money fact this suite otherwise has to take on
 * faith: `Payment.amount` (what was actually charged/settled at the gateway,
 * or manually recorded) alongside `Order.totalPrice` (what every UI surface
 * — admin orders table, order detail, CSV export, invoice email — actually
 * shows). Built for Chunk 6 (vault/Plan-PaymentE2ETesting.md, "edit after the
 * fact"), which exists specifically because §4's dependency map flags
 * `Payment.amount` as having **no UI surface anywhere in the app** ("Nowhere
 * in the current UI directly ... only indirectly via Order.paidAt"). A
 * Playwright assertion against the rendered page can therefore never, by
 * itself, prove whether the two have diverged after an edit — only a direct
 * read of the row can. This connects with a plain, unauthenticated
 * `PrismaClient` (via `@/lib/db`, same client the app itself uses) against the
 * real `DATABASE_URL` in `saas/.env` — the dev Supabase project, same DB
 * `staging.vineworks.ge` reads from — exactly like `scripts/audit-money.ts`
 * does for its own read-only audits. Bypasses RLS by design (there is no
 * tenant session to set up for a plain read like this, and nothing here ever
 * writes), and is scoped to reads only for exactly that reason.
 */
export type OrderPaymentRow = {
  id: string
  provider: string
  method: string
  status: string
  amount: number
  settledAt: Date | null
  reversedAt: Date | null
}

export type OrderMoneyState = {
  totalPrice: number | null
  paidAt: Date | null
  abandonedAt: Date | null
  payments: OrderPaymentRow[]
}

export async function readOrderMoneyState(orderId: string): Promise<OrderMoneyState> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true },
  })
  return {
    totalPrice: order.totalPrice,
    paidAt: order.paidAt,
    abandonedAt: order.abandonedAt,
    payments: order.payments.map(p => ({
      id: p.id,
      provider: p.provider,
      method: p.method,
      status: p.status,
      amount: p.amount,
      settledAt: p.settledAt,
      reversedAt: p.reversedAt,
    })),
  }
}

/** Extracts the order id from a `/admin/orders/<id>` detail URL — same shape
 * every tier5 spec already derives `detailPath` from, just carried one step
 * further to the bare id this helper's queries need. */
export function orderIdFromDetailUrl(detailUrl: string): string {
  const path = new URL(detailUrl).pathname
  const id = path.split('/').filter(Boolean).pop()
  if (!id) throw new Error(`Could not extract an order id from ${detailUrl}`)
  return id
}

/** Call once at the end of a test file/run — a long-lived Prisma connection
 * otherwise keeps the Playwright worker process alive past the test. */
export async function disconnectOrderMoneyDb(): Promise<void> {
  await db.$disconnect()
}
