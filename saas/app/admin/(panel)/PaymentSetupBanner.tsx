import Link from 'next/link'
import { headers } from 'next/headers'
import { withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { isPaymentConfigured } from '@/lib/payments/shouldTakePayment'
import { adminT } from '@/lib/adminT'

/**
 * Warns the winery when card payments are switched on but nothing can actually
 * be charged (Plan-OnlinePayment §7.3).
 *
 * Both half-configured states degrade to today's reservation-only flow, which is
 * the right outcome for the guest — but it is completely silent, so without this
 * banner a winery could take months of unpaid bookings believing they were paid.
 *
 * Renders nothing at all when the module is off, or when everything is in place.
 * Server component: it computes booleans only, so no credential ever reaches the
 * browser.
 *
 * `checks` narrows which problems this instance is responsible for. The Settings
 * page passes `['pricing']` because the credentials half is already explained in
 * place, in the section where it gets fixed.
 */
export default async function PaymentSetupBanner({
  checks = ['credentials', 'pricing'],
}: {
  checks?: ('credentials' | 'pricing')[]
}) {
  const h = await headers()
  if (h.get('x-tenant-modules-online-payment') !== 'true') return null

  const tenantId = await getTenantId()

  const [credentialsOk, individuals, adminLanguage] = await Promise.all([
    // Reuses the same check the booking path uses, so the banner can never
    // disagree with what actually happens at checkout time.
    // Deliberately unscoped (no `section`) — this banner answers "is Flitt
    // technically configured at all," a tenant-wide setup-completeness
    // question, not "is payment on for section X." There is no single section
    // that applies to a whole-tenant banner, so this is intentionally left as
    // the plain module+credentials check (#148 scope decision, not an
    // oversight — see Feature 148's build-time notes).
    isPaymentConfigured(tenantId),
    // "No usable pricing" = the lookup createBooking does would yield nothing,
    // i.e. the condition that makes totalPrice 0 (see lib/pricingUtils findTier).
    withTenantDb(tenantId, tx => tx.company.findFirst({
      where: { tenantId, isIndividual: true },
      select: { prices: { select: { pricePerPerson: true, tastingLunchPricePerPerson: true } } },
    })),
    getSetting('admin_language'),
  ])

  const pricingOk = (individuals?.prices ?? []).some(
    p => p.pricePerPerson > 0 || p.tastingLunchPricePerPerson > 0
  )

  const showCredentials = checks.includes('credentials') && !credentialsOk
  const showPricing = checks.includes('pricing') && !pricingOk
  if (!showCredentials && !showPricing) return null

  const at = (key: string) => adminT(adminLanguage || 'en', key)

  return (
    <div
      className="rounded-xl border px-5 py-4 mb-6"
      style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74' }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-base leading-none mt-0.5">⚠</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#9a3412' }}>
            {at('paymentSetup.banner.title')}
          </p>
          <ul className="mt-2 space-y-1 list-disc pl-4">
            {showCredentials && (
              <li className="text-xs" style={{ color: '#7c2d12' }}>{at('paymentSetup.banner.credentials')}</li>
            )}
            {showPricing && (
              <li className="text-xs" style={{ color: '#7c2d12' }}>{at('paymentSetup.banner.pricing')}</li>
            )}
          </ul>
          <p className="text-xs mt-2" style={{ color: '#7c2d12' }}>
            {at('paymentSetup.banner.effect')}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {showCredentials && (
              <Link
                href="/admin/settings"
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412' }}
              >
                {at('paymentSetup.banner.goToSettings')}
              </Link>
            )}
            {showPricing && (
              <Link
                href="/admin/companies"
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: '#ffedd5', border: '1px solid #fdba74', color: '#9a3412' }}
              >
                {at('paymentSetup.banner.goToCompanies')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
