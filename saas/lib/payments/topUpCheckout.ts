/**
 * Card-link top-up (Plan-PostPaymentExtras Chunk 4, KnownBugs #64).
 *
 * ## What this closes
 *
 * Chunk 3 gave the admin a way to record a manual (cash/bank transfer)
 * top-up against an already-paid order's balance due. The guest may only
 * have a card, though — this is this app's own minimal version of Flitt's
 * "Pay by Link" (which turned out not to be usable via API, see
 * Plan-PaymentE2ETesting.md §1b): the admin starts a real Flitt checkout for
 * just the outstanding amount and it's emailed to the guest, so they can pay
 * with their own card without the admin ever handling it.
 *
 * ## Why this needs its own function, not a second call to startCheckout()
 *
 * `startCheckout()` sends `input.orderId` straight through as Flitt's own
 * `order_id` — correct for the ordinary first checkout at booking time, but
 * Flitt's live API rejects a SECOND checkout that reuses that same
 * `order_id` outright, regardless of the first payment's settlement state
 * (confirmed live during the design spike, Plan-PaymentE2ETesting.md's
 * "Design spike (2026-09-25)" §3). `startCheckout()` grew an optional
 * `flittOrderId` override for exactly this — this module is the one caller
 * that supplies one, minted fresh per attempt via `mintTopUpFlittOrderId`.
 * `Payment.orderId` still always carries the real internal order id; nothing
 * in the schema stores Flitt's own order_id anywhere (only
 * `providerPaymentId`, which Flitt generates and returns), so this
 * decoupling costs nothing structurally — confirmed by reading the `Payment`
 * model in schema.prisma before writing this.
 *
 * ## Not gated by shouldTakePayment()
 *
 * Ground rule 5: a top-up is the admin's own deliberate choice, made after
 * the fact, independent of the tenant's module toggle, section toggles, or
 * any company override — those govern whether a GUEST'S OWN booking gets a
 * payment step. The only thing this module checks is whether the tenant has
 * Flitt credentials configured at all — not a policy toggle, just "is there
 * anything to call".
 *
 * ## Balance validation is a UX guard here, not the final authority
 *
 * Unlike `recordAdditionalPayment` (Chunk 3), which validates and writes the
 * `Payment` row in one atomic transaction, this function's "write" is an
 * external HTTP call to Flitt's checkout API — which cannot itself run
 * inside a database transaction. The balance is read fresh immediately
 * before that call, same arithmetic as `recordAdditionalPayment`
 * (`balanceDue(totalPrice, settled)`), so a same-request race is no more
 * likely here than it already is for the original checkout flow. The
 * genuine, authoritative check on what actually gets collected is Flitt's
 * own signed settlement callback through `settle.ts` — this check only
 * stops the admin from generating a link for an amount that's already
 * wrong at the moment they click the button.
 */
import { db } from '@/lib/db'
import { balanceDue, formatTetri, type Tetri } from '@/lib/money'
import { startCheckout } from '@/lib/payments/startCheckout'

/**
 * A fresh, traceable-by-eye Flitt-facing order_id for one top-up checkout
 * attempt. Distinct from the real order id (never reused as Flitt's own
 * reference for a second attempt) and distinct from any previous top-up
 * attempt for the same order (timestamp + random suffix) — both are real,
 * previously-confirmed collision risks (finding 3): Flitt rejects a reused
 * order_id outright, whether the reuse is against the original checkout or
 * against an earlier, possibly-abandoned top-up attempt for the same order.
 */
export function mintTopUpFlittOrderId(orderId: string): string {
  return `${orderId}-topup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export type StartTopUpCheckoutInput = {
  orderId: string
  tenantId: string
  amount: Tetri
  orderDesc: string
  locale?: string
}

export type StartTopUpCheckoutResult =
  | { success: true; checkoutUrl: string; paymentId: string }
  | { error: string }

export async function startTopUpCheckout(
  input: StartTopUpCheckoutInput
): Promise<StartTopUpCheckoutResult> {
  if (input.amount <= 0) {
    return { error: 'Enter an amount greater than zero.' }
  }

  const order = await db.order.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: { totalPrice: true },
  })
  if (!order) return { error: 'Order not found.' }

  const settled = await db.payment.aggregate({
    where: { orderId: input.orderId, settledAt: { not: null }, reversedAt: null },
    _sum: { amount: true },
  })
  const currentBalance = balanceDue(order.totalPrice, settled._sum.amount ?? 0)

  if (input.amount > currentBalance) {
    return {
      error:
        `That's more than the outstanding balance of ${formatTetri(currentBalance, { decimals: true })}. ` +
        `Generate a link for at most the balance due — if more than that is genuinely owed, add it as an extra first.`,
    }
  }

  // Credentials only — deliberately NOT shouldTakePayment()/isPaymentConfigured()'s
  // module/section toggles or company override (ground rule 5). Read directly
  // from Tenant, same fields shouldTakePayment() itself reads, but with none
  // of its business-policy gating.
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { flittMerchantId: true, flittSecretKey: true },
  })
  const merchantId = tenant?.flittMerchantId?.trim()
  const secretKey = tenant?.flittSecretKey
  if (!merchantId || !secretKey) {
    return {
      error: 'Card payments are not set up for this tenant yet — add Flitt credentials in Settings first.',
    }
  }

  const flittOrderId = mintTopUpFlittOrderId(input.orderId)

  const checkoutUrl = await startCheckout({
    tenantId: input.tenantId,
    merchantId,
    secretKey,
    orderId: input.orderId,
    amount: input.amount,
    orderDesc: input.orderDesc,
    locale: input.locale,
    flittOrderId,
  })

  if (!checkoutUrl) {
    return { error: 'Could not start a checkout with the payment provider. Try again in a moment.' }
  }

  // startCheckout() writes the Payment row itself (service-role, no tx — see
  // its own doc comment) and doesn't hand the new row's id back, only the
  // URL. Re-reading it here rather than trusting anything client-supplied
  // later: the follow-up "email this link" step looks the row up by this id,
  // not by a checkoutUrl/amount pair a browser could have tampered with.
  const paymentRow = await db.payment.findFirst({
    where: { orderId: input.orderId, tenantId: input.tenantId, provider: 'flitt', checkoutUrl },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!paymentRow) {
    // Should not happen — startCheckout() only returns a URL after its own
    // db.payment.create() succeeds — but a guest must never be handed a link
    // this app itself cannot later find and settle.
    return { error: 'Checkout was created but could not be located afterward. Do not send this link — contact support.' }
  }

  return { success: true, checkoutUrl, paymentId: paymentRow.id }
}
