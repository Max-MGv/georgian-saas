import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSetting } from '@/app/actions/settings'
import { getContent } from '@/app/actions/siteContent'
import { t } from '@/lib/t'
import { LEGAL_CONTENT_EN } from '@/lib/legalContent'
import LegalPageLayout from '../LegalPageLayout'

export const dynamic = 'force-dynamic'

export default async function PrivacyPage() {
  const h = await headers()
  if (h.get('x-tenant-modules-legal') !== 'true') redirect('/')

  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'

  const content = await getContent('legal_privacy_body', LEGAL_CONTENT_EN.legal_privacy_body, locale)

  return <LegalPageLayout locale={locale} title={t(locale, 'legal.privacy_title')} content={content} />
}
