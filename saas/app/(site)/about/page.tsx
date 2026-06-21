import { getContentMap } from '@/app/actions/siteContent'
import { getSetting } from '@/app/actions/settings'
import { cookies } from 'next/headers'
import { t } from '@/lib/t'

export const dynamic = 'force-dynamic'

export default async function AboutPage() {
  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const [c, bgPath, bgX, bgY, bgZoom, bgMobilePath, bgMobileX, bgMobileY, bgMobileZoom] = await Promise.all([
    getContentMap('about', locale),
    getSetting('about_hero_bg_path'),
    getSetting('about_hero_bg_x'),
    getSetting('about_hero_bg_y'),
    getSetting('about_hero_bg_zoom'),
    getSetting('about_hero_bg_mobile_path'),
    getSetting('about_hero_bg_mobile_x'),
    getSetting('about_hero_bg_mobile_y'),
    getSetting('about_hero_bg_mobile_zoom'),
  ])

  const activeBgPath       = bgPath || '/images/winery2.jpg'
  const activeMobileBgPath = bgMobilePath || activeBgPath

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
          transformOrigin: `${bgMobileX || '50'}% ${bgMobileY || '50'}%`,
        }} />
        {/* Desktop background */}
        <div className="hidden sm:block absolute inset-0" style={{
          backgroundImage: `url(${activeBgPath})`,
          backgroundPosition: `${bgX || '50'}% ${bgY || '50'}%`,
          backgroundSize: 'cover',
          transform: `scale(${(parseInt(bgZoom || '') || 110) / 100})`,
          transformOrigin: `${bgX || '50'}% ${bgY || '50'}%`,
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
              {c['about_eyebrow'] || t(locale, 'about.eyebrow')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold" style={{ color: 'white' }}>
              {c['about_heading'] || t(locale, 'about.heading')}
            </h1>
          </div>
        </div>
      </div>

    <div className="max-w-2xl mx-auto px-6 py-16">
      {/* heading moved into hero above */}
      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      <section className="mb-12 space-y-4 text-base leading-relaxed" style={{ color: '#4a3728' }}>
        <p>{c['about_story_p1'] || 'Nikalas Marani is a family winery tucked into the rolling vineyards of Kardanakhi, in the Gurjaani district of Kakheti — Georgia\'s most celebrated wine region.'}</p>
        <p>{c['about_story_p2'] || 'For generations, our family has grown Rkatsiteli and Saperavi grapes on the same land, using traditional Kakhetian methods passed down through the years. Our wines are made with minimal intervention — the grapes, the sun, and the clay vessels do most of the work.'}</p>
        <p>{c['about_story_p3'] || 'We opened Nikalas Marani to visitors so that anyone curious about Georgian wine culture could experience it the way we do — not in a tasting room, but at the table, with food, conversation, and the winemaker sitting across from you.'}</p>
      </section>

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-6" style={{ color: '#1c1008' }}>
          {c['about_expect_heading'] || t(locale, 'about.expect_heading')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { label: c['about_expect1_label'] || 'Wine Tasting',     text: c['about_expect1_text'] || 'Guided tasting of 2–3 house wines and chacha, explained by the winemaker himself.' },
            { label: c['about_expect2_label'] || 'Traditional Meal', text: c['about_expect2_text'] || 'Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani, fresh bread from the oven.' },
            { label: c['about_expect3_label'] || 'Vineyard Walk',    text: c['about_expect3_text'] || 'A short walk through the vineyard and a look at our qvevri (clay vessel) cellar.' },
          ].map(item => (
            <div key={item.label} className="rounded-xl p-5 border flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
              <p className="font-semibold mb-2" style={{ color: '#1c1008' }}>{item.label}</p>
              <p className="text-sm leading-relaxed" style={{ color: '#6b5a47' }}>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      <div className="text-center">
        <p className="text-sm mb-4" style={{ color: '#6b5a47' }}>
          {c['about_cta_text'] || t(locale, 'about.cta_text')}
        </p>
        <a href="/#book" className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
          {c['about_cta_btn'] || t(locale, 'about.cta_btn')}
        </a>
      </div>
    </div>
    </>
  )
}
