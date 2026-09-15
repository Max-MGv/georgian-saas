'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createWineOrderAdmin } from '@/app/actions/wineOrders'
import { adminT } from '@/lib/adminT'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--site-surface)',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: '0.875rem',
  color: C.text,
  outline: 'none',
  width: '100%',
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type CompanyOption = {
  id: string
  name: string
  wineDiscountPercent: number | null
  contactName: string | null
  contactPhone: string | null
  address: string | null
  identificationCode: string | null
}
type VintageOption = { id: string; year: number; price: number }
type WineOption = { id: string; name: string; vintages: VintageOption[] }
type LineItem = { tempId: number; vintageId: string; wineName: string; year: number; price: number; quantity: number }

// ─── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border mb-4" style={{ borderColor: C.border }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: C.border, backgroundColor: 'var(--site-bg)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--site-secondary)' }}>
          {title}
        </h3>
      </div>
      <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, half, required }: { label: string; children: React.ReactNode; half?: boolean; required?: boolean }) {
  return (
    <div className={half ? '' : 'mb-3'}>
      <label className="text-xs block mb-1" style={{ color: C.faint }}>{label}{required ? ' *' : ''}</label>
      {children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function NewWineOrderForm({
  companies,
  wines,
  locale = 'en',
}: {
  companies: CompanyOption[]
  wines: WineOption[]
  locale?: string
}) {
  const router = useRouter()
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)

  // Company + discount
  const [companyId, setCompanyId] = useState('')

  // Business / contact
  const [businessName, setBusinessName] = useState('')
  const [llcName, setLlcName] = useState('')
  const [llcId, setLlcId] = useState('')
  const [address, setAddress] = useState('')
  const [workingHours, setWorkingHours] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // Wine lines (client-side only until submit)
  const [lines, setLines] = useState<LineItem[]>([])
  const [addingLine, setAddingLine] = useState(false)
  const [newLineWineId, setNewLineWineId] = useState('')
  const [newLineVintageId, setNewLineVintageId] = useState('')
  const [newLineQty, setNewLineQty] = useState('1')

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [nextTempId, setNextTempId] = useState(1)

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedCompany = companies.find(c => c.id === companyId) ?? null
  const discountPercent = selectedCompany?.wineDiscountPercent && selectedCompany.wineDiscountPercent > 0
    ? Math.min(selectedCompany.wineDiscountPercent, 100)
    : null

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.price, 0)
  const computedTotal = discountPercent
    ? Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100
    : subtotal

  // ── Company autofill ──────────────────────────────────────────────────────
  // Mirrors WineCatalogueClient.tsx's applyProfile(): businessName/llcName take
  // the company name unconditionally, everything else only overwrites when the
  // company actually has that field set — so switching to a company never
  // blanks out something the admin already typed.
  function handleCompanyChange(id: string) {
    setCompanyId(id)
    if (!id) return
    const company = companies.find(c => c.id === id)
    if (!company) return
    setBusinessName(company.name)
    setLlcName(company.name)
    if (company.identificationCode) setLlcId(company.identificationCode)
    if (company.address) setAddress(company.address)
    if (company.contactName) setContactName(company.contactName)
    if (company.contactPhone) setContactPhone(company.contactPhone)
  }

  // ── Wine line helpers ─────────────────────────────────────────────────────
  const selectedWine = wines.find(w => w.id === newLineWineId)
  const selectedVintage = selectedWine?.vintages.find(v => v.id === newLineVintageId)
  const lineTotal = selectedVintage ? (parseInt(newLineQty) || 1) * selectedVintage.price : 0

  function handleNewLineWineChange(wineId: string) {
    setNewLineWineId(wineId)
    const wine = wines.find(w => w.id === wineId)
    setNewLineVintageId(wine?.vintages[0]?.id ?? '')
  }

  function handleAddLine() {
    if (!selectedWine || !selectedVintage) return
    const qty = parseInt(newLineQty) || 1
    setLines(prev => [...prev, {
      tempId: nextTempId,
      vintageId: selectedVintage.id,
      wineName: selectedWine.name,
      year: selectedVintage.year,
      price: selectedVintage.price,
      quantity: qty,
    }])
    setNextTempId(n => n + 1)
    setNewLineWineId('')
    setNewLineVintageId('')
    setNewLineQty('1')
    setAddingLine(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true)
    setError('')

    const result = await createWineOrderAdmin({
      companyId: companyId || null,
      businessName,
      llcName: llcName || null,
      llcId: llcId || null,
      address,
      workingHours: workingHours || null,
      contactName,
      contactPhone,
      contactEmail: contactEmail || null,
      wines: lines.map(l => ({ vintageId: l.vintageId, quantity: l.quantity })),
    })

    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    router.push('/admin/wine-orders')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Company ── */}
      <Card title={at('newWineOrder.company.title')}>
        <Field label={at('newWineOrder.company.label')}>
          <select value={companyId} onChange={e => handleCompanyChange(e.target.value)} style={inputStyle}>
            <option value="">{at('newWineOrder.company.none')}</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        {discountPercent != null && (
          <p className="text-xs" style={{ color: C.faint }}>
            {at('newWineOrder.company.discountApplies', { percent: discountPercent })}
          </p>
        )}
      </Card>

      {/* ── Business / Contact ── */}
      <Card title={at('newWineOrder.contact.title')}>
        <Field label={at('newWineOrder.contact.businessName')} required>
          <input value={businessName} onChange={e => setBusinessName(e.target.value)} style={inputStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label={at('newWineOrder.contact.llcName')} half>
            <input value={llcName} onChange={e => setLlcName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={at('newWineOrder.contact.llcId')} half>
            <input value={llcId} onChange={e => setLlcId(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label={at('newWineOrder.contact.address')} required>
          <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={at('newWineOrder.contact.workingHours')}>
          <input value={workingHours} onChange={e => setWorkingHours(e.target.value)} style={inputStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label={at('newWineOrder.contact.contactName')} half required>
            <input value={contactName} onChange={e => setContactName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={at('newWineOrder.contact.contactPhone')} half required>
            <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label={at('newWineOrder.contact.contactEmail')}>
          <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={inputStyle} />
        </Field>
      </Card>

      {/* ── Wines ── */}
      <Card title={at('newWineOrder.wines.title')}>
        {lines.length > 0 && (
          <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--site-bg)', borderBottom: `1px solid ${C.border}` }}>
                  {[at('newWineOrder.wines.colWine'), at('newWineOrder.wines.colYear'), at('newWineOrder.wines.colQty'), at('newWineOrder.wines.colPrice'), at('newWineOrder.wines.colTotal'), ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--site-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.tempId} style={{ borderBottom: i < lines.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <td className="px-3 py-2 text-sm" style={{ color: C.text }}>{l.wineName}</td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>{l.year}</td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>{l.quantity}</td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>{l.price}₾</td>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                      {(l.quantity * l.price).toFixed(2)}₾
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setLines(prev => prev.filter(x => x.tempId !== l.tempId))}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                      >
                        {at('newWineOrder.wines.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length === 0 && !addingLine && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>{at('newWineOrder.wines.none')}</p>
        )}

        {addingLine ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 160px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('newWineOrder.wines.colWine')}</label>
              <select value={newLineWineId} onChange={e => handleNewLineWineChange(e.target.value)} style={inputStyle}>
                <option value="">{at('newWineOrder.wines.selectWine')}</option>
                {wines.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            {selectedWine && (
              <div style={{ flex: '1 1 100px' }}>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('newWineOrder.wines.colYear')}</label>
                <select value={newLineVintageId} onChange={e => setNewLineVintageId(e.target.value)} style={inputStyle}>
                  {selectedWine.vintages.map(v => (
                    <option key={v.id} value={v.id}>{v.year} — {v.price}₾</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ width: 80 }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('newWineOrder.wines.colQty')}</label>
              <input type="number" min={1} value={newLineQty} onChange={e => setNewLineQty(e.target.value)} style={inputStyle} />
            </div>
            {selectedVintage && (
              <div className="text-sm pb-2" style={{ color: C.muted }}>= {lineTotal.toFixed(2)}₾</div>
            )}
            <button
              onClick={handleAddLine}
              disabled={!newLineVintageId}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {at('newWineOrder.wines.add')}
            </button>
            <button
              onClick={() => { setAddingLine(false); setNewLineWineId(''); setNewLineVintageId(''); setNewLineQty('1') }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {at('newWineOrder.wines.cancel')}
            </button>
          </div>
        ) : wines.length > 0 ? (
          <button onClick={() => setAddingLine(true)} className="text-sm font-medium" style={{ color: C.wine }}>
            {at('newWineOrder.wines.addBtn')}
          </button>
        ) : (
          <p className="text-xs" style={{ color: C.faint }}>
            {at('newWineOrder.wines.noActiveWines')}{' '}
            <a href="/admin/wines" style={{ color: C.wine }}>{at('newWineOrder.wines.addSomeLink')}</a>.
          </p>
        )}
      </Card>

      {/* ── Order Total ── */}
      <Card title={at('newWineOrder.total.title')}>
        <div className="space-y-1.5 mb-3">
          {lines.map(l => (
            <div key={l.tempId} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{l.wineName} {l.year} × {l.quantity}</span>
              <span style={{ color: C.text }}>{(l.quantity * l.price).toFixed(2)}₾</span>
            </div>
          ))}
          {discountPercent != null && lines.length > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{at('newWineOrder.total.discount', { percent: discountPercent })}</span>
              <span style={{ color: C.text }}>−{(subtotal - computedTotal).toFixed(2)}₾</span>
            </div>
          )}
        </div>

        <div className="pt-3 flex justify-between items-center border-t" style={{ borderColor: C.border }}>
          <span className="text-sm font-semibold" style={{ color: C.muted }}>{at('orderDetail.total.totalLabel')}</span>
          <span className="text-2xl font-bold" style={{ color: C.wine }}>
            {computedTotal.toFixed(2)}₾
          </span>
        </div>

        {error && (
          <p className="text-sm mt-3" style={{ color: '#b91c1c' }}>{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full py-3 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: C.wine, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? at('newWineOrder.total.creating') : at('newWineOrder.total.create')}
        </button>
      </Card>
    </div>
  )
}
