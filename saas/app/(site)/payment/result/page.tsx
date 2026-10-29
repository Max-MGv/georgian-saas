import { cookies } from 'next/headers'
import { getAllSettings } from '@/app/actions/settings'
import { getAllContent } from '@/app/actions/siteContent'
import { settingValue } from '@/lib/settings'
import { getTenantId } from '@/lib/tenant'
import { t } from '@/lib/t'
import PaymentResultView from '@/components/PaymentResultView'

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
  const [{ status, kind: linkKind }, cookieStore, tenantId] = await Promise.all([
    searchParams,
    cookies(),
    getTenantId(),
  ])
  const settings = await getAllSettings(tenantId)
  // Same locale resolution as the site layout, `??` semantics included.
  const locale = cookieStore.get('site_locale')?.value ?? settingValue(settings, 'default_locale') ?? 'en'
  const messagesContent = (await getAllContent(tenantId, locale))['messages'] ?? {}
  const mc = (key: string, tKey: string) => messagesContent[key] || t(locale, tKey)

  const kind = status === 'success' ? 'success' : status === 'pending' ? 'pending' : 'failed'

  // ?kind=link (set by the return route): an admin's card link was paid. Same heading, but no
  // "booking confirmed / confirmation sent" — nothing was emailed (T-321). Success only.
  const isLink = kind === 'success' && linkKind === 'link'
  const body = isLink
    ? mc('onsite_payment_link_body', 'payment.link_body')
    : mc(`onsite_payment_${kind}_body`, `payment.${kind}_body`)

  // Failed/pending states point the customer at the winery's phone — the
  // reservation is still held, and a call settles it fastest.
  const contactPhone = kind === 'success' ? '' : settingValue(settings, 'contact_phone')

  return (
    <PaymentResultView
      kind={kind}
      heading={mc(`onsite_payment_${kind}_heading`, `payment.${kind}_heading`)}
      body={body}
      contactPhone={contactPhone}
      backHomeLabel={t(locale, 'payment.back_home')}
    />
  )
}
