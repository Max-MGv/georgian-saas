import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { getContentMap } from '@/app/actions/siteContent'
import { cookies } from 'next/headers'
import BookingForm from '@/components/BookingForm'
import { t } from '@/lib/t'
import Image from 'next/image'
import { preload } from 'react-dom'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'

  const tenantId = await getTenantId()
  const [companies, showCompanyPrice, enhancedBookingStr, menuItems, masterclassItems, minGuestsTasting, minGuestsTastingLunch, blockedDates, c, formContent, heroBgPath, heroBgX, heroBgY, heroBgZoom, heroBgMobilePath, heroBgMobileX, heroBgMobileY, heroBgMobileZoom] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, include: { prices: { orderBy: { minGuests: 'asc' } } } })),
    getSetting('show_company_price_after_booking'),
    getSetting('enable_enhanced_company_booking'),
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

  return (
    <>
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

          {/* Logo on cream pill — #4 rounder corners */}
          <div style={{
            backgroundColor: 'rgba(245,239,230,0.92)',
            borderRadius: '22px',
            padding: '14px 28px',
            display: 'inline-block',
          }}>
            <Image src="/icons/logo-dark.svg" alt="Nikalas Marani"
              width={200} height={72} priority
              style={{ height: '72px', width: 'auto', display: 'block' }} />
          </div>

          {/* Eyebrow — per-line inline highlight */}
          <p className="text-xs font-semibold tracking-widest uppercase text-center">
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
          </p>

          {/* Subtitle */}
          <p className="text-center mx-auto" style={{ width: 'min(90%, 680px)', fontSize: 'clamp(0.8rem, 2.2vw, 1.05rem)' }}>
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
          </p>

          {/* Buttons — #5 more gap above buttons */}
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
              {c['home_book_btn'] || t(locale, 'nav.book')}
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
              {c['home_order_wine_btn'] || t(locale, 'home.order_wine')}
            </a>
          </div>

        </section>
      </div>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Packages */}
      <section className="px-6 py-14 max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
        {[
          {
            title: c['home_package1_title'] || t(locale, 'form.tasting'),
            desc:  c['home_package1_desc']  || '2 red wines, 1 white, chacha — guided by the winemaker',
            price: 50, min: parseInt(minGuestsTasting) || 4,
          },
          {
            title: c['home_package2_title'] || t(locale, 'form.tasting_lunch'),
            desc:  c['home_package2_desc']  || '3 wines, chacha brandy, and a full traditional Georgian meal',
            price: 100, min: parseInt(minGuestsTastingLunch) || 4,
          },
        ].map(pkg => (
          <div key={pkg.title} className="rounded-xl p-6 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
            <h3 className="font-semibold text-lg mb-1" style={{ color: '#1c1008' }}>{pkg.title}</h3>
            <p className="text-sm mb-4" style={{ color: '#6b5a47' }}>{pkg.desc}</p>
            <p className="font-bold text-2xl" style={{ color: '#7c1d23' }}>
              {pkg.price}₾ <span className="font-normal text-sm" style={{ color: '#a89070' }}>{t(locale, 'form.per_pp')}</span>
            </p>
            <p className="text-xs mt-1" style={{ color: '#a89070' }}>{t(locale, 'form.minimum')} {pkg.min} {t(locale, 'form.guest_plural')}</p>
          </div>
        ))}
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Booking form */}
      <section id="book" className="px-6 py-16 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#1c1008' }}>{c['home_book_heading'] || t(locale, 'home.book_heading')}</h2>
        <p className="text-sm mb-8" style={{ color: '#6b5a47' }}>
          {c['home_booking_intro'] || 'Fill in the form and we will confirm your booking shortly.'}
        </p>
        <BookingForm
          locale={locale}
          companies={companies}
          showCompanyPrice={showCompanyPrice === 'true'}
          enhancedEnabled={enhancedBookingStr === 'true'}
          menuItems={menuItems.map(i => ({ id: i.id, name: i.name, type: i.type }))}
          masterclassItems={masterclassItems.map(i => ({ id: i.id, name: i.name, unitType: i.unitType, pricePerUnit: i.pricePerUnit }))}
          minGuestsTasting={parseInt(minGuestsTasting) || 4}
          minGuestsTastingLunch={parseInt(minGuestsTastingLunch) || 4}
          blockedDates={blockedDates.map(d => d.date)}
          formContent={formContent}
        />
      </section>
    </>
  )
}
