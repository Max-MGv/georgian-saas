import { settlePayment } from '@/lib/payments/settle'
import { readCallbackBody } from '@/lib/payments/readCallbackBody'

/**
 * Flitt's server-to-server payment webhook (`server_callback_url`).
 *
 * This is the authoritative settlement path — it fires even if the customer
 * closes the tab before being redirected back. It is also the only genuinely
 * unrecoverable path in the payment flow: if this fails, the card has been
 * charged and the order still reads unpaid. Every rejection is logged with its
 * reason so a human can reconcile against Flitt's own portal.
 *
 * proxy.ts returns early for /api/payments/* — without that, the redirects for
 * `!modulesPublicSite` and unknown tenants would turn this POST into a 307 that
 * Flitt cannot follow.
 *
 * The repo's first Route Handler. Everything else is a Server Action, which
 * cannot be used here: this is an inbound machine-to-machine request, not a
 * page-initiated one.
 */
export async function POST(request: Request) {
  const body = await readCallbackBody(request)
  const result = await settlePayment(body)

  if (!result.ok) {
    // 200, not 4xx, and deliberately so: a non-2xx makes Flitt retry, and none
    // of these failures are retryable — a bad signature or a mismatched amount
    // will fail identically forever. Retrying would just bury the real event in
    // duplicates. The log line is the alert.
    console.error('[flitt:callback] rejected —', result.reason)
    return Response.json({ status: 'rejected' }, { status: 200 })
  }

  return Response.json({ status: 'ok', outcome: result.outcome }, { status: 200 })
}
