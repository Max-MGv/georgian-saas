'use client'

import { useState } from 'react'
import EditableText from '@/components/EditableText'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type ContentRow = { key: string; value: string; section: string; label: string; locale: string }
type LocaleKey = 'en' | 'ka'
type SectionKey = 'home' | 'about' | 'contact'

type Props = { rows: { en: ContentRow[]; ka: ContentRow[] } }

function buildMap(rows: ContentRow[]) {
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ─── Section preview components ───────────────────────────────────────────────

function HomePreview({ c, locale }: { c: Record<string, string>; locale: string }) {
  return (
    <div className="space-y-8">

      {/* Hero */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513' }}>
          Hero section
        </div>
        <div className="px-8 py-10 text-center" style={{ backgroundColor: C.bg }}>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }}>Kakheti, Georgia</p>
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-lg" style={{ backgroundColor: '#e0d4c0', color: C.faint }}>◈</div>
          <EditableText contentKey="home_hero_subtitle" section="home" label="Hero subtitle" locale={locale} fallback="Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle." isAdmin as="p" className="text-base max-w-sm mx-auto" style={{ color: C.muted }}>
            {c['home_hero_subtitle'] || ''}
          </EditableText>
        </div>
      </div>

      {/* Packages */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513' }}>
          Packages
        </div>
        <div className="p-6 grid sm:grid-cols-2 gap-4" style={{ backgroundColor: C.bg }}>
          {[
            { titleKey: 'home_package1_title', descKey: 'home_package1_desc', titleFb: 'Wine Tasting',   descFb: '2 red wines, 1 white, chacha — guided by the winemaker',              price: '50₾' },
            { titleKey: 'home_package2_title', descKey: 'home_package2_desc', titleFb: 'Tasting + Lunch', descFb: '3 wines, chacha brandy, and a full traditional Georgian meal',          price: '100₾' },
          ].map(pkg => (
            <div key={pkg.titleKey} className="rounded-xl p-5 border" style={{ backgroundColor: '#fffdf9', borderColor: C.border }}>
              <EditableText contentKey={pkg.titleKey} section="home" label={pkg.titleFb + ' title'} locale={locale} fallback={pkg.titleFb} isAdmin as="h3" className="font-semibold text-base mb-1" style={{ color: C.text }}>
                {c[pkg.titleKey] || ''}
              </EditableText>
              <EditableText contentKey={pkg.descKey} section="home" label={pkg.titleFb + ' description'} locale={locale} fallback={pkg.descFb} isAdmin as="p" className="text-sm mb-3" style={{ color: C.muted }}>
                {c[pkg.descKey] || ''}
              </EditableText>
              <p className="font-bold text-xl" style={{ color: C.wine }}>{pkg.price} <span className="font-normal text-xs" style={{ color: C.faint }}>/ person</span></p>
            </div>
          ))}
        </div>
      </div>

      {/* Booking intro */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513' }}>
          Booking section
        </div>
        <div className="px-6 py-6" style={{ backgroundColor: C.bg }}>
          <p className="text-lg font-bold mb-2" style={{ color: C.text }}>Book a Visit</p>
          <EditableText contentKey="home_booking_intro" section="home" label="Booking intro" locale={locale} fallback="Fill in the form and we will confirm your booking shortly." isAdmin as="p" className="text-sm" style={{ color: C.muted }}>
            {c['home_booking_intro'] || ''}
          </EditableText>
        </div>
      </div>

    </div>
  )
}

function AboutPreview({ c, locale }: { c: Record<string, string>; locale: string }) {
  return (
    <div className="space-y-8">

      {/* Story */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513' }}>
          Our Story
        </div>
        <div className="px-6 py-6 space-y-4 text-base leading-relaxed" style={{ backgroundColor: C.bg, color: '#4a3728' }}>
          {[
            { key: 'about_story_p1', label: 'Story paragraph 1', fb: 'Nikalas Marani is a family winery tucked into the rolling vineyards of Kardanakhi, in the Gurjaani district of Kakheti — Georgia\'s most celebrated wine region.' },
            { key: 'about_story_p2', label: 'Story paragraph 2', fb: 'For generations, our family has grown Rkatsiteli and Saperavi grapes on the same land, using traditional Kakhetian methods passed down through the years. Our wines are made with minimal intervention — the grapes, the sun, and the clay vessels do most of the work.' },
            { key: 'about_story_p3', label: 'Story paragraph 3', fb: 'We opened Nikalas Marani to visitors so that anyone curious about Georgian wine culture could experience it the way we do — not in a tasting room, but at the table, with food, conversation, and the winemaker sitting across from you.' },
          ].map(p => (
            <EditableText key={p.key} contentKey={p.key} section="about" label={p.label} locale={locale} fallback={p.fb} isAdmin as="p">
              {c[p.key] || ''}
            </EditableText>
          ))}
        </div>
      </div>

      {/* What to Expect */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513' }}>
          What to Expect cards
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ backgroundColor: C.bg }}>
          {[
            { lk: 'about_expect1_label', tk: 'about_expect1_text', lFb: 'Wine Tasting',    tFb: 'Guided tasting of 2–3 house wines and chacha, explained by the winemaker himself.' },
            { lk: 'about_expect2_label', tk: 'about_expect2_text', lFb: 'Traditional Meal', tFb: 'Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani, fresh bread from the oven.' },
            { lk: 'about_expect3_label', tk: 'about_expect3_text', lFb: 'Vineyard Walk',    tFb: 'A short walk through the vineyard and a look at our qvevri (clay vessel) cellar.' },
          ].map(card => (
            <div key={card.lk} className="rounded-xl p-5 border" style={{ backgroundColor: '#fffdf9', borderColor: C.border }}>
              <EditableText contentKey={card.lk} section="about" label="Card label" locale={locale} fallback={card.lFb} isAdmin as="p" className="font-semibold mb-2" style={{ color: C.text }}>
                {c[card.lk] || ''}
              </EditableText>
              <EditableText contentKey={card.tk} section="about" label="Card text" locale={locale} fallback={card.tFb} isAdmin as="p" className="text-sm leading-relaxed" style={{ color: C.muted }}>
                {c[card.tk] || ''}
              </EditableText>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

function ContactPreview({ c, locale }: { c: Record<string, string>; locale: string }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
      <div className="px-4 py-2 border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513' }}>
        Contact details
      </div>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ backgroundColor: C.bg }}>
        {[
          { key: 'contact_phone',   label: 'Phone',   fb: '+995 599 96 33 17',       note: 'Call or WhatsApp, Georgian or English' },
          { key: 'contact_email',   label: 'Email',   fb: 'nikalasmarani@gmail.com', note: 'We reply within 24 hours' },
          { key: 'contact_address', label: 'Address', fb: 'Kardanakhi, Gurjaani',    note: 'Kakheti region, Eastern Georgia' },
        ].map(item => (
          <div key={item.key} className="rounded-xl p-5 border" style={{ backgroundColor: '#fffdf9', borderColor: C.border }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#8b4513' }}>{item.label}</p>
            <EditableText contentKey={item.key} section="contact" label={item.label} locale={locale} fallback={item.fb} isAdmin as="p" className="font-semibold mb-1" style={{ color: C.text }}>
              {c[item.key] || ''}
            </EditableText>
            <p className="text-sm" style={{ color: C.faint }}>{item.note}</p>
          </div>
        ))}
        <div className="rounded-xl p-5 border" style={{ backgroundColor: '#fffdf9', borderColor: C.border }}>
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#8b4513' }}>Cancellation</p>
          <p className="font-semibold mb-1" style={{ color: C.text }}>48-hour policy</p>
          <p className="text-sm" style={{ color: C.faint }}>Please notify us at least 48 hours before your visit</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ContentClient({ rows }: Props) {
  const [activeLocale, setActiveLocale] = useState<LocaleKey>('en')
  const [activeSection, setActiveSection] = useState<SectionKey>('home')

  const maps: Record<LocaleKey, Record<string, string>> = {
    en: buildMap(rows.en),
    ka: buildMap(rows.ka),
  }

  const c = maps[activeLocale]

  const sections: { id: SectionKey; label: string }[] = [
    { id: 'home',    label: 'Home' },
    { id: 'about',   label: 'About' },
    { id: 'contact', label: 'Contact' },
  ]

  return (
    <div className="space-y-6 max-w-2xl">

      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>Site Content</h1>
        <p className="text-sm mt-1" style={{ color: C.faint }}>
          Click any text below to edit it. Changes are saved per field.
        </p>
      </div>

      {/* Locale tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: '#ede5d8' }}>
        {(['en', 'ka'] as const).map(l => (
          <button
            key={l}
            type="button"
            onClick={() => setActiveLocale(l)}
            className="px-5 py-1.5 rounded-md text-sm font-semibold uppercase transition-all"
            style={{
              backgroundColor: activeLocale === l ? '#fff9f3' : 'transparent',
              color: activeLocale === l ? C.wine : C.muted,
              boxShadow: activeLocale === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {l === 'en' ? 'English' : 'Georgian'}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
        {sections.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            className="px-4 py-2 text-sm font-medium transition-colors rounded-t-lg"
            style={{
              color: activeSection === tab.id ? C.wine : C.muted,
              borderBottom: activeSection === tab.id ? `2px solid ${C.wine}` : '2px solid transparent',
              backgroundColor: activeSection === tab.id ? '#fff9f3' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section preview — key forces remount (resets EditableText state) when locale changes */}
      <div key={activeLocale + '-' + activeSection}>
        {activeSection === 'home'    && <HomePreview    c={c} locale={activeLocale} />}
        {activeSection === 'about'   && <AboutPreview   c={c} locale={activeLocale} />}
        {activeSection === 'contact' && <ContactPreview c={c} locale={activeLocale} />}
      </div>

    </div>
  )
}
