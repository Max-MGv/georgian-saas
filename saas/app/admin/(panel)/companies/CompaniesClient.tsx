'use client'

import { useEffect, useRef, useState } from 'react'
import { createCompany, updateCompany, deleteCompany, regenerateAccessCode, setAccessCode } from '@/app/actions/companies'
import { createPrice, updatePrice, deletePrice, setDisplayPrice } from '@/app/actions/prices'
import { asTetri, fromMajor, toMajor, formatTetri, type Tetri } from '@/lib/money'
import {
  createPerson, updatePerson, deletePerson, regeneratePersonCode,
} from '@/app/actions/companyPeople'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'
import { comboRatePerPerson } from '@/lib/pricingUtils'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

type Price = {
  id: string
  minGuests: number
  maxGuests: number
  // TETRI. These come straight off the DB row; the tier form converts to and
  // from GEL at its inputs (chunk 3).
  pricePerPerson: Tetri
  tastingLunchPricePerPerson: Tetri
  registrationPrice: Tetri
  isDisplayPrice: boolean
}
/** One person at this company, in one role. Replaces the separate Guide/Representative types. */
type Person = {
  id: string
  roleId: string
  name: string
  phone: string | null
  email: string | null
  /** Null unless the tenant has person codes switched on. Never rendered when they are off. */
  code: string | null
}
/** Just enough of a ContactRole to label and group a list. */
type RoleLite = { id: string; key: string; labelEn: string; labelKa: string; sortOrder: number }
type Company = {
  id: string
  name: string
  isIndividual: boolean
  isBookingCompany: boolean
  isWineOrderCompany: boolean
  wineDiscountPercent: number | null
  // Per-company payment override (#148). null = follow the tenant's Companies
  // section toggle; true = always skip (trusted); false = always require.
  skipPayment: boolean | null
  identificationCode: string | null
  address: string | null
  accessCode: string | null
  orderCount: number
  prices: Price[]
  people: Person[]
}

type Module = 'BOOKING' | 'WINE_ORDER'

// Same trigger rule as getFinishDetailsStatus() (app/actions/onboarding.ts) —
// keep both in sync if this changes. Pricing only counts against a company if
// it's actually a booking company; wine-order-only companies never use price
// tiers at all, so flagging them for "no pricing" would be a false positive.
function missingDetails(at: (key: string) => string, company: Company): string[] {
  const missing: string[] = []
  if (company.identificationCode === null) missing.push(at('companies.missing.idCode'))
  // Was three scalar columns; now it is simply whether anyone is on file. `address` still
  // counts, because a company with a billing address and no named person is configured enough
  // to invoice.
  if (company.people.length === 0 && !company.address) {
    missing.push(at('companies.missing.contact'))
  }
  if (company.isBookingCompany && company.prices.length === 0) missing.push(at('companies.missing.pricing'))
  return missing
}

const inputStyle = {
  backgroundColor: 'var(--site-surface)', border: `1px solid ${C.border}`,
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
  // The inputs hold GEL, because that is what an admin types. Everything
  // below this component is tetri; fromMajor/toMajor are the boundary.
  const [pricePerPerson, setPricePerPerson] = useState(initial ? String(toMajor(asTetri(initial.pricePerPerson))) : '')
  const [tastingLunchPrice, setTastingLunchPrice] = useState(initial ? String(toMajor(asTetri(initial.tastingLunchPricePerPerson))) : '')
  const [registrationPrice, setRegistrationPrice] = useState(initial ? String(toMajor(asTetri(initial.registrationPrice))) : '0')

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
            pricePerPerson: fromMajor(Number(pricePerPerson)),
            tastingLunchPricePerPerson: fromMajor(tastingLunchPrice === '' ? 0 : Number(tastingLunchPrice)),
            registrationPrice: fromMajor(registrationPrice === '' ? 0 : Number(registrationPrice)),
          })}
          disabled={loading}
          className="btn-wine text-xs px-3 py-2 rounded-lg font-medium"
        >{at('settings.common.save')}</button>
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
      </div>
    </div>
  )
}

// ── Guides & Representatives (Plan-CompanyGuidesAndReps) ───────────────────
// Compact per-row code control — show/hide, copy, regenerate — same interaction
// pattern as the company-level access code field in EditPanel below, just sized
// for a list row instead of the panel's full-width field.
function PersonCodeField({ code, onRegenerate, loading, locale }: {
  code: string; onRegenerate: () => void; loading: boolean; locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-xs px-2 py-1 rounded"
        style={{ backgroundColor: 'var(--site-surface)', border: `1px solid ${C.border}`, fontFamily: 'monospace', color: C.text, letterSpacing: showCode ? '0.05em' : undefined }}
      >
        {showCode ? code : '••••••••'}
      </span>
      <button type="button" onClick={() => setShowCode(s => !s)} className="text-xs px-1.5 py-1 rounded border" style={{ borderColor: C.border, color: C.faint }}>
        {showCode ? at('companies.editPanel.hide') : at('companies.editPanel.show')}
      </button>
      <button type="button" onClick={handleCopy} className="text-xs px-1.5 py-1 rounded border" style={{ borderColor: C.border, color: copied ? '#15803d' : C.faint }}>
        {copied ? at('companies.editPanel.copied') : at('companies.editPanel.copy')}
      </button>
      <button type="button" onClick={onRegenerate} disabled={loading} className="text-xs px-1.5 py-1 rounded border" style={{ borderColor: C.border, color: C.faint }}>
        {at('companies.editPanel.generateNewCode')}
      </button>
    </div>
  )
}

function PersonForm({ initial, onSave, onCancel, loading, locale }: {
  initial?: Person
  onSave: (data: { name: string; phone: string; email: string }) => void
  onCancel: () => void
  loading: boolean
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SmallInput label={at('companies.people.name')} value={name} onChange={setName} width={160} />
      <SmallInput label={at('companies.people.phone')} value={phone} onChange={setPhone} width={150} />
      <SmallInput label={at('companies.people.email')} value={email} onChange={setEmail} width={180} />
      <div className="flex gap-2 pb-0.5">
        <button onClick={() => onSave({ name, phone, email })} disabled={loading || !name.trim()} className="btn-wine text-xs px-3 py-2 rounded-lg font-medium">{at('settings.common.save')}</button>
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
      </div>
    </div>
  )
}

/**
 * One role's people, for one company.
 *
 * Replaces `GuidesSection` and `RepresentativesSection`, which were ~75 lines each and differed
 * only in which action they called and whether the form had an email box. Rendering this once
 * per role is what makes "add a contact type" an admin action: a new role appears here with no
 * code change at all.
 *
 * Every role gets the same three fields (name, phone, email) rather than a per-role field set.
 * The old split — guides had no email, representatives had no reason to be called during a
 * visit — was a guess baked into a table definition, and it is the kind of guess that needs a
 * migration to undo. An unused box is cheap; a missing column is not.
 */
function PeopleSection({ companyId, role, people, setPeople, personCodesOn, locale }: {
  companyId: string
  role: RoleLite
  people: Person[]
  setPeople: (p: Person[]) => void
  personCodesOn: boolean
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mine = people.filter(p => p.roleId === role.id)
  const roleLabel = locale === 'ka' ? role.labelKa : role.labelEn

  async function handleAdd(data: { name: string; phone: string; email: string }) {
    setLoading(true); setError('')
    const result = await createPerson(companyId, role.id, data)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); return }
    if ('person' in result && result.person) setPeople([...people, result.person as Person])
    setAdding(false)
  }

  async function handleUpdate(id: string, data: { name: string; phone: string; email: string }) {
    setLoading(true); setError('')
    const result = await updatePerson(id, companyId, data)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); return }
    setPeople(people.map(p => p.id === id
      ? { ...p, name: data.name, phone: data.phone || null, email: data.email || null }
      : p))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    setLoading(true); setError('')
    const result = await deletePerson(id, companyId)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); setDeletingId(null); return }
    setPeople(people.filter(p => p.id !== id))
    setDeletingId(null)
  }

  async function handleRegenerate(id: string) {
    setLoading(true); setError('')
    const result = await regeneratePersonCode(id, companyId)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); return }
    if ('code' in result) setPeople(people.map(p => p.id === id ? { ...p, code: result.code as string } : p))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{roleLabel}</p>
        <HelpHint text={at('companies.people.roleHint')} />
      </div>
      {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
      {mine.length === 0 && !adding && (
        <p className="text-xs" style={{ color: C.faint }}>{at('companies.people.noneYet')}</p>
      )}
      {mine.map(person => (
        <div key={person.id}>
          {editingId === person.id ? (
            <PersonForm initial={person} onSave={data => handleUpdate(person.id, data)} onCancel={() => setEditingId(null)} loading={loading} locale={locale} />
          ) : deletingId === person.id ? (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: C.muted }}>{at('companies.people.deleteConfirm')}</span>
              <button onClick={() => handleDelete(person.id)} disabled={loading} className="px-3 py-1 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#b91c1c' }}>{at('orders.yes')}</button>
              <button onClick={() => setDeletingId(null)} className="px-3 py-1 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span style={{ color: C.text }}>{person.name}</span>
              {person.phone && <span className="text-xs" style={{ color: C.faint }}>{person.phone}</span>}
              {person.email && <span className="text-xs" style={{ color: C.faint }}>{person.email}</span>}
              {/* Only when the tenant actually uses person codes. A code control for a feature
                  that is switched off is a live-looking credential nothing accepts — the same
                  trap as an access code the panel kept displaying after guides retired it. */}
              {personCodesOn && person.code && (
                <PersonCodeField code={person.code} onRegenerate={() => handleRegenerate(person.id)} loading={loading} locale={locale} />
              )}
              <button onClick={() => setEditingId(person.id)} className="text-xs px-2 py-1 rounded border ml-auto" style={{ borderColor: C.border, color: C.muted }}>{at('companies.priceTiers.edit')}</button>
              <button onClick={() => setDeletingId(person.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <PersonForm onSave={handleAdd} onCancel={() => setAdding(false)} loading={loading} locale={locale} />
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs px-3 py-1.5 rounded-lg border w-fit" style={{ borderColor: C.border, color: C.muted }}>
          {at('companies.people.addTo').replace('{role}', roleLabel)}
        </button>
      )}
    </div>
  )
}

// ── Edit slide-over panel ──────────────────────────────────────────────────
function EditPanel({ company, onClose, onSaved, locale, paymentModuleOn, roles, personCodesOn }: {
  company: Company
  onClose: () => void
  onSaved: (updated: Partial<Company>) => void
  locale: string
  paymentModuleOn: boolean
  roles: RoleLite[]
  personCodesOn: boolean
}) {
  const at = (key: string) => adminT(locale, key)
  const [name, setName] = useState(company.name)
  const [idCode, setIdCode] = useState(company.identificationCode ?? '')
  const [address, setAddress] = useState(company.address ?? '')
  const [code, setCode] = useState(company.accessCode ?? '')
  const [isBooking, setIsBooking] = useState(company.isBookingCompany)
  const [isWineOrder, setIsWineOrder] = useState(company.isWineOrderCompany)
  const [wineDiscount, setWineDiscount] = useState(company.wineDiscountPercent != null ? String(company.wineDiscountPercent) : '')
  // #148 — three-way override, stored as null/true/false; the UI works with a
  // string so "no override" is a distinct selectable state, not just "unchecked".
  const [skipPayment, setSkipPayment] = useState<'default' | 'skip' | 'require'>(
    company.skipPayment === true ? 'skip' : company.skipPayment === false ? 'require' : 'default'
  )
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [people, setPeopleState] = useState(company.people)
  // Guides/reps are edited live in this panel (unlike the other fields, which only save on the
  // main Save button) — propagate to the parent's list immediately so reopening the panel later
  // in the same session doesn't show a stale list.
  function setPeople(next: Person[]) { setPeopleState(next); onSaved({ people: next }) }

  async function handleSave() {
    if (!isBooking && !isWineOrder) {
      setError(at('companies.editPanel.mustHaveModule'))
      return
    }
    setLoading(true); setError('')
    const parsedDiscount = wineDiscount.trim() !== '' ? parseFloat(wineDiscount) : null
    // Only sent when the control is actually rendered (paymentModuleOn) — when
    // it isn't, `undefined` tells updateCompany to leave skipPayment untouched.
    const parsedSkipPayment = paymentModuleOn
      ? (skipPayment === 'skip' ? true : skipPayment === 'require' ? false : null)
      : undefined
    const result = await updateCompany(company.id, {
      name, identificationCode: idCode, address,
      isBookingCompany: isBooking,
      isWineOrderCompany: isWineOrder,
      wineDiscountPercent: parsedDiscount,
      skipPayment: parsedSkipPayment,
    })
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    onSaved({
      name: name.trim(),
      identificationCode: idCode.trim() || null,
      address: address.trim() || null,
      isBookingCompany: isBooking,
      isWineOrderCompany: isWineOrder,
      wineDiscountPercent: parsedDiscount,
      ...(parsedSkipPayment !== undefined ? { skipPayment: parsedSkipPayment } : {}),
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
        style={{ width: '420px', maxWidth: '100vw', backgroundColor: 'var(--site-surface)', borderLeft: `1px solid ${C.border}` }}
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

          {/* Payment override (#148) — one field covers both bookings and wine
              orders for this company. Hidden entirely when the tenant's online-
              payment module is off, same as the Settings card. */}
          {paymentModuleOn && (
            <>
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.payment')}</p>
                <p className="text-xs" style={{ color: C.muted }}>{at('companies.editPanel.paymentHint')}</p>
                <div className="flex gap-2">
                  {(['default', 'skip', 'require'] as const).map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSkipPayment(option)}
                      className="text-xs px-3 py-2.5 md:py-2 min-h-10 md:min-h-0 rounded-lg font-medium flex-1"
                      style={skipPayment === option
                        ? { backgroundColor: C.wine, color: '#fff', border: `1px solid ${C.wine}` }
                        : { backgroundColor: 'var(--site-surface)', color: C.muted, border: `1px solid ${C.border}` }}
                    >
                      {at(`companies.editPanel.payment${option === 'default' ? 'Default' : option === 'skip' ? 'Skip' : 'Require'}`)}
                    </button>
                  ))}
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
            {/* The three company contact columns are gone (Plan-ContactRoles Chunk 1). The
                people lists below replace them — a company's contact person is now a row in a
                role, so there is one place to edit it rather than two that could disagree. */}
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
          {/* One section per active role, in the tenant's own order. A role added on the
              settings screen shows up here with no code change — which is the point of the
              whole rework. Previously this was two hardcoded sections. */}
          {roles.map(role => (
            <div key={role.id} className="contents">
              <div className="h-px" style={{ backgroundColor: C.border }} />
              <PeopleSection
                companyId={company.id}
                role={role}
                people={people}
                setPeople={setPeople}
                personCodesOn={personCodesOn}
                locale={locale}
              />
            </div>
          ))}
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
              <span className="text-xs" style={{ color: C.faint }}>{at('companies.priceTiers.tasting')} <span className="font-semibold" style={{ color: C.wine }}>{formatTetri(asTetri(price.pricePerPerson))}/pp</span></span>
              <span className="text-xs" style={{ color: C.faint }}>{at('companies.priceTiers.lunch')} <span className="font-semibold" style={{ color: C.wine }}>{formatTetri(asTetri(comboRatePerPerson(price)))}/pp</span></span>
              {price.registrationPrice > 0 && <span className="text-xs" style={{ color: C.faint }}>+{formatTetri(asTetri(price.registrationPrice))} {at('companies.priceTiers.flatFeeSuffix')}</span>}

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
export default function CompaniesClient({ companies: initial, roles = [], personCodesOn = false, bookingOn = true, wineOrdersOn = false, paymentModuleOn = false, locale = 'en' }: { companies: Company[]; roles?: RoleLite[]; personCodesOn?: boolean; bookingOn?: boolean; wineOrdersOn?: boolean; paymentModuleOn?: boolean; locale?: string }) {
  const at = (key: string) => adminT(locale, key)
  const availableModules: Module[] = [
    ...(bookingOn ? (['BOOKING'] as const) : []),
    ...(wineOrdersOn ? (['WINE_ORDER'] as const) : []),
  ]
  const [companies, setCompanies] = useState(initial)
  const [activeModule, setActiveModule] = useState<Module>(availableModules[0] ?? 'BOOKING')
  // `?expand=first` opens the first company in the list on arrival.
  //
  // The rate ladders are the proof this screen exists to show, and every row
  // arrives collapsed — so a deep link into it landed on six instances of
  // "2 tiers" in grey microtext and nothing else (Plan-DemoFlowFixes Chunk 4,
  // task 4.6). Resolved lazily in the initialiser so it costs nothing on a
  // normal visit, and it is a plain deep-link parameter rather than demo
  // chrome: any link into this page can use it.
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

  // Applied in an effect, not during render: `visibleCompanies` depends on the
  // active module tab, which is not known until after mount.
  const appliedExpandParam = useRef(false)
  useEffect(() => {
    if (appliedExpandParam.current) return
    if (visibleCompanies.length === 0) return
    if (new URLSearchParams(window.location.search).get('expand') !== 'first') return
    appliedExpandParam.current = true
    setExpandedId(visibleCompanies[0].id)
  }, [visibleCompanies])

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
          roles={roles}
          personCodesOn={personCodesOn}
          paymentModuleOn={paymentModuleOn}
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
                    {formatTetri(asTetri(displayTier.pricePerPerson))} / {formatTetri(asTetri(comboRatePerPerson(displayTier)))} {at('companies.individuals.shownOnSite')}
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
        <button onClick={() => setAdding(true)} className="btn-wine px-4 py-2 min-h-10 md:min-h-0 rounded-lg text-sm font-medium mb-4">
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
        <div data-tour="company-rates" className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          {visibleCompanies.map((company, i) => {
            const expanded = expandedId === company.id
            const isInBoth = company.isBookingCompany && company.isWineOrderCompany
            const missing = missingDetails(at, company)
            return (
              <div key={company.id} style={{ borderBottom: i < visibleCompanies.length - 1 ? `1px solid ${C.border}` : 'none', backgroundColor: '#ffffff' }}>
                <div className="flex items-center px-5 py-4 gap-4">
                  {/* The summary button stops before the "needs details" hint.
                      HelpHint renders a <button>, and a button inside a button
                      is invalid HTML: the parser relocates the inner one, so
                      the server's tree and the client's disagree and every
                      /admin/companies load logged a hydration mismatch
                      (KnownBugs #15). Same shape the Individuals row above
                      already uses. Visual order is unchanged — the pieces below
                      simply sit beside the button rather than inside it. */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    onClick={() => setExpandedId(expanded ? null : company.id)}
                    className="flex items-center gap-2 text-left min-w-0"
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
                  </button>
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
                  </div>

                  {deletingId === company.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: C.muted }}>{at('companies.deleteConfirm')}</span>
                      <button onClick={() => handleDelete(company.id)} disabled={loading} className="text-sm px-3 py-2.5 md:py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>{loading ? at('companies.deleting') : at('companies.yesDelete')}</button>
                      <button onClick={() => setDeletingId(null)} disabled={loading} className="text-sm px-3 py-2.5 md:py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingCompany(company)}
                        className="text-sm px-3 py-2.5 md:py-1.5 rounded-lg border"
                        style={{ borderColor: C.border, color: C.muted }}
                      >{at('companies.priceTiers.edit')}</button>
                      <button onClick={() => setDeletingId(company.id)} className="text-sm px-3 py-2.5 md:py-1.5 rounded-lg border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
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
                      {/* Was three scalar columns; now the first person on file. A company can
                          have several, but this is a one-line summary — the edit panel is where
                          the full list lives. */}
                      {company.people[0]?.name && <span>{at('companies.wineOrdersTab.contact')} <span style={{ color: C.text }}>{company.people[0].name}</span></span>}
                      {company.people[0]?.phone && <span>{at('companies.wineOrdersTab.phone')} <span style={{ color: C.text }}>{company.people[0].phone}</span></span>}
                      {company.people[0]?.email && <span>{at('companies.wineOrdersTab.email')} <span style={{ color: C.text }}>{company.people[0].email}</span></span>}
                      {company.wineDiscountPercent != null && company.wineDiscountPercent > 0 && (
                        <span className="px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                          −{company.wineDiscountPercent}% {at('companies.wineOrdersTab.wineDiscount')}
                        </span>
                      )}
                      {company.people.length === 0 && !company.wineDiscountPercent && (
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
