'use client'

import { useState, useEffect } from 'react'
import { adminT } from '@/lib/adminT'
import EditableText from '@/components/EditableText'
import BackgroundsTab from './BackgroundsTab'
import BookingFormVisualPanel from './BookingFormVisualPanel'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', pageBg: '#f5efe6',
  wine: 'var(--color-brand)', rust: '#8b4513', inputBg: '#fffdf9',
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ContentRow = { key: string; value: string; section: string; label: string; locale: string }
type LocaleKey = 'en' | 'ka'
type ModeKey = 'visual' | 'backgrounds'
type SectionKey = 'nav' | 'home' | 'form' | 'about' | 'contact'

const IFRAME_SECTIONS = new Set<SectionKey>(['home', 'about', 'contact'])
type Props = { rows: { en: ContentRow[]; ka: ContentRow[] }; bgSettings: Record<string, string>; uploadedImages: string[]; adminLocale: string }
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
    { key: 'home_location_eyebrow', label: 'Location eyebrow',        fallback: 'Georgia' },
    { key: 'home_hero_subtitle',    label: 'Hero subtitle',            fallback: 'Wine tastings and visits at our family winery.' },
    { key: 'home_book_btn',         label: '"Book a Visit" button',    fallback: 'Book a Visit' },
    { key: 'home_order_wine_btn',   label: '"Order Wine" button',      fallback: 'Order Wine' },
    { key: 'home_package1_title',   label: 'Package 1 — title',       fallback: 'Wine Tasting' },
    { key: 'home_package1_desc',    label: 'Package 1 — description', fallback: 'A guided tasting of our house wines.' },
    { key: 'home_package2_title',   label: 'Package 2 — title',       fallback: 'Tasting + Lunch' },
    { key: 'home_package2_desc',    label: 'Package 2 — description', fallback: 'Wine tasting followed by a full traditional meal.' },
    { key: 'home_book_heading',     label: 'Booking section heading',  fallback: 'Book a Visit' },
    { key: 'home_booking_intro',    label: 'Booking intro text',       fallback: 'Fill in the form and we will confirm your booking shortly.' },
  ],
  // MAINTENANCE: If you add, remove, or rename a key here, mirror the change in
  // BookingForm.tsx (which reads these keys from the formContent prop).
  // See vault/MaintenanceNotes.md §1 for full details.
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
    // Detailed-variant-only headers — shown when enable_enhanced_company_booking is on.
    // See vault/MaintenanceNotes.md §1: keep in sync with BookingForm.tsx's isEnhanced block.
    { key: 'form_guest_counts_header',   label: 'Guest Counts header',        fallback: 'Guest Counts' },
    { key: 'form_hot_dish_header',       label: 'Hot Dish Selection header',  fallback: 'Hot Dish Selection' },
    { key: 'form_masterclass_header',    label: 'Masterclass Add-ons header', fallback: 'Masterclass Add-ons' },
  ],
  about: [
    { key: 'about_eyebrow',        label: 'Eyebrow text',              fallback: 'Our Story' },
    { key: 'about_heading',        label: 'Page heading',              fallback: 'About Us' },
    { key: 'about_story_p1',       label: 'Story — paragraph 1',      fallback: 'A family winery producing traditional wines.' },
    { key: 'about_story_p2',       label: 'Story — paragraph 2',      fallback: 'We grow our grapes with care and make our wines with minimal intervention, following methods passed down through generations.' },
    { key: 'about_story_p3',       label: 'Story — paragraph 3',      fallback: 'We welcome visitors to experience our wine culture firsthand.' },
    { key: 'about_expect_heading', label: '"What to Expect" heading',  fallback: 'What to Expect' },
    { key: 'about_expect1_label',  label: 'Expect card 1 — label',    fallback: 'Wine Tasting' },
    { key: 'about_expect1_text',   label: 'Expect card 1 — text',     fallback: 'A guided tasting of our house wines, presented by the winemaker.' },
    { key: 'about_expect2_label',  label: 'Expect card 2 — label',    fallback: 'Traditional Meal' },
    { key: 'about_expect2_text',   label: 'Expect card 2 — text',     fallback: 'An optional meal of traditional local dishes.' },
    { key: 'about_expect3_label',  label: 'Expect card 3 — label',    fallback: 'Vineyard Walk' },
    { key: 'about_expect3_text',   label: 'Expect card 3 — text',     fallback: 'A short walk through the vineyard and our cellar.' },
    { key: 'about_cta_text',       label: 'CTA text',                 fallback: 'Ready to visit?' },
    { key: 'about_cta_btn',        label: 'CTA button',               fallback: 'Book a Visit' },
  ],
  contact: [
    { key: 'contact_eyebrow',        label: 'Eyebrow text',             fallback: 'Get in Touch' },
    { key: 'contact_heading',        label: 'Page heading',             fallback: 'Contact Us' },
    { key: 'contact_label_phone',    label: 'Phone card — header',      fallback: 'Phone' },
    { key: 'contact_phone',          label: 'Phone number',             fallback: '' },
    { key: 'contact_note_phone',     label: 'Phone card — note',        fallback: 'Call or WhatsApp, Georgian or English' },
    { key: 'contact_label_email',    label: 'Email card — header',      fallback: 'Email' },
    { key: 'contact_email',          label: 'Email address',            fallback: '' },
    { key: 'contact_note_email',     label: 'Email card — note',        fallback: 'We reply within 24 hours' },
    { key: 'contact_label_location', label: 'Location card — header',   fallback: 'Location' },
    { key: 'contact_address',        label: 'Address / Location',       fallback: '' },
    { key: 'contact_note_location',  label: 'Location card — note',     fallback: 'Georgia' },
    { key: 'contact_label_cancel',   label: 'Cancellation card — header', fallback: 'Cancellation' },
    { key: 'contact_cancel_value',   label: 'Cancellation — value',     fallback: '48-hour policy' },
    { key: 'contact_note_cancel',    label: 'Cancellation — note',      fallback: 'Please notify us at least 48 hours before your visit' },
    { key: 'contact_find_us',        label: '"How to Find Us" heading', fallback: 'How to Find Us' },
    { key: 'contact_map_directions', label: 'Map directions text',       fallback: 'Exact directions are sent with your booking confirmation.' },
    { key: 'contact_book_cta',       label: 'CTA text',                 fallback: 'Prefer to just book directly?' },
    { key: 'contact_book_btn',       label: 'CTA button',               fallback: 'Book a Visit' },
  ],
}

// ── Fields panel (used for Form + Nav tabs in Visual mode) ───────────────────

function FieldsPanel({ section, c, locale, adminLocale }: { section: SectionKey; c: Record<string, string>; locale: string; adminLocale: string }) {
  return (
    <div className="space-y-4 max-w-2xl">
      {FIELDS[section].map(f => (
        <div key={f.key}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: C.rust }}>
            {adminT(adminLocale, `content.field.${f.key}`)}
          </p>
          <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: C.border, backgroundColor: C.bg }}>
            <EditableText
              contentKey={f.key}
              section={section}
              label={f.label}
              locale={locale}
              adminLocale={adminLocale}
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

export default function ContentClient({ rows, bgSettings, uploadedImages, adminLocale }: Props) {
  const [mode, setMode]       = useState<ModeKey>('visual')
  const [locale, setLocale]   = useState<LocaleKey>('en')
  const [section, setSection] = useState<SectionKey>('home')
  // Which real BookingForm.tsx layout to preview — mirrors its isEnhanced branch
  // (driven live by the enable_enhanced_company_booking setting; here it's a manual
  // toggle so both variants can be previewed/edited regardless of the tenant's setting).
  const [formVariant, setFormVariant] = useState<'simple' | 'detailed'>('simple')
  const at = (key: string, vars?: Record<string, string | number>) => adminT(adminLocale, key, vars)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'switchTab' && e.data?.tab === 'form') {
        setMode('visual')
        setSection('form')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const maps: Record<LocaleKey, Record<string, string>> = {
    en: buildMap(rows.en),
    ka: buildMap(rows.ka),
  }
  const c = maps[locale]

  const allSections: { id: SectionKey; label: string }[] = [
    { id: 'home',    label: at('content.section.home') },
    { id: 'about',   label: at('content.section.about') },
    { id: 'contact', label: at('content.section.contact') },
    { id: 'form',    label: at('content.section.form') },
    { id: 'nav',     label: at('content.section.nav') },
  ]

  const subtitle = mode === 'visual'
    ? IFRAME_SECTIONS.has(section)
      ? at('content.subtitle.iframeHover')
      : at('content.subtitle.clickField')
    : at('content.subtitle.backgrounds')

  return (
    <div className="space-y-6" style={{ maxWidth: IFRAME_SECTIONS.has(section) && mode === 'visual' ? '900px' : '672px' }}>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>{at('content.pageTitle')}</h1>
        <p className="text-sm mt-1" style={{ color: C.faint }}>{subtitle}</p>
      </div>

      {/* Mode switcher */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: C.faint }}>{at('content.view')}</span>
        <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: '#ede5d8' }}>
          {([
            { id: 'visual',      label: at('content.mode.visual') },
            { id: 'backgrounds', label: at('content.mode.backgrounds') },
          ] as { id: ModeKey; label: string }[]).map(m => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
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

      {/* Backgrounds mode */}
      {mode === 'backgrounds' && <BackgroundsTab settings={bgSettings} uploadedImages={uploadedImages} adminLocale={adminLocale} />}

      {/* Visual mode */}
      {mode === 'visual' && (
        <>
          {/* Locale switcher */}
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: '#ede5d8' }}>
            {(['en', 'ka'] as LocaleKey[]).map(l => (
              <button key={l} type="button" onClick={() => setLocale(l)}
                className="px-5 py-1.5 rounded-md text-sm font-semibold uppercase transition-all"
                style={{
                  backgroundColor: locale === l ? '#fff9f3' : 'transparent',
                  color: locale === l ? C.wine : C.muted,
                  boxShadow: locale === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                {l === 'en' ? at('content.localeToggle.english') : at('content.localeToggle.georgian')}
              </button>
            ))}
          </div>

          {/* Section tabs */}
          <div className="flex gap-1 border-b flex-wrap" style={{ borderColor: C.border }}>
            {allSections.map(tab => (
              <button key={tab.id} type="button" onClick={() => setSection(tab.id)}
                className="px-4 py-2 text-sm font-medium transition-colors rounded-t-lg whitespace-nowrap"
                style={{
                  color: section === tab.id ? C.wine : C.muted,
                  borderBottom: section === tab.id ? `2px solid ${C.wine}` : '2px solid transparent',
                  backgroundColor: section === tab.id ? '#fff9f3' : 'transparent',
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div key={locale + '-' + section}>
            {IFRAME_SECTIONS.has(section) ? (
              <div className="rounded-xl border overflow-hidden"
                style={{ borderColor: C.border, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                <iframe
                  src={section === 'home' ? `/?editMode=true&locale=${locale}` : `/${section}?editMode=true&locale=${locale}`}
                  style={{ width: '100%', height: '800px', border: 'none', display: 'block' }}
                  title={`${section} page preview`}
                />
              </div>
            ) : section === 'form' ? (
              <div className="space-y-3">
                {/* Simple/Detailed toggle — Detailed mirrors what BookingForm.tsx shows
                    when enable_enhanced_company_booking is on for a company booking. */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: C.faint }}>{at('content.view')}</span>
                  <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: '#ede5d8' }}>
                    {(['simple', 'detailed'] as const).map(v => (
                      <button key={v} type="button" onClick={() => setFormVariant(v)}
                        className="px-4 py-1.5 rounded-md text-sm font-semibold transition-all"
                        style={{
                          backgroundColor: formVariant === v ? '#fff9f3' : 'transparent',
                          color: formVariant === v ? C.wine : C.muted,
                          boxShadow: formVariant === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}>
                        {v === 'simple' ? at('content.formVariant.simple') : at('content.formVariant.detailed')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border overflow-hidden"
                  style={{ borderColor: C.border, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', backgroundColor: '#f5efe6' }}>
                  <div className="p-8">
                    <BookingFormVisualPanel c={c} locale={locale} adminLocale={adminLocale} variant={formVariant} />
                  </div>
                </div>
              </div>
            ) : (
              <FieldsPanel section={section} c={c} locale={locale} adminLocale={adminLocale} />
            )}
          </div>
        </>
      )}

    </div>
  )
}
