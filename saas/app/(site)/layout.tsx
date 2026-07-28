import { cookies, headers } from 'next/headers'
import { getSetting } from '@/app/actions/settings'
import { getContentMap } from '@/app/actions/siteContent'
import SiteNav from './SiteNav'
import { t } from '@/lib/t'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, defaultLocale, h, contactEmail, contactPhone, contactAddress, contactFacebook, contactInstagram] = await Promise.all([
    cookies(),
    getSetting('default_locale'),
    headers(),
    getSetting('contact_email'),
    getSetting('contact_phone'),
    getSetting('contact_address'),
    getSetting('contact_facebook'),
    getSetting('contact_instagram'),
  ])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const navContent = await getContentMap('nav', locale)
  const logoUrl = h.get('x-tenant-logo') ?? null
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const tenantName = h.get('x-tenant-name') ?? ''
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  const legalOn = h.get('x-tenant-modules-legal') === 'true'

  const email    = contactEmail    || ''
  const phone    = contactPhone    || ''
  const address  = contactAddress  || ''
  const facebook = contactFacebook || ''
  const instagram = contactInstagram || ''
  const footerParts = [address, phone, email].filter(Boolean)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-text)' }}>
      <SiteNav locale={locale} navContent={navContent} logoUrl={logoUrl} logoAlt={logoAlt} tenantName={tenantName} wineOrdersOn={wineOrdersOn}
        contactEmail={email} contactPhone={phone} contactFacebook={facebook} contactInstagram={instagram} />

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm" style={{ borderColor: 'var(--site-border)', color: 'var(--site-secondary)' }}>
        {footerParts.length > 0 && <p>{footerParts.join(' · ')}</p>}
        <p className="mt-1">{t(locale, 'footer.cancel')}</p>
        {legalOn && (
          <p className="mt-3 flex items-center justify-center gap-4">
            <a href="/terms" className="hover:opacity-70 transition-opacity" style={{ color: 'var(--color-brand)' }}>{t(locale, 'footer.terms')}</a>
            <a href="/privacy" className="hover:opacity-70 transition-opacity" style={{ color: 'var(--color-brand)' }}>{t(locale, 'footer.privacy')}</a>
            <a href="/returns" className="hover:opacity-70 transition-opacity" style={{ color: 'var(--color-brand)' }}>{t(locale, 'footer.returns')}</a>
          </p>
        )}
      </footer>
    </div>
  )
}
