import { getSetting } from '@/app/actions/settings'
import { getWhatsNew } from '@/app/actions/releases'
import { adminT } from '@/lib/adminT'
import WhatsNew from '@/components/WhatsNew'

export const dynamic = 'force-dynamic'

// Release notes for clients (vault/Plan-ReleaseNotes.md): only releases Max published AND chose to show to clients.
// Opening the page marks them seen, which clears the dot on the menu item.
export default async function WhatsNewPage() {
  const [releases, adminLanguage] = await Promise.all([getWhatsNew(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const at = (key: string) => adminT(locale, key)
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{at('whatsNew.pageTitle')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--site-muted)' }}>{at('whatsNew.pageHint')}</p>
      </div>
      <WhatsNew releases={releases} locale={locale} labels={{
        before: at('whatsNew.before'), after: at('whatsNew.after'), howTo: at('whatsNew.howTo'),
        takeMeThere: at('whatsNew.takeMeThere'), empty: at('whatsNew.empty'), dragHint: at('whatsNew.dragHint'),
      }} />
    </div>
  )
}
