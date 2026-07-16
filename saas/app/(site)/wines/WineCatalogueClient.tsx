'use client'

import { useState, useEffect, useTransition } from 'react'
import { submitWineOrder } from '@/app/actions/submitWineOrder'
import { verifyCompanyCode, findCompanyByCode } from '@/app/actions/companies'
import { notifyNewCompany } from '@/app/actions/notifyNewCompany'

type DbWine = { id: string; name: string; type: string; price: number; color: string; imagePath: string | null }
type WineQty = Record<string, number>
type ViewMode = 'grid' | 'list'
type Company = {
  id: string
  name: string
  identificationCode: string | null
  contactName: string | null
  contactPhone: string | null
  address: string | null
  accessCode: string | null
}

const C = {
  bg: '#fff9f3', border: '#e0d4c0', text: '#1c1008',
  muted: '#6b5a47', faint: '#a89070', wine: 'var(--color-brand)', inputBg: '#fffdf9',
}
const inputStyle = { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }

function WineBottlePlaceholder({ color }: { color: string }) {
  return (
    <svg width="24" height="48" viewBox="0 0 32 64" fill="none">
      <path d="M8 2h16l-4 24a8 8 0 1 1-8 0L8 2z" fill={color} opacity="0.7" />
      <rect x="14" y="50" width="4" height="12" fill={color} opacity="0.5" />
      <rect x="8" y="60" width="16" height="2" rx="1" fill={color} opacity="0.5" />
    </svg>
  )
}

export default function WineCatalogueClient({
  wines: WINES,
  companies = [],
  logoUrl = '/icons/logo-dark.svg',
  logoAlt = '',
  hideCompanyDropdown = false,
}: {
  wines: DbWine[]
  companies?: Company[]
  logoUrl?: string
  logoAlt?: string
  hideCompanyDropdown?: boolean
}) {
  const [quantities, setQuantities] = useState<WineQty>({})
  const [view, setView] = useState<ViewMode>('grid')
  const [showDrawer, setShowDrawer] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Company selector
  const [companyId, setCompanyId] = useState('')

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

  // Controlled form fields (auto-fillable)
  const [businessName, setBusinessName] = useState('')
  const [llcName, setLlcName] = useState('')
  const [llcId, setLlcId] = useState('')
  const [address, setAddress] = useState('')
  const [workingHours, setWorkingHours] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  function setQty(id: string, delta: number) {
    setQuantities(prev => {
      const next = Math.max(0, (prev[id] ?? 0) + delta)
      return { ...prev, [id]: next }
    })
  }

  function setQtyDirect(id: string, value: number) {
    setQuantities(prev => ({ ...prev, [id]: Math.max(0, value) }))
  }

  const totalBottles = Object.values(quantities).reduce((s, q) => s + q, 0)
  const totalPrice = WINES.reduce((s, w) => s + (quantities[w.id] ?? 0) * w.price, 0)

  // Close drawer if cart becomes empty (and not on success screen)
  useEffect(() => {
    if (totalBottles === 0 && showDrawer && !submitted) {
      setShowDrawer(false)
    }
  }, [totalBottles, showDrawer, submitted])

  useEffect(() => {
    if (!companyId || hideCompanyDropdown) return
    const company = companies.find(c => c.id === companyId)
    if (!company) return
    if (!company.accessCode) {
      applyProfile(company, { contactName: company.contactName, contactPhone: company.contactPhone, identificationCode: company.identificationCode, address: company.address })
      return
    }
    setCodeInput('')
    setCodeError('')
    setShowCodeText(false)
    setShowCodePopup(true)
  }, [companyId, hideCompanyDropdown])

  function applyProfile(company: Company, profile: { contactName: string | null; contactPhone: string | null; identificationCode: string | null; address: string | null }) {
    setBusinessName(company.name)
    setLlcName(company.name)
    if (profile.identificationCode) setLlcId(profile.identificationCode)
    if (profile.address) setAddress(profile.address)
    if (profile.contactName) setContactName(profile.contactName)
    if (profile.contactPhone) setContactPhone(profile.contactPhone)
  }

  async function handleCodeSubmit() {
    if (!codeInput.trim()) return
    setCodeLoading(true)
    setCodeError('')
    const result = await verifyCompanyCode(companyId, codeInput)
    setCodeLoading(false)
    if ('error' in result) {
      setCodeError('Incorrect code — please try again or contact the winery.')
      return
    }
    const company = companies.find(c => c.id === companyId)!
    applyProfile(company, result.profile)
    setShowCodePopup(false)
  }

  function handleNotARep() {
    setShowCodePopup(false)
    setCompanyId('')
  }

  async function handleDirectCodeSubmit() {
    if (!directCode.trim()) return
    setDirectCodeLoading(true)
    setDirectCodeError('')
    const result = await findCompanyByCode(directCode, 'WINE_ORDER')
    setDirectCodeLoading(false)
    if ('error' in result) {
      setDirectCodeError('Code not recognised.')
      return
    }
    setCompanyId(result.company.id)
    setDirectCompanyName(result.company.name)
    applyProfile(
      { ...result.company, accessCode: null },
      { contactName: result.company.contactName, contactPhone: result.company.contactPhone, identificationCode: result.company.identificationCode, address: result.company.address }
    )
  }

  function clearDirectCode() {
    setCompanyId('')
    setDirectCompanyName('')
    setDirectCode('')
    setDirectCodeError('')
    setBusinessName(''); setLlcName(''); setLlcId(''); setAddress(''); setContactName(''); setContactPhone('')
  }

  async function handleNewCompanySubmit() {
    if (!newCoName.trim() || !newCoContact.trim() || !newCoPhone.trim()) return
    setNewCoStatus('submitting')
    const result = await notifyNewCompany({
      companyName: newCoName.trim(),
      contactName: newCoContact.trim(),
      phone: newCoPhone.trim(),
      email: newCoEmail.trim() || undefined,
      module: 'WINE_ORDER',
    })
    setNewCoStatus(result.success ? 'sent' : 'error')
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget
    const formData = new FormData(form)
    const wines = WINES.map(w => ({ id: w.id, name: w.name, quantity: quantities[w.id] ?? 0, price: w.price }))
    formData.set('wines', JSON.stringify(wines))

    startTransition(async () => {
      const result = await submitWineOrder(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSubmitted(true)
        form.reset()
        setQuantities({})
        setCompanyId('')
        setBusinessName(''); setLlcName(''); setLlcId(''); setAddress(''); setWorkingHours(''); setContactName(''); setContactPhone('')
      }
    })
  }

  function handlePlaceAnother() {
    setSubmitted(false)
    setShowDrawer(false)
  }

  const selectedCompany = companies.find(c => c.id === companyId)
  const selectedWines = WINES.filter(w => (quantities[w.id] ?? 0) > 0)

  // ── Company selector JSX (shared between drawer and popups) ────────────────
  const companySelectorJsx = (companies.length > 0 || hideCompanyDropdown) && (
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
              className="flex-1 rounded-lg border px-3 py-2.5 text-sm font-mono outline-none"
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
          <label className="block text-sm font-medium" style={{ color: C.muted }}>
            Ordering as a company? <span className="font-normal" style={{ color: C.faint }}>(optional — auto-fills your details)</span>
          </label>
          <button
            type="button"
            onClick={() => { setShowNewCompanyPopup(true); setNewCoStatus('idle'); setNewCoName(''); setNewCoContact(''); setNewCoPhone(''); setNewCoEmail('') }}
            className="text-xs font-medium transition-all hover:opacity-75 active:scale-95 flex-shrink-0 ml-3"
            style={{ color: 'var(--color-brand)' }}
          >
            New Company?
          </button>
        </div>
        <select
          value={companyId}
          onChange={e => setCompanyId(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
          style={inputStyle}
        >
          <option value="">— Individual / no company —</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    )
  )

  return (
    <>
      {/* ── Access code popup ─────────────────────────────────────────────── */}
      {showCodePopup && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: '#fffdf9', border: `1px solid ${C.border}` }}>
            <div>
              <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>Enter your company code</h3>
              <p className="text-sm" style={{ color: C.muted }}>
                {selectedCompany.name} — enter the access code provided by the winery.
              </p>
            </div>
            <div className="relative">
              <input
                autoFocus
                type={showCodeText ? 'text' : 'password'}
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleCodeSubmit() }}
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
              type="button"
              onClick={handleCodeSubmit}
              disabled={codeLoading || !codeInput.trim()}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white"
              style={{ backgroundColor: C.wine, opacity: (codeLoading || !codeInput.trim()) ? 0.6 : 1 }}
            >
              {codeLoading ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" onClick={handleNotARep} className="w-full py-2 rounded-lg text-xs font-medium border text-center transition-colors hover:bg-gray-50" style={{ color: C.muted, borderColor: C.border }}>
              Enter Manually
            </button>
          </div>
        </div>
      )}

      {/* ── New Company popup ─────────────────────────────────────────────── */}
      {showNewCompanyPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-3"
            style={{ backgroundColor: '#fffdf9', border: `1px solid ${C.border}` }}>
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
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text }} />
                <input type="text" placeholder="Your Name *" value={newCoContact}
                  onChange={e => setNewCoContact(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text }} />
                <input type="tel" placeholder="Phone Number *" value={newCoPhone}
                  onChange={e => setNewCoPhone(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text }} />
                <input type="email" placeholder="Email (optional)" value={newCoEmail}
                  onChange={e => setNewCoEmail(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text }} />
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

      {/* ── Sticky bottom bar ─────────────────────────────────────────────── */}
      {totalBottles > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t"
          style={{ backgroundColor: '#fffdf9', borderColor: '#c9b99a', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: C.faint }}>
                {totalBottles} bottle{totalBottles !== 1 ? 's' : ''}
              </p>
              <p className="text-xs truncate" style={{ color: C.muted }}>
                {selectedWines.map(w => `${w.name} ×${quantities[w.id]}`).join(' · ')}
              </p>
            </div>
            <span className="text-base font-bold flex-shrink-0" style={{ color: C.wine }}>{totalPrice}₾</span>
            <button
              type="button"
              onClick={() => setShowDrawer(true)}
              className="btn-wine font-semibold px-5 py-2.5 rounded-lg text-sm flex-shrink-0"
            >
              Place Reservation →
            </button>
          </div>
        </div>
      )}

      {/* ── Checkout drawer ───────────────────────────────────────────────── */}
      {showDrawer && (
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => { if (!submitted) setShowDrawer(false) }}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-full flex flex-col overflow-hidden"
            style={{ maxWidth: '480px', backgroundColor: '#fffdf9', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            {submitted ? (
              /* Success state */
              <div className="flex flex-col items-center justify-center flex-1 px-8 py-16 text-center">
                <div className="text-5xl mb-6">🍷</div>
                <h2 className="text-2xl font-bold mb-3" style={{ color: '#1c1008' }}>Order received!</h2>
                <p className="text-base mb-8" style={{ color: '#6b5a47' }}>
                  Thank you. We will contact you shortly to confirm the details.
                </p>
                <button onClick={handlePlaceAnother} className="btn-wine font-semibold px-8 py-3 rounded-lg">
                  Place another order
                </button>
              </div>
            ) : (
              <>
                {/* Drawer header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: C.border }}>
                  <h2 className="text-lg font-bold" style={{ color: C.text }}>Place a Reservation</h2>
                  <button
                    type="button"
                    onClick={() => setShowDrawer(false)}
                    className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: C.muted }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="2" x2="16" y2="16" /><line x1="16" y1="2" x2="2" y2="16" />
                    </svg>
                  </button>
                </div>

                {/* Order summary (read-only) */}
                <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor: C.border, backgroundColor: '#f5efe6' }}>
                  <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: C.faint }}>Your order</p>
                  <div className="flex flex-col gap-1.5">
                    {selectedWines.map(w => (
                      <div key={w.id} className="flex items-center justify-between text-sm">
                        <span style={{ color: C.text }}>
                          {w.name} <span style={{ color: C.muted }}>×{quantities[w.id]}</span>
                        </span>
                        <span style={{ color: C.muted }}>{(quantities[w.id]! * w.price)}₾</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: '#d9c9b0' }}>
                    <span className="text-sm font-semibold" style={{ color: C.text }}>Total</span>
                    <span className="text-base font-bold" style={{ color: C.wine }}>{totalPrice}₾</span>
                  </div>
                </div>

                {/* Scrollable form */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input type="hidden" name="companyId" value={companyId} />

                    {companySelectorJsx}

                    <input name="businessName" required placeholder="Bar, restaurant, or individual name"
                      value={businessName} onChange={e => setBusinessName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />
                    <input name="llcName" placeholder="LLC name (if applicable)"
                      value={llcName} onChange={e => setLlcName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />
                    <input name="llcId" placeholder="LLC identification number"
                      value={llcId} onChange={e => setLlcId(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />
                    <input name="address" required placeholder="Actual address of bar / restaurant"
                      value={address} onChange={e => setAddress(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />
                    <input name="workingHours" placeholder="Working hours"
                      value={workingHours} onChange={e => setWorkingHours(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />
                    <input name="contactName" required placeholder="Contact person full name"
                      value={contactName} onChange={e => setContactName(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />
                    <input name="contactPhone" required placeholder="Contact person phone number"
                      value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-sm outline-none" style={inputStyle} />

                    {error && <p className="text-sm" style={{ color: 'var(--color-brand)' }}>{error}</p>}

                    <button type="submit" disabled={isPending}
                      className="btn-wine font-semibold py-3 rounded-lg mt-2 disabled:opacity-60 transition-opacity">
                      {isPending ? 'Sending...' : 'Place Reservation'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Main catalogue ────────────────────────────────────────────────── */}
      <div
        className="max-w-4xl mx-auto px-6 py-16"
        style={{ paddingBottom: totalBottles > 0 ? '96px' : undefined }}
      >
        {/* Heading */}
        <p className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }}>Order Wine</p>
        <div className="flex items-start justify-between gap-4 mb-10">
          <div>
            <img src={logoUrl} alt={logoAlt} style={{ height: '56px', width: 'auto' }} />
            <p className="text-base" style={{ color: '#6b5a47' }}>Select wines, set quantities, and place a reservation.</p>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg border p-0.5 flex-shrink-0" style={{ borderColor: '#e0d4c0', backgroundColor: '#fff9f3' }}>
            <button
              onClick={() => setView('grid')} title="Grid view"
              className={`p-2 rounded transition-colors ${view === 'grid' ? 'text-white' : 'hover:opacity-70'}`}
              style={{ backgroundColor: view === 'grid' ? 'var(--color-brand)' : 'transparent', color: view === 'grid' ? 'white' : '#6b5a47' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
                <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => setView('list')} title="List view"
              className={`p-2 rounded transition-colors ${view === 'list' ? 'text-white' : 'hover:opacity-70'}`}
              style={{ backgroundColor: view === 'list' ? 'var(--color-brand)' : 'transparent', color: view === 'list' ? 'white' : '#6b5a47' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="2" width="14" height="2" rx="1" /><rect x="1" y="7" width="14" height="2" rx="1" />
                <rect x="1" y="12" width="14" height="2" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

        {/* ── GRID VIEW ── */}
        {view === 'grid' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WINES.map(wine => {
              const qty = quantities[wine.id] ?? 0
              return (
                <div key={wine.id} className="rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
                  <div className="h-44 flex items-center justify-center"
                    style={wine.imagePath ? { backgroundColor: '#faf6f0' } : { background: `linear-gradient(to bottom, ${wine.color}, ${wine.color}99)` }}>
                    {wine.imagePath ? (
                      <img src={wine.imagePath} alt={wine.name} className="h-full w-full object-contain p-3" />
                    ) : (
                      <svg width="32" height="64" viewBox="0 0 32 64" fill="none" opacity="0.25">
                        <path d="M8 2h16l-4 24a8 8 0 1 1-8 0L8 2z" fill="white" />
                        <rect x="14" y="50" width="4" height="12" fill="white" />
                        <rect x="8" y="60" width="16" height="2" rx="1" fill="white" />
                      </svg>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#1c1008' }}>{wine.name}</p>
                      <p className="text-xs font-medium uppercase tracking-wide mt-0.5" style={{ color: wine.color }}>{wine.type}</p>
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-sm font-semibold" style={{ color: '#1c1008' }}>{wine.price}₾ / bottle</span>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setQty(wine.id, -1)} disabled={qty === 0}
                          className="w-7 h-7 rounded border font-bold text-base flex items-center justify-center disabled:opacity-30"
                          style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}>−</button>
                        <input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={e => setQtyDirect(wine.id, parseInt(e.target.value) || 0)}
                          className="w-9 text-center font-semibold text-sm border rounded outline-none"
                          style={{ borderColor: '#e0d4c0', backgroundColor: '#fff9f3', color: '#1c1008' }}
                        />
                        <button type="button" onClick={() => setQty(wine.id, 1)}
                          className="w-7 h-7 rounded border font-bold text-base flex items-center justify-center"
                          style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: '#e0d4c0' }}>
            <div className="grid items-center text-xs font-medium uppercase tracking-wider px-4 py-3 border-b"
              style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr', backgroundColor: '#f5efe6', borderColor: '#e0d4c0', color: '#a89070' }}>
              <span>Wine</span>
              <span className="text-center">Unit price</span>
              <span className="text-center">Quantity</span>
              <span className="text-right">Total</span>
            </div>

            {WINES.map((wine, i) => {
              const qty = quantities[wine.id] ?? 0
              const lineTotal = qty * wine.price
              return (
                <div key={wine.id} className="grid items-center px-4 py-3 border-b last:border-b-0"
                  style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr', borderColor: '#e0d4c0', backgroundColor: i % 2 === 0 ? '#fff9f3' : '#fdf7ef' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-10 rounded flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: '#f5efe6' }}>
                      {wine.imagePath ? (
                        <img src={wine.imagePath} alt={wine.name} className="w-full h-full object-contain" />
                      ) : (
                        <WineBottlePlaceholder color={wine.color} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#1c1008' }}>{wine.name}</p>
                      <p className="text-xs uppercase tracking-wide" style={{ color: wine.color }}>{wine.type}</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-center" style={{ color: '#6b5a47' }}>{wine.price}₾</p>
                  <div className="flex items-center justify-center gap-1">
                    <button type="button" onClick={() => setQty(wine.id, -1)} disabled={qty === 0}
                      className="w-6 h-6 rounded border text-sm font-bold flex items-center justify-center disabled:opacity-30"
                      style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}>−</button>
                    <input type="number" min={0} value={qty}
                      onChange={e => setQtyDirect(wine.id, parseInt(e.target.value) || 0)}
                      className="w-10 text-center text-sm font-semibold border rounded outline-none"
                      style={{ borderColor: '#e0d4c0', backgroundColor: '#fff9f3', color: '#1c1008' }} />
                    <button type="button" onClick={() => setQty(wine.id, 1)}
                      className="w-6 h-6 rounded border text-sm font-bold flex items-center justify-center"
                      style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}>+</button>
                  </div>
                  <p className="text-sm font-semibold text-right" style={{ color: lineTotal > 0 ? 'var(--color-brand)' : '#c9b99a' }}>
                    {lineTotal > 0 ? `${lineTotal}₾` : '—'}
                  </p>
                </div>
              )
            })}

            {totalBottles > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t"
                style={{ borderColor: '#c9b99a', backgroundColor: '#f5efe6' }}>
                <span className="text-sm font-medium" style={{ color: '#6b5a47' }}>{totalBottles} bottle{totalBottles !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>Total: {totalPrice}₾</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
