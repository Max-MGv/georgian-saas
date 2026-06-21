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

// ── Visual mode — shared nav bar ──────────────────────────────────────────────

function VisualNav({ c, locale }: { c: Record<string, string>; locale: string }) {
  const links = [
    { key: 'nav_home',    label: 'Home link',       fb: 'Home' },
    { key: 'nav_about',   label: 'About link',      fb: 'About' },
    { key: 'nav_wines',   label: 'Order Wine link', fb: 'Order Wine' },
    { key: 'nav_contact', label: 'Contact link',    fb: 'Contact' },
  ]
  return (
    <header className="border-b" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '48px', width: 'auto' }} />
        <nav className="flex items-center gap-6">
          {links.map(l => (
            <EditableText key={l.key} contentKey={l.key} section="nav" label={l.label}
              locale={locale} fallback={l.fb} isAdmin as="span"
              className="text-sm font-medium" style={{ color: C.muted }}>
              {c[l.key] ?? null}
            </EditableText>
          ))}
          <div className="rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ backgroundColor: C.wine }}>
            <EditableText contentKey="nav_book" section="nav" label='"Book a Visit" button'
              locale={locale} fallback="Book a Visit" isAdmin as="span">
              {c['nav_book'] ?? null}
            </EditableText>
          </div>
        </nav>
      </div>
    </header>
  )
}

// ── Visual mode — booking form preview ────────────────────────────────────────

function VisualFormPreview({ c, locale }: { c: Record<string, string>; locale: string }) {
  const ET = ({ k, fb, lbl, as: Tag = 'p', className, style }: {
    k: string; fb: string; lbl: string
    as?: keyof React.JSX.IntrinsicElements; className?: string; style?: React.CSSProperties
  }) => (
    <EditableText contentKey={k} section="form" label={lbl} locale={locale} fallback={fb}
      isAdmin as={Tag} className={className} style={style}>
      {c[k] ?? null}
    </EditableText>
  )

  const inputBox = (
    <div className="w-full h-10 rounded-lg border" style={{ backgroundColor: C.inputBg, borderColor: C.border }} />
  )
  const labelSt: React.CSSProperties = { color: C.muted, fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px' }

  return (
    <div className="space-y-6">

      {/* Booking type */}
      <div>
        <ET k="form_booking_type" lbl="Booking Type label" fb="Booking Type" style={labelSt} />
        <div className="grid grid-cols-2 gap-3 mt-1.5">
          <div className="py-3 px-4 rounded-lg border text-sm font-medium text-white" style={{ backgroundColor: C.wine, borderColor: C.wine }}>
            <ET k="form_individual" lbl="Individual Booking button" fb="Individual Booking" as="span" />
          </div>
          <div className="py-3 px-4 rounded-lg border text-sm font-medium" style={{ backgroundColor: C.bg, borderColor: C.border, color: C.muted }}>
            <ET k="form_company_type" lbl="Tour Company button" fb="Tour Company" as="span" />
          </div>
        </div>
      </div>

      {/* Visit type */}
      <div>
        <ET k="form_visit_type" lbl="Visit Type label" fb="Visit Type" style={labelSt} />
        <div className="grid grid-cols-2 gap-3 mt-1.5">
          <div className="py-3 px-4 rounded-lg border text-left" style={{ backgroundColor: '#fff3ef', borderColor: C.wine }}>
            <ET k="form_tasting" lbl="Wine Tasting option" fb="Wine Tasting" as="div" className="font-medium text-sm" style={{ color: C.text }} />
            <div className="text-sm mt-0.5" style={{ color: C.wine }}>50₾ / person</div>
          </div>
          <div className="py-3 px-4 rounded-lg border text-left" style={{ backgroundColor: C.bg, borderColor: C.border }}>
            <ET k="form_tasting_lunch" lbl="Tasting + Lunch option" fb="Tasting + Lunch" as="div" className="font-medium text-sm" style={{ color: C.text }} />
            <div className="text-sm mt-0.5" style={{ color: C.wine }}>100₾ / person</div>
          </div>
        </div>
      </div>

      {/* Date + time */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <ET k="form_date" lbl="Date label" fb="Date" style={labelSt} />
          {inputBox}
        </div>
        <div>
          <ET k="form_time_slot" lbl="Time Slot label" fb="Time Slot" style={labelSt} />
          {inputBox}
        </div>
      </div>

      {/* Guests */}
      <div>
        <ET k="form_num_guests" lbl="Number of Guests label" fb="Number of Guests" style={labelSt} />
        <div className="h-10 w-28 rounded-lg border" style={{ backgroundColor: C.inputBg, borderColor: C.border }} />
      </div>

      {/* Name */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <ET k="form_first_name" lbl="First Name label" fb="First Name" style={labelSt} />
          {inputBox}
        </div>
        <div>
          <ET k="form_last_name" lbl="Last Name label" fb="Last Name" style={labelSt} />
          {inputBox}
        </div>
      </div>

      {/* Contact */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <ET k="form_phone" lbl="Phone label" fb="Phone" style={labelSt} />
          {inputBox}
        </div>
        <div>
          <ET k="form_email" lbl="Email label" fb="Email" style={labelSt} />
          {inputBox}
        </div>
      </div>

      {/* Submit button */}
      <div className="w-full py-3 rounded-lg text-center font-semibold text-white" style={{ backgroundColor: C.wine }}>
        <ET k="form_submit" lbl="Submit button" fb="Request Booking" as="span" />
      </div>

      {/* Cancel policy */}
      <ET k="form_cancel_policy" lbl="Cancellation policy text"
        fb="48-hour cancellation policy. We will contact you to confirm."
        as="p" className="text-xs text-center" style={{ color: C.faint }} />

    </div>
  )
}

// ── Visual mode — Home page ───────────────────────────────────────────────────

function VisualHome({ c, locale }: { c: Record<string, string>; locale: string }) {
  const ET = ({ k, fb, sec = 'home', lbl, as: Tag = 'span', className, style }: {
    k: string; fb: string; sec?: string; lbl: string
    as?: keyof React.JSX.IntrinsicElements; className?: string; style?: React.CSSProperties
  }) => (
    <EditableText contentKey={k} section={sec} label={lbl} locale={locale} fallback={fb}
      isAdmin as={Tag} className={className} style={style}>
      {c[k] ?? null}
    </EditableText>
  )

  return (
    <div style={{ backgroundColor: '#f5efe6' }}>

      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center max-w-2xl mx-auto">
        <ET k="home_location_eyebrow" lbl="Location eyebrow" fb="Kakheti, Georgia"
          as="p" className="text-sm font-medium tracking-widest uppercase mb-4" style={{ color: '#8b4513' }} />
        <div className="flex justify-center mb-4">
          <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '80px', width: 'auto' }} />
        </div>
        <ET k="home_hero_subtitle" lbl="Hero subtitle"
          fb="Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle."
          as="p" className="text-lg mb-10" style={{ color: '#6b5a47' }} />
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <div className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
            <ET k="home_book_btn" lbl='"Book a Visit" button' fb="Book a Visit" as="span" />
          </div>
          <div className="border font-semibold px-8 py-3 rounded-lg"
            style={{ borderColor: '#c9b99a', color: '#6b5a47' }}>
            <ET k="home_order_wine_btn" lbl='"Order Wine" button' fb="Order Wine" as="span" />
          </div>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Packages */}
      <section className="px-6 py-14 max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
        {[
          { tk: 'home_package1_title', dk: 'home_package1_desc', tFb: 'Wine Tasting',    dFb: '2 red wines, 1 white, chacha — guided by the winemaker',            price: '50₾' },
          { tk: 'home_package2_title', dk: 'home_package2_desc', tFb: 'Tasting + Lunch', dFb: '3 wines, chacha brandy, and a full traditional Georgian meal', price: '100₾' },
        ].map(pkg => (
          <div key={pkg.tk} className="rounded-xl p-6 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
            <ET k={pkg.tk} lbl={pkg.tFb + ' — title'} fb={pkg.tFb}
              as="h3" className="font-semibold text-lg mb-1" style={{ color: '#1c1008' }} />
            <ET k={pkg.dk} lbl={pkg.tFb + ' — description'} fb={pkg.dFb}
              as="p" className="text-sm mb-4" style={{ color: '#6b5a47' }} />
            <p className="font-bold text-2xl" style={{ color: '#7c1d23' }}>
              {pkg.price} <span className="font-normal text-sm" style={{ color: '#a89070' }}>/ person</span>
            </p>
          </div>
        ))}
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Booking section */}
      <section className="px-6 py-16 max-w-2xl mx-auto">
        <ET k="home_book_heading" lbl="Booking section heading" fb="Book a Visit"
          as="h2" className="text-2xl font-bold mb-2" style={{ color: '#1c1008' }} />
        <ET k="home_booking_intro" lbl="Booking intro text"
          fb="Fill in the form and we will confirm your booking shortly."
          as="p" className="text-sm mb-8" style={{ color: '#6b5a47' }} />

        <VisualFormPreview c={c} locale={locale} />
      </section>

    </div>
  )
}

// ── Visual mode — About page ──────────────────────────────────────────────────

function VisualAbout({ c, locale }: { c: Record<string, string>; locale: string }) {
  const ET = ({ k, fb, sec = 'about', lbl, as: Tag = 'span', className, style }: {
    k: string; fb: string; sec?: string; lbl: string
    as?: keyof React.JSX.IntrinsicElements; className?: string; style?: React.CSSProperties
  }) => (
    <EditableText contentKey={k} section={sec} label={lbl} locale={locale} fallback={fb}
      isAdmin as={Tag} className={className} style={style}>
      {c[k] ?? null}
    </EditableText>
  )

  return (
    <div style={{ backgroundColor: '#f5efe6' }}>
      <div className="max-w-2xl mx-auto px-6 py-16">

        <ET k="about_eyebrow" lbl="Eyebrow text" fb="Our Story"
          as="p" className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }} />
        <ET k="about_heading" lbl="Page heading" fb="About Nikalas Marani"
          as="h1" className="text-3xl sm:text-4xl font-bold mb-8" style={{ color: '#1c1008' }} />
        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12 space-y-4 text-base leading-relaxed" style={{ color: '#4a3728' }}>
          {[
            { k: 'about_story_p1', fb: 'Nikalas Marani is a family winery tucked into the rolling vineyards of Kardanakhi, in the Gurjaani district of Kakheti — Georgia\'s most celebrated wine region.' },
            { k: 'about_story_p2', fb: 'For generations, our family has grown Rkatsiteli and Saperavi grapes on the same land, using traditional Kakhetian methods passed down through the years. Our wines are made with minimal intervention — the grapes, the sun, and the clay vessels do most of the work.' },
            { k: 'about_story_p3', fb: 'We opened Nikalas Marani to visitors so that anyone curious about Georgian wine culture could experience it the way we do — not in a tasting room, but at the table, with food, conversation, and the winemaker sitting across from you.' },
          ].map((p, i) => (
            <ET key={p.k} k={p.k} lbl={`Story — paragraph ${i + 1}`} fb={p.fb} as="p" />
          ))}
        </section>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12">
          <ET k="about_expect_heading" lbl='"What to Expect" heading' fb="What to Expect"
            as="h2" className="text-xl font-bold mb-6" style={{ color: '#1c1008' }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { lk: 'about_expect1_label', tk: 'about_expect1_text', lFb: 'Wine Tasting',    tFb: 'Guided tasting of 2–3 house wines and chacha, explained by the winemaker himself.' },
              { lk: 'about_expect2_label', tk: 'about_expect2_text', lFb: 'Traditional Meal', tFb: 'Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani, fresh bread from the oven.' },
              { lk: 'about_expect3_label', tk: 'about_expect3_text', lFb: 'Vineyard Walk',   tFb: 'A short walk through the vineyard and a look at our qvevri (clay vessel) cellar.' },
            ].map(card => (
              <div key={card.lk} className="rounded-xl p-5 border flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
                <ET k={card.lk} lbl="Expect card — label" fb={card.lFb} as="p" className="font-semibold mb-2" style={{ color: '#1c1008' }} />
                <ET k={card.tk} lbl="Expect card — text"  fb={card.tFb} as="p" className="text-sm leading-relaxed" style={{ color: '#6b5a47' }} />
              </div>
            ))}
          </div>
        </section>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <div className="text-center">
          <ET k="about_cta_text" lbl="CTA text" fb="Ready to visit?"
            as="p" className="text-sm mb-4" style={{ color: '#6b5a47' }} />
          <div className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
            <ET k="about_cta_btn" lbl="CTA button" fb="Book a Visit" as="span" />
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Visual mode — Contact page ────────────────────────────────────────────────

function VisualContact({ c, locale }: { c: Record<string, string>; locale: string }) {
  const ET = ({ k, fb, sec = 'contact', lbl, as: Tag = 'span', className, style }: {
    k: string; fb: string; sec?: string; lbl: string
    as?: keyof React.JSX.IntrinsicElements; className?: string; style?: React.CSSProperties
  }) => (
    <EditableText contentKey={k} section={sec} label={lbl} locale={locale} fallback={fb}
      isAdmin as={Tag} className={className} style={style}>
      {c[k] ?? null}
    </EditableText>
  )

  const cards = [
    { hk: 'contact_label_phone',    hFb: 'Phone',        vk: 'contact_phone',         vFb: '+995 599 96 33 17',       nk: 'contact_note_phone',    nFb: 'Call or WhatsApp, Georgian or English' },
    { hk: 'contact_label_email',    hFb: 'Email',        vk: 'contact_email',         vFb: 'nikalasmarani@gmail.com', nk: 'contact_note_email',    nFb: 'We reply within 24 hours' },
    { hk: 'contact_label_location', hFb: 'Location',     vk: 'contact_address',       vFb: 'Kardanakhi, Gurjaani',    nk: 'contact_note_location', nFb: 'Kakheti region, Eastern Georgia' },
    { hk: 'contact_label_cancel',   hFb: 'Cancellation', vk: 'contact_cancel_value',  vFb: '48-hour policy',          nk: 'contact_note_cancel',   nFb: 'Please notify us at least 48 hours before your visit' },
  ]

  return (
    <div style={{ backgroundColor: '#f5efe6' }}>
      <div className="max-w-2xl mx-auto px-6 py-16">

        <ET k="contact_eyebrow" lbl="Eyebrow text" fb="Get in Touch"
          as="p" className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }} />
        <ET k="contact_heading" lbl="Page heading" fb="Contact Us"
          as="h1" className="text-3xl sm:text-4xl font-bold mb-8" style={{ color: '#1c1008' }} />
        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {cards.map(card => (
            <div key={card.vk} className="rounded-xl p-5 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
              <ET k={card.hk} lbl={card.hFb + ' card — header'} fb={card.hFb}
                as="p" className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#8b4513' }} />
              <ET k={card.vk} lbl={card.hFb + ' — value'} fb={card.vFb}
                as="p" className="font-semibold mb-1" style={{ color: '#1c1008' }} />
              <ET k={card.nk} lbl={card.hFb + ' — note'}  fb={card.nFb}
                as="p" className="text-sm" style={{ color: '#a89070' }} />
            </div>
          ))}
        </div>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        <section className="mb-12">
          <ET k="contact_find_us" lbl='"How to Find Us" heading' fb="How to Find Us"
            as="h2" className="text-lg font-bold mb-4" style={{ color: '#1c1008' }} />
          <div className="w-full h-48 rounded-xl border flex items-center justify-center text-sm"
            style={{ backgroundColor: '#ede5d8', borderColor: '#e0d4c0', color: '#a89070' }}>
            Kardanakhi, Gurjaani Municipality, Kakheti, Georgia
          </div>
          <ET k="contact_map_directions" lbl="Map directions text"
            fb="We are located in the village of Kardanakhi, about 15 minutes from Gurjaani town. Exact directions are sent with your booking confirmation."
            as="p" className="text-sm mt-3" style={{ color: '#6b5a47' }} />
        </section>

        <div className="text-center">
          <ET k="contact_book_cta" lbl="CTA text" fb="Prefer to just book directly?"
            as="p" className="text-sm mb-4" style={{ color: '#6b5a47' }} />
          <div className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">
            <ET k="contact_book_btn" lbl="CTA button" fb="Book a Visit" as="span" />
          </div>
        </div>

      </div>
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
                <VisualNav c={c} locale={locale} />
                {section === 'home'    && <VisualHome    c={c} locale={locale} />}
                {section === 'about'   && <VisualAbout   c={c} locale={locale} />}
                {section === 'contact' && <VisualContact c={c} locale={locale} />}
              </div>
            )}
          </div>
        </>
      )}

    </div>
  )
}
