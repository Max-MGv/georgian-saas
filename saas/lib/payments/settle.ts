import { db, withTenantDb } from '@/lib/db'
import { OrderStatus } from '@prisma/client'
import { verifyCallbackSignature, toMinorUnits } from '@/lib/payments/flitt'

/**
 * The single place a payment is marked settled.
 *
 * Both inbound paths — the browser return POST and the server-to-server webhook
 * — call this. They are deliberately not allowed their own copies: the old
 * Laravel site duplicated the whole "mark paid + email" block across its
 * `response()` and `callback()` handlers, and the two had already drifted apart
 * (one used a translation key, the other hardcoded raw text). One function, two
 * callers.
 *
 * Everything here runs before the caller trusts anything in the request body.
 * The old code trusted `order_status` blindly, which meant anyone who learned a
 * payment_id could POST a forged approval.
 */

export type SettleResult =
  | { ok: true; outcome: 'settled' | 'already-settled' | 'not-approved'; tenantId: string }
  | { ok: false; reason: string }

/** Flitt's terminal success value. Anything else is not a paid order. */
const APPROVED = 'approved'

export async function settlePayment(body: Record<string, unknown>): Promise<SettleResult> {
  const providerPaymentId = body.payment_id != null ? String(body.payment_id) : ''
  if (!providerPaymentId) return { ok: false, reason: 'callback carried no payment_id' }

  // Service-role read: we cannot enter a tenant's RLS context until we know
  // which tenant this is, and the Payment row is what tells us. Same pattern
  // proxy.ts already uses for its Tenant lookup. Nothing from the request body
  // is trusted yet — this is a lookup by an opaque id, not an authorisation.
  const payment = await db.payment.findUnique({
    where: { provider_providerPaymentId: { provider: 'flitt', providerPaymentId } },
  })
  if (!payment) return { ok: false, reason: 'no payment matches that payment_id' }

  const tenantId = payment.tenantId
  if (!tenantId) return { ok: false, reason: 'payment row has no tenant' }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { flittSecretKey: true },
  })
  const secret = tenant?.flittSecretKey
  if (!secret) return { ok: false, reason: 'tenant has no Flitt secret configured' }

  // ── Gate 1: authenticity ───────────────────────────────────────────────────
  if (!verifyCallbackSignature(body, secret)) {
    return { ok: false, reason: 'signature verification failed' }
  }

  // ── Gate 2: the amount is the one we asked for ─────────────────────────────
  // Without this, a customer who tampers with the checkout could settle a 400
  // GEL booking for one tetri and the order would read as fully paid. Flitt
  // reports minor units, so the stored major-unit amount is converted rather
  // than the other way around (no float division).
  const reportedMinor = Number(body.amount)
  const expectedMinor = toMinorUnits(payment.amount)
  if (!Number.isFinite(reportedMinor) || reportedMinor !== expectedMinor) {
    return { ok: false, reason: `amount mismatch: expected ${expectedMinor}, got ${body.amount}` }
  }

  const reportedCurrency = body.currency != null ? String(body.currency) : ''
  if (reportedCurrency && reportedCurrency !== payment.currency) {
    return { ok: false, reason: `currency mismatch: expected ${payment.currency}, got ${reportedCurrency}` }
  }

  const orderStatus = body.order_status != null ? String(body.order_status) : ''

  // ── Gate 3: idempotency ────────────────────────────────────────────────────
  // Flitt retries, and the return and callback routes both fire for the same
  // payment. Settling twice would double-send the customer's email.
  if (payment.settledAt) {
    return { ok: true, outcome: 'already-settled', tenantId }
  }

  // Record the outcome whatever it is — a decline is real history worth keeping,
  // and rawResponse is what a human reconciles against Flitt's portal when
  // something goes wrong. Only an approval advances the order.
  const approved = orderStatus === APPROVED

  await withTenantDb(tenantId, async tx => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: orderStatus || 'unknown',
        rawResponse: body as object,
        settledAt: approved ? new Date() : null,
      },
    })

    if (!approved) return

    if (payment.orderId) {
      // Guarded on status rather than blindly set: an order a human already
      // moved on (to COMPLETED, or CANCELLED) must not be dragged back to PAID
      // by a late callback.
      await tx.order.updateMany({
        where: { id: payment.orderId, status: { in: [OrderStatus.NEW, OrderStatus.PENDING_PAYMENT] } },
        data: { status: OrderStatus.PAID },
      })
    } else if (payment.wineOrderId) {
      // WineOrder.status is a bare String, not the OrderStatus enum — a
      // different convention from Order, and one to keep in mind here.
      await tx.wineOrder.updateMany({
        where: { id: payment.wineOrderId, status: { in: ['pending', 'pending_payment'] } },
        data: { status: 'paid' },
      })
    }
  })

  // Customer and winery notification is wired in phase 7. It belongs here —
  // after the write, in the one shared path — not in either route handler.

  return { ok: true, outcome: approved ? 'settled' : 'not-approved', tenantId }
}
