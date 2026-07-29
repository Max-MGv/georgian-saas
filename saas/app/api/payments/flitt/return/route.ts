import { settlePayment } from '@/lib/payments/settle'
import { readCallbackBody } from '@/lib/payments/readCallbackBody'

/**
 * Where Flitt sends the customer's **browser** after they finish at the payment
 * page (`response_url`). A real form POST, not a navigation.
 *
 * Settlement is idempotent, so calling it here as well as from the webhook is
 * safe and deliberate: whichever arrives first settles, the other returns
 * 'already-settled'. That matters because the two paths fail independently —
 * a customer behind a flaky connection still gets settled by the webhook, and a
 * webhook blocked upstream still gets settled by the returning browser.
 *
 * The customer is shown a generic result either way. The specific reason a
 * callback was rejected is logged, never rendered: it would tell someone probing
 * the endpoint exactly which check they tripped.
 */
export async function POST(request: Request) {
  const body = await readCallbackBody(request)
  const result = await settlePayment(body)

  let status: 'success' | 'failed' | 'pending'
  if (!result.ok) {
    console.error('[flitt:return] rejected —', result.reason)
    status = 'failed'
  } else if (result.outcome === 'not-approved') {
    status = 'failed'
  } else {
    status = 'success'
  }

  // 303 so the browser follows with a GET — a 307/308 would replay the POST
  // against the result page.
  return Response.redirect(new URL(`/payment/result?status=${status}`, request.url), 303)
}

/**
 * Flitt is configured with one response_url and uses POST, but a customer who
 * reloads or bookmarks the URL arrives by GET. Send them somewhere sensible
 * instead of a 405.
 */
export async function GET(request: Request) {
  return Response.redirect(new URL('/payment/result?status=pending', request.url), 303)
}
