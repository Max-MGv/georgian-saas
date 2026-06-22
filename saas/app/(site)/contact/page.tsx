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

export default async function ContactPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const isEditMode = sp.editMode === 'true'

  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const cookieLocale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const locale = sp.locale ?? cookieLocale

  const isAdmin = isEditMode ? (await getSiteContext()).isAdmin : false

  const [c, bgPath, bgX, bgY, bgZoom, bgMobilePath, bgMobileX, bgMobileY, bgMobileZoom, mapsEmbedUrl] = await Promise.all([
    getContentMap('contact', locale),
    getSetting('contact_hero_bg_path'),
    getSetting('contact_hero_bg_x'),
    getSetting('contact_hero_bg_y'),
    getSetting('contact_hero_bg_zoom'),
    getSetting('contact_hero_bg_mobile_path'),
    getSetting('contact_hero_bg_mobile_x'),
    getSetting('contact_hero_bg_mobile_y'),
    getSetting('contact_hero_bg_mobile_zoom'),
    getSetting('maps_embed_url'),
  ])

  const activeBgPath       = bgPath || '/images/winery3.jpg'
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

  const cards = [
    { hk: 'contact_label_phone',    hFb: t(locale, 'contact.label_phone'),    vk: 'contact_phone',        vFb: '+995 599 96 33 17',       nk: 'contact_note_phone',    nFb: t(locale, 'contact.note_phone') },
    { hk: 'contact_label_email',    hFb: t(locale, 'contact.label_email'),    vk: 'contact_email',        vFb: 'nikalasmarani@gmail.com', nk: 'contact_note_email',    nFb: t(locale, 'contact.note_email') },
    { hk: 'contact_label_location', hFb: t(locale, 'contact.label_location'), vk: 'contact_address',      vFb: 'Kardanakhi, Gurjaani',    nk: 'contact_note_location', nFb: t(locale, 'contact.note_location') },
    { hk: 'contact_label_cancel',   hFb: t(locale, 'contact.label_cancel'),   vk: 'contact_cancel_value', vFb: t(locale, 'contact.cancel_value'), nk: 'contact_note_cancel', nFb: t(locale, 'contact.note_cancel') },
  ]

  return (
    <>
      {isEditMode && isAdmin && <EditModeSuppressor />}
      <style>{`
        .contact-hero-bg {
          background-image: url("${activeMobileBgPath}");
          background-position: ${mx}% ${my}%;
          background-size: cover;
          transform: scale(${mz});
          transform-origin: ${mx}% ${my}%;
        }
        @media (min-width: 640px) {
          .contact-hero-bg {
            background-image: url("${activeBgPath}");
            background-position: ${dx}% ${dy}%;
            transform: scale(${dz});
            transform-origin: ${dx}% ${dy}%;
          }
        }
      `}</style>
      {/* Hero banner */}
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        <div className="contact-hero-bg absolute inset-0" />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(28,16,8,0.30)' }} />
        <div className="relative h-full flex items-end max-w-2xl mx-auto px-6 pb-10">
          <div style={{
            backgroundColor: 'rgba(10,5,2,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderRadius: '12px',
            padding: '14px 22px',
          }}>
            <ET k="contact_eyebrow" s="contact" lbl="Eyebrow text" fb={t(locale, 'contact.eyebrow')}
              as="p" className="text-sm font-medium tracking-widest uppercase mb-1.5"
              style={{ color: 'rgba(255,255,255,0.75)' }} />
            <ET k="contact_heading" s="contact" lbl="Page heading" fb={t(locale, 'contact.heading')}
              as="h1" className="text-3xl sm:text-4xl font-bold" style={{ color: 'white' }} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {cards.map(card => (
            <div key={card.vk} className="rounded-xl p-5 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
              <ET k={card.hk} s="contact" lbl={card.hFb + ' card — header'} fb={card.hFb}
                as="p" className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#8b4513' }} />
              <ET k={card.vk} s="contact" lbl={card.hFb + ' — value'} fb={card.vFb}
                as="p" className="font-semibold mb-1" style={{ color: '#1c1008' }} />
              <ET k={card.nk} s="contact" lbl={card.hFb + ' — note'} fb={card.nFb}
                as="p" className="text-sm" style={{ color: '#a89070' }} />
            </div>
          ))}
        </div>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12">
          <ET k="contact_find_us" s="contact" lbl='"How to Find Us" heading'
            fb={t(locale, 'contact.find_us')} as="h2"
            className="text-lg font-bold mb-4" style={{ color: '#1c1008' }} />
          <iframe
            title="Nikalas Marani location"
            src={mapsEmbedUrl}
            width="100%"
            height="256"
            style={{ border: 0, borderRadius: '12px' }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <ET k="contact_map_directions" s="contact" lbl="Map directions text"
            fb={t(locale, 'contact.map_directions')} as="p"
            className="text-sm mt-3" style={{ color: '#6b5a47' }} />
        </section>

        <div className="text-center">
          <ET k="contact_book_cta" s="contact" lbl="CTA text" fb={t(locale, 'contact.book_cta')}
            as="p" className="text-sm mb-4" style={{ color: '#6b5a47' }} />
          <a href="/#book" className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
            {isAdmin ? (
              <EditableText contentKey="contact_book_btn" section="contact" label="CTA button"
                locale={locale} fallback={t(locale, 'contact.book_btn')} isAdmin as="span">
                {c['contact_book_btn'] ?? null}
              </EditableText>
            ) : (c['contact_book_btn'] || t(locale, 'contact.book_btn'))}
          </a>
        </div>
      </div>
    </>
  )
}
