'use client'

import { useState } from 'react'
import { createCompany, updateCompany, deleteCompany, regenerateAccessCode, setAccessCode } from '@/app/actions/companies'
import { createPrice, updatePrice, deletePrice, setDisplayPrice } from '@/app/actions/prices'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'

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
  isBookingCompany: boolean
  isWineOrderCompany: boolean
  wineDiscountPercent: number | null
  identificationCode: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  accessCode: string | null
  orderCount: number
  prices: Price[]
}

type Module = 'BOOKING' | 'WINE_ORDER'

// Same trigger rule as getFinishDetailsStatus() (app/actions/onboarding.ts) —
// keep both in sync if this changes. Pricing only counts against a company if
// it's actually a booking company; wine-order-only companies never use price
// tiers at all, so flagging them for "no pricing" would be a false positive.
function missingDetails(at: (key: string) => string, company: Company): string[] {
  const missing: string[] = []
  if (company.identificationCode === null) missing.push(at('companies.missing.idCode'))
  if (!company.contactName && !company.contactPhone && !company.contactEmail && !company.address) {
    missing.push(at('companies.missing.contact'))
  }
  if (company.isBookingCompany && company.prices.length === 0) missing.push(at('companies.missing.pricing'))
  return missing
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
  initial, onSave, onCancel, loading, locale,
}: {
  initial?: Price; onSave: (data: Omit<Price, 'id' | 'isDisplayPrice'>) => void; onCancel: () => void; loading: boolean; locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [minGuests, setMinGuests] = useState(String(initial?.minGuests ?? 1))
  const [maxGuests, setMaxGuests] = useState(String(initial?.maxGuests ?? 10))
  const [pricePerPerson, setPricePerPerson] = useState(String(initial?.pricePerPerson ?? ''))
  const [tastingLunchPrice, setTastingLunchPrice] = useState(String(initial?.tastingLunchPricePerPerson ?? ''))
  const [registrationPrice, setRegistrationPrice] = useState(String(initial?.registrationPrice ?? 0))

  return (
    <div className="flex flex-wrap items-end gap-3 mt-3">
      <SmallInput label={at('companies.priceForm.minGuests')} value={minGuests} onChange={setMinGuests} type="number" width={72} />
      <SmallInput label={at('companies.priceForm.maxGuests')} value={maxGuests} onChange={setMaxGuests} type="number" width={72} />
      <SmallInput label={at('companies.priceForm.tastingPP')} value={pricePerPerson} onChange={setPricePerPerson} type="number" width={110} />
      <SmallInput label={at('companies.priceForm.tastingLunchPP')} value={tastingLunchPrice} onChange={setTastingLunchPrice} type="number" width={140} />
      <SmallInput label={at('companies.priceForm.flatFee')} value={registrationPrice} onChange={setRegistrationPrice} type="number" width={120} />
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
        >{at('settings.common.save')}</button>
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
      </div>
    </div>
  )
}

// ── Edit slide-over panel ──────────────────────────────────────────────────
function EditPanel({ company, onClose, onSaved, locale }: {
  company: Company
  onClose: () => void
  onSaved: (updated: Partial<Company>) => void
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [name, setName] = useState(company.name)
  const [idCode, setIdCode] = useState(company.identificationCode ?? '')
  const [contactName, setContactName] = useState(company.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(company.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(company.contactEmail ?? '')
  const [address, setAddress] = useState(company.address ?? '')
  const [code, setCode] = useState(company.accessCode ?? '')
  const [isBooking, setIsBooking] = useState(company.isBookingCompany)
  const [isWineOrder, setIsWineOrder] = useState(company.isWineOrderCompany)
  const [wineDiscount, setWineDiscount] = useState(company.wineDiscountPercent != null ? String(company.wineDiscountPercent) : '')
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!isBooking && !isWineOrder) {
      setError(at('companies.editPanel.mustHaveModule'))
      return
    }
    setLoading(true); setError('')
    const parsedDiscount = wineDiscount.trim() !== '' ? parseFloat(wineDiscount) : null
    const result = await updateCompany(company.id, {
      name, identificationCode: idCode,
      contactName, contactPhone, contactEmail, address,
      isBookingCompany: isBooking,
      isWineOrderCompany: isWineOrder,
      wineDiscountPercent: parsedDiscount,
    })
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    onSaved({
      name: name.trim(),
      identificationCode: idCode.trim() || null,
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      contactEmail: contactEmail.trim() || null,
      address: address.trim() || null,
      isBookingCompany: isBooking,
      isWineOrderCompany: isWineOrder,
      wineDiscountPercent: parsedDiscount,
    })
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
          <h2 className="font-semibold text-base" style={{ color: C.text }}>{at('companies.editPanel.title')}</h2>
          <button onClick={onClose} style={{ color: C.faint }} className="hover:opacity-70 text-xl leading-none">×</button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-6 flex-1">
          {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}

          {/* Modules */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.modules')}</p>
              <HelpHint text={at('help.companies.modules')} />
            </div>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isBooking}
                  onChange={e => setIsBooking(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm" style={{ color: C.text }}>{at('companies.editPanel.bookings')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isWineOrder}
                  onChange={e => setIsWineOrder(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm" style={{ color: C.text }}>{at('nav.wineOrders')}</span>
              </label>
            </div>
          </div>

          <div className="h-px" style={{ backgroundColor: C.border }} />

          {/* Wine discount — only relevant when isWineOrderCompany */}
          {isWineOrder && (
            <>
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.wineDiscount')}</p>
                <p className="text-xs" style={{ color: C.muted }}>{at('companies.editPanel.wineDiscountHint')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={wineDiscount}
                    onChange={e => setWineDiscount(e.target.value)}
                    placeholder="0"
                    style={{ ...inputStyle, width: 80, padding: '9px 12px', fontSize: '0.875rem', textAlign: 'right' }}
                  />
                  <span className="text-sm font-medium" style={{ color: C.muted }}>{at('companies.editPanel.percentOffAllWines')}</span>
                </div>
              </div>
              <div className="h-px" style={{ backgroundColor: C.border }} />
            </>
          )}

          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.companyInfo')}</p>
            {field(at('companies.editPanel.companyName'), name, setName, at('companies.editPanel.companyName'))}
            {field(at('companies.editPanel.idCode'), idCode, setIdCode, at('companies.editPanel.optional'))}
            {field(at('companies.editPanel.address'), address, setAddress, at('companies.editPanel.addressPh'))}
          </div>
          <div className="h-px" style={{ backgroundColor: C.border }} />
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.contactPerson')}</p>
            {field(at('companies.editPanel.fullName'), contactName, setContactName, at('companies.editPanel.fullNamePh'))}
            {field(at('orderDetail.bookingInfo.phone'), contactPhone, setContactPhone, at('companies.editPanel.phonePh'))}
            {field(at('orderDetail.bookingInfo.email'), contactEmail, setContactEmail, at('companies.editPanel.emailPh'))}
          </div>
          <div className="h-px" style={{ backgroundColor: C.border }} />
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.accessCode')}</p>
            <p className="text-xs" style={{ color: C.muted }}>{at('companies.editPanel.accessCodeHint')}</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showCode ? 'text' : 'password'}
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onBlur={handleSetCode}
                  placeholder={at('companies.editPanel.noCodeSet')}
                  style={{ ...inputStyle, width: '100%', padding: '9px 36px 9px 12px', fontSize: '0.875rem', fontFamily: 'monospace', letterSpacing: showCode ? '0.1em' : undefined }}
                />
                <button
                  type="button"
                  onClick={() => setShowCode(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80"
                  title={showCode ? at('companies.editPanel.hide') : at('companies.editPanel.show')}
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
                title={at('companies.editPanel.copyCode')}
                className="px-3 py-2 rounded-lg border text-xs font-medium"
                style={{ borderColor: C.border, color: copied ? '#15803d' : C.muted, minWidth: 60 }}
              >
                {copied ? at('companies.editPanel.copied') : at('companies.editPanel.copy')}
              </button>
            </div>
            <button
              onClick={handleRegenerate}
              disabled={loading}
              className="text-xs px-3 py-2 rounded-lg border w-fit"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {at('companies.editPanel.generateNewCode')}
            </button>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: C.border }}>
          <button onClick={handleSave} disabled={loading} className="btn-wine flex-1 py-2.5 rounded-lg text-sm font-medium">
            {loading ? at('settings.common.saving') : at('orders.editPanel.save')}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg border text-sm" style={{ borderColor: C.border, color: C.muted }}>
            {at('settings.common.cancel')}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Price tiers section (bookings only) ────────────────────────────────────
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
  locale,
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
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  return (
    <div className="px-5 pb-5" style={{ backgroundColor: isIndividual ? '#fffbf2' : '#faf5ef', borderTop: `1px solid ${C.border}` }}>
      <p className="text-xs font-medium mt-4 mb-3" style={{ color: C.muted }}>{at('companies.priceTiers.title')}</p>

      {isIndividual && (
        <p className="text-xs mb-3" style={{ color: C.faint }}>
          {at('companies.priceTiers.showOnSiteHint')}
        </p>
      )}

      {company.prices.length === 0 && addingPriceFor !== company.id && (
        <p className="text-xs mb-3" style={{ color: C.faint }}>
          {isIndividual
            ? at('companies.priceTiers.noCustomTiersIndividual')
            : at('companies.priceTiers.noTiersCompany')}
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
              locale={locale}
            />
          ) : deletingPriceId === price.id ? (
            <div className="flex items-center gap-3 text-sm">
              <span style={{ color: C.muted }}>{at('companies.priceTiers.deleteConfirm')}</span>
              <button onClick={() => onDeleteTier(company.id, price.id)} disabled={loading} className="px-3 py-1 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#b91c1c' }}>{loading ? at('companies.priceTiers.deleting') : at('orders.yes')}</button>
              <button onClick={() => setDeletingPriceId(null)} disabled={loading} className="px-3 py-1 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm" style={{ color: C.text }}>{price.minGuests}–{price.maxGuests} {at('companies.priceTiers.guests')}</span>
              <span className="text-xs" style={{ color: C.faint }}>{at('companies.priceTiers.tasting')} <span className="font-semibold" style={{ color: C.wine }}>{price.pricePerPerson}₾/pp</span></span>
              <span className="text-xs" style={{ color: C.faint }}>{at('companies.priceTiers.lunch')} <span className="font-semibold" style={{ color: C.wine }}>{price.tastingLunchPricePerPerson}₾/pp</span></span>
              {price.registrationPrice > 0 && <span className="text-xs" style={{ color: C.faint }}>+{price.registrationPrice}₾ {at('companies.priceTiers.flatFeeSuffix')}</span>}

              {isIndividual && (
                <button
                  onClick={() => !price.isDisplayPrice && onSetDisplayPrice(price.id)}
                  disabled={loading || price.isDisplayPrice}
                  title={price.isDisplayPrice ? at('companies.priceTiers.shownOnSiteTitle') : at('companies.priceTiers.showThisOnSiteTitle')}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border"
                  style={{
                    borderColor: price.isDisplayPrice ? '#d97706' : C.border,
                    color: price.isDisplayPrice ? '#b45309' : C.faint,
                    backgroundColor: price.isDisplayPrice ? '#fffbeb' : 'transparent',
                    cursor: price.isDisplayPrice ? 'default' : 'pointer',
                  }}
                >
                  ★ {price.isDisplayPrice ? at('companies.priceTiers.shownOnSiteBadge') : at('companies.priceTiers.showOnSiteBadge')}
                </button>
              )}

              <button onClick={() => setEditingPriceId(price.id)} className="text-xs px-2 py-1 rounded border ml-auto" style={{ borderColor: C.border, color: C.muted }}>{at('companies.priceTiers.edit')}</button>
              <button onClick={() => setDeletingPriceId(price.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
            </div>
          )}
        </div>
      ))}

      {addingPriceFor === company.id ? (
        <PriceForm
          onSave={data => onAddTier(company.id, data)}
          onCancel={() => setAddingPriceFor(null)}
          loading={loading}
          locale={locale}
        />
      ) : (
        <button
          onClick={() => setAddingPriceFor(company.id)}
          className="text-xs mt-2 px-3 py-1.5 rounded-lg border"
          style={{ borderColor: C.border, color: C.muted }}
        >
          {at('companies.priceTiers.addTier')}
        </button>
      )}
    </div>
  )
}

// ── Module badge ───────────────────────────────────────────────────────────
function ModuleBadge({ label, active }: { label: string; active: boolean }) {
  if (!active) return null
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: active ? '#f0fdf4' : '#f5f5f5', color: active ? '#15803d' : '#9ca3af', border: `1px solid ${active ? '#bbf7d0' : '#e5e7eb'}` }}>
      {label}
    </span>
  )
}

// ── Tab toggle ─────────────────────────────────────────────────────────────
function TabToggle({ active, onChange, modules, locale }: { active: Module; onChange: (m: Module) => void; modules: Module[]; locale: string }) {
  const at = (key: string) => adminT(locale, key)
  return (
    <div className="flex mb-5">
      <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
        {modules.map(m => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: active === m ? 'var(--color-brand)' : C.bg,
              color: active === m ? '#fff' : C.muted,
              borderRight: m === 'BOOKING' ? `1px solid ${C.border}` : undefined,
            }}
          >
            {m === 'BOOKING' ? at('companies.editPanel.bookings') : at('nav.wineOrders')}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CompaniesClient({ companies: initial, bookingOn = true, wineOrdersOn = false, locale = 'en' }: { companies: Company[]; bookingOn?: boolean; wineOrdersOn?: boolean; locale?: string }) {
  const at = (key: string) => adminT(locale, key)
  const availableModules: Module[] = [
    ...(bookingOn ? (['BOOKING'] as const) : []),
    ...(wineOrdersOn ? (['WINE_ORDER'] as const) : []),
  ]
  const [companies, setCompanies] = useState(initial)
  const [activeModule, setActiveModule] = useState<Module>(availableModules[0] ?? 'BOOKING')
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
  const allTourOperators = companies.filter(c => !c.isIndividual)

  // Companies visible in the active tab (a company in both modules appears in both)
  const visibleCompanies = allTourOperators.filter(c =>
    activeModule === 'BOOKING' ? c.isBookingCompany : c.isWineOrderCompany
  )

  function updateCompanyPrices(companyId: string, prices: Price[]) {
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, prices } : c))
  }

  async function handleAdd() {
    setLoading(true); setError('')
    const result = await createCompany(newName, {
      isBookingCompany: activeModule === 'BOOKING',
      isWineOrderCompany: activeModule === 'WINE_ORDER',
    })
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
    locale,
  }

  return (
    <div>
      {editingCompany && (
        <EditPanel
          company={editingCompany}
          onClose={() => setEditingCompany(null)}
          onSaved={updated => setCompanies(prev => prev.map(c => c.id === editingCompany.id ? { ...c, ...updated } : c))}
          locale={locale}
        />
      )}

      {availableModules.length > 1 && (
        <TabToggle active={activeModule} onChange={m => { setActiveModule(m); setExpandedId(null) }} modules={availableModules} locale={locale} />
      )}

      {/* ── Individuals row — only in Bookings tab ── */}
      {activeModule === 'BOOKING' && individualsRow && (() => {
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
                <span className="font-semibold" style={{ color: '#92400e' }}>{at('companies.individuals.title')}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                  {at('companies.individuals.publicPricing')}
                </span>
                {displayTier ? (
                  <span className="text-xs" style={{ color: '#b45309' }}>
                    {displayTier.pricePerPerson}₾ / {displayTier.tastingLunchPricePerPerson}₾ {at('companies.individuals.shownOnSite')}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: C.faint }}>
                    {at('companies.individuals.defaults')} · {individualsRow.prices.length} {individualsRow.prices.length !== 1 ? at('companies.individuals.tier.plural') : at('companies.individuals.tier.singular')}
                  </span>
                )}
              </button>
              <HelpHint text={at('help.companies.individuals')} />
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

      {/* ── Add company ── */}
      {!adding && (
        <button onClick={() => setAdding(true)} className="btn-wine px-4 py-2 rounded-lg text-sm font-medium mb-4">
          {activeModule === 'BOOKING' ? at('companies.addCompanyBooking') : at('companies.addCompanyWineOrder')}
        </button>
      )}
      {adding && (
        <div className="flex items-center gap-3 mb-4">
          <input
            autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder={at('companies.newCompanyPh')} style={{ ...inputStyle, width: 280, padding: '8px 12px' }}
          />
          <button onClick={handleAdd} disabled={loading} className="btn-wine px-4 py-2 rounded-lg text-sm font-medium">{loading ? at('settings.common.saving') : at('settings.common.save')}</button>
          <button onClick={() => { setAdding(false); setNewName('') }} className="text-sm px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
        </div>
      )}
      {error && <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{error}</p>}

      {/* ── Company list ── */}
      {visibleCompanies.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>
            {activeModule === 'BOOKING' ? at('companies.noCompaniesBooking') : at('companies.noCompaniesWineOrder')}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          {visibleCompanies.map((company, i) => {
            const expanded = expandedId === company.id
            const isInBoth = company.isBookingCompany && company.isWineOrderCompany
            const missing = missingDetails(at, company)
            return (
              <div key={company.id} style={{ borderBottom: i < visibleCompanies.length - 1 ? `1px solid ${C.border}` : 'none', backgroundColor: '#ffffff' }}>
                <div className="flex items-center px-5 py-4 gap-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : company.id)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    <svg className="w-4 h-4 transition-transform" style={{ color: C.faint, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="font-medium" style={{ color: C.text }}>{company.name}</span>
                    {company.identificationCode && <span className="text-xs" style={{ color: C.faint }}>{at('companies.idLabel')} {company.identificationCode}</span>}
                    {company.accessCode && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                        {at('companies.codeSet')}
                      </span>
                    )}
                    {isInBoth && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        {at('companies.bothModules')}
                      </span>
                    )}
                    {missing.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#fff7ed', color: '#b45309', border: '1px solid #fdba74' }}>
                          ⚠ {at('companies.needsDetails')}
                        </span>
                        <HelpHint text={`${at('companies.missing.label')} ${missing.join(', ')}`} />
                      </span>
                    )}
                    <span className="text-xs" style={{ color: C.faint }}>
                      {activeModule === 'BOOKING'
                        ? `${company.prices.length} ${company.prices.length !== 1 ? at('companies.individuals.tier.plural') : at('companies.individuals.tier.singular')} · `
                        : ''}{company.orderCount} {company.orderCount !== 1 ? at('packing.order.plural') : at('packing.order.singular')}
                    </span>
                  </button>

                  {deletingId === company.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: C.muted }}>{at('companies.deleteConfirm')}</span>
                      <button onClick={() => handleDelete(company.id)} disabled={loading} className="text-sm px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>{loading ? at('companies.deleting') : at('companies.yesDelete')}</button>
                      <button onClick={() => setDeletingId(null)} disabled={loading} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingCompany(company)}
                        className="text-sm px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: C.border, color: C.muted }}
                      >{at('companies.priceTiers.edit')}</button>
                      <button onClick={() => setDeletingId(company.id)} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
                    </div>
                  )}
                </div>

                {/* Price tiers only in Bookings tab */}
                {expanded && activeModule === 'BOOKING' && (
                  <PriceTiersSection
                    company={company}
                    isIndividual={false}
                    {...priceTiersProps}
                  />
                )}

                {/* Wine Orders tab expanded: show contact summary + discount */}
                {expanded && activeModule === 'WINE_ORDER' && (
                  <div className="px-5 pb-5 pt-3" style={{ backgroundColor: '#faf5ef', borderTop: `1px solid ${C.border}` }}>
                    <div className="flex flex-wrap gap-4 text-xs" style={{ color: C.muted }}>
                      {company.contactName && <span>{at('companies.wineOrdersTab.contact')} <span style={{ color: C.text }}>{company.contactName}</span></span>}
                      {company.contactPhone && <span>{at('companies.wineOrdersTab.phone')} <span style={{ color: C.text }}>{company.contactPhone}</span></span>}
                      {company.contactEmail && <span>{at('companies.wineOrdersTab.email')} <span style={{ color: C.text }}>{company.contactEmail}</span></span>}
                      {company.wineDiscountPercent != null && company.wineDiscountPercent > 0 && (
                        <span className="px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                          −{company.wineDiscountPercent}% {at('companies.wineOrdersTab.wineDiscount')}
                        </span>
                      )}
                      {!company.contactName && !company.contactPhone && !company.contactEmail && !company.wineDiscountPercent && (
                        <p style={{ color: C.faint }}>{at('companies.wineOrdersTab.noContact')}</p>
                      )}
                    </div>
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
