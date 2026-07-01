import { getContentMap } from '@/app/actions/siteContent'
import { getSetting } from '@/app/actions/settings'
import { getSiteContext } from '@/lib/siteContext'
import { cookies } from 'next/headers'
import { t } from '@/lib/t'
import { preload } from 'react-dom'
import EditableText from '@/components/EditableText'
import EditModeSuppressor from '@/components/EditModeSuppressor'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<{ editMode?: string; locale?: string }> }

export default async function AboutPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const isEditMode = sp.editMode === 'true'

  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const cookieLocale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const locale = sp.locale ?? cookieLocale

  const isAdmin = isEditMode ? (await getSiteContext()).isAdmin : false

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

  const dx = bgX || '50'
  const dy = bgY || '50'
  const dz = (parseInt(bgZoom || '') || 110) / 100
  const mx = bgMobileX || '50'
  const my = bgMobileY || '50'
  const mz = (parseInt(bgMobileZoom || '') || 100) / 100

  preload(activeBgPath, { as: 'image', fetchPriority: 'high' })
  if (activeMobileBgPath !== activeBgPath) preload(activeMobileBgPath, { as: 'image' })

  // Inline-or-editable helper — captured over locale, isAdmin, c
  function ET({ k, s, lbl, fb, as: Tag, className, style }: {
    k: string; s: string; lbl: string; fb: string
    as: keyof React.JSX.IntrinsicElements; className?: string; style?: React.CSSProperties
  }) {
    if (!isAdmin) {
      const T = Tag as React.ElementType
      return <T className={className} style={style}>{c[k] ?? fb}</T>
    }
    return (
      <EditableText contentKey={k} section={s} label={lbl} locale={locale} fallback={fb}
        isAdmin as={Tag} className={className} style={style}>
        {c[k] ?? null}
      </EditableText>
    )
  }

  return (
    <>
      {isEditMode && isAdmin && <EditModeSuppressor />}
      <style>{`
        .about-hero-bg {
          background-image: url("${activeMobileBgPath}");
          background-position: ${mx}% ${my}%;
          background-size: cover;
          transform: scale(${mz});
          transform-origin: ${mx}% ${my}%;
        }
        @media (min-width: 640px) {
          .about-hero-bg {
            background-image: url("${activeBgPath}");
            background-position: ${dx}% ${dy}%;
            transform: scale(${dz});
            transform-origin: ${dx}% ${dy}%;
          }
        }
      `}</style>
      {/* Hero banner */}
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        <div className="about-hero-bg absolute inset-0" />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(28,16,8,0.30)' }} />
        <div className="relative h-full flex items-end max-w-2xl mx-auto px-6 pb-10">
          <div style={{
            backgroundColor: 'rgba(10,5,2,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderRadius: '12px',
            padding: '14px 22px',
          }}>
            <ET k="about_eyebrow" s="about" lbl="Eyebrow text" fb={t(locale, 'about.eyebrow')}
              as="p" className="text-sm font-medium tracking-widest uppercase mb-1.5"
              style={{ color: 'rgba(255,255,255,0.75)' }} />
            <ET k="about_heading" s="about" lbl="Page heading" fb={t(locale, 'about.heading')}
              as="h1" className="text-3xl sm:text-4xl font-bold" style={{ color: 'white' }} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12 space-y-4 text-base leading-relaxed" style={{ color: '#4a3728' }}>
          <ET k="about_story_p1" s="about" lbl="Story — paragraph 1" as="p"
            fb="A family winery producing traditional Georgian wine." />
          <ET k="about_story_p2" s="about" lbl="Story — paragraph 2" as="p"
            fb="For generations, our family has grown Rkatsiteli and Saperavi grapes on the same land, using traditional Kakhetian methods passed down through the years. Our wines are made with minimal intervention — the grapes, the sun, and the clay vessels do most of the work." />
          <ET k="about_story_p3" s="about" lbl="Story — paragraph 3" as="p"
            fb="We welcome visitors to experience Georgian wine culture firsthand — at the table, with food, conversation, and the winemaker." />
        </section>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12">
          <ET k="about_expect_heading" s="about" lbl='"What to Expect" heading'
            fb={t(locale, 'about.expect_heading')} as="h2"
            className="text-xl font-bold mb-6" style={{ color: '#1c1008' }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { lk: 'about_expect1_label', tk: 'about_expect1_text', lFb: 'Wine Tasting',     tFb: 'Guided tasting of 2–3 house wines and chacha, explained by the winemaker himself.' },
              { lk: 'about_expect2_label', tk: 'about_expect2_text', lFb: 'Traditional Meal', tFb: 'Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani, fresh bread from the oven.' },
              { lk: 'about_expect3_label', tk: 'about_expect3_text', lFb: 'Vineyard Walk',    tFb: 'A short walk through the vineyard and a look at our qvevri (clay vessel) cellar.' },
            ].map(card => (
              <div key={card.lk} className="rounded-xl p-5 border flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
                <ET k={card.lk} s="about" lbl="Expect card — label" fb={card.lFb}
                  as="p" className="font-semibold mb-2" style={{ color: '#1c1008' }} />
                <ET k={card.tk} s="about" lbl="Expect card — text" fb={card.tFb}
                  as="p" className="text-sm leading-relaxed" style={{ color: '#6b5a47' }} />
              </div>
            ))}
          </div>
        </section>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <div className="text-center">
          <ET k="about_cta_text" s="about" lbl="CTA text" fb={t(locale, 'about.cta_text')}
            as="p" className="text-sm mb-4" style={{ color: '#6b5a47' }} />
          <a href="/#book" className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
            {isAdmin ? (
              <EditableText contentKey="about_cta_btn" section="about" label="CTA button"
                locale={locale} fallback={t(locale, 'about.cta_btn')} isAdmin as="span">
                {c['about_cta_btn'] ?? null}
              </EditableText>
            ) : (c['about_cta_btn'] || t(locale, 'about.cta_btn'))}
          </a>
        </div>
      </div>
    </>
  )
}
