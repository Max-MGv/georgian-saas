import { db, withTenantDb } from '@/lib/db'
import { recordOrderEvent } from '@/lib/orderEvents'
import { verifyCallbackSignature } from '@/lib/payments/flitt'
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
  // reports minor units and `payment.amount` is now stored in tetri, so this is
  // an integer-to-integer comparison with no conversion and no float division
  // on either side (chunk 3, 2026-09-18).
  const reportedMinor = Number(body.amount)
  const expectedMinor = payment.amount
  if (!Number.isFinite(reportedMinor) || reportedMinor !== expectedMinor) {
    return { ok: false, reason: `amount mismatch: expected ${expectedMinor}, got ${body.amount}` }
  }

  const reportedCurrency = body.currency != null ? String(body.currency) : ''
  if (reportedCurrency && reportedCurrency !== payment.currency) {
    return { ok: false, reason: `currency mismatch: expected ${payment.currency}, got ${reportedCurrency}` }
  }

  const orderStatus = body.order_status != null ? String(body.order_status) : ''

  // Record the outcome whatever it is — a decline is real history worth keeping,
  // and rawResponse is what a human reconciles against Flitt's portal when
  // something goes wrong. Only an approval advances the order.
  const approved = orderStatus === APPROVED

  // One instant shared by the Payment row and the order's own paidAt, so the
  // gateway record and the order can never disagree about when money arrived.
  const settledAt = new Date()

  const outcome = await withTenantDb(tenantId, async tx => {
    // ── Gate 3: idempotency ──────────────────────────────────────────────────
    // Flitt retries, and the return and callback routes both fire for the same
    // payment — confirmed live: both response_url and server_callback_url can
    // land inside the same tens-of-milliseconds, well before either write below
    // commits. Checking `payment.settledAt` from the read above is not enough —
    // both concurrent calls would see it still null and both would proceed. The
    // fix is to make the claim itself atomic: this conditional update is the
    // idempotency gate, not a check before one.
    //
    // Gated on `settledAt: null`, not `status: 'created'`. An earlier version of
    // this fix (commit 45f8629, 2026-09-24) gated on `status: 'created'` and was
    // wrong: Flitt can legitimately send a non-final `processing` callback before
    // the real, final `approved`/`declined` one (see the `processing` comment
    // further down — a card can be "still in flight and may yet approve"). The
    // FIRST callback of ANY kind flips `status` away from `'created'` permanently,
    // so under that gate a `processing` callback would claim the row and the
    // later genuine final callback would be silently rejected as
    // "already-settled" — a customer who actually paid could have their order
    // stuck unpaid forever, with nothing surfacing the loss.
    //
    // `settledAt` is the one fact that actually needs to be atomic: "has this
    // payment ever truly, finally succeeded." It is set exactly once, only on an
    // approval, and once set nothing should ever act on this payment again. That
    // is exactly what this `where` clause guarantees — a `processing` callback
    // leaves `settledAt` null, so a later `approved`/`declined` callback still
    // passes the gate, while two truly simultaneous `approved` deliveries for the
    // same row still can't both win: Postgres serializes the concurrent
    // `updateMany`s, the second one finds `settledAt` already non-null, and
    // `claim.count === 0` correctly reports it as already-settled. That closes
    // the original race this gate exists for.
    //
    // Refinement (2026-09-24, following an independent audit of the fix above —
    // see KnownBugs.md #60's follow-up): the trade-off this comment used to
    // accept turned out to be closeable for free. Two simultaneous deliveries of
    // the exact same NON-final status (two `processing` pings, or two genuine
    // `declined` pings) both used to pass the `settledAt: null` gate and both
    // recorded a duplicate `OrderEvent` row. Adding `status: { not: orderStatus
    // || 'unknown' }` closes that: Postgres still serializes the two concurrent
    // `updateMany`s on the same row, and the second one now additionally
    // requires the row's *current* `status` to differ from the status it's
    // trying to write. For two identical pings that's false the second time
    // (the first one already wrote that same status), so `claim.count === 0`
    // and the duplicate is correctly dropped. A genuine `processing → approved`
    // sequence is untouched — the statuses differ, so the second call still
    // passes both conditions and settles normally. This is additive to the
    // `settledAt` condition, not a replacement for it: `settledAt` is still what
    // guarantees a payment can never be un-settled or re-settled once approved.
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, settledAt: null, status: { not: orderStatus || 'unknown' } },
      data: {
        status: orderStatus || 'unknown',
        rawResponse: body as object,
        settledAt: approved ? settledAt : null,
      },
    })
    if (claim.count === 0) {
      // Someone else — a concurrent call, or a genuine retry — already claimed
      // this row. Don't record another event, don't touch the order.
      return 'already-settled' as const
    }

    if (!approved) {
      // Refinement (2026-09-24, same audit as the WHERE clause above): only
      // record `OrderEvent(PAYMENT_DECLINED)` for a genuine terminal
      // non-approval, not for `processing`. `processing` means the payment is
      // still in flight and may yet approve — it is not a decline, and until
      // now this branch recorded one anyway for *any* non-`approved` status.
      // A `processing → approved` sequence (a real, legitimate Flitt pattern —
      // see the gate comment above) used to write a `PAYMENT_DECLINED` event
      // followed shortly by a `PAID` event, leaving a false "declined, then
      // somehow paid" line on the order's own timeline. There is deliberately
      // no new `OrderEventType` for "still processing" here — that needs a
      // Prisma migration, a separate, bigger workflow per
      // vault/ClaudeInstructions.md Rule 10, out of scope for this fix. Skipping
      // the event entirely for an in-flight ping is the simplest honest choice:
      // no event is a more accurate record than a wrong one. The `Payment` row's
      // `status`/`rawResponse` above still update unconditionally either way —
      // only whether an `OrderEvent` gets written is conditional here.
      if (orderStatus !== 'processing') {
        // A refusal is real history. The Payment row keeps the gateway's verbatim
        // status; this puts the same fact on the order's own timeline, where
        // anyone looking at the order will actually see it.
        await recordOrderEvent(tx, {
          tenantId,
          orderId: payment.orderId,
          wineOrderId: payment.wineOrderId,
          type: 'PAYMENT_DECLINED',
          actorType: 'GATEWAY',
          payload: { provider: payment.provider, status: orderStatus || 'unknown', amount: payment.amount },
        })
      }

      // A declined card needs nothing written onto the order any more. It was
      // already marked incomplete when the guest was sent to the gateway, and
      // since Feature 191 a refusal and a closed tab are the same fact to the
      // winery: an order that never happened. What distinguishes them lives on
      // the Payment row, which keeps the gateway's own verbatim status.
      //
      // `processing` was the reason this used to branch — it is still in flight
      // and may yet approve — and that distinction now costs nothing for the
      // order's own fields, because neither case writes to the order. It does
      // still matter for the `OrderEvent` above, which is why that part stayed
      // conditional even after this comment originally said the distinction
      // "costs nothing."
      return 'not-approved' as const
    }

    // Money arriving is what turns an incomplete checkout into a real order, so
    // the same write clears `abandonedAt`. The database enforces the pairing
    // (`*_abandoned_is_unpaid`), so a paid write that forgot it would fail
    // loudly rather than leave a paid order filed under abandoned.
    const paidColumns = { paidAt: settledAt, abandonedAt: null }

    await recordOrderEvent(tx, {
      tenantId,
      orderId: payment.orderId,
      wineOrderId: payment.wineOrderId,
      type: 'PAID',
      actorType: 'GATEWAY',
      payload: { provider: payment.provider, providerPaymentId, amount: payment.amount },
    })

    // Guarded on stage rather than blindly set: an order a human already moved
    // on — completed it, or cancelled it — must not have its fulfilment dragged
    // backwards by a late callback. `stage: 'NEW'` says exactly that, which is
    // what the old `status IN (NEW, PENDING_PAYMENT)` guard was reaching for
    // through a column that mixed the two ideas together.
    if (payment.orderId) {
      await tx.order.updateMany({
        where: { id: payment.orderId, stage: 'NEW' },
        data: paidColumns,
      })
    } else if (payment.wineOrderId) {
      await tx.wineOrder.updateMany({
        where: { id: payment.wineOrderId, stage: 'NEW' },
        data: paidColumns,
      })
    }

    return 'settled' as const
  })

  // ── Notification ───────────────────────────────────────────────────────────
  // Deliberately here: one shared path, reached by both the webhook and the
  // browser return, and only past the idempotency gate above so a retried
  // callback can't double-send. Never awaited into the response — a mail
  // failure must not make the callback look failed to Flitt, which would earn
  // a retry for a payment that already settled correctly. Gated on the
  // transaction's own outcome (the winner of the atomic claim above), not on
  // `approved` alone — the loser of a concurrent race must never send this.
  if (outcome === 'settled') {
    void sendSettlementEmail(tenantId, payment.orderId, payment.wineOrderId).catch(err =>
      // Logged loudly rather than swallowed: the money moved, so a missing
      // receipt is a real support issue someone has to chase manually.
      console.error('[flitt:settle] notification failed —', err instanceof Error ? err.message : err)
    )
  }

  return { ok: true, outcome, tenantId }
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
