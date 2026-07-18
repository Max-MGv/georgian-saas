import { headers } from 'next/headers'

export const metadata = {
  title: 'Georgian Winery Platform — This could be your website',
  description: 'Booking, wine orders, and admin panel for Georgian wineries.',
}

const FEATURES = [
  {
    title: 'ონლაინ ჯავშნები',
    subtitle: 'Online bookings',
    body: 'სტუმრები ჯავშნიან დეგუსტაციას პირდაპირ საიტიდან — თარიღი, დრო, სტუმრების რაოდენობა. Guests book tastings straight from your site.',
  },
  {
    title: 'ღვინის შეკვეთები',
    subtitle: 'Wine orders',
    body: 'თქვენი ღვინოების კატალოგი კომპანიების ფასდაკლებებით და შეკვეთების მართვით. A wine catalogue with company discounts and order tracking.',
  },
  {
    title: 'ადმინ პანელი',
    subtitle: 'Admin panel',
    body: 'შეკვეთები, ფასები, სტატისტიკა და ინვოისები ერთ ადგილას — ტელეფონიდანაც. Orders, prices, statistics and invoices in one place, phone-friendly.',
  },
]

export default async function WelcomePage() {
  const h = await headers()
  const platformLogo = h.get('x-platform-logo')
  const platformLogoAlt = h.get('x-platform-logo-alt') || 'Platform'

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ backgroundColor: '#0b1120', color: '#e5e7eb' }}>
      <div className="w-full max-w-3xl text-center">
        {platformLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={platformLogo} alt={platformLogoAlt} className="mx-auto mb-8" style={{ height: 48, width: 'auto' }} />
        ) : (
          <div className="mx-auto mb-8 h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl">⬡</div>
        )}

        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight" style={{ color: '#f9fafb' }}>
          ეს შეიძლება იყოს თქვენი მარნის საიტი
        </h1>
        <p className="mt-3 text-lg" style={{ color: '#9ca3af' }}>
          This could be your winery&rsquo;s website.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-3 text-left">
          {FEATURES.map((f) => (
            <div key={f.subtitle} className="rounded-xl p-5" style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}>
              <h2 className="font-semibold" style={{ color: '#f9fafb' }}>{f.title}</h2>
              <p className="text-xs uppercase tracking-wide mt-0.5" style={{ color: '#818cf8' }}>{f.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: '#9ca3af' }}>{f.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-sm" style={{ color: '#9ca3af' }}>
          დაგვიკავშირდით / Contact us:{' '}
          <a href="mailto:max.mghvdliashvili@gmail.com" className="underline underline-offset-4" style={{ color: '#a5b4fc' }}>
            max.mghvdliashvili@gmail.com
          </a>
        </p>
      </div>
    </main>
  )
}
