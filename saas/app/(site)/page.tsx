import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { getSiteContext } from '@/lib/siteContext'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { getContentMap } from '@/app/actions/siteContent'
import { cookies, headers } from 'next/headers'
import BookingForm from '@/components/BookingForm'
import BookingFormEditOverlay from '@/components/BookingFormEditOverlay'
import { t } from '@/lib/t'
import { preload } from 'react-dom'
import EditableText from '@/components/EditableText'
import EditModeSuppressor from '@/components/EditModeSuppressor'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<{ editMode?: string; locale?: string }> }

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams
  const isEditMode = sp.editMode === 'true'

  const [cookieStore, defaultLocale, h] = await Promise.all([cookies(), getSetting('default_locale'), headers()])
  const cookieLocale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const locale = sp.locale ?? cookieLocale

  const isAdmin = isEditMode ? (await getSiteContext()).isAdmin : false

  const tenantId = await getTenantId()
  const [allCompanies, showCompanyPrice, enhancedBookingStr, hideCompanyDropdownStr, menuItems, masterclassItems, minGuestsTasting, minGuestsTastingLunch, blockedDates, c, formContent, heroBgPath, heroBgX, heroBgY, heroBgZoom, heroBgMobilePath, heroBgMobileX, heroBgMobileY, heroBgMobileZoom] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId, isBookingCompany: true }, orderBy: { name: 'asc' }, include: { prices: { orderBy: { minGuests: 'asc' } } } })),
    getSetting('show_company_price_after_booking'),
    getSetting('enable_enhanced_company_booking'),
    getSetting('hide_company_dropdown'),
    withTenantDb(tenantId, tx => tx.menuItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    withTenantDb(tenantId, tx => tx.masterclassItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    getSetting('min_guests_tasting'),
    getSetting('min_guests_tasting_lunch'),
    getBlockedDates(),
    getContentMap('home', locale),
    getContentMap('form', locale),
    getSetting('home_hero_bg_path'),
    getSetting('home_hero_bg_x'),
    getSetting('home_hero_bg_y'),
    getSetting('home_hero_bg_zoom'),
    getSetting('home_hero_bg_mobile_path'),
    getSetting('home_hero_bg_mobile_x'),
    getSetting('home_hero_bg_mobile_y'),
    getSetting('home_hero_bg_mobile_zoom'),
  ])

  const individualsRow = allCompanies.find(c => c.isIndividual)
  const companies = allCompanies.filter(c => !c.isIndividual)
  const displayTier = individualsRow?.prices.find(p => p.isDisplayPrice)
  const displayPriceTasting = displayTier?.pricePerPerson ?? 50
  const displayPriceLunch = displayTier?.tastingLunchPricePerPerson ?? 100

  const logoUrl = h.get('x-tenant-logo') ?? '/icons/logo-dark.svg'
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''

  const activeBgPath       = heroBgPath || '/images/winery1.jpg'
  const activeMobileBgPath = heroBgMobilePath || activeBgPath

  const dx = heroBgX || '50'
  const dy = heroBgY || '50'
  const dz = (parseInt(heroBgZoom || '') || 110) / 100
  const mx = heroBgMobileX || '50'
  const my = heroBgMobileY || '50'
  const mz = (parseInt(heroBgMobileZoom || '') || 100) / 100

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
          box-shadow: 0 0 18px rgba(180,40,50,0.75), 0 0 40px rgba(180,40,50,0.35);
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
          background-image: url("${activeMobileBgPath}");
          background-position: ${mx}% ${my}%;
          background-size: cover;
          transform: scale(${mz});
          transform-origin: ${mx}% ${my}%;
        }
        @media (min-width: 640px) {
          .home-hero-bg {
            background-image: url("${activeBgPath}");
            background-position: ${dx}% ${dy}%;
            transform: scale(${dz});
            transform-origin: ${dx}% ${dy}%;
          }
        }
      `}</style>

      <div className="hero-banner relative overflow-hidden">
        <div className="home-hero-bg absolute inset-0" />
        {/* Light tint — darkens on hover via CSS */}
        <div className="hero-overlay absolute inset-0" style={{ backgroundColor: 'rgba(28,16,8,0.32)' }} />

        <section className="relative px-6 pt-24 pb-20 sm:pt-0 sm:pb-0 sm:h-full sm:justify-center text-center max-w-xl mx-auto flex flex-col items-center gap-6">

          {/* Logo on cream pill */}
          <div style={{
            backgroundColor: 'rgba(245,239,230,0.92)',
            borderRadius: '22px',
            padding: '14px 28px',
            display: 'inline-block',
          }}>
            <img src={logoUrl} alt={logoAlt}
              style={{ height: '72px', width: 'auto', display: 'block' }} />
          </div>

          {/* Eyebrow */}
          <p className="text-xs font-semibold tracking-widest uppercase text-center">
            {isAdmin ? (
              <EditableText contentKey="home_location_eyebrow" section="home" label="Location eyebrow"
                locale={locale} fallback="Kakheti, Georgia" isAdmin as="span"
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
                {c['home_location_eyebrow'] || 'Kakheti, Georgia'}
              </span>
            )}
          </p>

          {/* Subtitle */}
          <p className="text-center mx-auto" style={{ width: 'min(90%, 680px)', fontSize: 'clamp(0.8rem, 2.2vw, 1.05rem)' }}>
            {isAdmin ? (
              <EditableText contentKey="home_hero_subtitle" section="home" label="Hero subtitle"
                locale={locale}
                fallback="Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle."
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
                {c['home_hero_subtitle'] || 'Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle.'}
              </span>
            )}
          </p>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <a href="#book" className="hero-btn hero-btn-book" style={{
              backgroundColor: 'rgba(124,29,35,0.92)',
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
          </div>

        </section>
      </div>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Packages */}
      <section className="px-6 py-14 max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
        {[
          {
            tk: 'home_package1_title', dk: 'home_package1_desc',
            tFb: t(locale, 'form.tasting'),
            dFb: '2 red wines, 1 white, chacha — guided by the winemaker',
            price: displayPriceTasting, min: parseInt(minGuestsTasting) || 4,
          },
          {
            tk: 'home_package2_title', dk: 'home_package2_desc',
            tFb: t(locale, 'form.tasting_lunch'),
            dFb: '3 wines, chacha brandy, and a full traditional Georgian meal',
            price: displayPriceLunch, min: parseInt(minGuestsTastingLunch) || 4,
          },
        ].map(pkg => (
          <div key={pkg.tk} className="rounded-xl p-6 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
            <ET k={pkg.tk} s="home" lbl={pkg.tFb + ' — title'} fb={pkg.tFb}
              as="h3" className="font-semibold text-lg mb-1" style={{ color: '#1c1008' }} />
            <ET k={pkg.dk} s="home" lbl={pkg.tFb + ' — description'} fb={pkg.dFb}
              as="p" className="text-sm mb-4" style={{ color: '#6b5a47' }} />
            <p className="font-bold text-2xl" style={{ color: 'var(--color-brand)' }}>
              {pkg.price}₾ <span className="font-normal text-sm" style={{ color: '#a89070' }}>{t(locale, 'form.per_pp')}</span>
            </p>
            <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: '#a89070' }}>
              <svg width="10" height="13" viewBox="0 0 10 13" fill="none" aria-hidden="true">
                <circle cx="5" cy="3.5" r="2.5" fill="var(--color-brand)" opacity="0.75" />
                <path d="M1 12.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="var(--color-brand)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.75" />
              </svg>
              {locale === 'ka' ? `${pkg.min} ან მეტი სტუმარი` : `${pkg.min} or more guests`}
            </p>
          </div>
        ))}
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Booking form */}
      <section id="book" className="px-6 py-16 max-w-2xl mx-auto">
        <ET k="home_book_heading" s="home" lbl="Booking section heading"
          fb={t(locale, 'home.book_heading')} as="h2"
          className="text-2xl font-bold mb-2" style={{ color: '#1c1008' }} />
        <ET k="home_booking_intro" s="home" lbl="Booking intro text"
          fb="Fill in the form and we will confirm your booking shortly." as="p"
          className="text-sm mb-8" style={{ color: '#6b5a47' }} />
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
          />
          {isEditMode && isAdmin && <BookingFormEditOverlay />}
        </div>
      </section>
    </>
  )
}
