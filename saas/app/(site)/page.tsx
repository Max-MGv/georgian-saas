import { db } from '@/lib/db'
import { getSetting } from '@/app/actions/settings'
import { getBlockedDates } from '@/app/actions/blockedDates'
import { getContentMap } from '@/app/actions/siteContent'
import { cookies } from 'next/headers'
import BookingForm from '@/components/BookingForm'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'

  const [companies, showCompanyPrice, enhancedBookingStr, menuItems, masterclassItems, minGuestsTasting, minGuestsTastingLunch, blockedDates, c] = await Promise.all([
    db.company.findMany({ orderBy: { name: 'asc' }, include: { prices: { orderBy: { minGuests: 'asc' } } } }),
    getSetting('show_company_price_after_booking'),
    getSetting('enable_enhanced_company_booking'),
    db.menuItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    db.masterclassItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    getSetting('min_guests_tasting'),
    getSetting('min_guests_tasting_lunch'),
    getBlockedDates(),
    getContentMap('home', locale),
  ])

  return (
    <>
      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center max-w-2xl mx-auto">
        <p className="text-sm font-medium tracking-widest uppercase mb-4" style={{ color: '#8b4513' }}>
          Kakheti, Georgia
        </p>
        <div className="flex justify-center mb-4">
          <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '80px', width: 'auto' }} />
        </div>
        <p className="text-lg mb-10" style={{ color: '#6b5a47' }}>
          {c['home_hero_subtitle'] || 'Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="#book" className="btn-wine font-semibold px-8 py-3 rounded-lg">Book a Visit</a>
          <a href="/wines" className="border font-semibold px-8 py-3 rounded-lg transition-opacity hover:opacity-70" style={{ borderColor: '#c9b99a', color: '#6b5a47' }}>
            Order Wine
          </a>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Packages */}
      <section className="px-6 py-14 max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
        {[
          {
            title: c['home_package1_title'] || 'Wine Tasting',
            desc:  c['home_package1_desc']  || '2 red wines, 1 white, chacha — guided by the winemaker',
            price: 50, min: parseInt(minGuestsTasting) || 4,
          },
          {
            title: c['home_package2_title'] || 'Tasting + Lunch',
            desc:  c['home_package2_desc']  || '3 wines, chacha brandy, and a full traditional Georgian meal',
            price: 100, min: parseInt(minGuestsTastingLunch) || 4,
          },
        ].map(pkg => (
          <div key={pkg.title} className="rounded-xl p-6 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
            <h3 className="font-semibold text-lg mb-1" style={{ color: '#1c1008' }}>{pkg.title}</h3>
            <p className="text-sm mb-4" style={{ color: '#6b5a47' }}>{pkg.desc}</p>
            <p className="font-bold text-2xl" style={{ color: '#7c1d23' }}>
              {pkg.price}₾ <span className="font-normal text-sm" style={{ color: '#a89070' }}>/ person</span>
            </p>
            <p className="text-xs mt-1" style={{ color: '#a89070' }}>Minimum {pkg.min} guests</p>
          </div>
        ))}
      </section>

      <div className="max-w-2xl mx-auto px-6"><div className="h-px" style={{ backgroundColor: '#e0d4c0' }} /></div>

      {/* Booking form */}
      <section id="book" className="px-6 py-16 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#1c1008' }}>Book a Visit</h2>
        <p className="text-sm mb-8" style={{ color: '#6b5a47' }}>
          {c['home_booking_intro'] || 'Fill in the form and we will confirm your booking shortly.'}
        </p>
        <BookingForm
          companies={companies}
          showCompanyPrice={showCompanyPrice === 'true'}
          enhancedEnabled={enhancedBookingStr === 'true'}
          menuItems={menuItems.map(i => ({ id: i.id, name: i.name, type: i.type }))}
          masterclassItems={masterclassItems.map(i => ({ id: i.id, name: i.name, unitType: i.unitType, pricePerUnit: i.pricePerUnit }))}
          minGuestsTasting={parseInt(minGuestsTasting) || 4}
          minGuestsTastingLunch={parseInt(minGuestsTastingLunch) || 4}
          blockedDates={blockedDates.map(d => d.date)}
        />
      </section>
    </>
  )
}
