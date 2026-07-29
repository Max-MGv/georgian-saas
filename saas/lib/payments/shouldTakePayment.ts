import { db } from '@/lib/db'
import { headers } from 'next/headers'

export type PaymentGate =
  | { takePayment: true; merchantId: string; secretKey: string }
  | { takePayment: false }

/**
 * Decides whether a just-created order should be routed to online checkout,
 * and hands back the tenant's credentials when it should.
 *
 * The rules, in order (Plan-OnlinePayment §7):
 *  - module off → reservation-only. This is the toggle that keeps every
 *    existing tenant byte-identical to today.
 *  - credentials missing → reservation-only, even with the module on. A
 *    half-configured tenant must degrade to the working flow, not error.
 *  - price null or ≤ 0 → reservation-only. Means "pricing not configured,
 *    winery confirms manually" (see createBooking) — not a free booking, and
 *    not chargeable.
 *  - price deliberately hidden from the customer → reservation-only. Charging
 *    an amount the customer was never shown is a chargeback waiting to happen;
 *    those settle by invoice. Callers pass `priceShown: false` for that case.
 *
 * Reads the module flag from the proxy's request header (same source the site
 * layout uses) and the credentials from Tenant — deliberately not from Setting,
 * see MaintenanceNotes §9.
 */
export async function shouldTakePayment(input: {
  tenantId: string
  totalPrice: number | null | undefined
  priceShown: boolean
}): Promise<PaymentGate> {
  const h = await headers()
  if (h.get('x-tenant-modules-online-payment') !== 'true') return { takePayment: false }

  if (!input.priceShown) return { takePayment: false }
  if (input.totalPrice == null || input.totalPrice <= 0) return { takePayment: false }

  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { flittMerchantId: true, flittSecretKey: true },
  })
  const merchantId = tenant?.flittMerchantId?.trim()
  const secretKey = tenant?.flittSecretKey
  if (!merchantId || !secretKey) return { takePayment: false }

  return { takePayment: true, merchantId, secretKey }
}

/**
 * Lighter check for rendering: is this tenant set up to take payment at all
 * (module on + both credentials present)? Drives button labels — "Book" vs
 * "Book & Pay" — so a tenant with the module on but no credentials shows the
 * plain booking button rather than promising a payment step that the server
 * would then quietly skip. Returns a boolean only; the secret never leaves
 * the server.
 */
export async function isPaymentConfigured(tenantId: string): Promise<boolean> {
  const h = await headers()
  if (h.get('x-tenant-modules-online-payment') !== 'true') return false
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { flittMerchantId: true, flittSecretKey: true },
  })
  return Boolean(tenant?.flittMerchantId?.trim() && tenant?.flittSecretKey)
}
