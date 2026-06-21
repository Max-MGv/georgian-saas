import { getContentMap } from '@/app/actions/siteContent'
import { getSetting } from '@/app/actions/settings'
import { cookies } from 'next/headers'
import { t } from '@/lib/t'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'

  const [c, bgPath, bgX, bgY, bgZoom, bgMobilePath, bgMobileX, bgMobileY, bgMobileZoom] = await Promise.all([
    getContentMap('contact', locale),
    getSetting('contact_hero_bg_path'),
    getSetting('contact_hero_bg_x'),
    getSetting('contact_hero_bg_y'),
    getSetting('contact_hero_bg_zoom'),
    getSetting('contact_hero_bg_mobile_path'),
    getSetting('contact_hero_bg_mobile_x'),
    getSetting('contact_hero_bg_mobile_y'),
    getSetting('contact_hero_bg_mobile_zoom'),
  ])

  const activeBgPath       = bgPath || '/images/winery3.jpg'
  const activeMobileBgPath = bgMobilePath || activeBgPath

  const cards = [
    { label: c['contact_label_phone']    || t(locale, 'contact.label_phone'),    value: c['contact_phone']        || '+995 599 96 33 17',       note: c['contact_note_phone']    || t(locale, 'contact.note_phone') },
    { label: c['contact_label_email']    || t(locale, 'contact.label_email'),    value: c['contact_email']        || 'nikalasmarani@gmail.com', note: c['contact_note_email']    || t(locale, 'contact.note_email') },
    { label: c['contact_label_location'] || t(locale, 'contact.label_location'), value: c['contact_address']      || 'Kardanakhi, Gurjaani',    note: c['contact_note_location'] || t(locale, 'contact.note_location') },
    { label: c['contact_label_cancel']   || t(locale, 'contact.label_cancel'),   value: c['contact_cancel_value'] || t(locale, 'contact.cancel_value'), note: c['contact_note_cancel'] || t(locale, 'contact.note_cancel') },
  ]

  return (
    <>
      {/* Hero banner — Option C: light overlay + frosted text card */}
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        {/* Mobile background — cover baseline, scale for zoom */}
        <div className="block sm:hidden absolute inset-0" style={{
          backgroundImage: `url(${activeMobileBgPath})`,
          backgroundPosition: `${bgMobileX || '50'}% ${bgMobileY || '50'}%`,
          backgroundSize: 'cover',
          transform: `scale(${(parseInt(bgMobileZoom || '') || 100) / 100})`,
          transformOrigin: 'center center',
        }} />
        {/* Desktop background */}
        <div className="hidden sm:block absolute inset-0" style={{
          backgroundImage: `url(${activeBgPath})`,
          backgroundPosition: `${bgX || '50'}% ${bgY || '50'}%`,
          backgroundSize: 'cover',
          transform: `scale(${(parseInt(bgZoom || '') || 110) / 100})`,
          transformOrigin: 'center center',
        }} />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(28,16,8,0.30)' }} />
        <div className="relative h-full flex items-end max-w-2xl mx-auto px-6 pb-10">
          <div style={{
            backgroundColor: 'rgba(10,5,2,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderRadius: '12px',
            padding: '14px 22px',
          }}>
            <p className="text-sm font-medium tracking-widest uppercase mb-1.5"
              style={{ color: 'rgba(255,255,255,0.75)' }}>
              {c['contact_eyebrow'] || t(locale, 'contact.eyebrow')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold" style={{ color: 'white' }}>
              {c['contact_heading'] || t(locale, 'contact.heading')}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* heading moved into hero above */}
        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {cards.map(item => (
            <div key={item.label} className="rounded-xl p-5 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#8b4513' }}>{item.label}</p>
              <p className="font-semibold mb-1" style={{ color: '#1c1008' }}>{item.value}</p>
              <p className="text-sm" style={{ color: '#a89070' }}>{item.note}</p>
            </div>
          ))}
        </div>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12">
          <h2 className="text-lg font-bold mb-4" style={{ color: '#1c1008' }}>
            {c['contact_find_us'] || t(locale, 'contact.find_us')}
          </h2>
          <div className="w-full h-64 rounded-xl border flex items-center justify-center text-sm" style={{ backgroundColor: '#ede5d8', borderColor: '#e0d4c0', color: '#a89070' }}>
            {t(locale, 'contact.map_placeholder')}
          </div>
          <p className="text-sm mt-3" style={{ color: '#6b5a47' }}>
            {c['contact_map_directions'] || t(locale, 'contact.map_directions')}
          </p>
        </section>

        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: '#6b5a47' }}>
            {c['contact_book_cta'] || t(locale, 'contact.book_cta')}
          </p>
          <a href="/#book" className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
            {c['contact_book_btn'] || t(locale, 'contact.book_btn')}
          </a>
        </div>
      </div>
    </>
  )
}
