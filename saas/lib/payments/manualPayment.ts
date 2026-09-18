/**
 * Payments that did not come through the gateway (chunk 6, 2026-09-18).
 *
 * ## The split this closes
 *
 * `Payment` was a Flitt attempt log: only card payments ever created a row. A
 * company paying by bank transfer, cash on the day, or an admin correcting a
 * mistake produced no row at all — "mark as paid" wrote `Order.paidAt` and
 * stopped there. So `SUM(Payment.amount)` was card revenue while
 * `paidAt IS NOT NULL` was all revenue, nothing reconciled the two, and nothing
 * in the schema said which was which.
 *
 * Now every payment is a row, whatever channel it arrived through.
 *
 * ## `paidAt` still exists, and still matters
 *
 * It stays as the cached current state — read on every board render, every
 * filter, and enforced by a database constraint against `abandonedAt`. This
 * module keeps the ledger beside it in agreement, rather than replacing it.
 * Making `paidAt` a derived query would put a join on the hot path for no gain.
 */
import type { TxClient } from '@/lib/db'
import type { Tetri } from '@/lib/money'

/** Rows this module writes, as opposed to the gateway's own. */
const MANUAL_PROVIDER = 'manual'

type OrderRef = { orderId?: string | null; wineOrderId?: string | null }

/**
 * Is this order already covered by a payment that counts?
 *
 * Settled and not reversed. Used to stop a second row appearing when an admin
 * toggles paid off and on again for an order the gateway already settled — the
 * card payment is still real, and a manual row beside it would double-count.
 */
async function hasLivePayment(tx: TxClient, ref: OrderRef): Promise<boolean> {
  const found = await tx.payment.findFirst({
    where: {
      ...(ref.orderId ? { orderId: ref.orderId } : { wineOrderId: ref.wineOrderId ?? undefined }),
      settledAt: { not: null },
      reversedAt: null,
    },
    select: { id: true },
  })
  return found != null
}

/**
 * Record a payment an admin marked by hand.
 *
 * No-op when the order already has a live payment, so this is safe to call on
 * every "mark as paid" without checking first.
 *
 * `method` is MANUAL rather than CASH or BANK_TRANSFER because the admin was
 * not asked how the money arrived. Those values exist for when a picker is
 * added; guessing on the admin's behalf would put a fact in the ledger that
 * nobody asserted.
 */
export async function recordManualPayment(
  tx: TxClient,
  // `amount` is TETRI. Typed `number` until 2026-09-18 — no live bug behind it,
  // but it was the last unbranded money parameter in the codebase, and bug #45
  // is what an unbranded one costs when someone wires a lari field to it.
  input: OrderRef & { tenantId: string | null; amount: Tetri; at: Date }
): Promise<void> {
  if (await hasLivePayment(tx, input)) return

  await tx.payment.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId ?? null,
      wineOrderId: input.wineOrderId ?? null,
      provider: MANUAL_PROVIDER,
      method: 'MANUAL',
      // The gateway's verbatim string has no meaning here; this says plainly
      // where the row came from.
      status: 'recorded',
      amount: input.amount,
      settledAt: input.at,
    },
  })
}

/**
 * Un-pay: mark the payments we recorded as reversed, rather than deleting them.
 *
 * **Only rows this module wrote.** A card payment that really settled is money
 * the gateway is holding; marking that row reversed would misstate reality. An
 * admin un-paying a gateway-paid order is an override, and the `OrderEvent`
 * row is what records that (chunk 5).
 *
 * Reversal rather than deletion because a ledger that can lose rows is not a
 * ledger — "this was recorded as paid on the 3rd and taken back on the 19th" is
 * the fact worth keeping.
 */
export async function reverseManualPayments(
  tx: TxClient,
  input: OrderRef & { at: Date }
): Promise<void> {
  await tx.payment.updateMany({
    where: {
      ...(input.orderId ? { orderId: input.orderId } : { wineOrderId: input.wineOrderId ?? undefined }),
      provider: MANUAL_PROVIDER,
      reversedAt: null,
    },
    data: { reversedAt: input.at },
  })
}
