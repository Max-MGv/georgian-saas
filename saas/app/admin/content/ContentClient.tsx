'use client'

import { useState } from 'react'
import EditableText from '@/components/EditableText'
import BackgroundsTab from './BackgroundsTab'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', pageBg: '#f5efe6',
  wine: '#7c1d23', rust: '#8b4513', inputBg: '#fffdf9',
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ContentRow = { key: string; value: string; section: string; label: string; locale: string }
type LocaleKey = 'en' | 'ka'
type ModeKey = 'text' | 'visual' | 'backgrounds'
type SectionKey = 'nav' | 'home' | 'form' | 'about' | 'contact'
type Props = { rows: { en: ContentRow[]; ka: ContentRow[] }; bgSettings: Record<string, string>; uploadedImages: string[] }
type FieldDef = { key: string; label: string; fallback: string }

function buildMap(rows: ContentRow[]) {
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ── Content schema ────────────────────────────────────────────────────────────
const FIELDS: Record<SectionKey, FieldDef[]> = {
  nav: [
    { key: 'nav_home',    label: 'Home link',               fallback: 'Home' },
    { key: 'nav_about',   label: 'About link',              fallback: 'About' },
    { key: 'nav_wines',   label: 'Order Wine link',         fallback: 'Order Wine' },
    { key: 'nav_contact', label: 'Contact link',            fallback: 'Contact' },
    { key: 'nav_book',    label: '"Book a Visit" button',   fallback: 'Book a Visit' },
  ],
  home: [
    { key: 'home_location_eyebrow', label: 'Location eyebrow',        fallback: 'Kakheti, Georgia' },
    { key: 'home_hero_subtitle',    label: 'Hero subtitle',            fallback: 'Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle.' },
    { key: 'home_book_btn',         label: '"Book a Visit" button',    fallback: 'Book a Visit' },
    { key: 'home_order_wine_btn',   label: '"Order Wine" button',      fallback: 'Order Wine' },
    { key: 'home_package1_title',   label: 'Package 1 — title',       fallback: 'Wine Tasting' },
    { key: 'home_package1_desc',    label: 'Package 1 — description', fallback: '2 red wines, 1 white, chacha — guided by the winemaker' },
    { key: 'home_package2_title',   label: 'Package 2 — title',       fallback: 'Tasting + Lunch' },
    { key: 'home_package2_desc',    label: 'Package 2 — description', fallback: '3 wines, chacha brandy, and a full traditional Georgian meal' },
    { key: 'home_book_heading',     label: 'Booking section heading',  fallback: 'Book a Visit' },
    { key: 'home_booking_intro',    label: 'Booking intro text',       fallback: 'Fill in the form and we will confirm your booking shortly.' },
  ],
  form: [
    { key: 'form_booking_type',          label: 'Booking Type label',         fallback: 'Booking Type' },
    { key: 'form_individual',            label: 'Individual Booking button',  fallback: 'Individual Booking' },
    { key: 'form_company_type',          label: 'Tour Company button',        fallback: 'Tour Company' },
    { key: 'form_visit_type',            label: 'Visit Type label',           fallback: 'Visit Type' },
    { key: 'form_tasting',               label: 'Wine Tasting option',        fallback: 'Wine Tasting' },
    { key: 'form_tasting_lunch',         label: 'Tasting + Lunch option',     fallback: 'Tasting + Lunch' },
    { key: 'form_date',                  label: 'Date label',                 fallback: 'Date' },
    { key: 'form_time_slot',             label: 'Time Slot label',            fallback: 'Time Slot' },
    { key: 'form_num_guests',            label: 'Number of Guests label',     fallback: 'Number of Guests' },
    { key: 'form_first_name',            label: 'First Name label',           fallback: 'First Name' },
    { key: 'form_last_name',             label: 'Last Name label',            fallback: 'Last Name' },
    { key: 'form_phone',                 label: 'Phone label',                fallback: 'Phone' },
    { key: 'form_email',                 label: 'Email label',                fallback: 'Email' },
    { key: 'form_food_notes',            label: 'Food Notes label',           fallback: 'Food Notes' },
    { key: 'form_food_notes_sub',        label: 'Food Notes subtitle',        fallback: 'allergies, dietary requirements' },
    { key: 'form_food_notes_placeholder', label: 'Food Notes placeholder',    fallback: 'Any dietary restrictions or special requests for the kitchen…' },
    { key: 'form_submit',                label: 'Submit button',              fallback: 'Request Booking' },
    { key: 'form_cancel_policy',         label: 'Cancellation policy text',   fallback: '48-hour cancellation policy. We will contact you to confirm.' },
    { key: 'form_success_heading',       label: 'Success heading',            fallback: 'Booking received!' },
    { key: 'form_success_body',          label: 'Success body text',          fallback: 'Thank you. We will contact you shortly to confirm your visit.' },
  ],
  about: [
    { key: 'about_eyebrow',        label: 'Eyebrow text',              fallback: 'Our Story' },
    { key: 'about_heading',        label: 'Page heading',              fallback: 'About Nikalas Marani' },
    { key: 'about_story_p1',       label: 'Story — paragraph 1',      fallback: 'Nikalas Marani is a family winery tucked into the rolling vineyards of Kardanakhi, in the Gurjaani district of Kakheti — Georgia\'s most celebrated wine region.' },
    { key: 'about_story_p2',       label: 'Story — paragraph 2',      fallback: 'For generations, our family has grown Rkatsiteli and Saperavi grapes on the same land, using traditional Kakhetian methods passed down through the years. Our wines are made with minimal intervention — the grapes, the sun, and the clay vessels do most of the work.' },
    { key: 'about_story_p3',       label: 'Story — paragraph 3',      fallback: 'We opened Nikalas Marani to visitors so that anyone curious about Georgian wine culture could experience it the way we do — not in a tasting room, but at the table, with food, conversation, and the winemaker sitting across from you.' },
    { key: 'about_expect_heading', label: '"What to Expect" heading',  fallback: 'What to Expect' },
    { key: 'about_expect1_label',  label: 'Expect card 1 — label',    fallback: 'Wine Tasting' },
    { key: 'about_expect1_text',   label: 'Expect card 1 — text',     fallback: 'Guided tasting of 2–3 house wines and chacha, explained by the winemaker himself.' },
    { key: 'about_expect2_label',  label: 'Expect card 2 — label',    fallback: 'Traditional Meal' },
    { key: 'about_expect2_text',   label: 'Expect card 2 — text',     fallback: 'Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani, fresh bread from the oven.' },
    { key: 'about_expect3_label',  label: 'Expect card 3 — label',    fallback: 'Vineyard Walk' },
    { key: 'about_expect3_text',   label: 'Expect card 3 — text',     fallback: 'A short walk through the vineyard and a look at our qvevri (clay vessel) cellar.' },
    { key: 'about_cta_text',       label: 'CTA text',                 fallback: 'Ready to visit?' },
    { key: 'about_cta_btn',        label: 'CTA button',               fallback: 'Book a Visit' },
  ],
  contact: [
    { key: 'contact_eyebrow',        label: 'Eyebrow text',             fallback: 'Get in Touch' },
    { key: 'contact_heading',        label: 'Page heading',             fallback: 'Contact Us' },
    { key: 'contact_label_phone',    label: 'Phone card — header',      fallback: 'Phone' },
    { key: 'contact_phone',          label: 'Phone number',             fallback: '+995 599 96 33 17' },
    { key: 'contact_note_phone',     label: 'Phone card — note',        fallback: 'Call or WhatsApp, Georgian or English' },
    { key: 'contact_label_email',    label: 'Email card — header',      fallback: 'Email' },
    { key: 'contact_email',          label: 'Email address',            fallback: 'nikalasmarani@gmail.com' },
    { key: 'contact_note_email',     label: 'Email card — note',        fallback: 'We reply within 24 hours' },
    { key: 'contact_label_location', label: 'Location card — header',   fallback: 'Location' },
    { key: 'contact_address',        label: 'Address / Location',       fallback: 'Kardanakhi, Gurjaani' },
    { key: 'contact_note_location',  label: 'Location card — note',     fallback: 'Kakheti region, Eastern Georgia' },
    { key: 'contact_label_cancel',   label: 'Cancellation card — header', fallback: 'Cancellation' },
    { key: 'contact_cancel_value',   label: 'Cancellation — value',     fallback: '48-hour policy' },
    { key: 'contact_note_cancel',    label: 'Cancellation — note',      fallback: 'Please notify us at least 48 hours before your visit' },
    { key: 'contact_find_us',        label: '"How to Find Us" heading', fallback: 'How to Find Us' },
    { key: 'contact_map_directions', label: 'Map directions text',       fallback: 'We are located in the village of Kardanakhi, about 15 minutes from Gurjaani town. Exact directions are sent with your booking confirmation.' },
    { key: 'contact_book_cta',       label: 'CTA text',                 fallback: 'Prefer to just book directly?' },
    { key: 'contact_book_btn',       label: 'CTA button',               fallback: 'Book a Visit' },
  ],
}

// ── Text mode ─────────────────────────────────────────────────────────────────

function TextMode({ section, c, locale }: { section: SectionKey; c: Record<string, string>; locale: string }) {
  return (
    <div className="space-y-5 max-w-2xl">
      {FIELDS[section].map(f => (
        <div key={f.key}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: C.rust }}>
            {f.label}
          </p>
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: C.border, backgroundColor: C.bg }}>
            <EditableText
              contentKey={f.key}
              section={section}
              label={f.label}
              locale={locale}
              fallback={f.fallback}
              isAdmin
              as="p"
              className="text-sm leading-relaxed"
              style={{ color: C.text }}
            >
              {c[f.key] ?? null}
            </EditableText>
          </div>
        </div>
      ))}
    </div>
  )
}




// ── Main component ────────────────────────────────────────────────────────────

export default function ContentClient({ rows, bgSettings, uploadedImages }: Props) {
  const [mode, setMode]       = useState<ModeKey>('text')
  const [locale, setLocale]   = useState<LocaleKey>('en')
  const [section, setSection] = useState<SectionKey>('home')

  const maps: Record<LocaleKey, Record<string, string>> = {
    en: buildMap(rows.en),
    ka: buildMap(rows.ka),
  }
  const c = maps[locale]

  const textSections:   { id: SectionKey; label: string }[] = [
    { id: 'nav',     label: 'Navigation' },
    { id: 'home',    label: 'Home' },
    { id: 'form',    label: 'Form' },
    { id: 'about',   label: 'About' },
    { id: 'contact', label: 'Contact' },
  ]
  const visualSections: { id: SectionKey; label: string }[] = [
    { id: 'home',    label: 'Home' },
    { id: 'about',   label: 'About' },
    { id: 'contact', label: 'Contact' },
  ]
  const activeSections = mode === 'text' ? textSections : visualSections

  function switchMode(next: ModeKey) {
    setMode(next)
    if (next === 'visual' && (section === 'nav' || section === 'form')) setSection('home')
  }

  return (
    <div className="space-y-6" style={{ maxWidth: mode === 'visual' ? '900px' : '672px' }}>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>Site Content</h1>
        <p className="text-sm mt-1" style={{ color: C.faint }}>
          {mode === 'text'
            ? 'Click any field to edit it inline. Changes save per field.'
            : mode === 'visual'
            ? 'Hover any text on the page preview to edit it. Changes save per field.'
            : 'Choose a background image for each page. Adjust position and zoom, then save.'}
        </p>
      </div>

      {/* Mode switcher */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: C.faint }}>View</span>
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: '#ede5d8' }}>
          {([
            { id: 'text',        label: 'Text' },
            { id: 'visual',      label: 'Visual' },
            { id: 'backgrounds', label: 'Backgrounds' },
          ] as { id: ModeKey; label: string }[]).map(m => (
            <button key={m.id} type="button" onClick={() => switchMode(m.id)}
              className="px-4 py-1.5 rounded-md text-sm font-semibold transition-all"
              style={{
                backgroundColor: mode === m.id ? '#fff9f3' : 'transparent',
                color: mode === m.id ? C.wine : C.muted,
                boxShadow: mode === m.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Backgrounds mode — no locale/section switchers needed */}
      {mode === 'backgrounds' && <BackgroundsTab settings={bgSettings} uploadedImages={uploadedImages} />}

      {/* Locale + section switchers — only for text/visual modes */}
      {mode !== 'backgrounds' && (
        <>
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: '#ede5d8' }}>
            {(['en', 'ka'] as LocaleKey[]).map(l => (
              <button key={l} type="button" onClick={() => setLocale(l)}
                className="px-5 py-1.5 rounded-md text-sm font-semibold uppercase transition-all"
                style={{
                  backgroundColor: locale === l ? '#fff9f3' : 'transparent',
                  color: locale === l ? C.wine : C.muted,
                  boxShadow: locale === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                {l === 'en' ? 'English' : 'Georgian'}
              </button>
            ))}
          </div>

          <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
            {activeSections.map(tab => (
              <button key={tab.id} type="button" onClick={() => setSection(tab.id)}
                className="px-4 py-2 text-sm font-medium transition-colors rounded-t-lg"
                style={{
                  color: section === tab.id ? C.wine : C.muted,
                  borderBottom: section === tab.id ? `2px solid ${C.wine}` : '2px solid transparent',
                  backgroundColor: section === tab.id ? '#fff9f3' : 'transparent',
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div key={mode + '-' + locale + '-' + section}>
            {mode === 'text' ? (
              <TextMode section={section} c={c} locale={locale} />
            ) : (
              <div className="rounded-xl border overflow-hidden"
                style={{ borderColor: C.border, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                <iframe
                  src={section === 'home' ? `/?editMode=true&locale=${locale}` : `/${section}?editMode=true&locale=${locale}`}
                  style={{ width: '100%', height: '800px', border: 'none', display: 'block' }}
                  title={`${section} page preview`}
                />
              </div>
            )}
          </div>
        </>
      )}

    </div>
  )
}
