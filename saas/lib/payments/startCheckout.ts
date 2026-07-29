import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { createCheckout } from '@/lib/payments/flitt'

/**
 * Create the Flitt checkout for a just-created order and record the attempt.
 *
 * Returns the URL to redirect the customer to, or null — and null always means
 * "fall back to the reservation-only flow", never "block the customer". The
 * order already exists in the DB by the time this runs; a gateway hiccup must
 * not un-book them (Plan-OnlinePayment §7: the customer never hits the wall).
 *
 * The Payment row is written with a service-role client rather than
 * withTenantDb: it happens in the same request as the order insert, before any
 * RLS context exists for the row, and the callback later needs to find it by
 * providerPaymentId alone.
 */
export async function startCheckout(input: {
  tenantId: string
  merchantId: string
  secretKey: string
  /** Exactly one of these, matching the Payment row shape. */
  orderId?: string
  wineOrderId?: string
  amount: number
  orderDesc: string
  locale?: string
}): Promise<string | null> {
  // The tenant's real domain for this request — never hardcoded. The old site
  // pinned https://www.nikalasmarani.ge/ in the controller, which broke the
  // moment the site moved. x-forwarded-* is what Vercel/the proxy hand us.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) {
    console.error('[flitt] no host header — cannot build callback URLs')
    return null
  }
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const base = `${proto}://${host}`

  const result = await createCheckout({
    merchantId: input.merchantId,
    password: input.secretKey,
    orderId: input.orderId ?? input.wineOrderId ?? '',
    amount: input.amount,
    orderDesc: input.orderDesc,
    responseUrl: `${base}/api/payments/flitt/return`,
    serverCallbackUrl: `${base}/api/payments/flitt/callback`,
    lang: input.locale === 'ka' ? 'ka' : 'en',
    // Cross-check only — the callback's authoritative tenant binding is the
    // Payment row itself (settle.ts), which survives a mid-payment domain move.
    merchantData: input.tenantId,
  })

  if ('error' in result) {
    console.error('[flitt] checkout creation failed:', result.error)
    return null
  }

  try {
    await db.payment.create({
      data: {
        tenantId: input.tenantId,
        orderId: input.orderId ?? null,
        wineOrderId: input.wineOrderId ?? null,
        provider: 'flitt',
        providerPaymentId: result.paymentId,
        checkoutUrl: result.checkoutUrl,
        status: 'created',
        amount: input.amount,
      },
    })
  } catch (e) {
    // No Payment row means the callback could never settle this checkout —
    // sending the customer to it would take their money into a black hole.
    // Reservation-only is the safe degradation.
    console.error('[flitt] failed to record payment row:', e instanceof Error ? e.message : e)
    return null
  }

  return result.checkoutUrl
}
