import { db } from '@/lib/db'
import BookingForm from '@/components/BookingForm'

export default async function Home() {
  const companies = await db.company.findMany({
    orderBy: { name: 'asc' },
    include: { prices: { orderBy: { minGuests: 'asc' } } },
  })

  return (
    <>
      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center max-w-2xl mx-auto">
        <p className="text-sm font-medium tracking-widest uppercase mb-4" style={{ color: '#8b4513' }}>
          Kakheti, Georgia
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 leading-tight" style={{ color: '#1c1008' }}>
          Nikalas Marani
        </h1>
        <p className="text-lg mb-10" style={{ color: '#6b5a47' }}>
          Family winery in the heart of Kakheti. Wine tastings, traditional meals,
          and the stories behind every bottle.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="#book"
            className="btn-wine font-semibold px-8 py-3 rounded-lg"
          >
            Book a Visit
          </a>
          <button
            disabled
            title="Coming soon"
            className="border font-semibold px-8 py-3 rounded-lg cursor-not-allowed"
            style={{ borderColor: '#c9b99a', color: '#a89070' }}
          >
            View Wine Catalogue
          </button>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="h-px" style={{ backgroundColor: '#e0d4c0' }} />
      </div>

      {/* Packages */}
      <section className="px-6 py-14 max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
        {[
          {
            title: 'Wine Tasting',
            desc: '2 red wines, 1 white, chacha — guided by the winemaker',
            price: 50,
          },
          {
            title: 'Tasting + Lunch',
            desc: '3 wines, chacha brandy, and a full traditional Georgian meal',
            price: 100,
          },
        ].map(pkg => (
          <div
            key={pkg.title}
            className="rounded-xl p-6 border"
            style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}
          >
            <h3 className="font-semibold text-lg mb-1" style={{ color: '#1c1008' }}>{pkg.title}</h3>
            <p className="text-sm mb-4" style={{ color: '#6b5a47' }}>{pkg.desc}</p>
            <p className="font-bold text-2xl" style={{ color: '#7c1d23' }}>
              {pkg.price}₾{' '}
              <span className="font-normal text-sm" style={{ color: '#a89070' }}>/ person</span>
            </p>
            <p className="text-xs mt-1" style={{ color: '#a89070' }}>Minimum 4 guests</p>
          </div>
        ))}
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="h-px" style={{ backgroundColor: '#e0d4c0' }} />
      </div>

      {/* Booking form */}
      <section id="book" className="px-6 py-16 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#1c1008' }}>Book a Visit</h2>
        <p className="text-sm mb-8" style={{ color: '#6b5a47' }}>
          Fill in the form and we will confirm your booking shortly.
        </p>
        <BookingForm companies={companies} />
      </section>
    </>
  )
}
