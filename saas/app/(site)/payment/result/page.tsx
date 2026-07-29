import { cookies } from 'next/headers'
import Link from 'next/link'
import { getAllSettings } from '@/app/actions/settings'
import { settingValue } from '@/lib/settings'
import { getTenantId } from '@/lib/tenant'
import { t } from '@/lib/t'

/**
 * Where the customer lands after Flitt — via a 303 from
 * /api/payments/flitt/return, with ?status=success|failed|pending.
 *
 * The status here drives the copy only. The order's real state was decided by
 * settlePayment() before the redirect was issued; nothing on this page (or in
 * its query string) writes anything. A customer editing the URL to
 * status=success changes their own screen, not their order.
 */
export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ status }, cookieStore, tenantId] = await Promise.all([
    searchParams,
    cookies(),
    getTenantId(),
  ])
  const settings = await getAllSettings(tenantId)
  // Same locale resolution as the site layout, `??` semantics included.
  const locale = cookieStore.get('site_locale')?.value ?? settingValue(settings, 'default_locale') ?? 'en'

  const kind = status === 'success' ? 'success' : status === 'pending' ? 'pending' : 'failed'
  const icon = kind === 'success' ? '🍷' : kind === 'pending' ? '⏳' : '💳'

  // Failed/pending states point the customer at the winery's phone — the
  // reservation is still held, and a call settles it fastest.
  const contactPhone = kind === 'success' ? '' : settingValue(settings, 'contact_phone')

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div
        className="rounded-xl border p-10 text-center max-w-lg"
        style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}
      >
        <div className="text-4xl mb-4">{icon}</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--site-text)' }}>
          {t(locale, `payment.${kind}_heading`)}
        </h1>
        <p style={{ color: 'var(--site-muted)' }}>{t(locale, `payment.${kind}_body`)}</p>
        {contactPhone && (
          <p className="mt-4 font-medium" style={{ color: 'var(--site-text)' }}>
            <a href={`tel:${contactPhone}`}>{contactPhone}</a>
          </p>
        )}
        <Link
          href="/"
          className="inline-block mt-8 py-3 px-6 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {t(locale, 'payment.back_home')}
        </Link>
      </div>
    </main>
  )
}
