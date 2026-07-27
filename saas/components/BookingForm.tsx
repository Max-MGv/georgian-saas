'use client'

// MAINTENANCE: If you add, remove, or rename any label in this form, mirror the change in
// FIELDS.form inside saas/app/admin/content/ContentClient.tsx so the admin panel stays in sync.
// See vault/MaintenanceNotes.md §1 for full details.

import { useState, useEffect } from 'react'
import { createBooking } from '@/app/actions/createBooking'
import { verifyCompanyCode, findCompanyByCode } from '@/app/actions/companies'
import { notifyNewCompany } from '@/app/actions/notifyNewCompany'
import { findTier } from '@/lib/pricingUtils'
import { t } from '@/lib/t'
import DateInput from '@/components/DateInput'

type Price = {
  id: string; minGuests: number; maxGuests: number
  pricePerPerson: number; tastingLunchPricePerPerson: number; registrationPrice: number
}
type Company = { id: string; name: string; prices: Price[]; accessCode: string | null; contactName: string | null; contactPhone: string | null; contactEmail: string | null }
type MenuItem = { id: string; name: string; type: string }
type MasterclassItem = { id: string; name: string; unitType: string; pricePerUnit: number }

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', faint: 'var(--site-secondary)', wine: 'var(--color-brand)', inputBg: 'var(--site-surface)',
}


type Props = {
  locale?: string
  companies: Company[]
  showCompanyPrice: boolean
  enhancedEnabled?: boolean
  hideCompanyDropdown?: boolean
  menuItems?: MenuItem[]
  masterclassItems?: MasterclassItem[]
  minGuestsTasting?: number
  minGuestsTastingLunch?: number
  blockedDates?: string[]
  formContent?: Record<string, string>
  displayPriceTasting?: number | null
  displayPriceLunch?: number | null
}

export default function BookingForm({ locale = 'en', companies, showCompanyPrice, enhancedEnabled, hideCompanyDropdown = false, menuItems = [], masterclassItems = [], minGuestsTasting = 4, minGuestsTastingLunch = 4, blockedDates = [], formContent = {}, displayPriceTasting = null, displayPriceLunch = null }: Props) {
  const fc = (key: string, tKey: string) => formContent[key] || t(locale, tKey)
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

  // Auto-fill fields (controlled so we can populate them from company profile)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Access code popup
  const [showCodePopup, setShowCodePopup] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [showCodeText, setShowCodeText] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)

  // Direct code entry state (used when hideCompanyDropdown=true)
  const [directCode, setDirectCode] = useState('')
  const [directCodeLoading, setDirectCodeLoading] = useState(false)
  const [directCodeError, setDirectCodeError] = useState('')
  const [directCompanyName, setDirectCompanyName] = useState('')

  // New company request popup
  const [showNewCompanyPopup, setShowNewCompanyPopup] = useState(false)
  const [newCoName, setNewCoName] = useState('')
  const [newCoContact, setNewCoContact] = useState('')
  const [newCoPhone, setNewCoPhone] = useState('')
  const [newCoEmail, setNewCoEmail] = useState('')
  const [newCoStatus, setNewCoStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')

  // Enhanced company form state
  const [tastingGuestsStr, setTastingGuestsStr] = useState('0')
  const [lunchGuestsStr, setLunchGuestsStr] = useState('0')
  const [freeGuestsStr, setFreeGuestsStr] = useState('0')
  const [hotDishVeg, setHotDishVeg] = useState('')
  const [hotDishMeat, setHotDishMeat] = useState('')
  const [foodNotes, setFoodNotes] = useState('')
  const [mcSelections, setMcSelections] = useState<Record<string, { checked: boolean; qtyStr: string }>>({})

  const minGuests = visitType === 'TASTING' ? minGuestsTasting : minGuestsTastingLunch
  const guestCount = Math.max(parseInt(guestInput) || minGuests, minGuests)
  const today = new Date().toISOString().split('T')[0]
  const currentHour = new Date().getHours()
  const availableSlots = selectedDate === today
    ? TIME_SLOTS.filter(s => parseInt(s) > currentHour)
    : TIME_SLOTS

  const isDateBlocked = (date: string) => blockedDates.includes(date)
  const isPastDate = selectedDate !== '' && selectedDate < today

  function handleDateChange(date: string) {
    setSelectedDate(date)
    const slots = date === today ? TIME_SLOTS.filter(s => parseInt(s) > currentHour) : TIME_SLOTS
    if (slots.length > 0 && !slots.includes(timeSlot)) setTimeSlot(slots[0])
  }

  const isEnhanced = !!enhancedEnabled && bookingType === 'COMPANY'
  const selectedCompany = bookingType === 'COMPANY' ? companies.find(c => c.id === companyId) : null

  // Show access code popup when a company with a code is selected; auto-fill directly if no code
  useEffect(() => {
    if (!companyId || bookingType !== 'COMPANY' || hideCompanyDropdown) return
    const company = companies.find(c => c.id === companyId)
    if (!company) return
    if (!company.accessCode) {
      applyProfile({ contactName: company.contactName, contactPhone: company.contactPhone, contactEmail: company.contactEmail })
      return
    }
    setCodeInput('')
    setCodeError('')
    setShowCodeText(false)
    setShowCodePopup(true)
  }, [companyId, bookingType, hideCompanyDropdown])

  function applyProfile(profile: { contactName: string | null; contactPhone: string | null; contactEmail: string | null }) {
    if (profile.contactName) {
      const parts = profile.contactName.trim().split(' ')
      setFirstName(parts[0] ?? '')
      setLastName(parts.slice(1).join(' '))
    }
    if (profile.contactPhone) setPhone(profile.contactPhone)
    if (profile.contactEmail) setEmail(profile.contactEmail)
  }

  async function handleCodeSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!codeInput.trim()) return
    setCodeLoading(true)
    setCodeError('')
    const result = await verifyCompanyCode(companyId, codeInput)
    setCodeLoading(false)
    if ('error' in result) {
      setCodeError('Incorrect code — please try again or contact the winery.')
      return
    }
    // Ask the browser to save the credential natively (triggers "Save password?" prompt)
    if (typeof window !== 'undefined' && 'PasswordCredential' in window) {
      try {
        const companyName = companies.find(c => c.id === companyId)?.name ?? companyId
        // @ts-ignore — PasswordCredential is not in all TS lib versions
        const cred = new window.PasswordCredential({ id: companyName, password: codeInput, name: companyName })
        await navigator.credentials.store(cred)
      } catch {}
    }
    applyProfile(result.profile)
    setShowCodePopup(false)
  }

  function handleNotARep() {
    setShowCodePopup(false)
    setCompanyId('')
    setBookingType('INDIVIDUAL')
  }

  async function handleDirectCodeSubmit() {
    if (!directCode.trim()) return
    setDirectCodeLoading(true)
    setDirectCodeError('')
    const result = await findCompanyByCode(directCode, 'BOOKING')
    setDirectCodeLoading(false)
    if ('error' in result) {
      setDirectCodeError('Code not recognised.')
      return
    }
    setCompanyId(result.company.id)
    setDirectCompanyName(result.company.name)
    applyProfile({ contactName: result.company.contactName, contactPhone: result.company.contactPhone, contactEmail: result.company.contactEmail })
  }

  function clearDirectCode() {
    setCompanyId('')
    setDirectCompanyName('')
    setDirectCode('')
    setDirectCodeError('')
    setFirstName(''); setLastName(''); setPhone(''); setEmail('')
  }

  async function handleNewCompanySubmit() {
    if (!newCoName.trim() || !newCoContact.trim() || !newCoPhone.trim()) return
    setNewCoStatus('submitting')
    const result = await notifyNewCompany({
      companyName: newCoName.trim(),
      contactName: newCoContact.trim(),
      phone: newCoPhone.trim(),
      email: newCoEmail.trim() || undefined,
      module: 'BOOKING',
    })
    setNewCoStatus(result.success ? 'sent' : 'error')
  }

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
  // No invented default rates — when the tenant has no display price set,
  // the estimate is unknown and the form says "price confirmed after submission"
  const basePrice = visitType === 'TASTING' ? displayPriceTasting : displayPriceLunch
  const estimatedTotal = matchedTier
    ? matchedTier.pricePerPerson * guestCount + matchedTier.registrationPrice
    : basePrice != null ? basePrice * guestCount : null

  const vegItems = menuItems.filter(m => m.type === 'VEGETABLE')
  const meatItems = menuItems.filter(m => m.type === 'MEAT')

  function toggleMc(id: string, checked: boolean) {
    setMcSelections(prev => ({ ...prev, [id]: { checked, qtyStr: prev[id]?.qtyStr ?? '1' } }))
  }

  function setMcQty(id: string, qtyStr: string) {
    setMcSelections(prev => ({ ...prev, [id]: { checked: prev[id]?.checked ?? true, qtyStr } }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (bookingType === 'COMPANY' && hideCompanyDropdown && !companyId) {
      setStatus('error'); setErrorMsg('Please enter and confirm your company code.'); return
    }
    if (!selectedDate) { setStatus('error'); setErrorMsg('Please select a date.'); return }
    if (!phone && !email) { setStatus('error'); setErrorMsg(t(locale, 'form.err_contact')); return }
    if (selectedDate < today) { setStatus('error'); setErrorMsg('Please choose a future date.'); return }
    if (isDateBlocked(selectedDate)) { setStatus('error'); setErrorMsg(t(locale, 'form.err_blocked')); return }
    if (isEnhanced && totalGuests < minGuests) { setStatus('error'); setErrorMsg(t(locale, 'form.err_min_guests', { min: minGuests })); return }
    setStatus('loading')
    setErrorMsg('')
    const result = await createBooking({
      bookingType,
      visitType,
      companyId: bookingType === 'COMPANY' ? companyId : undefined,
      date: selectedDate,
      timeSlot,
      guestCount: isEnhanced ? totalGuests : guestCount,
      name: firstName,
      surname: lastName,
      email,
      phone,
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
    // Hide the price on the success screen when it's 0 — that means the tenant
    // has no pricing configured and the real price will be confirmed manually
    const showPrice = (confirmedType === 'INDIVIDUAL' || (confirmedType === 'COMPANY' && showCompanyPrice)) && confirmedPrice != null && confirmedPrice > 0
    return (
      <div className="rounded-xl border p-10 text-center" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <div className="text-4xl mb-4">🍷</div>
        <h3 className="text-xl font-bold mb-2" style={{ color: C.text }}>{fc('form_success_heading', 'form.success_heading')}</h3>
        <p style={{ color: C.muted }}>{fc('form_success_body', 'form.success_body')}</p>
        {showPrice && confirmedPrice != null && (
          <div className="mt-6 inline-block rounded-lg px-6 py-3 border" style={{ backgroundColor: 'var(--site-surface)', borderColor: C.border }}>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: C.faint }}>{t(locale, 'form.est_total_label')}</p>
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
        style={{ backgroundColor: active ? 'var(--color-brand)' : C.bg, borderColor: active ? 'var(--color-brand)' : C.border, color: active ? '#fff' : C.muted }}>
        {children}
      </button>
    )
  }

  return (
    <>
      {/* Access code popup */}
      {showCodePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <form
            onSubmit={handleCodeSubmit}
            className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
            style={{ backgroundColor: 'var(--site-surface)', border: `1px solid ${C.border}` }}
          >
            <div>
              <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>Enter your company code</h3>
              <p className="text-sm" style={{ color: C.muted }}>
                {companies.find(c => c.id === companyId)?.name} — enter the access code provided by the winery.
              </p>
            </div>

            {/* Hidden username field — tells the browser what account this password belongs to */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={companies.find(c => c.id === companyId)?.name ?? ''}
              readOnly
              style={{ display: 'none' }}
            />

            <div className="relative">
              <input
                autoFocus
                name="password"
                type={showCodeText ? 'text' : 'password'}
                autoComplete="current-password"
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError('') }}
                placeholder="e.g. MARANI42"
                className="w-full rounded-lg border px-3 py-2.5 text-sm font-mono"
                style={{ ...inputStyle, paddingRight: '40px', letterSpacing: '0.08em' }}
              />
              <button
                type="button"
                onClick={() => setShowCodeText(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80"
              >
                {showCodeText ? (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {codeError && <p className="text-sm" style={{ color: '#b91c1c' }}>{codeError}</p>}

            <button
              type="submit"
              disabled={codeLoading || !codeInput.trim()}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white"
              style={{ backgroundColor: C.wine, opacity: (codeLoading || !codeInput.trim()) ? 0.6 : 1 }}
            >
              {codeLoading ? 'Checking…' : 'Confirm'}
            </button>

            <button
              type="button"
              onClick={handleNotARep}
              className="w-full py-2 rounded-lg text-xs font-medium border text-center transition-colors hover:bg-gray-50"
              style={{ color: C.muted, borderColor: C.border }}
            >
              Enter Manually
            </button>
          </form>
        </div>
      )}

      {/* New Company popup */}
      {showNewCompanyPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-3"
            style={{ backgroundColor: 'var(--site-surface)', border: `1px solid ${C.border}` }}>
            <div>
              <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>New Company?</h3>
              <p className="text-sm" style={{ color: C.muted }}>Fill in your details and we'll get in touch to set up your account.</p>
            </div>
            {newCoStatus === 'sent' ? (
              <div className="py-4 text-center">
                <p className="font-medium" style={{ color: '#15803d' }}>Request received!</p>
                <p className="text-sm mt-1" style={{ color: C.muted }}>We'll be in touch to set up your account.</p>
                <button type="button" onClick={() => setShowNewCompanyPopup(false)}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium border"
                  style={{ borderColor: C.border, color: C.text }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <input type="text" placeholder="Company Name *" value={newCoName}
                  onChange={e => setNewCoName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
                <input type="text" placeholder="Your Name *" value={newCoContact}
                  onChange={e => setNewCoContact(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
                <input type="tel" placeholder="Phone Number *" value={newCoPhone}
                  onChange={e => setNewCoPhone(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
                <input type="email" placeholder="Email (optional)" value={newCoEmail}
                  onChange={e => setNewCoEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
                {newCoStatus === 'error' && (
                  <p className="text-xs" style={{ color: '#b91c1c' }}>Something went wrong. Please try again.</p>
                )}
                <button type="button" onClick={handleNewCompanySubmit}
                  disabled={newCoStatus === 'submitting' || !newCoName.trim() || !newCoContact.trim() || !newCoPhone.trim()}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-opacity"
                  style={{ backgroundColor: 'var(--color-brand)', opacity: (newCoStatus === 'submitting' || !newCoName.trim() || !newCoContact.trim() || !newCoPhone.trim()) ? 0.6 : 1 }}>
                  {newCoStatus === 'submitting' ? 'Sending…' : 'Send Request'}
                </button>
                <button type="button" onClick={() => setShowNewCompanyPopup(false)}
                  className="w-full py-2 rounded-lg text-xs font-medium border text-center"
                  style={{ color: C.muted, borderColor: C.border }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Booking type */}
        <div>
          <label style={labelStyle}>{fc('form_booking_type', 'form.booking_type')}</label>
          <div className="grid grid-cols-2 gap-3">
            <ToggleButton active={bookingType === 'INDIVIDUAL'} onClick={() => { setBookingType('INDIVIDUAL'); setCompanyId('') }}>
              {fc('form_individual', 'form.individual')}
            </ToggleButton>
            <ToggleButton active={bookingType === 'COMPANY'} onClick={() => setBookingType('COMPANY')}>
              {fc('form_company_type', 'form.company_type')}
            </ToggleButton>
          </div>
        </div>

        {/* Company selector */}
        {bookingType === 'COMPANY' && (
          hideCompanyDropdown ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setShowNewCompanyPopup(true); setNewCoStatus('idle'); setNewCoName(''); setNewCoContact(''); setNewCoPhone(''); setNewCoEmail('') }}
                className="self-start text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:opacity-75 active:scale-95"
                style={{ color: 'var(--color-brand)', borderColor: 'var(--color-brand)' }}
              >
                New Company?
              </button>
              {directCompanyName ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border"
                  style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <circle cx="6" cy="6" r="5.5" stroke="#16a34a" strokeWidth="1.5" />
                    <path d="M3.5 6l2 2 3-3" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-medium flex-1" style={{ color: '#15803d' }}>{directCompanyName}</span>
                  <button type="button" onClick={clearDirectCode}
                    className="text-base font-bold leading-none hover:opacity-70" style={{ color: '#16a34a' }}>×</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter your company code"
                    value={directCode}
                    onChange={e => { setDirectCode(e.target.value.toUpperCase()); setDirectCodeError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDirectCodeSubmit() } }}
                    className="flex-1 rounded-lg border px-3 py-2.5 text-sm font-mono"
                    style={{ ...inputStyle, letterSpacing: '0.06em' }}
                  />
                  <button
                    type="button"
                    onClick={handleDirectCodeSubmit}
                    disabled={directCodeLoading || !directCode.trim()}
                    className="px-4 py-2.5 rounded-lg font-semibold text-sm text-white flex-shrink-0 transition-opacity"
                    style={{ backgroundColor: 'var(--color-brand)', opacity: (directCodeLoading || !directCode.trim()) ? 0.6 : 1 }}
                  >
                    {directCodeLoading ? '…' : 'Confirm'}
                  </button>
                </div>
              )}
              {directCodeError && (
                <p className="text-xs" style={{ color: '#b91c1c' }}>{directCodeError}</p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label style={{ ...labelStyle, marginBottom: 0 }}>{t(locale, 'form.company')}</label>
                <button
                  type="button"
                  onClick={() => { setShowNewCompanyPopup(true); setNewCoStatus('idle'); setNewCoName(''); setNewCoContact(''); setNewCoPhone(''); setNewCoEmail('') }}
                  className="text-xs font-medium transition-all hover:opacity-75 active:scale-95"
                  style={{ color: 'var(--color-brand)' }}
                >
                  New Company?
                </button>
              </div>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} required
                className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                <option value="">{t(locale, 'form.company_placeholder')}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )
        )}

        {/* Visit type */}
        <div>
          <label style={labelStyle}>{fc('form_visit_type', 'form.visit_type')}</label>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'TASTING',       contentKey: 'form_tasting',       labelKey: 'form.tasting',       price: displayPriceTasting },
              { value: 'TASTING_LUNCH', contentKey: 'form_tasting_lunch', labelKey: 'form.tasting_lunch', price: displayPriceLunch },
            ] as const).map(opt => (
              <button key={opt.value} type="button" onClick={() => setVisitType(opt.value)}
                className="py-3 px-4 rounded-lg border text-left transition-colors"
                style={{ backgroundColor: visitType === opt.value ? 'color-mix(in srgb, var(--color-brand) 8%, var(--site-surface))' : C.bg, borderColor: visitType === opt.value ? C.wine : C.border, color: C.text }}>
                <div className="font-medium text-sm">{fc(opt.contentKey, opt.labelKey)}</div>
                {(bookingType === 'COMPANY' || opt.price != null) && (
                  <div className="text-sm mt-0.5" style={{ color: C.wine }}>
                    {bookingType === 'COMPANY' ? t(locale, 'form.company_rate') : `${opt.price}₾ ${t(locale, 'form.per_pp')}`}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Date & time */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>{fc('form_date', 'form.date')}</label>
            <input type="hidden" name="date" value={selectedDate} />
            <DateInput
              value={selectedDate}
              onChange={handleDateChange}
              min={today}
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              style={inputStyle}
            />
            {isPastDate && (
              <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>Please choose a future date.</p>
            )}
            {selectedDate && !isPastDate && isDateBlocked(selectedDate) && (
              <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{t(locale, 'form.blocked_date')}</p>
            )}
          </div>
          <div>
            <label style={labelStyle}>{fc('form_time_slot', 'form.time_slot')}</label>
            <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
              {availableSlots.length > 0
                ? availableSlots.map(s => <option key={s} value={s}>{s}</option>)
                : <option value="">{t(locale, 'form.no_slots')}</option>}
            </select>
          </div>
        </div>

        {/* Guest count — enhanced vs simple */}
        {isEnhanced ? (
          <div>
            <label style={labelStyle}>{fc('form_guest_counts_header', 'form.guest_counts')}</label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { labelKey: 'form.guests_tasting', value: tastingGuestsStr, set: setTastingGuestsStr, hidden: false },
                { labelKey: 'form.guests_lunch',   value: lunchGuestsStr,   set: setLunchGuestsStr,   hidden: visitType === 'TASTING' },
                { labelKey: 'form.guests_free',    value: freeGuestsStr,    set: setFreeGuestsStr,    hidden: false },
              ] as { labelKey: string; value: string; set: (v: string) => void; hidden: boolean }[]).map(({ labelKey, value, set, hidden }) => hidden ? null : (
                <div key={labelKey}>
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{t(locale, labelKey)}</p>
                  <input type="number" min={0} max={200} value={value}
                    onChange={e => set(e.target.value)}
                    onBlur={e => { const v = parseInt(e.target.value) || 0; set(String(Math.max(v, 0))) }}
                    className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
                </div>
              ))}
            </div>
            {totalGuests > 0 && (
              <p className="text-xs mt-1.5" style={{ color: C.faint }}>
                {t(locale, 'form.total')}: {totalGuests} {totalGuests !== 1 ? t(locale, 'form.guest_plural') : t(locale, 'form.guest_singular')}{payingGuests > 0 ? ` (${payingGuests} ${t(locale, 'form.paying')})` : ''}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor="guestCount" style={labelStyle}>
              {fc('form_num_guests', 'form.num_guests')}
              <span className="block text-xs font-normal mt-0.5" style={{ color: C.faint }}>({t(locale, 'form.minimum')} {minGuests})</span>
            </label>
            <input id="guestCount" name="guestCount" type="number" min={minGuests} max={200}
              value={guestInput}
              onChange={e => { setGuestInput(e.target.value); setGuestWarning('') }}
              onBlur={() => {
                const val = parseInt(guestInput) || 0
                if (val < minGuests) { setGuestInput(String(minGuests)); setGuestWarning(t(locale, 'form.guest_min_warn', { min: minGuests })) }
                else { setGuestInput(String(val)); setGuestWarning('') }
              }}
              required className="rounded-lg border px-3 py-2.5 w-28" style={inputStyle} />
            {guestWarning && <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{guestWarning}</p>}
          </div>
        )}

        {/* Enhanced: Hot dishes (only for TASTING_LUNCH) */}
        {isEnhanced && visitType === 'TASTING_LUNCH' && (vegItems.length > 0 || meatItems.length > 0) && (
          <div>
            <label style={labelStyle}>{fc('form_hot_dish_header', 'form.hot_dish')}</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {vegItems.length > 0 && (
                <div>
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{t(locale, 'form.veg_dish')}</p>
                  <select value={hotDishVeg} onChange={e => setHotDishVeg(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                    <option value="">{t(locale, 'form.choose')}</option>
                    {vegItems.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              )}
              {meatItems.length > 0 && (
                <div>
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{t(locale, 'form.meat_dish')}</p>
                  <select value={hotDishMeat} onChange={e => setHotDishMeat(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle}>
                    <option value="">{t(locale, 'form.choose')}</option>
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
            <label style={labelStyle}>{fc('form_masterclass_header', 'form.masterclass')}</label>
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
                        {m.pricePerUnit}₾/{m.unitType === 'PER_PERSON' ? t(locale, 'form.pp') : m.unitType === 'FLAT' ? t(locale, 'form.flat') : t(locale, 'form.pc')}
                      </span>
                    </label>
                    {sel?.checked && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.qty')}</span>
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
            <label htmlFor="foodNotes" style={labelStyle}>{fc('form_food_notes', 'form.food_notes')} <span style={{ color: C.faint }}>({fc('form_food_notes_sub', 'form.food_notes_sub')})</span></label>
            <textarea id="foodNotes" rows={3} value={foodNotes} onChange={e => setFoodNotes(e.target.value)}
              placeholder={fc('form_food_notes_placeholder', 'form.food_notes_placeholder')}
              className="w-full rounded-lg border px-3 py-2.5 text-sm resize-none" style={inputStyle} />
          </div>
        )}

        {/* Name & surname */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" style={labelStyle}>{fc('form_first_name', 'form.first_name')}</label>
            <input id="name" name="name" required value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="surname" style={labelStyle}>{fc('form_last_name', 'form.last_name')}</label>
            <input id="surname" name="surname" required value={lastName} onChange={e => setLastName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          </div>
        </div>

        {/* Contact */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" style={labelStyle}>{fc('form_phone', 'form.phone')}</label>
            <input id="phone" name="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="email" style={labelStyle}>{fc('form_email', 'form.email')}</label>
            <input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm" style={inputStyle} />
          </div>
        </div>

        {/* Price preview */}
        {isEnhanced ? (
          payingGuests > 0 && enhancedTier ? (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.est_total')}</p>
                <p className="font-bold text-2xl" style={{ color: C.wine }}>{enhancedTotal}₾</p>
              </div>
              <div className="space-y-0.5">
                {tastingGuests > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{tastingGuests} {t(locale, 'form.guests_tasting')} × {enhancedTier.pricePerPerson}₾</p>
                )}
                {lunchGuests > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{lunchGuests} {t(locale, 'form.guests_lunch')} × {enhancedTier.tastingLunchPricePerPerson}₾</p>
                )}
                {enhancedTier.registrationPrice > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{t(locale, 'form.registration')}: {enhancedTier.registrationPrice}₾</p>
                )}
                {masterclassAmt > 0 && (
                  <p className="text-xs" style={{ color: C.faint }}>{fc('form_masterclass_header', 'form.masterclass')}: {masterclassAmt}₾</p>
                )}
              </div>
            </div>
          ) : payingGuests === 0 ? null : (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <p className="text-sm" style={{ color: C.muted }}>{t(locale, 'form.price_after_submit')}</p>
            </div>
          )
        ) : bookingType === 'INDIVIDUAL' ? (
          estimatedTotal != null ? (
            <div className="rounded-lg border p-4 flex items-center justify-between" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <div>
                <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.est_total')}</p>
                <p className="text-xs mt-0.5" style={{ color: C.faint }}>{basePrice}₾ × {guestCount} {t(locale, 'form.guest_plural')}</p>
              </div>
              <p className="font-bold text-2xl" style={{ color: C.wine }}>{estimatedTotal}₾</p>
            </div>
          ) : (
            <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
              <p className="text-sm" style={{ color: C.muted }}>{t(locale, 'form.price_after_submit')}</p>
            </div>
          )
        ) : tierGap ? (
          <div className="rounded-lg border p-4" style={{ backgroundColor: '#fff8f0', borderColor: '#fca5a5' }}>
            <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>{t(locale, 'form.no_rate', { n: guestCount })}</p>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              {t(locale, 'form.no_rate_detail', { n: guestCount })}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border p-4" style={{ backgroundColor: C.bg, borderColor: C.border }}>
            <p className="text-sm font-medium" style={{ color: C.muted }}>{t(locale, 'form.company_rate_applies')}</p>
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>{t(locale, 'form.price_after_submit')}</p>
          </div>
        )}

        {status === 'error' && (
          <p className="text-sm" style={{ color: '#b91c1c' }}>{errorMsg}</p>
        )}

        <button type="submit"
          disabled={status === 'loading' || (!isEnhanced && !!tierGap)}
          className="w-full font-semibold py-3 rounded-lg transition-colors text-white"
          style={{ backgroundColor: (status === 'loading' || (!isEnhanced && tierGap)) ? 'color-mix(in srgb, var(--color-brand) 60%, var(--site-muted))' : C.wine }}>
          {status === 'loading' ? t(locale, 'form.submitting') : fc('form_submit', 'form.submit')}
        </button>

        <p className="text-xs text-center" style={{ color: C.faint }}>
          {fc('form_cancel_policy', 'form.cancel_policy')}
        </p>
      </form>
    </>
  )
}
