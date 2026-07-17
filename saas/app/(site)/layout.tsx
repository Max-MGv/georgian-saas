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
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'

  const email    = contactEmail    || ''
  const phone    = contactPhone    || ''
  const address  = contactAddress  || ''
  const facebook = contactFacebook || ''
  const instagram = contactInstagram || ''

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5efe6', color: '#1c1008' }}>
      <SiteNav locale={locale} navContent={navContent} logoUrl={logoUrl} logoAlt={logoAlt} wineOrdersOn={wineOrdersOn}
        contactEmail={email} contactPhone={phone} contactFacebook={facebook} contactInstagram={instagram} />

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm" style={{ borderColor: '#e0d4c0', color: '#a89070' }}>
        <p>{address} · {phone} · {email}</p>
        <p className="mt-1">{t(locale, 'footer.cancel')}</p>
      </footer>
    </div>
  )
}
