'use client'

import { useState } from 'react'
import { createCompany, updateCompany, deleteCompany } from '@/app/actions/companies'
import { createPrice, updatePrice, deletePrice } from '@/app/actions/prices'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type Price = { id: string; minGuests: number; maxGuests: number; pricePerPerson: number; registrationPrice: number }
type Company = { id: string; name: string; orderCount: number; prices: Price[] }

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
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Price
  onSave: (data: Omit<Price, 'id'>) => void
  onCancel: () => void
  loading: boolean
}) {
  const [minGuests, setMinGuests] = useState(String(initial?.minGuests ?? 1))
  const [maxGuests, setMaxGuests] = useState(String(initial?.maxGuests ?? 10))
  const [pricePerPerson, setPricePerPerson] = useState(String(initial?.pricePerPerson ?? ''))
  const [registrationPrice, setRegistrationPrice] = useState(String(initial?.registrationPrice ?? 0))

  return (
    <div className="flex flex-wrap items-end gap-3 mt-3">
      <SmallInput label="Min guests" value={minGuests} onChange={setMinGuests} type="number" width={72} />
      <SmallInput label="Max guests" value={maxGuests} onChange={setMaxGuests} type="number" width={72} />
      <SmallInput label="₾ / person" value={pricePerPerson} onChange={setPricePerPerson} type="number" width={88} />
      <SmallInput label="Flat fee ₾ (optional)" value={registrationPrice} onChange={setRegistrationPrice} type="number" width={120} />
      <div className="flex gap-2 pb-0.5">
        <button
          onClick={() => onSave({
            minGuests: Number(minGuests),
            maxGuests: Number(maxGuests),
            pricePerPerson: Number(pricePerPerson),
            registrationPrice: registrationPrice === '' ? 0 : Number(registrationPrice),
          })}
          disabled={loading}
          className="btn-wine text-xs px-3 py-2 rounded-lg font-medium"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-2 rounded-lg border"
          style={{ borderColor: C.border, color: C.muted }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function CompaniesClient({ companies: initial }: { companies: Company[] }) {
  const [companies, setCompanies] = useState(initial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingPriceFor, setAddingPriceFor] = useState<string | null>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [deletingPriceId, setDeletingPriceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateCompanyPrices(companyId: string, prices: Price[]) {
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, prices } : c))
  }

  async function handleAdd() {
    setLoading(true); setError('')
    const result = await createCompany(newName)
    if ('error' in result) { setError(result.error) }
    else { setNewName(''); setAdding(false); window.location.reload() }
    setLoading(false)
  }

  async function handleUpdate(id: string) {
    setLoading(true); setError('')
    const result = await updateCompany(id, editName)
    if ('error' in result) { setError(result.error) }
    else { setCompanies(prev => prev.map(c => c.id === id ? { ...c, name: editName.trim() } : c)); setEditingId(null) }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setLoading(true)
    await deleteCompany(id)
    setCompanies(prev => prev.filter(c => c.id !== id))
    setDeletingId(null); setLoading(false)
  }

  async function handleAddPrice(companyId: string, data: Omit<Price, 'id'>) {
    setLoading(true)
    const result = await createPrice({ companyId, ...data })
    if ('error' in result) { setError(result.error); setLoading(false); return }
    setAddingPriceFor(null)
    window.location.reload()
  }

  async function handleUpdatePrice(companyId: string, priceId: string, data: Omit<Price, 'id'>) {
    setLoading(true)
    const result = await updatePrice(priceId, data, companyId)
    if ('error' in result) { setError(result.error); setLoading(false); return }
    const company = companies.find(c => c.id === companyId)!
    updateCompanyPrices(companyId, company.prices.map(p => p.id === priceId ? { id: priceId, ...data } : p))
    setEditingPriceId(null); setLoading(false)
  }

  async function handleDeletePrice(companyId: string, priceId: string) {
    setLoading(true)
    await deletePrice(priceId)
    const company = companies.find(c => c.id === companyId)!
    updateCompanyPrices(companyId, company.prices.filter(p => p.id !== priceId))
    setDeletingPriceId(null); setLoading(false)
  }

  return (
    <div>
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
          <button onClick={handleAdd} disabled={loading} className="btn-wine px-4 py-2 rounded-lg text-sm font-medium">Save</button>
          <button onClick={() => { setAdding(false); setNewName('') }} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
        </div>
      )}
      {error && <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{error}</p>}

      {companies.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>No companies yet. Add your first tour operator.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          {companies.map((company, i) => {
            const expanded = expandedId === company.id
            return (
              <div key={company.id} style={{ borderBottom: i < companies.length - 1 ? `1px solid ${C.border}` : 'none', backgroundColor: '#ffffff' }}>

                {/* Company row */}
                <div className="flex items-center px-5 py-4 gap-4">
                  {editingId === company.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdate(company.id); if (e.key === 'Escape') setEditingId(null) }}
                      style={{ ...inputStyle, flex: 1, maxWidth: 300, padding: '8px 12px' }} />
                  ) : (
                    <button
                      onClick={() => setExpandedId(expanded ? null : company.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <svg className="w-4 h-4 transition-transform" style={{ color: C.faint, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="font-medium" style={{ color: C.text }}>{company.name}</span>
                      <span className="text-xs" style={{ color: C.faint }}>
                        {company.prices.length} tier{company.prices.length !== 1 ? 's' : ''} · {company.orderCount} order{company.orderCount !== 1 ? 's' : ''}
                      </span>
                    </button>
                  )}

                  {deletingId === company.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: C.muted }}>Delete?</span>
                      <button onClick={() => handleDelete(company.id)} disabled={loading} className="text-sm px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>Yes, delete</button>
                      <button onClick={() => setDeletingId(null)} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
                    </div>
                  ) : editingId === company.id ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleUpdate(company.id)} disabled={loading} className="btn-wine text-sm px-3 py-1.5 rounded-lg font-medium">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingId(company.id); setEditName(company.name) }} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>Edit</button>
                      <button onClick={() => setDeletingId(company.id)} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Delete</button>
                    </div>
                  )}
                </div>

                {/* Expanded price tiers */}
                {expanded && (
                  <div className="px-5 pb-5" style={{ backgroundColor: '#faf5ef', borderTop: `1px solid ${C.border}` }}>
                    <p className="text-xs font-medium mt-4 mb-3" style={{ color: C.muted }}>Price tiers</p>

                    {company.prices.length === 0 && addingPriceFor !== company.id && (
                      <p className="text-xs mb-3" style={{ color: C.faint }}>No price tiers yet. Individual booking rates will apply.</p>
                    )}

                    {company.prices.map(price => (
                      <div key={price.id} className="mb-2">
                        {editingPriceId === price.id ? (
                          <PriceForm
                            initial={price}
                        onSave={data => handleUpdatePrice(company.id, price.id, data)}
                            onCancel={() => setEditingPriceId(null)}
                            loading={loading}
                          />
                        ) : deletingPriceId === price.id ? (
                          <div className="flex items-center gap-3 text-sm">
                            <span style={{ color: C.muted }}>Delete this tier?</span>
                            <button onClick={() => handleDeletePrice(company.id, price.id)} disabled={loading} className="px-3 py-1 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#b91c1c' }}>Yes</button>
                            <button onClick={() => setDeletingPriceId(null)} className="px-3 py-1 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <span className="text-sm" style={{ color: C.text }}>
                              {price.minGuests}–{price.maxGuests} guests
                            </span>
                            <span className="font-semibold text-sm" style={{ color: C.wine }}>{price.pricePerPerson}₾/person</span>
                            {price.registrationPrice > 0 && (
                              <span className="text-xs" style={{ color: C.faint }}>+{price.registrationPrice}₾ flat fee</span>
                            )}
                            <button onClick={() => setEditingPriceId(price.id)} className="text-xs px-2 py-1 rounded border ml-auto" style={{ borderColor: C.border, color: C.muted }}>Edit</button>
                            <button onClick={() => setDeletingPriceId(price.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Delete</button>
                          </div>
                        )}
                      </div>
                    ))}

                    {addingPriceFor === company.id ? (
                      <PriceForm
                        onSave={data => handleAddPrice(company.id, data)}
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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
