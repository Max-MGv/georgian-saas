import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getAllSettings } from '@/app/actions/settings'
import { settingValue } from '@/lib/settings'
import { getSiteContext } from '@/lib/siteContext'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { getAllContent } from '@/app/actions/siteContent'
import { cookies, headers } from 'next/headers'
import BookingForm from '@/components/BookingForm'
import BookingFormEditOverlay from '@/components/BookingFormEditOverlay'
import { t } from '@/lib/t'
import { preload } from 'react-dom'
import EditableText from '@/components/EditableText'
import EditModeSuppressor from '@/components/EditModeSuppressor'
import { isPaymentConfigured } from '@/lib/payments/shouldTakePayment'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<{ editMode?: string; locale?: string }> }

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams
  const isEditMode = sp.editMode === 'true'

  const [cookieStore, h, tenantId] = await Promise.all([cookies(), headers(), getTenantId()])

  // Was 14 separate getSetting() calls, each opening its own DB transaction.
  // Now one query for the whole map. ⚠️ `settings` is SERVER-ONLY — it includes
  // payment details (IBAN etc). Read individual keys below and pass those as
  // props; never hand the map itself to a client component.
  const settings = await getAllSettings(tenantId)

  const defaultLocale = settingValue(settings, 'default_locale')
  const cookieLocale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const locale = sp.locale ?? cookieLocale
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'

  const isAdmin = isEditMode ? (await getSiteContext()).isAdmin : false

  // Booleans only cross to the client — never the credentials themselves.
  // Three separate calls (#148), not one: `paymentConfigured` is the hard-block
  // half (module + credentials) — nothing, not even a company's skipPayment:false
  // override, can beat it, mirroring shouldTakePayment()'s own precedence. The
  // two section-scoped calls are the INDIVIDUAL/COMPANY defaults BookingForm
  // uses when no company override applies. Collapsing these into one scoped
  // boolean per booking type would make it impossible to tell "module off" apart
  // from "COMPANY section merely off by default" client-side — the former must
  // never be overridable, the latter must be (see Feature 148's build-time notes).
  const [allCompanies, menuItems, masterclassItems, blockedDates, content, paymentConfigured, individualsPaymentReady, companiesPaymentReady] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId, isBookingCompany: true }, orderBy: { name: 'asc' }, include: { prices: { orderBy: { minGuests: 'asc' } } } })),
    withTenantDb(tenantId, tx => tx.menuItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    withTenantDb(tenantId, tx => tx.masterclassItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    getBlockedDates(),
    // Was two getContentMap() calls (home + form) = two transactions; now one.
    getAllContent(tenantId, locale),
    isPaymentConfigured(tenantId),
    isPaymentConfigured(tenantId, { section: 'INDIVIDUAL' }),
    isPaymentConfigured(tenantId, { section: 'COMPANY' }),
  ])

  const c           = content['home'] ?? {}
  const formContent = content['form'] ?? {}

  const showCompanyPrice        = settingValue(settings, 'show_company_price_after_booking')
  const enhancedBookingStr      = settingValue(settings, 'enable_enhanced_company_booking')
  const hideCompanyDropdownStr  = settingValue(settings, 'hide_company_dropdown')
  const minGuestsTasting        = settingValue(settings, 'min_guests_tasting')
  const minGuestsTastingLunch   = settingValue(settings, 'min_guests_tasting_lunch')
  const heroBgPath              = settingValue(settings, 'home_hero_bg_path')
  const heroBgX                 = settingValue(settings, 'home_hero_bg_x')
  const heroBgY                 = settingValue(settings, 'home_hero_bg_y')
  const heroBgZoom              = settingValue(settings, 'home_hero_bg_zoom')
  const heroBgMobilePath        = settingValue(settings, 'home_hero_bg_mobile_path')
  const heroBgMobileX           = settingValue(settings, 'home_hero_bg_mobile_x')
  const heroBgMobileY           = settingValue(settings, 'home_hero_bg_mobile_y')
  const heroBgMobileZoom        = settingValue(settings, 'home_hero_bg_mobile_zoom')

  const individualsRow = allCompanies.find(c => c.isIndividual)
  const companies = allCompanies.filter(c => !c.isIndividual)
  // No invented default prices — the price line is hidden until the tenant sets a display tier
  const displayTier = individualsRow?.prices.find(p => p.isDisplayPrice)
  const displayPriceTasting = displayTier?.pricePerPerson ?? null
  const displayPriceLunch = displayTier?.tastingLunchPricePerPerson ?? null

  const logoUrl = h.get('x-tenant-logo') ?? null
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const tenantName = h.get('x-tenant-name') ?? ''

  const activeBgPath       = heroBgPath || null
  const activeMobileBgPath = heroBgMobilePath || activeBgPath
  // Neutral hero when no background image is set: gradient from the tenant's brand
  // color into a fixed near-black. The dark end is intentionally NOT a theme token
  // (e.g. --site-text) — it must stay dark for every preset, including Midnight
  // cellar where --site-text is a light cream, to keep the hero's white overlay
  // text legible and the hero reading as "dark and moody" regardless of preset.
  const heroGradient = 'linear-gradient(160deg, var(--color-brand) 0%, #1c1008 100%)'
  const desktopBgCss = activeBgPath ? `url("${activeBgPath}")` : heroGradient
  const mobileBgCss  = activeMobileBgPath ? `url("${activeMobileBgPath}")` : heroGradient

  const dx = heroBgX || '50'
  const dy = heroBgY || '50'
  const dz = (parseInt(heroBgZoom || '') || 110) / 100
  const mx = heroBgMobileX || '50'
  const my = heroBgMobileY || '50'
  const mz = (parseInt(heroBgMobileZoom || '') || 100) / 100

  if (activeBgPath) preload(activeBgPath, { as: 'image', fetchPriority: 'high' })
  if (activeMobileBgPath && activeMobileBgPath !== activeBgPath) preload(activeMobileBgPath, { as: 'image' })

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
      {/* Hero — combination: light overlay with hover-darken, logo on cream bg, individual text pills, separate button boxes */}
      <style>{`
        .hero-banner .hero-overlay {
          transition: background-color 0.45s ease;
        }
        .hero-banner:hover .hero-overlay {
          background-color: rgba(28,16,8,0.70) !important;
        }
        .hero-btn {
          transition: transform 0.2s ease, box-shadow 0.25s ease, brightness 0.2s ease;
        }
        .hero-banner:hover .hero-btn {
          transform: scale(1.04);
        }
        .hero-btn-book:hover {
          box-shadow: 0 0 18px color-mix(in srgb, var(--color-brand) 75%, transparent),
                      0 0 40px color-mix(in srgb, var(--color-brand) 35%, transparent);
          transform: scale(1.06) !important;
        }
        .hero-btn-wine:hover {
          box-shadow: 0 0 18px rgba(255,255,255,0.35), 0 0 36px rgba(255,255,255,0.15);
          transform: scale(1.06) !important;
        }
        @media (min-width: 640px) {
          .hero-banner { height: 480px; }
        }
        .home-hero-bg {
          background-image: ${mobileBgCss};
          background-position: ${mx}% ${my}%;
          background-size: cover;
          transform: scale(${mz});
          transform-origin: ${mx}% ${my}%;
        }
        @media (min-width: 640px) {
          .home-hero-bg {
            background-image: ${desktopBgCss};
            background-position: ${dx}% ${dy}%;
            transform: scale(${dz});
            transform-origin: ${dx}% ${dy}%;
          }
        }
      `}</style>

      <div className="hero-banner relative overflow-hidden">
        <div className="home-hero-bg absolute inset-0" />
        {/* Light tint — darkens on hover via CSS. Fixed dark rgba, not a theme
            token, for the same reason as heroGradient above: this section is
            always dark-with-white-text by design, independent of preset. */}
        <div className="hero-overlay absolute inset-0" style={{ backgroundColor: 'rgba(28,16,8,0.32)' }} />

        <section className="relative px-6 pt-24 pb-20 sm:pt-0 sm:pb-0 sm:h-full sm:justify-center text-center max-w-xl mx-auto flex flex-col items-center gap-6">

          {/* Logo on cream pill — tenant name as text when no logo is set */}
          <div style={{
            backgroundColor: 'rgba(245,239,230,0.92)',
            borderRadius: '22px',
            padding: '14px 28px',
            display: 'inline-block',
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt={logoAlt}
                style={{ height: '72px', width: 'auto', display: 'block' }} />
            ) : (
              <span className="font-serif text-3xl font-semibold tracking-wide" style={{ color: 'var(--color-brand)', display: 'block', lineHeight: '72px' }}>
                {tenantName}
              </span>
            )}
          </div>

          {/* Eyebrow */}
          <p className="text-xs font-semibold tracking-widest uppercase text-center">
            {isAdmin ? (
              <EditableText contentKey="home_location_eyebrow" section="home" label="Location eyebrow"
                locale={locale} fallback="Georgia" isAdmin as="span"
                style={{
                  backgroundColor: 'rgba(10,5,2,0.58)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  borderRadius: '999px',
                  padding: '4px 12px',
                  color: 'rgba(255,255,255,0.82)',
                  boxDecorationBreak: 'clone',
                  WebkitBoxDecorationBreak: 'clone',
                  display: 'inline',
                  lineHeight: '2',
                }}>
                {c['home_location_eyebrow'] ?? null}
              </EditableText>
            ) : (
              <span style={{
                backgroundColor: 'rgba(10,5,2,0.58)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                borderRadius: '999px',
                padding: '4px 12px',
                color: 'rgba(255,255,255,0.82)',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
                display: 'inline',
                lineHeight: '2',
              }}>
                {c['home_location_eyebrow'] || 'Georgia'}
              </span>
            )}
          </p>

          {/* Subtitle */}
          <p className="text-center mx-auto" style={{ width: 'min(90%, 680px)', fontSize: 'clamp(0.8rem, 2.2vw, 1.05rem)' }}>
            {isAdmin ? (
              <EditableText contentKey="home_hero_subtitle" section="home" label="Hero subtitle"
                locale={locale}
                fallback="Wine tastings and visits at our family winery."
                isAdmin as="span"
                style={{
                  backgroundColor: 'rgba(10,5,2,0.65)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  color: 'rgba(255,255,255,0.9)',
                  display: 'block',
                  lineHeight: '1.6',
                }}>
                {c['home_hero_subtitle'] ?? null}
              </EditableText>
            ) : (
              <span style={{
                backgroundColor: 'rgba(10,5,2,0.65)',
                borderRadius: '6px',
                padding: '10px 14px',
                color: 'rgba(255,255,255,0.9)',
                display: 'block',
                lineHeight: '1.6',
              }}>
                {c['home_hero_subtitle'] || 'Wine tastings and visits at our family winery.'}
              </span>
            )}
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <a href="#book" className="hero-btn hero-btn-book" style={{
              // Was a hardcoded rgba matching only the original default brand
              // color — didn't actually follow a tenant's brand override. Now
              // genuinely brand-tinted via color-mix.
              backgroundColor: 'color-mix(in srgb, var(--color-brand) 92%, transparent)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: '2px solid rgba(255,255,255,0.65)',
              borderRadius: '8px',
              padding: '12px 32px',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.95rem',
              textDecoration: 'none',
              display: 'inline-block',
            }}>
              {isAdmin ? (
                <EditableText contentKey="home_book_btn" section="home" label='"Book a Visit" button'
                  locale={locale} fallback={t(locale, 'nav.book')} isAdmin as="span">
                  {c['home_book_btn'] ?? null}
                </EditableText>
              ) : (c['home_book_btn'] || t(locale, 'nav.book'))}
            </a>
            {wineOrdersOn && (
              <a href="/wines" className="hero-btn hero-btn-wine" style={{
                backgroundColor: 'rgba(10,5,2,0.52)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                border: '2px solid rgba(255,255,255,0.65)',
                borderRadius: '8px',
                padding: '12px 32px',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.95rem',
                textDecoration: 'none',
                display: 'inline-block',
              }}>
                {isAdmin ? (
                  <EditableText contentKey="home_order_wine_btn" section="home" label='"Order Wine" button'
                    locale={locale} fallback={t(locale, 'home.order_wine')} isAdmin as="span">
                    {c['home_order_wine_btn'] ?? null}
                  </EditableText>
                ) : (c['home_order_wine_btn'] || t(locale, 'home.order_wine'))}
              </a>
            )}
          </div>

        </section>
      </div>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: 'var(--site-border)' }} /></div>

      {/* Packages */}
      <section className="px-6 py-14 max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
        {[
          {
            tk: 'home_package1_title', dk: 'home_package1_desc',
            tFb: t(locale, 'form.tasting'),
            dFb: 'A guided tasting of our house wines.',
            price: displayPriceTasting, min: parseInt(minGuestsTasting) || 4,
          },
          {
            tk: 'home_package2_title', dk: 'home_package2_desc',
            tFb: t(locale, 'form.tasting_lunch'),
            dFb: 'Wine tasting followed by a full traditional meal.',
            price: displayPriceLunch, min: parseInt(minGuestsTastingLunch) || 4,
          },
        ].map(pkg => (
          <div key={pkg.tk} className="rounded-xl p-6 border" style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}>
            <ET k={pkg.tk} s="home" lbl={pkg.tFb + ' — title'} fb={pkg.tFb}
              as="h3" className="font-semibold text-lg mb-1" style={{ color: 'var(--site-text)' }} />
            <ET k={pkg.dk} s="home" lbl={pkg.tFb + ' — description'} fb={pkg.dFb}
              as="p" className="text-sm mb-4" style={{ color: 'var(--site-muted)' }} />
            {pkg.price != null && (
              <p className="font-bold text-2xl" style={{ color: 'var(--color-brand)' }}>
                {pkg.price}₾ <span className="font-normal text-sm" style={{ color: 'var(--site-secondary)' }}>{t(locale, 'form.per_pp')}</span>
              </p>
            )}
            <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--site-secondary)' }}>
              <svg width="10" height="13" viewBox="0 0 10 13" fill="none" aria-hidden="true">
                <circle cx="5" cy="3.5" r="2.5" fill="var(--color-brand)" opacity="0.75" />
                <path d="M1 12.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="var(--color-brand)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
              </svg>
              {locale === 'ka' ? `${pkg.min} ან მეტი სტუმარი` : `${pkg.min} or more guests`}
            </p>
          </div>
        ))}
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: 'var(--site-border)' }} /></div>

      {/* Booking form */}
      <section id="book" className="px-6 py-16 max-w-2xl mx-auto">
        <ET k="home_book_heading" s="home" lbl="Booking section heading"
          fb={t(locale, 'home.book_heading')} as="h2"
          className="text-2xl font-bold mb-2" style={{ color: 'var(--site-text)' }} />
        <ET k="home_booking_intro" s="home" lbl="Booking intro text"
          fb="Fill in the form and we will confirm your booking shortly." as="p"
          className="text-sm mb-8" style={{ color: 'var(--site-muted)' }} />
        <div style={{ position: 'relative' }}>
          <BookingForm
            locale={locale}
            companies={companies}
            showCompanyPrice={showCompanyPrice === 'true'}
            enhancedEnabled={enhancedBookingStr === 'true'}
            hideCompanyDropdown={hideCompanyDropdownStr === 'true'}
            menuItems={menuItems.map(i => ({ id: i.id, name: i.name, type: i.type }))}
            masterclassItems={masterclassItems.map(i => ({ id: i.id, name: i.name, unitType: i.unitType, pricePerUnit: i.pricePerUnit }))}
            minGuestsTasting={parseInt(minGuestsTasting) || 4}
            minGuestsTastingLunch={parseInt(minGuestsTastingLunch) || 4}
            blockedDates={blockedDates.map(d => d.date)}
            formContent={formContent}
            displayPriceTasting={displayPriceTasting}
            displayPriceLunch={displayPriceLunch}
            onlinePaymentEnabled={{
              configured: paymentConfigured,
              individual: individualsPaymentReady,
              company: companiesPaymentReady,
            }}
          />
          {isEditMode && isAdmin && <BookingFormEditOverlay />}
        </div>
      </section>
    </>
  )
}
