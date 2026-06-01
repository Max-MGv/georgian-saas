import { getContentMap } from '@/app/actions/siteContent'
import { getSetting } from '@/app/actions/settings'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const [cookieStore, defaultLocale] = await Promise.all([cookies(), getSetting('default_locale')])
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const c = await getContentMap('contact', locale)

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }}>Get in Touch</p>
      <h1 className="text-3xl sm:text-4xl font-bold mb-8" style={{ color: '#1c1008' }}>Contact Us</h1>
      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
        {[
          { label: 'Phone',        value: c['contact_phone']   || '+995 599 96 33 17',       note: 'Call or WhatsApp, Georgian or English' },
          { label: 'Email',        value: c['contact_email']   || 'nikalasmarani@gmail.com', note: 'We reply within 24 hours' },
          { label: 'Location',     value: c['contact_address'] || 'Kardanakhi, Gurjaani',    note: 'Kakheti region, Eastern Georgia' },
          { label: 'Cancellation', value: '48-hour policy',                                  note: 'Please notify us at least 48 hours before your visit' },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-5 border" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#8b4513' }}>{item.label}</p>
            <p className="font-semibold mb-1" style={{ color: '#1c1008' }}>{item.value}</p>
            <p className="text-sm" style={{ color: '#a89070' }}>{item.note}</p>
          </div>
        ))}
      </div>

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      <section className="mb-12">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#1c1008' }}>How to Find Us</h2>
        <div className="w-full h-64 rounded-xl border flex items-center justify-center text-sm" style={{ backgroundColor: '#ede5d8', borderColor: '#e0d4c0', color: '#a89070' }}>
          Kardanakhi, Gurjaani Municipality, Kakheti, Georgia
        </div>
        <p className="text-sm mt-3" style={{ color: '#6b5a47' }}>
          We are located in the village of Kardanakhi, about 15 minutes from Gurjaani town. Exact directions are sent with your booking confirmation.
        </p>
      </section>

      <div className="text-center">
        <p className="text-sm mb-4" style={{ color: '#6b5a47' }}>Prefer to just book directly?</p>
        <a href="/#book" className="btn-wine font-semibold px-8 py-3 rounded-lg inline-block">Book a Visit</a>
      </div>
    </div>
  )
}
