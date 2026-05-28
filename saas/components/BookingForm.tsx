'use client'

import { useState } from 'react'
import { createBooking } from '@/app/actions/createBooking'
import { findTier } from '@/lib/pricingUtils'

type Price = {
  id: string; minGuests: number; maxGuests: number
  pricePerPerson: number; tastingLunchPricePerPerson: number; registrationPrice: number
}
type Company = { id: string; name: string; prices: Price[] }
type MenuItem = { id: string; name: string; type: string }
type MasterclassItem = { id: string; name: string; unitType: string; pricePerUnit: number }

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const MIN_GUESTS = 4

const C = {
  bg: '#fff9f3', border: '#e0d4c0', text: '#1c1008',
  muted: '#6b5a47', faint: '#a89070', wine: '#7c1d23', inputBg: '#fffdf9',
}

type Props = {
  companies: Company[]
  showCompanyPrice: boolean
  enhancedEnabled?: boolean
  menuItems?: MenuItem[]
  masterclassItems?: MasterclassItem[]
}

export default function BookingForm({ companies, showCompanyPrice, enhancedEnabled, menuItems = [], masterclassItems = [] }: Props) {
  const [bookingType, setBookingType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL')
  const [visitType, setVisitType] = useState<'TASTING' | 'TASTING_LUNCH'>('TASTING')
  const [guestInput, setGuestInput] = useState('4')
  const [guestWarning, setGuestWarning] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [timeSlot, setTimeSlot] = useState('11:00')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmedPrice, setConfirmedPrice] = useState<number | null>(null)
  const [confirmedType, setConfirmedType] = useState<'INDIVIDUAL' | 'COMPANY' | null>(null)

  // Enhanced company form state
  const [tastingGuestsStr, setTastingGuestsStr] = useState('0')
  const [lunchGuestsStr, setLunchGuestsStr] = useState('0')
  const [freeGuestsStr, setFreeGuestsStr] = useState('0')
  const [hotDishVeg, setHotDishVeg] = useState('')
  const [hotDishMeat, setHotDishMeat] = useState('')
  const [foodNotes, setFoodNotes] = useState('')
  const [mcSelections, setMcSelections] = useState<Record<string, { checked: boolean; qtyStr: string }>>({})

  const guestCount = Math.max(parseInt(guestInput) || MIN_GUESTS, MIN_GUESTS)
  const today = new Date().toISOString().split('T')[0]
  const currentHour = new Date().getHours()
  const availableSlots = selectedDate === today
    ? TIME_SLOTS.filter(t => parseInt(t) > currentHour)
    : TIME_SLOTS

  function handleDateChange(date: string) {
    setSelectedDate(date)
    const slots = date === today ? TIME_SLOTS.filter(t => parseInt(t) > currentHour) : TIME_SLOTS
    if (slots.length > 0 && !slots.includes(timeSlot)) setTimeSlot(slots[0])
  }

  const isEnhanced = !!enhancedEnabled && bookingType === 'COMPANY'
  const selectedCompany = bookingType === 'COMPANY' ? companies.find(c => c.id === companyId) : null

  // Enhanced guest counts
  const tastingGuests = Math.max(parseInt(tastingGuestsStr) || 0, 0)
  const lunchGuests = Math.max(parseInt(lunchGuestsStr) || 0, 0)
  const freeGuests = Math.max(parseInt(freeGuestsStr) || 0, 0)
  const totalGuests = isEnhanced ? tastingGuests + lunchGuests + freeGuests : guestCount
  const payingGuests = tastingGuests + lunchGuests

  // Masterclass selections
  const activeMcLines = masterclassItems
    .filter(m => mcSelections[m.id]?.checked)
    .map(m => ({
      masterclassItemId: m.id,
      quantity: Math.max(parseInt(mcSelections[m.id]?.qtyStr || '1') || 1, 1),
      pricePerUnit: m.pricePerUnit,
    }))
  const masterclassAmt = activeMcLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)

  // Price preview
  const enhancedTier = isEnhanced && selectedCompany
    ? findTier(selectedCompany.prices, payingGuests)
    : null
  const enhancedTotal = enhancedTier
    ? tastingGuests * enhancedTier.pricePerPerson +
      lunchGuests * enhancedTier.tastingLunchPricePerPerson +
      enhancedTier.registrationPrice +
      masterclassAmt
    : masterclassAmt

  // Simple form price preview
  const matchedTier = !isEnhanced && selectedCompany
    ? selectedCompany.prices.find(p => guestCount >= p.minGuests && guestCount <= p.maxGuests) ?? null
    : null
  const tierGap = !isEnhanced && selectedCompany && selectedCompany.prices.length > 0 && !matchedTier
  const basePrice = visitType === 'TASTING' ? 50 : 100
  const estimatedTotal = matchedTier
    ? matchedTier.pricePerPerson * guestCount + matchedTier.registrationPrice
    : basePrice * guestCount

  const vegItems = menuItems.filter(m => m.type === 'VEGETABLE')
  const meatItems = menuItems.filter(m => m.type === 'MEAT')

  function toggleMc(id: string, checked: boolean) {
    setMcSelections(prev => ({
      ...prev,
      [id]: { checked, qtyStr: prev[id]?.qtyStr ?? '1' },
    }))
  }

  function setMcQty(id: string, qtyStr: string) {
    setMcSelections(prev => ({
      ...prev,
      [id]: { checked: prev[id]?.checked ?? true, qtyStr },
    }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (!fd.get('phone') && !fd.get('email')) {
      setStatus('error')
      setErrorMsg('Please provide at least a phone number or email so we can confirm your booking.')
      return
    }
    if (isEnhanced && totalGuests < MIN_GUESTS) {
      setStatus('error')
      setErrorMsg(`Minimum ${MIN_GUESTS} guests total required.`)
      return
    }
    setStatus('loading')
    setErrorMsg('')
    const result = await createBooking({
      bookingType,
      visitType,
      companyId: bookingType === 'COMPANY' ? companyId : undefined,
      date: fd.get('date') as string,
      timeSlot,
      guestCount: isEnhanced ? totalGuests : guestCount,
      name: fd.get('name') as string,
      surname: fd.get('surname') as string,
      email: fd.get('email') as string,
      phone: fd.get('phone') as string,
      ...(isEnhanced ? {
        tastingGuestCount: tastingGuests,
        lunchGuestCount: lunchGuests,
        freeGuestCount: freeGuests,
        hotDishVegetable: hotDishVeg || null,
        hotDishMeat: hotDishMeat || null,
        foodNotes: foodNotes || null,
        masterclassLines: activeMcLines,
      } : {}),
    })
    if (result.success) {
      setConfirmedPrice(result.totalPrice)
      setConfirmedType(result.bookingType)
      setStatus('success')
    } else {
      setStatus('error')
      setErrorMsg(result.error)
    }
  }

  if (status === 'success') {
    const showPrice = confirmedType === 'INDIVIDUAL' || (confirmedType === 'COMPANY' && showCompanyPrice)
    return (
      <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <div className="text-4xl mb-4">🍷</div>
        <h3 className="text-xl font-bold mb-2" style={{ color: C.text }}>Booking received!</h3>
        <p style={{ color: C.muted }}>Thank you. We will contact you shortly to confirm your visit.</p>
        {showPrice && confirmedPrice != null && (
          <div className="mt-6 inline-block rounded-lg px-6 py-3 border" style={{ backgroundColor: '#fdf6ee', borderColor: C.border }}>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: C.faint }}>Estimated total</p>
            <p className="text-2xl font-bold" style={{ color: C.wine }}>{confirmedPrice}₾</p>
          </div>
        )}
      </div>
    )
  }

  const inputStyle = { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }
  const labelStyle: React.CSSProperties = { color: C.muted, fontSize: '0.875rem', fontWeight: 500, marginBottom: '6px', display: 'block' }

  function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button type="button" onClick={onClick}
        className="py-3 px-4 rounded-lg border text-sm font-medium transition-colors text-left w-full"
        style={{ backgroundColor: active ? '#7c1d23' : C.bg, borderColor: active ? '#7c1d23' : C.border, color: active ? '#fff' : C.muted }}>
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
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} required
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
            <option value="">Select your company…</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <button key={opt.value} type="button" onClick={() => setVisitType(opt.value)}
              className="py-3 px-4 rounded-lg border text-left transition-colors"
              style={{ backgroundColor: visitType === opt.value ? '#fff3ef' : C.bg, borderColor: visitType === opt.value ? C.wine : C.border, color: C.text }}>
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-sm mt-0.5" style={{ color: C.wine }}>
                {bookingType === 'COMPANY' ? 'Company rate' : `${opt.price}₾ / person`}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Date & time */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="date" style={labelStyle}>Date</label>
          <input id="date" name="date" type="date" required min={today}
            value={selectedDate} onChange={e => handleDateChange(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Time Slot</label>
          <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
            {availableSlots.length > 0
              ? availableSlots.map(t => <option key={t} value={t}>{t}</option>)
              : <option value="">No slots available today</option>}
          </select>
        </div>
      </div>

      {/* Guest count — enhanced vs simple */}
      {isEnhanced ? (
        <div>
          <label style={labelStyle}>Guest Counts</label>
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: 'Tasting', value: tastingGuestsStr, set: setTastingGuestsStr, hidden: false },
              { label: 'Lunch', value: lunchGuestsStr, set: setLunchGuestsStr, hidden: visitType === 'TASTING' },
              { label: 'Free / Guide', value: freeGuestsStr, set: setFreeGuestsStr, hidden: false },
            ] as { label: string; value: string; set: (v: string) => void; hidden: boolean }[]).map(({ label, value, set, hidden }) => hidden ? null : (
              <div key={label}>
                <p className="text-xs mb-1" style={{ color: C.faint }}>{label}</p>
                <input type="number" min={0} max={200} value={value}
                  onChange={e => set(e.target.value)}
                  onBlur={e => { const v = parseInt(e.target.value) || 0; set(String(Math.max(v, 0))) }}
                  className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </div>
            ))}
          </div>
          {totalGuests > 0 && (
            <p className="text-xs mt-1.5" style={{ color: C.faint }}>
              Total: {totalGuests} guest{totalGuests !== 1 ? 's' : ''}{payingGuests > 0 ? ` (${payingGuests} paying)` : ''}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="guestCount" style={labelStyle}>
            Number of Guests <span style={{ color: C.faint }}>(minimum {MIN_GUESTS})</span>
          </label>
          <input id="guestCount" name="guestCount" type="number" min={MIN_GUESTS} max={50}
            value={guestInput}
            onChange={e => { setGuestInput(e.target.value); setGuestWarning('') }}
            onBlur={() => {
              const val = parseInt(guestInput) || 0
              if (val < MIN_GUESTS) { setGuestInput(String(MIN_GUESTS)); setGuestWarning(`Minimum is ${MIN_GUESTS} guests — reset to ${MIN_GUESTS}.`) }
              else { setGuestInput(String(val)); setGuestWarning('') }
            }}
            required className="rounded-lg border px-3 py-2.5 w-28" style={inputStyle} />
          {guestWarning && <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{guestWarning}</p>}
        </div>
      )}

      {/* Enhanced: Hot dishes (only for TASTING_LUNCH) */}
      {isEnhanced && visitType === 'TASTING_LUNCH' && (vegItems.length > 0 || meatItems.length > 0) && (
        <div>
          <label style={labelStyle}>Hot Dish Selection</label>
          <div className="grid sm:grid-cols-2 gap-3">
            {vegItems.length > 0 && (
              <div>
                <p className="text-xs mb-1" style={{ color: C.faint }}>Vegetable dish</p>
                <select value={hotDishVeg} onChange={e => setHotDishVeg(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                  <option value="">— choose —</option>
                  {vegItems.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            )}
            {meatItems.length > 0 && (
              <div>
                <p className="text-xs mb-1" style={{ color: C.faint }}>Meat dish</p>
                <select value={hotDishMeat} onChange={e => setHotDishMeat(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                  <option value="">— choose —</option>
                  {meatItems.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced: Masterclass add-ons */}
      {isEnhanced && masterclassItems.length > 0 && (
        <div>
          <label style={labelStyle}>Masterclass Add-ons</label>
          <div className="rounded-lg border divide-y" style={{ borderColor: C.border }}>
            {masterclassItems.map(m => {
              const sel = mcSelections[m.id]
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: C.bg }}>
                  <input type="checkbox" id={`mc-${m.id}`} checked={!!sel?.checked}
                    onChange={e => toggleMc(m.id, e.target.checked)}
                    className="rounded" />
                  <label htmlFor={`mc-${m.id}`} className="flex-1 text-sm cursor-pointer" style={{ color: C.text }}>
                    {m.name}
                    <span className="ml-1 text-xs" style={{ color: C.faint }}>
                      {m.pricePerUnit}₾/{m.unitType === 'PER_PERSON' ? 'pp' : m.unitType === 'FLAT' ? 'flat' : 'pc'}
                    </span>
                  </label>
                  {sel?.checked && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: C.faint }}>qty</span>
                      <input type="number" min={1} max={999} value={sel.qtyStr}
                        onChange={e => setMcQty(m.id, e.target.value)}
                        onBlur={e => setMcQty(m.id, String(Math.max(parseInt(e.target.value) || 1, 1)))}
                        className="w-16 rounded border px-2 py-1 text-sm text-center" style={inputStyle} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Enhanced: Food notes */}
      {isEnhanced && (
        <div>
          <label htmlFor="foodNotes" style={labelStyle}>Food Notes <span style={{ color: C.faint }}>(allergies, dietary requirements)</span></label>
          <textarea id="foodNotes" rows={3} value={foodNotes} onChange={e => setFoodNotes(e.target.value)}
            placeholder="Any dietary restrictions or special requests for the kitchen…"
            className="w-full rounded-lg border px-3 py-2.5 text-sm resize-none" style={inputStyle} />
        </div>
      )}

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
      {isEnhanced ? (
        payingGuests > 0 && enhancedTier ? (
          <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium" style={{ color: C.muted }}>Estimated Total</p>
              <p className="font-bold text-2xl" style={{ color: C.wine }}>{enhancedTotal}₾</p>
            </div>
            <div className="space-y-0.5">
              {tastingGuests > 0 && (
                <p className="text-xs" style={{ color: C.faint }}>{tastingGuests} tasting × {enhancedTier.pricePerPerson}₾</p>
              )}
              {lunchGuests > 0 && (
                <p className="text-xs" style={{ color: C.faint }}>{lunchGuests} lunch × {enhancedTier.tastingLunchPricePerPerson}₾</p>
              )}
              {enhancedTier.registrationPrice > 0 && (
                <p className="text-xs" style={{ color: C.faint }}>Registration: {enhancedTier.registrationPrice}₾</p>
              )}
              {masterclassAmt > 0 && (
                <p className="text-xs" style={{ color: C.faint }}>Masterclass: {masterclassAmt}₾</p>
              )}
            </div>
          </div>
        ) : payingGuests === 0 ? null : (
          <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
            <p className="text-sm" style={{ color: C.muted }}>Price will be confirmed after submission.</p>
          </div>
        )
      ) : bookingType === 'INDIVIDUAL' ? (
        <div className="rounded-lg border p-4 flex items-center justify-between" style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <div>
            <p className="text-sm font-medium" style={{ color: C.muted }}>Estimated Total</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{basePrice}₾ × {guestCount} guests</p>
          </div>
          <p className="font-bold text-2xl" style={{ color: C.wine }}>{estimatedTotal}₾</p>
        </div>
      ) : tierGap ? (
        <div className="rounded-lg border p-4" style={{ backgroundColor: '#fff8f0', borderColor: '#fca5a5' }}>
          <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>No rate for {guestCount} guests</p>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            This company has no pricing tier that covers {guestCount} guests. Please contact us directly.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
          <p className="text-sm font-medium" style={{ color: C.muted }}>Your company rate applies</p>
          <p className="text-xs mt-0.5" style={{ color: C.faint }}>Price will be confirmed after submission.</p>
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm" style={{ color: '#b91c1c' }}>{errorMsg}</p>
      )}

      <button type="submit"
        disabled={status === 'loading' || (!isEnhanced && !!tierGap)}
        className="w-full font-semibold py-3 rounded-lg transition-colors text-white"
        style={{ backgroundColor: (status === 'loading' || (!isEnhanced && tierGap)) ? '#a0392a' : C.wine }}>
        {status === 'loading' ? 'Submitting…' : 'Request Booking'}
      </button>

      <p className="text-xs text-center" style={{ color: C.faint }}>
        48-hour cancellation policy. We will contact you to confirm.
      </p>
    </form>
  )
}
