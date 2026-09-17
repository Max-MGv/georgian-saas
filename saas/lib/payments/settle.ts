import { db, withTenantDb } from '@/lib/db'
import { OrderStatus } from '@prisma/client'
import { FINANCIAL_STATUS } from '@/lib/statusBridge'
import { verifyCallbackSignature, toMinorUnits } from '@/lib/payments/flitt'
import { getAllSettings } from '@/app/actions/settings'
import { getAllContent } from '@/app/actions/siteContent'
import { settingValue } from '@/lib/settings'
import { resolveTenantTheme } from '@/lib/themePresets'
import { sendBookingConfirmation } from '@/lib/emails/bookingConfirmation'
import { sendWineOrderReceipt } from '@/lib/emails/wineOrderReceipt'
import { sendNewBookingNotification } from '@/lib/emails/newBookingNotification'
import { DEFAULT_BOOKING_INTRO_PAID, DEFAULT_BOOKING_INTRO_PAID_KA } from '@/lib/emails/templates/bookingConfirmationTemplate'
import { DEFAULT_WINE_RECEIPT_INTRO, DEFAULT_WINE_RECEIPT_INTRO_KA } from '@/lib/emails/templates/wineOrderReceiptTemplate'
import { formatLongDate } from '@/lib/emails/templates/dateFormat'

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

/**
 * Gateway outcomes that mean this attempt is definitively over and unpaid.
 * `processing` is not here on purpose — it may still become `approved`.
 */
const TERMINAL_FAILURES = new Set(['declined', 'expired'])

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

  // One instant shared by the Payment row and the order's own paidAt, so the
  // gateway record and the order can never disagree about when money arrived.
  const settledAt = new Date()

  await withTenantDb(tenantId, async tx => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: orderStatus || 'unknown',
        rawResponse: body as object,
        settledAt: approved ? settledAt : null,
      },
    })

    if (!approved) {
      // A terminal decline is worth writing onto the order, not just the
      // payment: otherwise a wine order sits in "Awaiting Payment" forever when
      // we already know the card was refused. `processing` is deliberately
      // excluded — that one is still in flight and may yet approve.
      if (TERMINAL_FAILURES.has(orderStatus) && payment.wineOrderId) {
        await tx.wineOrder.updateMany({
          where: { id: payment.wineOrderId, status: 'pending_payment' },
          data: { status: 'payment_failed' },
        })
      }
      return
    }

    // Both branches also write the two-axis columns (Plan-StatusModel chunk 3).
    // `paidAtStage` is 'new' rather than a value read from the row because the
    // status guards below already pin these to un-progressed orders — a
    // settlement can only land on something nobody has moved on yet.
    const paidColumns = {
      financialStatusId: FINANCIAL_STATUS.paid,
      paidAt: settledAt,
      paidAtStage: 'new',
    }

    if (payment.orderId) {
      // Guarded on status rather than blindly set: an order a human already
      // moved on (to COMPLETED, or CANCELLED) must not be dragged back to PAID
      // by a late callback.
      await tx.order.updateMany({
        where: { id: payment.orderId, status: { in: [OrderStatus.NEW, OrderStatus.PENDING_PAYMENT] } },
        data: { status: OrderStatus.PAID, ...paidColumns },
      })
    } else if (payment.wineOrderId) {
      // WineOrder.status is a bare String, not the OrderStatus enum — a
      // different convention from Order, and one to keep in mind here.
      await tx.wineOrder.updateMany({
        where: { id: payment.wineOrderId, status: { in: ['pending', 'pending_payment'] } },
        data: { status: 'paid', ...paidColumns },
      })
    }
  })

  // ── Notification ───────────────────────────────────────────────────────────
  // Deliberately here: one shared path, reached by both the webhook and the
  // browser return, and only past the idempotency gate above so a retried
  // callback can't double-send. Never awaited into the response — a mail
  // failure must not make the callback look failed to Flitt, which would earn
  // a retry for a payment that already settled correctly.
  if (approved) {
    void sendSettlementEmail(tenantId, payment.orderId, payment.wineOrderId).catch(err =>
      // Logged loudly rather than swallowed: the money moved, so a missing
      // receipt is a real support issue someone has to chase manually.
      console.error('[flitt:settle] notification failed —', err instanceof Error ? err.message : err)
    )
  }

  return { ok: true, outcome: approved ? 'settled' : 'not-approved', tenantId }
}

/**
 * Build and send the customer's post-payment email.
 *
 * Reads settings via `getAllSettings(tenantId)` rather than `getSetting()`:
 * the latter resolves the tenant from request headers, and on this path the
 * authoritative tenant is the payment's own, which need not match the host that
 * received the callback.
 */
async function sendSettlementEmail(
  tenantId: string,
  orderId: string | null,
  wineOrderId: string | null
): Promise<void> {
  const [tenant, settings] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true, theme: true } }),
    getAllSettings(tenantId),
  ])
  // No guest-specific locale survives to a webhook/redirect callback (see
  // createBooking.ts's comment on the same gap) — falls back to the
  // tenant's site-wide default language instead of the guest's own choice.
  const emailLocale = settingValue(settings, 'default_locale') === 'ka' ? 'ka' : 'en'
  const content = await getAllContent(tenantId, emailLocale)
  const messages = content.messages ?? {}
  const common = {
    // Carried so sendTenantEmail can suppress mail from the demo tenant.
    tenantId,
    wineryName: tenant?.displayName ?? tenant?.name ?? '',
    wineryAddress: settingValue(settings, 'contact_address'),
    wineryPhone: settingValue(settings, 'contact_phone'),
    wineryEmail: settingValue(settings, 'contact_email'),
    theme: resolveTenantTheme(tenant?.theme ?? null),
  }

  if (orderId) {
    const order = await withTenantDb(tenantId, tx => tx.order.findUnique({ where: { id: orderId } }))
    if (!order) return

    const formattedDate = formatLongDate(order.date, emailLocale)

    // No email on file is a legitimate state — phone-only bookings are
    // allowed (createBooking requires phone OR email) — but the winery
    // notification below must still fire regardless.
    if (order.email) {
      await sendBookingConfirmation({
        name: order.name,
        surname: order.surname,
        email: order.email,
        date: formattedDate,
        timeSlot: order.timeSlot,
        guestCount: order.guestCount,
        visitType: order.visitType,
        totalPrice: order.totalPrice ?? 0,
        // This is the confirmation createBooking deliberately withheld — it only
        // becomes true here, once the money actually arrived.
        paid: true,
        introText: messages.email_booking_intro_paid
          ?? (emailLocale === 'ka' ? DEFAULT_BOOKING_INTRO_PAID_KA : DEFAULT_BOOKING_INTRO_PAID),
        locale: emailLocale,
        ...common,
      })
    }

    await sendNewBookingNotification({
      tenantId,
      tenantName: common.wineryName,
      wineryEmail: common.wineryEmail,
      guestName: order.name,
      guestSurname: order.surname,
      guestEmail: order.email,
      guestPhone: order.phone,
      date: formattedDate,
      timeSlot: order.timeSlot,
      guestCount: order.guestCount,
      visitType: order.visitType,
      totalPrice: order.totalPrice ?? 0,
      bookingType: order.bookingType,
      paid: true,
    })
    return
  }

  if (wineOrderId) {
    const wineOrder = await withTenantDb(tenantId, tx =>
      tx.wineOrder.findUnique({ where: { id: wineOrderId }, include: { wineItems: true } })
    )
    if (!wineOrder?.contactEmail) return

    await sendWineOrderReceipt({
      email: wineOrder.contactEmail,
      contactName: wineOrder.contactName,
      businessName: wineOrder.businessName,
      lines: wineOrder.wineItems.map(i => ({
        name: i.wineNameSnapshot,
        year: i.vintageYearSnapshot,
        quantity: i.quantity,
        price: i.priceSnapshot,
      })),
      totalAmount: wineOrder.totalAmount ?? 0,
      discountPercent: wineOrder.discountPercent,
      introText: messages.email_wine_receipt_intro
        ?? (emailLocale === 'ka' ? DEFAULT_WINE_RECEIPT_INTRO_KA : DEFAULT_WINE_RECEIPT_INTRO),
      ...common,
    })
  }
}
