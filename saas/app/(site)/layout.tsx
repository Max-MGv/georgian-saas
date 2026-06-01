import { cookies } from 'next/headers'
import { getSetting } from '@/app/actions/settings'
import { getContentMap } from '@/app/actions/siteContent'
import SiteNav from './SiteNav'
import { t } from '@/lib/t'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, defaultLocale] = await Promise.all([
    cookies(),
    getSetting('default_locale'),
  ])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const navContent = await getContentMap('nav', locale)

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5efe6', color: '#1c1008' }}>
      <SiteNav locale={locale} navContent={navContent} />

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm" style={{ borderColor: '#e0d4c0', color: '#a89070' }}>
        <p>Kardanakhi, Gurjaani · +995 599 96 33 17 · nikalasmarani@gmail.com</p>
        <p className="mt-1">{t(locale, 'footer.cancel')}</p>
      </footer>
    </div>
  )
}
