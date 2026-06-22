'use client'

import { useState, useTransition } from 'react'
import { submitWineOrder } from '@/app/actions/submitWineOrder'
import { verifyCompanyCode } from '@/app/actions/companies'

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
  muted: '#6b5a47', faint: '#a89070', wine: '#7c1d23', inputBg: '#fffdf9',
}
const inputStyle = { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }

const LS_PREFIX = 'company_auth_'
const LS_EXPIRY_DAYS = 30

function saveAuth(companyId: string) {
  try {
    localStorage.setItem(LS_PREFIX + companyId, String(Date.now() + LS_EXPIRY_DAYS * 86400 * 1000))
  } catch {}
}
function hasValidAuth(companyId: string): boolean {
  try { return Number(localStorage.getItem(LS_PREFIX + companyId) ?? 0) > Date.now() } catch { return false }
}

function WineBottlePlaceholder({ color }: { color: string }) {
  return (
    <svg width="24" height="48" viewBox="0 0 32 64" fill="none">
      <path d="M8 2h16l-4 24a8 8 0 1 1-8 0L8 2z" fill={color} opacity="0.7" />
      <rect x="14" y="50" width="4" height="12" fill={color} opacity="0.5" />
      <rect x="8" y="60" width="16" height="2" rx="1" fill={color} opacity="0.5" />
    </svg>
  )
}

export default function WineCatalogueClient({ wines: WINES, companies = [] }: { wines: DbWine[]; companies?: Company[] }) {
  const [quantities, setQuantities] = useState<WineQty>({})
  const [view, setView] = useState<ViewMode>('grid')
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
  const [rememberDevice, setRememberDevice] = useState(true)

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

  function handleCompanyChange(id: string) {
    setCompanyId(id)
    if (!id) return
    const company = companies.find(c => c.id === id)
    if (!company?.accessCode) {
      // No code set — auto-fill name immediately, no popup
      setBusinessName(company?.name ?? '')
      return
    }
    if (hasValidAuth(id)) {
      // Already authenticated — just fill the name (no profile available without server call)
      setBusinessName(company.name)
      return
    }
    setCodeInput('')
    setCodeError('')
    setShowCodeText(false)
    setShowCodePopup(true)
  }

  function applyProfile(company: Company, profile: { contactName: string | null; contactPhone: string | null; identificationCode: string | null; address: string | null }) {
    setBusinessName(company.name)
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
    if (rememberDevice) saveAuth(companyId)
    const company = companies.find(c => c.id === companyId)!
    applyProfile(company, result.profile)
    setShowCodePopup(false)
  }

  function handleNotARep() {
    setShowCodePopup(false)
    setCompanyId('')
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

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="text-5xl mb-6">🍷</div>
        <h2 className="text-2xl font-bold mb-3" style={{ color: '#1c1008' }}>Order received!</h2>
        <p className="text-base mb-8" style={{ color: '#6b5a47' }}>
          Thank you. We will contact you shortly to confirm the details.
        </p>
        <button onClick={() => setSubmitted(false)} className="btn-wine font-semibold px-8 py-3 rounded-lg">
          Place another order
        </button>
      </div>
    )
  }

  const selectedCompany = companies.find(c => c.id === companyId)

  return (
    <>
      {/* Access code popup */}
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

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={rememberDevice} onChange={e => setRememberDevice(e.target.checked)} className="rounded" />
              <span className="text-sm" style={{ color: C.muted }}>Remember this device for 30 days</span>
            </label>

            <button
              type="button"
              onClick={handleCodeSubmit}
              disabled={codeLoading || !codeInput.trim()}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white"
              style={{ backgroundColor: C.wine, opacity: (codeLoading || !codeInput.trim()) ? 0.6 : 1 }}
            >
              {codeLoading ? 'Checking…' : 'Confirm'}
            </button>

            <button type="button" onClick={handleNotARep} className="text-xs text-center hover:underline" style={{ color: C.faint }}>
              I'm not a company rep — continue without a code
            </button>
          </div>
        </div>
      )}

    <div className="max-w-4xl mx-auto px-6 py-16">

      {/* Heading */}
      <p className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }}>Order Wine</p>
      <div className="flex items-start justify-between gap-4 mb-10">
        <div>
          <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '56px', width: 'auto' }} />
          <p className="text-base" style={{ color: '#6b5a47' }}>Select wines, set quantities, and place a reservation.</p>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border p-0.5 flex-shrink-0" style={{ borderColor: '#e0d4c0', backgroundColor: '#fff9f3' }}>
          <button
            onClick={() => setView('grid')} title="Grid view"
            className={`p-2 rounded transition-colors ${view === 'grid' ? 'text-white' : 'hover:opacity-70'}`}
            style={{ backgroundColor: view === 'grid' ? '#7c1d23' : 'transparent', color: view === 'grid' ? 'white' : '#6b5a47' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setView('list')} title="List view"
            className={`p-2 rounded transition-colors ${view === 'list' ? 'text-white' : 'hover:opacity-70'}`}
            style={{ backgroundColor: view === 'list' ? '#7c1d23' : 'transparent', color: view === 'list' ? 'white' : '#6b5a47' }}
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
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
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setQty(wine.id, -1)} disabled={qty === 0}
                        className="w-7 h-7 rounded border font-bold text-base flex items-center justify-center disabled:opacity-30"
                        style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}>−</button>
                      <span className="w-5 text-center font-semibold text-sm" style={{ color: '#1c1008' }}>{qty}</span>
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
        <div className="mb-10 rounded-xl border overflow-x-auto" style={{ borderColor: '#e0d4c0' }}>
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
                <p className="text-sm font-semibold text-right" style={{ color: lineTotal > 0 ? '#7c1d23' : '#c9b99a' }}>
                  {lineTotal > 0 ? `${lineTotal}₾` : '—'}
                </p>
              </div>
            )
          })}

          {totalBottles > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t"
              style={{ borderColor: '#c9b99a', backgroundColor: '#f5efe6' }}>
              <span className="text-sm font-medium" style={{ color: '#6b5a47' }}>{totalBottles} bottle{totalBottles !== 1 ? 's' : ''}</span>
              <span className="text-sm font-bold" style={{ color: '#7c1d23' }}>Total: {totalPrice}₾</span>
            </div>
          )}
        </div>
      )}

      {/* Selection summary (grid view only) */}
      {view === 'grid' && totalBottles > 0 && (
        <div className="rounded-xl border px-5 py-3 mb-8 flex items-center justify-between text-sm"
          style={{ borderColor: '#c9b99a', backgroundColor: '#fff9f3', color: '#6b5a47' }}>
          <span className="flex items-center gap-2">
            <span>🍷</span>
            <span>{WINES.filter(w => (quantities[w.id] ?? 0) > 0).map(w => `${w.name} × ${quantities[w.id]}`).join(', ')}</span>
          </span>
          <span className="font-bold flex-shrink-0 ml-4" style={{ color: '#7c1d23' }}>{totalPrice}₾</span>
        </div>
      )}

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      {/* Reservation form */}
      <h2 className="text-xl font-bold mb-6" style={{ color: '#1c1008' }}>Place a Reservation</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Company selector (optional) */}
        {companies.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.muted }}>
              Ordering as a company? <span className="font-normal" style={{ color: C.faint }}>(optional — auto-fills your details)</span>
            </label>
            <select
              value={companyId}
              onChange={e => handleCompanyChange(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
              style={inputStyle}
            >
              <option value="">— Individual / no company —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

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

        {error && <p className="text-sm" style={{ color: '#7c1d23' }}>{error}</p>}

        <button type="submit" disabled={isPending}
          className="btn-wine font-semibold py-3 rounded-lg mt-2 disabled:opacity-60 transition-opacity">
          {isPending ? 'Sending...' : 'Place Reservation'}
        </button>
      </form>

    </div>
    </>
  )
}
