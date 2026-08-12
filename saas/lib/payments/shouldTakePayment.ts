import { db, withTenantDb } from '@/lib/db'
import { headers } from 'next/headers'

export type PaymentGate =
  | { takePayment: true; merchantId: string; secretKey: string }
  | { takePayment: false }

/** Which part of the site this order came from — drives the section toggle
 * lookup (#148). `Company.isIndividual` rows are a pricing-tier container
 * only (see createBooking.ts), never a real company order, so INDIVIDUAL
 * orders never carry a companyId and never consult a company override. */
export type PaymentSection = 'INDIVIDUAL' | 'COMPANY' | 'WINE_ORDER'

/**
 * Decides whether a just-created order should be routed to online checkout,
 * and hands back the tenant's credentials when it should.
 *
 * The rules, in order (Plan-OnlinePayment §7, extended by Feature 148):
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
 *  - the four rules above are hard blocks: nothing below can override them.
 *  - `Company.skipPayment` (#148), when the order carries a `companyId`:
 *    `true` → always skip (trusted); `false` → always require; `null`/absent
 *    → fall through to the tenant's section toggle. Deliberately NOT
 *    influenced by `showCompanyPrice`/`show_company_price_after_booking` —
 *    that setting is priced-visibility only, checked above via `priceShown`,
 *    and has nothing to do with payment intent going forward (Feature 148 §5).
 *  - the tenant's per-section toggle (`paymentEnabledIndividuals/Companies/
 *    WineOrders`) — the default when no company override applies.
 *
 * Reads the module flag from the proxy's request header (same source the site
 * layout uses) and the credentials from Tenant — deliberately not from Setting,
 * see MaintenanceNotes §9.
 */
export async function shouldTakePayment(input: {
  tenantId: string
  totalPrice: number | null | undefined
  priceShown: boolean
  section: PaymentSection
  companyId?: string | null
}): Promise<PaymentGate> {
  const h = await headers()
  if (h.get('x-tenant-modules-online-payment') !== 'true') return { takePayment: false }

  if (!input.priceShown) return { takePayment: false }
  if (input.totalPrice == null || input.totalPrice <= 0) return { takePayment: false }

  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      flittMerchantId: true,
      flittSecretKey: true,
      paymentEnabledIndividuals: true,
      paymentEnabledCompanies: true,
      paymentEnabledWineOrders: true,
    },
  })
  const merchantId = tenant?.flittMerchantId?.trim()
  const secretKey = tenant?.flittSecretKey
  if (!merchantId || !secretKey) return { takePayment: false }

  // Company override (#148) — most specific wins, bounded by the hard blocks
  // above; it can never force payment through a missing price or credentials.
  if (input.companyId) {
    const company = await withTenantDb(input.tenantId, tx =>
      tx.company.findFirst({
        where: { id: input.companyId!, tenantId: input.tenantId },
        select: { skipPayment: true },
      })
    )
    if (company?.skipPayment === true) return { takePayment: false }
    if (company?.skipPayment === false) return { takePayment: true, merchantId, secretKey }
    // company?.skipPayment === null (or no matching company) → fall through
  }

  const sectionEnabled =
    input.section === 'INDIVIDUAL' ? tenant?.paymentEnabledIndividuals
    : input.section === 'COMPANY' ? tenant?.paymentEnabledCompanies
    : tenant?.paymentEnabledWineOrders
  if (!sectionEnabled) return { takePayment: false }

  return { takePayment: true, merchantId, secretKey }
}

/**
 * Lighter check for rendering: is this tenant set up to take payment at all
 * (module on + both credentials present)? Drives button labels — "Book" vs
 * "Book & Pay" — so a tenant with the module on but no credentials shows the
 * plain booking button rather than promising a payment step that the server
 * would then quietly skip. Returns a boolean only; the secret never leaves
 * the server.
 *
 * `section`/`companyId` are optional (#148). Callers that omit them keep
 * today's exact behavior — module + credentials only, blind to the section
 * toggles and company override — which is deliberately still "safe": it can
 * only make a label say "…& Pay" when the actual gate would fall back to
 * reservation-only, never the other way round (shouldTakePayment() is the
 * real gate and always wins). Pass `section` when a caller wants the label
 * to also reflect the section/company precedence.
 */
export async function isPaymentConfigured(
  tenantId: string,
  opts?: { section?: PaymentSection; companyId?: string | null }
): Promise<boolean> {
  const h = await headers()
  if (h.get('x-tenant-modules-online-payment') !== 'true') return false
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      flittMerchantId: true,
      flittSecretKey: true,
      paymentEnabledIndividuals: true,
      paymentEnabledCompanies: true,
      paymentEnabledWineOrders: true,
    },
  })
  const configured = Boolean(tenant?.flittMerchantId?.trim() && tenant?.flittSecretKey)
  if (!configured) return false
  if (!opts?.section) return true

  if (opts.companyId) {
    const company = await withTenantDb(tenantId, tx =>
      tx.company.findFirst({
        where: { id: opts.companyId!, tenantId },
        select: { skipPayment: true },
      })
    )
    if (company?.skipPayment === true) return false
    if (company?.skipPayment === false) return true
  }

  const sectionEnabled =
    opts.section === 'INDIVIDUAL' ? tenant?.paymentEnabledIndividuals
    : opts.section === 'COMPANY' ? tenant?.paymentEnabledCompanies
    : tenant?.paymentEnabledWineOrders
  return Boolean(sectionEnabled)
}
