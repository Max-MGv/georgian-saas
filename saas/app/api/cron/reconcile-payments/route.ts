import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkOrderStatus } from '@/lib/payments/flitt'
import { settlePayment } from '@/lib/payments/settle'

/**
 * Daily reconciliation for Flitt payments that never got a callback at all
 * (KnownBugs.md #61).
 *
 * Every real payment is confirmed through two independent channels — the
 * browser redirect (app/api/payments/flitt/return) and the server-to-server
 * webhook (app/api/payments/flitt/callback) — both calling the single
 * `settlePayment()` in lib/payments/settle.ts. Flitt retries the webhook for
 * up to 24h, and the two channels fail independently, so this is genuinely
 * rare — but if a guest's browser crashes right after paying AND something
 * blocks the webhook across every retry, the order sits there marked unpaid
 * forever with nothing noticing. This job asks Flitt directly, once a day,
 * for any payment that's had zero response from either channel for over an
 * hour: "did this actually go through?" — and if yes, settles it through the
 * exact same trusted path a normal callback would use.
 *
 * Decisions already made (do not re-litigate here):
 *   - Auto-settle, not flag-for-review. A confirmed approval settles for real,
 *     immediately — same trust level as a normal late webhook.
 *   - Daily cron. This project's Vercel plan only runs cron once a day; this
 *     is the second entry alongside reseed-demo (vercel.json). Worst case a
 *     stuck payment isn't caught for ~24h instead of never — accepted.
 *
 * Flitt's status endpoint looks up by `order_id`, not `payment_id`. This used
 * to be a guessing problem: for an ordinary first checkout `order_id` equals
 * `payment.orderId ?? payment.wineOrderId`, but startCheckout also supports a
 * `flittOrderId` override for a SECOND checkout attempt on the same order
 * (the post-payment top-up flow) — and that override value used to go
 * nowhere, so a stuck SECOND attempt couldn't be reconciled. Closed by
 * `Payment.flittOrderId` (schema.prisma), which now stores the exact
 * `order_id` string sent for every checkout attempt, override or not. The
 * reconstruction below reads that column first and only falls back to
 * `orderId ?? wineOrderId` for pre-migration rows, where the override was
 * never used historically anyway so the old guess was already correct.
 *
 * Only ever touches `Payment` rows with `status: 'created'` — i.e. rows with
 * genuinely zero callback of any kind. A payment that already reached
 * `processing` (a real, legitimate non-terminal Flitt state — see settle.ts's
 * own comments) is NOT this job's job to chase; that's a known, smaller,
 * separate remaining gap.
 *
 * Uses `db` directly (service-role), the same way settle.ts's own initial
 * Payment lookup does and reseed-demo does its cross-tenant seeding — this
 * job is inherently cross-tenant, there's no single tenant context to scope
 * it to.
 *
 * Scheduled from vercel.json. Same CRON_SECRET bearer-token guard as
 * reseed-demo, copied deliberately rather than reinvented.
 */

// Mirrors reseed-demo: long enough for a sequential loop over rows, each of
// which makes a real outbound HTTP call to Flitt.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** A payment younger than this might still get a callback any second — leave it alone. */
const STUCK_AFTER_MS = 60 * 60 * 1000 // 1 hour

/**
 * A payment older than this is treated as a dead row, not re-queried forever.
 * Not specified anywhere precise — a sane default so this job doesn't keep
 * paying the cost of asking Flitt about ancient, essentially-abandoned
 * checkouts on every single run.
 */
const GIVE_UP_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured; refusing to run' },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const now = Date.now()

  const candidates = await db.payment.findMany({
    where: {
      provider: 'flitt',
      status: 'created',
      settledAt: null,
      createdAt: {
        lt: new Date(now - STUCK_AFTER_MS),
        gt: new Date(now - GIVE_UP_AFTER_MS),
      },
    },
  })

  let checked = 0
  let settled = 0
  let errored = 0
  let skipped = 0

  for (const payment of candidates) {
    checked++

    try {
      const tenantId = payment.tenantId
      if (!tenantId) {
        skipped++
        console.error(`[reconcile-payments] payment ${payment.id} has no tenantId — skipping`)
        continue
      }

      // Prefer the persisted value (exact order_id Flitt was actually given —
      // see the file header above). Falls back to the old guess only for
      // legacy rows predating the flittOrderId column, where it's still
      // correct since the override was never used before this migration.
      const orderId = payment.flittOrderId || payment.orderId || payment.wineOrderId || ''
      if (!orderId) {
        skipped++
        console.error(`[reconcile-payments] payment ${payment.id} has neither orderId nor wineOrderId — skipping`)
        continue
      }

      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { flittMerchantId: true, flittSecretKey: true },
      })
      if (!tenant?.flittMerchantId || !tenant?.flittSecretKey) {
        skipped++
        console.error(`[reconcile-payments] tenant ${tenantId} has no Flitt credentials configured — skipping payment ${payment.id}`)
        continue
      }

      const statusResult = await checkOrderStatus({
        merchantId: tenant.flittMerchantId,
        password: tenant.flittSecretKey,
        orderId,
      })

      if ('error' in statusResult) {
        errored++
        console.error(`[reconcile-payments] status check failed for payment ${payment.id} (order_id=${orderId}): ${statusResult.error}`)
        continue
      }

      if (statusResult.response.response_status !== 'success') {
        errored++
        console.error(`[reconcile-payments] status query rejected for payment ${payment.id} (order_id=${orderId}): response_status=${String(statusResult.response.response_status)}`)
        continue
      }

      // Hand Flitt's raw response straight to the same function a live
      // callback uses — signature verification, the amount-match gate, and
      // the idempotency gate all apply exactly as they would for a real
      // callback. No duplicated settlement logic here.
      const settleResult = await settlePayment(statusResult.response)
      if (!settleResult.ok) {
        errored++
        console.error(`[reconcile-payments] settlePayment rejected payment ${payment.id} (order_id=${orderId}): ${settleResult.reason}`)
        continue
      }

      if (settleResult.outcome === 'settled') settled++
      console.log(`[reconcile-payments] payment ${payment.id} (order_id=${orderId}): ${settleResult.outcome}`)
    } catch (e) {
      // One bad row must never abort the whole run.
      errored++
      const reason = e instanceof Error ? e.message : String(e)
      console.error(`[reconcile-payments] unexpected error on payment ${payment.id}:`, reason)
    }
  }

  const summary = { checked, settled, errored, skipped, elapsedMs: Date.now() - startedAt }
  console.log(
    `[reconcile-payments] checked ${checked}, settled ${settled}, errored ${errored}, skipped ${skipped} in ${summary.elapsedMs}ms`,
  )

  return NextResponse.json({ ok: true, ...summary })
}
