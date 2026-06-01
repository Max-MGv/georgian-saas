import { db } from '@/lib/db'
import { getSetting } from '@/app/actions/settings'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { getContentMap } from '@/app/actions/siteContent'
import { cookies } from 'next/headers'
import BookingForm from '@/components/BookingForm'
import { t } from '@/lib/t'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'

  const [companies, showCompanyPrice, enhancedBookingStr, menuItems, masterclassItems, minGuestsTasting, minGuestsTastingLunch, blockedDates, c, formContent] = await Promise.all([
    db.company.findMany({ orderBy: { name: 'asc' }, include: { prices: { orderBy: { minGuests: 'asc' } } } }),
    getSetting('show_company_price_after_booking'),
    getSetting('enable_enhanced_company_booking'),
    db.menuItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    db.masterclassItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    getSetting('min_guests_tasting'),
    getSetting('min_guests_tasting_lunch'),
    getBlockedDates(),
    getContentMap('home', locale),
    getContentMap('form', locale),
  ])

  return (
    <>
      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center max-w-2xl mx-auto">
        <p className="text-sm font-medium tracking-widest uppercase mb-4" style={{ color: '#8b4513' }}>
          {c['home_location_eyebrow'] || 'Kakheti, Georgia'}
        </p>
        <div className="flex justify-center mb-4">
          <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '80px', width: 'auto' }} />
        </div>
        <p className="text-lg mb-10" style={{ color: '#6b5a47' }}>
          {c['home_hero_subtitle'] || 'Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="#book" className="btn-wine font-semibold px-8 py-3 rounded-lg">
            {c['home_book_btn'] || t(locale, 'nav.book')}
          </a>
          <a href="/wines" className="border font-semibold px-8 py-3 rounded-lg transition-opacity hover:opacity-70" style={{ borderColor: '#c9b99a', color: '#6b5a47' }}>
            {c['home_order_wine_btn'] || t(locale, 'home.order_wine')}
          </a>
        </div>
      </section>

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
