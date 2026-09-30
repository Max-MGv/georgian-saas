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
import { balanceDue, formatTetri, type Tetri } from '@/lib/money'

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
 * `method` defaults to MANUAL — the admin was not asked how the money arrived
 * — but the "Paid" picker now lets them say BANK_TRANSFER or CASH, which is
 * passed straight through. Guessing one on the admin's behalf when they
 * weren't asked would put a fact in the ledger that nobody asserted.
 */
export async function recordManualPayment(
  tx: TxClient,
  // `amount` is TETRI. Typed `number` until 2026-09-18 — no live bug behind it,
  // but it was the last unbranded money parameter in the codebase, and bug #45
  // is what an unbranded one costs when someone wires a lari field to it.
  input: OrderRef & { tenantId: string | null; amount: Tetri; at: Date; method?: 'BANK_TRANSFER' | 'CASH' }
): Promise<void> {
  if (await hasLivePayment(tx, input)) return

  await tx.payment.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId ?? null,
      wineOrderId: input.wineOrderId ?? null,
      provider: MANUAL_PROVIDER,
      method: input.method ?? 'MANUAL',
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

/**
 * Record a genuine *additional* payment — a real top-up against the balance
 * due, not the same payment being recorded twice (Plan-PostPaymentExtras
 * Chunk 3, KnownBugs #64 finding 1).
 *
 * `recordManualPayment`/`hasLivePayment` exist to make "mark as paid" safe to
 * call repeatedly — a no-op once the order already has a settled payment, so
 * toggling the status picker never double-records the *same* charge. That
 * guard is correct for its own job and is deliberately left untouched here
 * (ground rule 1): this is a new, separate function that **always** writes a
 * new `Payment` row, because a post-payment extra creates a second, genuinely
 * different charge that the first guard would otherwise silently swallow.
 *
 * Only supports a real `orderId` — not the `wineOrderId` half of this
 * module's usual `OrderRef` shape. Balance-due (Chunk 2) was only ever wired
 * up for bookings; a wine order has no `balanceDue()` call site anywhere in
 * the app, so accepting one here would validate against a concept that does
 * not exist for it. Extending this to wine orders is out of scope until
 * Chunk 2's balance concept itself is.
 *
 * The amount is validated against the current balance due, computed fresh
 * inside this same transaction from a real read of `Order.totalPrice` and a
 * real sum of every settled, non-reversed `Payment` row already on the order
 * — never a value the caller computed before the transaction opened, so two
 * concurrent top-up attempts cannot both be validated against a balance that
 * was only ever correct for the first of them.
 *
 * An amount of zero or less is rejected outright. An amount greater than the
 * current balance is also rejected outright, rather than silently clamped to
 * the balance: clamping would record an amount the admin never actually
 * typed, without telling them, and letting the top-up path itself create a
 * negative/overpaid-looking balance is exactly the kind of "screen disagrees
 * with reality" gap this whole plan exists to close, just with the money
 * moving the other way. Partial collection (recording less than the full
 * balance) is fully supported and is not an error.
 */
export async function recordAdditionalPayment(
  tx: TxClient,
  input: {
    orderId: string
    tenantId: string | null
    amount: Tetri
    at: Date
    method: 'BANK_TRANSFER' | 'CASH'
  }
): Promise<{ success: true; paymentId: string } | { error: string }> {
  if (input.amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }

  const order = await tx.order.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: { totalPrice: true },
  })
  if (!order) return { error: 'Order not found.' }

  const settled = await tx.payment.aggregate({
    where: { orderId: input.orderId, settledAt: { not: null }, reversedAt: null },
    _sum: { amount: true },
  })
  const currentBalance = balanceDue(order.totalPrice, settled._sum.amount ?? 0)

  if (input.amount > currentBalance) {
    return {
      error:
        `That's more than the outstanding balance of ${formatTetri(currentBalance, { decimals: true })}. ` +
        `Record at most the balance due — if more than that is genuinely owed, add it as an extra first.`,
    }
  }

  const created = await tx.payment.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      provider: MANUAL_PROVIDER,
      method: input.method,
      status: 'recorded',
      amount: input.amount,
      settledAt: input.at,
    },
  })
  return { success: true, paymentId: created.id }
}
