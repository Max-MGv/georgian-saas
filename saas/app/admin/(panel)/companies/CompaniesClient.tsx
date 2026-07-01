'use client'

import { useState } from 'react'
import { createCompany, updateCompany, deleteCompany, regenerateAccessCode, setAccessCode } from '@/app/actions/companies'
import { createPrice, updatePrice, deletePrice, setDisplayPrice } from '@/app/actions/prices'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

type Price = {
  id: string
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
  isDisplayPrice: boolean
}
type Company = {
  id: string
  name: string
  isIndividual: boolean
  identificationCode: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  accessCode: string | null
  orderCount: number
  prices: Price[]
}

const inputStyle = {
  backgroundColor: '#fffdf9', border: `1px solid ${C.border}`,
  borderRadius: '8px', padding: '7px 10px', fontSize: '0.8125rem', color: C.text, outline: 'none',
}

function SmallInput({ label, value, onChange, type = 'text', width = 80 }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; width?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <label style={{ fontSize: '0.7rem', color: C.faint }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, width }}
      />
    </div>
  )
}

function PriceForm({
  initial, onSave, onCancel, loading,
}: {
  initial?: Price; onSave: (data: Omit<Price, 'id' | 'isDisplayPrice'>) => void; onCancel: () => void; loading: boolean
}) {
  const [minGuests, setMinGuests] = useState(String(initial?.minGuests ?? 1))
  const [maxGuests, setMaxGuests] = useState(String(initial?.maxGuests ?? 10))
  const [pricePerPerson, setPricePerPerson] = useState(String(initial?.pricePerPerson ?? ''))
  const [tastingLunchPrice, setTastingLunchPrice] = useState(String(initial?.tastingLunchPricePerPerson ?? ''))
  const [registrationPrice, setRegistrationPrice] = useState(String(initial?.registrationPrice ?? 0))

  return (
    <div className="flex flex-wrap items-end gap-3 mt-3">
      <SmallInput label="Min guests" value={minGuests} onChange={setMinGuests} type="number" width={72} />
      <SmallInput label="Max guests" value={maxGuests} onChange={setMaxGuests} type="number" width={72} />
      <SmallInput label="Tasting ₾/person" value={pricePerPerson} onChange={setPricePerPerson} type="number" width={110} />
      <SmallInput label="Tasting+Lunch ₾/person" value={tastingLunchPrice} onChange={setTastingLunchPrice} type="number" width={140} />
      <SmallInput label="Flat fee ₾ (optional)" value={registrationPrice} onChange={setRegistrationPrice} type="number" width={120} />
      <div className="flex gap-2 pb-0.5">
        <button
          onClick={() => onSave({
            minGuests: Number(minGuests), maxGuests: Number(maxGuests),
            pricePerPerson: Number(pricePerPerson),
            tastingLunchPricePerPerson: tastingLunchPrice === '' ? 0 : Number(tastingLunchPrice),
            registrationPrice: registrationPrice === '' ? 0 : Number(registrationPrice),
          })}
          disabled={loading}
          className="btn-wine text-xs px-3 py-2 rounded-lg font-medium"
        >Save</button>
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Edit slide-over panel (tour operators only) ────────────────────────────
function EditPanel({ company, onClose, onSaved }: {
  company: Company
  onClose: () => void
  onSaved: (updated: Partial<Company>) => void
}) {
  const [name, setName] = useState(company.name)
  const [idCode, setIdCode] = useState(company.identificationCode ?? '')
  const [contactName, setContactName] = useState(company.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(company.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(company.contactEmail ?? '')
  const [address, setAddress] = useState(company.address ?? '')
  const [code, setCode] = useState(company.accessCode ?? '')
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setLoading(true); setError('')
    const result = await updateCompany(company.id, {
      name, identificationCode: idCode,
      contactName, contactPhone, contactEmail, address,
    })
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    onSaved({ name: name.trim(), identificationCode: idCode.trim() || null, contactName: contactName.trim() || null, contactPhone: contactPhone.trim() || null, contactEmail: contactEmail.trim() || null, address: address.trim() || null })
    onClose()
    setLoading(false)
  }

  async function handleRegenerate() {
    setLoading(true)
    const result = await regenerateAccessCode(company.id)
    if ('error' in result) { setError(result.error ?? '') }
    else { setCode(result.code ?? '') }
    setLoading(false)
  }

  async function handleSetCode() {
    if (!code.trim()) return
    setLoading(true)
    const result = await setAccessCode(company.id, code)
    if ('error' in result) { setError(result.error ?? '') }
    setLoading(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder = '') => (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%', padding: '9px 12px', fontSize: '0.875rem' }}
      />
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }} onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl overflow-y-auto"
        style={{ width: '420px', maxWidth: '100vw', backgroundColor: '#fffdf9', borderLeft: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: C.border }}>
          <h2 className="font-semibold text-base" style={{ color: C.text }}>Edit Company</h2>
          <button onClick={onClose} style={{ color: C.faint }} className="hover:opacity-70 text-xl leading-none">×</button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-6 flex-1">
          {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Company info</p>
            {field('Company name', name, setName, 'Company name')}
            {field('Identification code (ID)', idCode, setIdCode, 'Optional')}
            {field('Address', address, setAddress, 'Company address')}
          </div>
          <div className="h-px" style={{ backgroundColor: C.border }} />
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Contact person (auto-fills booking form)</p>
            {field('Full name', contactName, setContactName, 'First and last name')}
            {field('Phone', contactPhone, setContactPhone, '+995 5XX XXX XXX')}
            {field('Email', contactEmail, setContactEmail, 'contact@company.ge')}
          </div>
          <div className="h-px" style={{ backgroundColor: C.border }} />
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>Access code</p>
            <p className="text-xs" style={{ color: C.muted }}>Companies enter this on the booking form to auto-fill their details.</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showCode ? 'text' : 'password'}
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onBlur={handleSetCode}
                  placeholder="No code set"
                  style={{ ...inputStyle, width: '100%', padding: '9px 36px 9px 12px', fontSize: '0.875rem', fontFamily: 'monospace', letterSpacing: showCode ? '0.1em' : undefined }}
                />
                <button
                  type="button"
                  onClick={() => setShowCode(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80"
                  title={showCode ? 'Hide' : 'Show'}
                >
                  {showCode ? (
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
              <button
                onClick={handleCopy}
                disabled={!code}
                title="Copy code"
                className="px-3 py-2 rounded-lg border text-xs font-medium"
                style={{ borderColor: C.border, color: copied ? '#15803d' : C.muted, minWidth: 60 }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={handleRegenerate}
              disabled={loading}
              className="text-xs px-3 py-2 rounded-lg border w-fit"
              style={{ borderColor: C.border, color: C.muted }}
            >
              ↻ Generate new code
            </button>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: C.border }}>
          <button onClick={handleSave} disabled={loading} className="btn-wine flex-1 py-2.5 rounded-lg text-sm font-medium">
            {loading ? 'Saving…' : 'Save changes'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg border text-sm" style={{ borderColor: C.border, color: C.muted }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ── Price tiers section (shared between Individuals + tour operators) ───────
function PriceTiersSection({
  company,
  isIndividual,
  addingPriceFor,
  editingPriceId,
  deletingPriceId,
  loading,
  error,
  onAddTier,
  onUpdateTier,
  onDeleteTier,
  onSetDisplayPrice,
  setAddingPriceFor,
  setEditingPriceId,
  setDeletingPriceId,
}: {
  company: Company
  isIndividual: boolean
  addingPriceFor: string | null
  editingPriceId: string | null
  deletingPriceId: string | null
  loading: boolean
  error: string
  onAddTier: (companyId: string, data: Omit<Price, 'id' | 'isDisplayPrice'>) => void
  onUpdateTier: (companyId: string, priceId: string, data: Omit<Price, 'id' | 'isDisplayPrice'>) => void
  onDeleteTier: (companyId: string, priceId: string) => void
  onSetDisplayPrice: (priceId: string) => void
  setAddingPriceFor: (id: string | null) => void
  setEditingPriceId: (id: string | null) => void
  setDeletingPriceId: (id: string | null) => void
}) {
  return (
    <div className="px-5 pb-5" style={{ backgroundColor: isIndividual ? '#fffbf2' : '#faf5ef', borderTop: `1px solid ${C.border}` }}>
      <p className="text-xs font-medium mt-4 mb-3" style={{ color: C.muted }}>Price tiers</p>

      {isIndividual && (
        <p className="text-xs mb-3" style={{ color: C.faint }}>
          Tick <span style={{ color: '#b45309' }}>★ Show on site</span> on the tier to display on the public home page. Falls back to 50₾ / 100₾ if none selected.
        </p>
      )}

      {company.prices.length === 0 && addingPriceFor !== company.id && (
        <p className="text-xs mb-3" style={{ color: C.faint }}>
          {isIndividual
            ? 'No custom tiers. Public site shows 50₾ / 100₾ defaults.'
            : 'No price tiers yet. Individual booking rates will apply.'}
        </p>
      )}

      {company.prices.map(price => (
        <div key={price.id} className="mb-2">
          {editingPriceId === price.id ? (
            <PriceForm
              initial={price}
              onSave={data => onUpdateTier(company.id, price.id, data)}
              onCancel={() => setEditingPriceId(null)}
              loading={loading}
            />
          ) : deletingPriceId === price.id ? (
            <div className="flex items-center gap-3 text-sm">
              <span style={{ color: C.muted }}>Delete this tier?</span>
              <button onClick={() => onDeleteTier(company.id, price.id)} disabled={loading} className="px-3 py-1 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#b91c1c' }}>{loading ? 'Deleting…' : 'Yes'}</button>
              <button onClick={() => setDeletingPriceId(null)} disabled={loading} className="px-3 py-1 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm" style={{ color: C.text }}>{price.minGuests}–{price.maxGuests} guests</span>
              <span className="text-xs" style={{ color: C.faint }}>Tasting: <span className="font-semibold" style={{ color: C.wine }}>{price.pricePerPerson}₾/pp</span></span>
              <span className="text-xs" style={{ color: C.faint }}>+Lunch: <span className="font-semibold" style={{ color: C.wine }}>{price.tastingLunchPricePerPerson}₾/pp</span></span>
              {price.registrationPrice > 0 && <span className="text-xs" style={{ color: C.faint }}>+{price.registrationPrice}₾ flat fee</span>}

              {isIndividual && (
                <button
                  onClick={() => !price.isDisplayPrice && onSetDisplayPrice(price.id)}
                  disabled={loading || price.isDisplayPrice}
                  title={price.isDisplayPrice ? 'Shown on public site' : 'Show this tier on public site'}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border"
                  style={{
                    borderColor: price.isDisplayPrice ? '#d97706' : C.border,
                    color: price.isDisplayPrice ? '#b45309' : C.faint,
                    backgroundColor: price.isDisplayPrice ? '#fffbeb' : 'transparent',
                    cursor: price.isDisplayPrice ? 'default' : 'pointer',
                  }}
                >
                  ★ {price.isDisplayPrice ? 'Shown on site' : 'Show on site'}
                </button>
              )}

              <button onClick={() => setEditingPriceId(price.id)} className="text-xs px-2 py-1 rounded border ml-auto" style={{ borderColor: C.border, color: C.muted }}>Edit</button>
              <button onClick={() => setDeletingPriceId(price.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Delete</button>
            </div>
          )}
        </div>
      ))}

      {addingPriceFor === company.id ? (
        <PriceForm
          onSave={data => onAddTier(company.id, data)}
          onCancel={() => setAddingPriceFor(null)}
          loading={loading}
        />
      ) : (
        <button
          onClick={() => setAddingPriceFor(company.id)}
          className="text-xs mt-2 px-3 py-1.5 rounded-lg border"
          style={{ borderColor: C.border, color: C.muted }}
        >
          + Add tier
        </button>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CompaniesClient({ companies: initial }: { companies: Company[] }) {
  const [companies, setCompanies] = useState(initial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingPriceFor, setAddingPriceFor] = useState<string | null>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [deletingPriceId, setDeletingPriceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const individualsRow = companies.find(c => c.isIndividual)
  const tourOperators = companies.filter(c => !c.isIndividual)

  function updateCompanyPrices(companyId: string, prices: Price[]) {
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, prices } : c))
  }

  async function handleAdd() {
    setLoading(true); setError('')
    const result = await createCompany(newName)
    if ('error' in result) { setError(result.error ?? '') }
    else { setNewName(''); setAdding(false); window.location.reload() }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setLoading(true)
    await deleteCompany(id)
    setCompanies(prev => prev.filter(c => c.id !== id))
    setDeletingId(null); setLoading(false)
  }

  async function handleAddPrice(companyId: string, data: Omit<Price, 'id' | 'isDisplayPrice'>) {
    setLoading(true)
    const result = await createPrice({ companyId, ...data })
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    setAddingPriceFor(null)
    window.location.reload()
  }

  async function handleUpdatePrice(companyId: string, priceId: string, data: Omit<Price, 'id' | 'isDisplayPrice'>) {
    setLoading(true)
    const result = await updatePrice(priceId, data, companyId)
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    const company = companies.find(c => c.id === companyId)!
    updateCompanyPrices(companyId, company.prices.map(p => p.id === priceId ? { id: priceId, isDisplayPrice: p.isDisplayPrice, ...data } : p))
    setEditingPriceId(null); setLoading(false)
  }

  async function handleDeletePrice(companyId: string, priceId: string) {
    setLoading(true)
    await deletePrice(priceId)
    const company = companies.find(c => c.id === companyId)!
    updateCompanyPrices(companyId, company.prices.filter(p => p.id !== priceId))
    setDeletingPriceId(null); setLoading(false)
  }

  async function handleSetDisplayPrice(priceId: string) {
    setLoading(true)
    const result = await setDisplayPrice(priceId)
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    setCompanies(prev => prev.map(c => {
      if (!c.isIndividual) return c
      return { ...c, prices: c.prices.map(p => ({ ...p, isDisplayPrice: p.id === priceId })) }
    }))
    setLoading(false)
  }

  const priceTiersProps = {
    addingPriceFor, editingPriceId, deletingPriceId, loading, error,
    onAddTier: handleAddPrice,
    onUpdateTier: handleUpdatePrice,
    onDeleteTier: handleDeletePrice,
    onSetDisplayPrice: handleSetDisplayPrice,
    setAddingPriceFor, setEditingPriceId, setDeletingPriceId,
  }

  return (
    <div>
      {editingCompany && (
        <EditPanel
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSaved={updated => setCompanies(prev => prev.map(c => c.id === editingCompany.id ? { ...c, ...updated } : c))}
        />
      )}

      {/* ── Individuals row — always pinned at top ── */}
      {individualsRow && (() => {
        const expanded = expandedId === individualsRow.id
        const displayTier = individualsRow.prices.find(p => p.isDisplayPrice)
        return (
          <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: '#d97706', backgroundColor: '#ffffff' }}>
            <div className="flex items-center px-5 py-4 gap-4" style={{ backgroundColor: '#fffbeb' }}>
              <button
                onClick={() => setExpandedId(expanded ? null : individualsRow.id)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <svg className="w-4 h-4 transition-transform" style={{ color: '#b45309', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-semibold" style={{ color: '#92400e' }}>Individuals</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                  Public pricing
                </span>
                {displayTier ? (
                  <span className="text-xs" style={{ color: '#b45309' }}>
                    {displayTier.pricePerPerson}₾ / {displayTier.tastingLunchPricePerPerson}₾ shown on site
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: C.faint }}>
                    50₾ / 100₾ defaults · {individualsRow.prices.length} tier{individualsRow.prices.length !== 1 ? 's' : ''}
                  </span>
                )}
              </button>
            </div>
            {expanded && (
              <PriceTiersSection
                company={individualsRow}
                isIndividual
                {...priceTiersProps}
              />
            )}
          </div>
        )
      })()}

      {/* ── Add tour operator ── */}
      {!adding && (
        <button onClick={() => setAdding(true)} className="btn-wine px-4 py-2 rounded-lg text-sm font-medium mb-4">
          + Add Company
        </button>
      )}
      {adding && (
        <div className="flex items-center gap-3 mb-4">
          <input
            autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Company name…" style={{ ...inputStyle, width: 280, padding: '8px 12px' }}
          />
          <button onClick={handleAdd} disabled={loading} className="btn-wine px-4 py-2 rounded-lg text-sm font-medium">{loading ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setAdding(false); setNewName('') }} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
        </div>
      )}
      {error && <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{error}</p>}

      {/* ── Tour operators list ── */}
      {tourOperators.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>No tour operators yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          {tourOperators.map((company, i) => {
            const expanded = expandedId === company.id
            return (
              <div key={company.id} style={{ borderBottom: i < tourOperators.length - 1 ? `1px solid ${C.border}` : 'none', backgroundColor: '#ffffff' }}>
                <div className="flex items-center px-5 py-4 gap-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : company.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    <svg className="w-4 h-4 transition-transform" style={{ color: C.faint, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-medium" style={{ color: C.text }}>{company.name}</span>
                    {company.identificationCode && <span className="text-xs" style={{ color: C.faint }}>ID: {company.identificationCode}</span>}
                    {company.accessCode && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                        Code set
                      </span>
                    )}
                    <span className="text-xs" style={{ color: C.faint }}>
                      {company.prices.length} tier{company.prices.length !== 1 ? 's' : ''} · {company.orderCount} order{company.orderCount !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {deletingId === company.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: C.muted }}>Delete?</span>
                      <button onClick={() => handleDelete(company.id)} disabled={loading} className="text-sm px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>{loading ? 'Deleting…' : 'Yes, delete'}</button>
                      <button onClick={() => setDeletingId(null)} disabled={loading} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingCompany(company)}
                        className="text-sm px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: C.border, color: C.muted }}
                      >Edit</button>
                      <button onClick={() => setDeletingId(company.id)} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Delete</button>
                    </div>
                  )}
                </div>

                {expanded && (
                  <PriceTiersSection
                    company={company}
                    isIndividual={false}
                    {...priceTiersProps}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
