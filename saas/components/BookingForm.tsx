'use client'

import { useState } from 'react'
import { createBooking } from '@/app/actions/createBooking'

type Price = { id: string; minGuests: number; maxGuests: number; pricePerPerson: number; registrationPrice: number }
type Company = { id: string; name: string; prices: Price[] }

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const MIN_GUESTS = 4

// Palette constants so styles stay consistent
const C = {
  bg: '#fff9f3',
  border: '#e0d4c0',
  text: '#1c1008',
  muted: '#6b5a47',
  faint: '#a89070',
  wine: '#7c1d23',
  wineHover: '#9b2429',
  inputBg: '#fffdf9',
}

type Props = { companies: Company[] }

export default function BookingForm({ companies }: Props) {
  const [bookingType, setBookingType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL')
  const [visitType, setVisitType] = useState<'TASTING' | 'TASTING_LUNCH'>('TASTING')
  const [guestCount, setGuestCount] = useState(4)
  const [companyId, setCompanyId] = useState('')
  const [timeSlot, setTimeSlot] = useState('11:00')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const basePrice = visitType === 'TASTING' ? 50 : 100
  const guests = Math.max(guestCount, MIN_GUESTS)

  const selectedCompany = bookingType === 'COMPANY' ? companies.find(c => c.id === companyId) : null
  const matchedTier = selectedCompany?.prices.find(p => guests >= p.minGuests && guests <= p.maxGuests) ?? null
  const tierGap = selectedCompany && selectedCompany.prices.length > 0 && !matchedTier

  const estimatedTotal = matchedTier
    ? matchedTier.pricePerPerson * guests + matchedTier.registrationPrice
    : basePrice * guests

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd0 = new FormData(e.currentTarget)
    if (!fd0.get('phone') && !fd0.get('email')) {
      setStatus('error')
      setErrorMsg('Please provide at least a phone number or email so we can confirm your booking.')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    const result = await createBooking({
      bookingType,
      visitType,
      companyId: bookingType === 'COMPANY' ? companyId : undefined,
      date: fd0.get('date') as string,
      timeSlot,
      guestCount,
      name: fd0.get('name') as string,
      surname: fd0.get('surname') as string,
      email: fd0.get('email') as string,
      phone: fd0.get('phone') as string,
    })
    if (result.success) {
      setStatus('success')
    } else {
      setStatus('error')
      setErrorMsg(result.error)
    }
  }

  if (status === 'success') {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ backgroundColor: C.bg, borderColor: C.border }}
      >
        <div className="text-4xl mb-4">🍷</div>
        <h3 className="text-xl font-bold mb-2" style={{ color: C.text }}>Booking received!</h3>
        <p style={{ color: C.muted }}>
          Thank you. We will contact you shortly to confirm your visit.
        </p>
      </div>
    )
  }

  const inputStyle = {
    backgroundColor: C.inputBg,
    borderColor: C.border,
    color: C.text,
    outline: 'none',
  }

  const labelStyle = { color: C.muted, fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px', display: 'block' }

  function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="py-3 px-4 rounded-lg border text-sm font-medium transition-colors text-left w-full"
        style={{
          backgroundColor: active ? '#7c1d23' : C.bg,
          borderColor: active ? '#7c1d23' : C.border,
          color: active ? '#fff' : C.muted,
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Booking type */}
      <div>
        <label style={labelStyle}>Booking Type</label>
        <div className="grid grid-cols-2 gap-3">
          <ToggleButton active={bookingType === 'INDIVIDUAL'} onClick={() => setBookingType('INDIVIDUAL')}>
            Individual Booking
          </ToggleButton>
          <ToggleButton active={bookingType === 'COMPANY'} onClick={() => setBookingType('COMPANY')}>
            Tour Company
          </ToggleButton>
        </div>
      </div>

      {/* Company selector */}
      {bookingType === 'COMPANY' && (
        <div>
          <label style={labelStyle}>Company</label>
          <select
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2.5 text-sm"
            style={inputStyle}
          >
            <option value="">Select your company…</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Visit type */}
      <div>
        <label style={labelStyle}>Visit Type</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'TASTING', label: 'Wine Tasting', price: 50 },
            { value: 'TASTING_LUNCH', label: 'Tasting + Lunch', price: 100 },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVisitType(opt.value)}
              className="py-3 px-4 rounded-lg border text-left transition-colors"
              style={{
                backgroundColor: visitType === opt.value ? '#fff3ef' : C.bg,
                borderColor: visitType === opt.value ? C.wine : C.border,
                color: C.text,
              }}
            >
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-sm mt-0.5" style={{ color: C.wine }}>{opt.price}₾ / person</div>
            </button>
          ))}
        </div>
      </div>

      {/* Date & time */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="date" style={labelStyle}>Date</label>
          <input
            id="date"
            name="date"
            type="date"
            required
            min={new Date().toISOString().split('T')[0]}
            className="w-full rounded-lg border px-3 py-2.5 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Time Slot</label>
          <select
            value={timeSlot}
            onChange={e => setTimeSlot(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm"
            style={inputStyle}
          >
            {TIME_SLOTS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Guest count */}
      <div>
        <label htmlFor="guestCount" style={labelStyle}>
          Number of Guests <span style={{ color: C.faint }}>(minimum {MIN_GUESTS})</span>
        </label>
        <input
          id="guestCount"
          name="guestCount"
          type="number"
          min={MIN_GUESTS}
          max={50}
          value={guestCount}
          onChange={e => setGuestCount(Number(e.target.value))}
          required
          className="rounded-lg border px-3 py-2.5 text-sm w-28"
          style={inputStyle}
        />
      </div>

      {/* Name & surname */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" style={labelStyle}>First Name</label>
          <input id="name" name="name" required className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="surname" style={labelStyle}>Last Name</label>
          <input id="surname" name="surname" required className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
        </div>
      </div>

      {/* Contact */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" style={labelStyle}>Phone</label>
          <input id="phone" name="phone" type="tel" className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="email" style={labelStyle}>Email</label>
          <input id="email" name="email" type="email" className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
        </div>
      </div>

      {/* Price preview */}
      {tierGap ? (
        <div className="rounded-lg border p-4" style={{ backgroundColor: '#fff8f0', borderColor: '#fca5a5' }}>
          <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>No rate for {guests} guests</p>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            This company has no pricing tier that covers {guests} guests. Please contact us directly.
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg border p-4 flex items-center justify-between"
          style={{ backgroundColor: C.bg, borderColor: C.border }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: C.muted }}>Estimated Total</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              {matchedTier
                ? `${matchedTier.pricePerPerson}₾ × ${guests} guests${matchedTier.registrationPrice > 0 ? ` + ${matchedTier.registrationPrice}₾ flat fee` : ''} · company rate`
                : `${basePrice}₾ × ${guests} guests`}
            </p>
          </div>
          <p className="font-bold text-2xl" style={{ color: C.wine }}>{estimatedTotal}₾</p>
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm" style={{ color: '#b91c1c' }}>{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading' || !!tierGap}
        className="w-full font-semibold py-3 rounded-lg transition-colors text-white"
        style={{ backgroundColor: (status === 'loading' || tierGap) ? '#a0392a' : C.wine }}
      >
        {status === 'loading' ? 'Submitting…' : 'Request Booking'}
      </button>

      <p className="text-xs text-center" style={{ color: C.faint }}>
        48-hour cancellation policy. We will contact you to confirm.
      </p>
    </form>
  )
}
