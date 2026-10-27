'use client'

import { useEffect, useRef, useState } from 'react'
import { createCompany, updateCompany, deleteCompany, regenerateAccessCode, setAccessCode } from '@/app/actions/companies'
import { createPrice, updatePrice, deletePrice, setDisplayPrice, setRegistrationFee } from '@/app/actions/prices'
import { asTetri, fromMajor, toMajor, formatTetri, parseMajor, type Tetri } from '@/lib/money'
import {
  createPerson, updatePerson, deletePerson, regeneratePersonCode,
} from '@/app/actions/companyPeople'
import { createAddress, updateAddress, deleteAddress } from '@/app/actions/companyAddresses'
import { setCompanyWinePrice } from '@/app/actions/companyWinePrices'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

type Price = {
  id: string
  minGuests: number
  maxGuests: number
  // TETRI. These come straight off the DB row; the tier form converts to and
  // from GEL at its inputs (chunk 3). Product model (T-152): null = not offered;
  // tastingLunchPrice is the ALL-IN price for tasting and lunch.
  tastingOnlyPrice: Tetri | null
  lunchOnlyPrice: Tetri | null
  tastingLunchPrice: Tetri | null
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
/** One delivery address of this company (T-13). The customer picks one on the wine form. */
type CompanyAddressRow = {
  id: string
  label: string | null
  address: string
  workingHours: string | null
  /** Delivery zone (T-8) — its fee fills in on the wine form. */
  deliveryZoneId: string | null
}
/** A delivery zone, as much as the address form needs. */
type ZoneLite = { id: string; nameEn: string; nameKa: string | null }
/** Just enough of a ContactRole to label and group a list. */
type RoleLite = { id: string; key: string; labelEn: string; labelKa: string; sortOrder: number }
type Company = {
  id: string
  name: string
  isIndividual: boolean
  isBookingCompany: boolean
  isWineOrderCompany: boolean
  wineDiscountPercent: number | null
  /** Flat fee per booking, TETRI (T-152 D-6). Always 0 on the Individuals row — individuals are never charged one. */
  registrationFee: Tetri
  /** T-12 — label + filter only. */
  isExporter: boolean
  /** T-12 — negotiated price per vintage id (tetri). Exceptions only. */
  winePrices: Record<string, number>
  // Per-company payment override (#148). null = follow the tenant's Companies
  // section toggle; true = always skip (trusted); false = always require.
  skipPayment: boolean | null
  identificationCode: string | null
  addresses: CompanyAddressRow[]
  accessCode: string | null
  orderCount: number
  wineOrderCount: number
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
  // Was three scalar columns; now it is simply whether anyone is on file. An address still
  // counts, because a company with an address and no named person is configured enough to
  // invoice. (Was the single Company.address column until T-13.)
  if (company.people.length === 0 && company.addresses.length === 0) {
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

/** The price columns of a tier row, in display order. Individuals have no Lunch only (Plan-PricingModel D-5). */
function tierPriceLabels(isIndividual: boolean): [string, 'tastingOnlyPrice' | 'lunchOnlyPrice' | 'tastingLunchPrice'][] {
  return [
    ['companies.priceTiers.tastingOnly', 'tastingOnlyPrice'],
    ...(isIndividual ? [] : [['companies.priceTiers.lunchOnly', 'lunchOnlyPrice'] as [string, 'lunchOnlyPrice']]),
    ['companies.priceTiers.tastingLunch', 'tastingLunchPrice'],
  ]
}

function PriceForm({
  initial, onSave, onCancel, loading, locale, isIndividual,
}: {
  initial?: Price; onSave: (data: Omit<Price, 'id' | 'isDisplayPrice'>) => void; onCancel: () => void; loading: boolean; locale: string
  /** Individuals have no Lunch only price (Plan-PricingModel D-5), so its box is not shown. */
  isIndividual: boolean
}) {
  const at = (key: string) => adminT(locale, key)
  const [minGuests, setMinGuests] = useState(String(initial?.minGuests ?? 1))
  const [maxGuests, setMaxGuests] = useState(String(initial?.maxGuests ?? 10))
  // The inputs hold GEL, because that is what an admin types. Everything below this component is tetri;
  // parseMajor/toMajor are the boundary. Three ALL-IN prices per row (T-152): an empty box is "not offered"
  // (null), which only Lunch only may be for now — see tierPricesProblem() in app/actions/prices.ts.
  const majorOf = (v: Tetri | null | undefined) => (v == null ? '' : String(toMajor(asTetri(v))))
  const [tastingOnly, setTastingOnly] = useState(majorOf(initial?.tastingOnlyPrice))
  const [lunchOnly, setLunchOnly] = useState(majorOf(initial?.lunchOnlyPrice))
  const [tastingLunch, setTastingLunch] = useState(majorOf(initial?.tastingLunchPrice))
  const [formError, setFormError] = useState('')

  function save() {
    const t = parseMajor(tastingOnly), tl = parseMajor(tastingLunch)
    if (t == null || tl == null) { setFormError(at('companies.priceForm.required')); return }
    setFormError('')
    onSave({
      minGuests: Number(minGuests), maxGuests: Number(maxGuests),
      tastingOnlyPrice: t,
      lunchOnlyPrice: isIndividual ? null : parseMajor(lunchOnly),
      tastingLunchPrice: tl,
    })
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <SmallInput label={at('companies.priceForm.minGuests')} value={minGuests} onChange={setMinGuests} type="number" width={72} />
        <SmallInput label={at('companies.priceForm.maxGuests')} value={maxGuests} onChange={setMaxGuests} type="number" width={72} />
        <SmallInput label={at('companies.priceForm.tastingOnlyPP')} value={tastingOnly} onChange={setTastingOnly} type="number" width={130} />
        {!isIndividual && (
          <SmallInput label={at('companies.priceForm.lunchOnlyPP')} value={lunchOnly} onChange={setLunchOnly} type="number" width={130} />
        )}
        <SmallInput label={at('companies.priceForm.tastingLunchAllInPP')} value={tastingLunch} onChange={setTastingLunch} type="number" width={150} />
        <div className="flex gap-2 pb-0.5">
          <button onClick={save} disabled={loading} className="btn-wine text-xs px-3 py-2 rounded-lg font-medium">{at('settings.common.save')}</button>
          <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
        </div>
      </div>
      {!isIndividual && <p className="text-xs mt-1.5" style={{ color: C.faint }}>{at('companies.priceForm.lunchOnlyHint')}</p>}
      {formError && <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{formError}</p>}
    </div>
  )
}

/**
 * The company's flat registration fee per booking (T-152 D-6) — one number for the company, not per tier.
 * Shown under the tiers for companies only; individuals are never charged one.
 */
function RegistrationFeeRow({ company, locale, onSaved }: {
  company: Company; locale: string; onSaved: (companyId: string, fee: Tetri) => void
}) {
  const at = (key: string) => adminT(locale, key)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(toMajor(company.registrationFee)))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    const fee = value.trim() === '' ? asTetri(0) : parseMajor(value)
    if (fee == null || fee < 0) { setErr(at('companies.registrationFee.hint')); return }
    setSaving(true); setErr('')
    const result = await setRegistrationFee(company.id, fee)
    setSaving(false)
    if ('error' in result) { setErr(result.error ?? ''); return }
    onSaved(company.id, fee)
    setEditing(false)
  }

  return (
    <div className="mt-3 pt-3 flex flex-wrap items-center gap-3" style={{ borderTop: `1px dashed ${C.border}` }}>
      <span className="text-xs" style={{ color: C.muted }}>{at('companies.registrationFee.label')}</span>
      {editing ? (
        <>
          <input type="number" min="0" value={value} onChange={e => setValue(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          <button onClick={save} disabled={saving} className="btn-wine text-xs px-3 py-1.5 rounded-lg font-medium">{at('settings.common.save')}</button>
          <button
            onClick={() => { setEditing(false); setErr(''); setValue(String(toMajor(company.registrationFee))) }}
            className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}
          >{at('settings.common.cancel')}</button>
          <span className="text-xs w-full" style={{ color: C.faint }}>{at('companies.registrationFee.hint')}</span>
        </>
      ) : (
        <>
          <span className="text-xs font-semibold" style={{ color: C.wine }}>
            {company.registrationFee > 0 ? formatTetri(company.registrationFee) : at('companies.registrationFee.none')}
          </span>
          <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>{at('companies.priceTiers.edit')}</button>
        </>
      )}
      {err && <span className="text-xs w-full" style={{ color: '#b91c1c' }}>{err}</span>}
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

type AddressFormData = { label: string; address: string; workingHours: string; deliveryZoneId: string | null }

function AddressForm({ initial, onSave, onCancel, loading, locale, zones }: {
  initial?: CompanyAddressRow
  onSave: (data: AddressFormData) => void
  onCancel: () => void
  loading: boolean
  locale: string
  zones: ZoneLite[]
}) {
  const at = (key: string) => adminT(locale, key)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [workingHours, setWorkingHours] = useState(initial?.workingHours ?? '')
  const [zoneId, setZoneId] = useState(initial?.deliveryZoneId ?? '')
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SmallInput label={at('companies.addresses.label')} value={label} onChange={setLabel} width={130} />
      <SmallInput label={at('companies.addresses.address')} value={address} onChange={setAddress} width={220} />
      <SmallInput label={at('companies.addresses.hours')} value={workingHours} onChange={setWorkingHours} width={120} />
      {/* Only once the winery has zones (Settings → Wine Orders — Delivery & Minimum). */}
      {zones.length > 0 && (
        <div className="flex flex-col gap-1">
          <label style={{ fontSize: '0.7rem', color: C.faint }}>{at('companies.addresses.zone')}</label>
          <select value={zoneId} onChange={e => setZoneId(e.target.value)} style={{ ...inputStyle, width: 150 }}>
            <option value="">{at('companies.addresses.zoneNone')}</option>
            {zones.map(z => <option key={z.id} value={z.id}>{(locale === 'ka' && z.nameKa) || z.nameEn}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2 pb-0.5">
        <button onClick={() => onSave({ label, address, workingHours, deliveryZoneId: zoneId || null })} disabled={loading || !address.trim()} className="btn-wine text-xs px-3 py-2 rounded-lg font-medium">{at('settings.common.save')}</button>
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
      </div>
    </div>
  )
}

/**
 * A company's delivery addresses (T-13, vault/Plan-WineOrderFeatures.md). Replaces the single
 * Address field. Same live-edit shape as `PeopleSection`: each row saves on its own, not on the
 * panel's main Save button.
 */
function AddressesSection({ companyId, addresses, setAddresses, locale, zones }: {
  companyId: string
  addresses: CompanyAddressRow[]
  setAddresses: (a: CompanyAddressRow[]) => void
  locale: string
  zones: ZoneLite[]
}) {
  const zoneName = (id: string | null) => {
    const z = id ? zones.find(zz => zz.id === id) : null
    return z ? (locale === 'ka' && z.nameKa) || z.nameEn : null
  }
  const at = (key: string) => adminT(locale, key)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd(data: AddressFormData) {
    setLoading(true); setError('')
    const result = await createAddress(companyId, data)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); return }
    setAddresses([...addresses, result.address])
    setAdding(false)
  }

  async function handleUpdate(id: string, data: AddressFormData) {
    setLoading(true); setError('')
    const result = await updateAddress(id, companyId, data)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); return }
    setAddresses(addresses.map(a => a.id === id
      ? { ...a, label: data.label.trim() || null, address: data.address.trim(), workingHours: data.workingHours.trim() || null, deliveryZoneId: data.deliveryZoneId }
      : a))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    setLoading(true); setError('')
    const result = await deleteAddress(id, companyId)
    setLoading(false)
    if ('error' in result) { setError(result.error ?? ''); setDeletingId(null); return }
    setAddresses(addresses.filter(a => a.id !== id))
    setDeletingId(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.addresses.title')}</p>
        <HelpHint text={at('companies.addresses.hint')} />
      </div>
      {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
      {addresses.length === 0 && !adding && (
        <p className="text-xs" style={{ color: C.faint }}>{at('companies.addresses.noneYet')}</p>
      )}
      {addresses.map(a => (
        <div key={a.id}>
          {editingId === a.id ? (
            <AddressForm initial={a} onSave={data => handleUpdate(a.id, data)} onCancel={() => setEditingId(null)} loading={loading} locale={locale} zones={zones} />
          ) : deletingId === a.id ? (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: C.muted }}>{at('companies.addresses.deleteConfirm')}</span>
              <button onClick={() => handleDelete(a.id)} disabled={loading} className="px-3 py-1 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: '#b91c1c' }}>{at('orders.yes')}</button>
              <button onClick={() => setDeletingId(null)} className="px-3 py-1 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 break-words" style={{ color: C.text }}>
                {a.label && <span className="font-medium">{a.label} — </span>}
                {a.address}
              </span>
              {a.workingHours && <span className="text-xs" style={{ color: C.faint }}>{a.workingHours}</span>}
              {zoneName(a.deliveryZoneId) && (
                <span className="text-xs px-1.5 py-0.5 rounded border" style={{ borderColor: C.border, color: C.muted }}>{zoneName(a.deliveryZoneId)}</span>
              )}
              <button onClick={() => setEditingId(a.id)} className="text-xs px-2 py-1 rounded border ml-auto" style={{ borderColor: C.border, color: C.muted }}>{at('companies.priceTiers.edit')}</button>
              <button onClick={() => setDeletingId(a.id)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{at('companies.priceTiers.delete')}</button>
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <AddressForm onSave={handleAdd} onCancel={() => setAdding(false)} loading={loading} locale={locale} zones={zones} />
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs px-3 py-1.5 rounded-lg border w-fit" style={{ borderColor: C.border, color: C.muted }}>
          {at('companies.addresses.add')}
        </button>
      )}
    </div>
  )
}

/** One vintage as the price list needs it (T-12). `price` is the standard price, tetri; `wineId` / `wineName` / `year` group the list by wine. */
type VintageLite = { id: string; label: string; wineId: string; wineName: string; year: number; price: number }

/**
 * Negotiated prices (T-12, vault/Plan-WineOrderFeatures.md Chunk 9) — every active vintage with
 * its standard price greyed; type a price to negotiate it (bold), clear it or press "Standard"
 * to go back. Exceptions only: only typed prices are stored. Saves per row, live, like the
 * addresses and people lists.
 *
 * Grows with wines × years, so (Max, 2026-10-25) the whole section is collapsed until opened, and inside it the vintages sit
 * under their wine (Rkatsiteli → 2023, 2026…). A wine that already has an agreed price starts open; the rest start closed.
 */
function WinePricesSection({ companyId, vintages, prices, setPrices, locale }: {
  companyId: string
  vintages: VintageLite[]
  prices: Record<string, number>
  setPrices: (p: Record<string, number>) => void
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sectionOpen, setSectionOpen] = useState(false)

  // The vintages under their wine, in the order the wines come (the list is already sorted by the winery's wine order, newest year first).
  const groups: { id: string; name: string; items: VintageLite[] }[] = []
  for (const v of vintages) {
    const g = groups.find(x => x.id === v.wineId)
    if (g) g.items.push(v); else groups.push({ id: v.wineId, name: v.wineName, items: [v] })
  }
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.filter(g => g.items.some(v => prices[v.id] !== undefined)).map(g => [g.id, true])))
  const agreedTotal = vintages.filter(v => prices[v.id] !== undefined).length

  async function save(vintageId: string, text: string) {
    const trimmed = text.trim()
    const price = trimmed === '' ? null : parseMajor(trimmed)
    if (trimmed !== '' && (price === null || price < 0)) { setError(at('companies.winePrices.invalid')); return }
    const current = prices[vintageId] ?? null
    if (price === current) return
    setBusyId(vintageId); setError('')
    const r = await setCompanyWinePrice(companyId, vintageId, price)
    setBusyId(null)
    if ('error' in r) { setError(r.error); return }
    const next = { ...prices }
    if (price === null) delete next[vintageId]; else next[vintageId] = price
    setPrices(next)
    setDrafts(d => { const { [vintageId]: _drop, ...rest } = d; return rest })
  }

  if (vintages.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSectionOpen(o => !o)} aria-expanded={sectionOpen}
          className="flex items-center gap-2 text-left" data-testid="wine-prices-toggle">
          <span aria-hidden="true" className="text-xs w-3" style={{ color: C.faint }}>{sectionOpen ? '▾' : '▸'}</span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.winePrices.title')}</span>
          <span className="text-xs" style={{ color: agreedTotal > 0 ? C.wine : C.faint, fontWeight: agreedTotal > 0 ? 600 : 400 }}>
            {agreedTotal > 0 ? adminT(locale, 'companies.winePrices.agreedCount', { n: agreedTotal }) : at('companies.winePrices.noneAgreed')}
          </span>
        </button>
        <HelpHint text={at('companies.winePrices.hint')} />
      </div>
      {error && <p className="text-xs" style={{ color: '#b91c1c' }}>{error}</p>}
      {sectionOpen && groups.map(g => {
        const groupOpen = openGroups[g.id] === true
        const groupAgreed = g.items.filter(v => prices[v.id] !== undefined).length
        return (
          <div key={g.id} className="rounded-lg border" style={{ borderColor: C.border }}>
            <button type="button" onClick={() => setOpenGroups(o => ({ ...o, [g.id]: !groupOpen }))} aria-expanded={groupOpen}
              data-testid={`wine-group-${g.id}`} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm">
              <span aria-hidden="true" className="text-xs w-3" style={{ color: C.faint }}>{groupOpen ? '▾' : '▸'}</span>
              <span className="min-w-0 flex-1 break-words font-medium" style={{ color: C.text }}>{g.name}</span>
              {groupAgreed > 0 && (
                <span className="text-xs font-semibold" style={{ color: C.wine }}>{adminT(locale, 'companies.winePrices.agreedCount', { n: groupAgreed })}</span>
              )}
            </button>
            {groupOpen && (
              <div className="flex flex-col gap-2 px-3 pb-3">
                {g.items.map(v => {
        const negotiated = prices[v.id]
        const draft = drafts[v.id] ?? (negotiated !== undefined ? String(toMajor(asTetri(negotiated))) : '')
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 break-words" style={{ color: C.text, fontWeight: negotiated !== undefined ? 600 : 400 }}>{v.year}</span>
            <span className="text-xs" style={{ color: C.faint, textDecoration: negotiated !== undefined ? 'line-through' : undefined }}>
              {formatTetri(asTetri(v.price))}
            </span>
            <input
              type="number" min={0} step="0.01" inputMode="decimal"
              aria-label={`${v.label} — ${at('companies.winePrices.negotiated')}`}
              placeholder={String(toMajor(asTetri(v.price)))}
              value={draft}
              disabled={busyId === v.id}
              onChange={e => setDrafts(d => ({ ...d, [v.id]: e.target.value }))}
              onBlur={e => save(v.id, e.target.value)}
              style={{ ...inputStyle, width: 80, textAlign: 'right', fontWeight: negotiated !== undefined ? 700 : 400 }}
            />
            <span className="text-xs" style={{ color: C.muted }}>₾</span>
            {negotiated !== undefined && (
              <button type="button" disabled={busyId === v.id} onClick={() => save(v.id, '')}
                className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>
                {at('companies.winePrices.reset')}
              </button>
            )}
          </div>
        )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Edit slide-over panel ──────────────────────────────────────────────────
function EditPanel({ company, onClose, onSaved, locale, paymentModuleOn, roles, personCodesOn, zones, vintages, wineOn }: {
  zones: ZoneLite[]
  vintages: VintageLite[]
  /** The tenant's wine module is on — a booking company then has wine terms too (T-22). */
  wineOn: boolean
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
  const [code, setCode] = useState(company.accessCode ?? '')
  const [isBooking, setIsBooking] = useState(company.isBookingCompany)
  const [isWineOrder, setIsWineOrder] = useState(company.isWineOrderCompany)
  const [wineDiscount, setWineDiscount] = useState(company.wineDiscountPercent != null ? String(company.wineDiscountPercent) : '')
  const [isExporter, setIsExporter] = useState(company.isExporter)
  // Negotiated prices save live, per row — propagated up like addresses and people.
  const [winePrices, setWinePricesState] = useState(company.winePrices)
  function setWinePrices(next: Record<string, number>) { setWinePricesState(next); onSaved({ winePrices: next }) }
  // #148 — three-way override, stored as null/true/false; the UI works with a
  // string so "no override" is a distinct selectable state, not just "unchecked".
  const [skipPayment, setSkipPayment] = useState<'default' | 'skip' | 'require'>(
    company.skipPayment === true ? 'skip' : company.skipPayment === false ? 'require' : 'default'
  )
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // The error line sits at the top of this tall panel; bring it into view when it appears,
  // otherwise a refused Save at the bottom looks like nothing happened. (QA 2026-10-15 F13)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [error])
  const [people, setPeopleState] = useState(company.people)
  // Guides/reps are edited live in this panel (unlike the other fields, which only save on the
  // main Save button) — propagate to the parent's list immediately so reopening the panel later
  // in the same session doesn't show a stale list.
  function setPeople(next: Person[]) { setPeopleState(next); onSaved({ people: next }) }
  // Addresses are edited live too, for the same reason.
  const [addresses, setAddressesState] = useState(company.addresses)
  function setAddresses(next: CompanyAddressRow[]) { setAddressesState(next); onSaved({ addresses: next }) }

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
      name, identificationCode: idCode,
      isBookingCompany: isBooking,
      isWineOrderCompany: isWineOrder,
      wineDiscountPercent: parsedDiscount,
      skipPayment: parsedSkipPayment,
      isExporter,
    })
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    onSaved({
      name: name.trim(),
      identificationCode: idCode.trim() || null,
      isBookingCompany: isBooking,
      isWineOrderCompany: isWineOrder,
      wineDiscountPercent: parsedDiscount,
      isExporter,
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
          {error && <p ref={errorRef} className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}

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

          {/* Wine terms (% off + agreed prices) — for a wine-order company, and since T-22 also for a booking company when the
              wine module is on: the same terms price the wine added to its bookings ("wine for the table", Plan D-5 / D-18). */}
          {(isWineOrder || (isBooking && wineOn)) && (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.wineDiscount')}</p>
                  {/* The same "how the % and agreed prices work together" note as on Wine prices below — so nobody has to remember it. */}
                  <HelpHint text={at('companies.winePrices.hint')} />
                </div>
                <p className="text-xs" style={{ color: C.muted }}>{at('companies.editPanel.wineDiscountHint')}</p>
                {isBooking && <p className="text-xs" style={{ color: C.muted }}>{at('companies.editPanel.tableWineHint')}</p>}
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
                {isWineOrder && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={isExporter} onChange={e => setIsExporter(e.target.checked)} className="rounded" />
                    <span className="text-sm" style={{ color: C.text }}>{at('companies.exporter.label')}</span>
                  </label>
                )}
              </div>
              <div className="h-px" style={{ backgroundColor: C.border }} />
              <WinePricesSection companyId={company.id} vintages={vintages} prices={winePrices} setPrices={setWinePrices} locale={locale} />
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
          </div>
          <div className="h-px" style={{ backgroundColor: C.border }} />
          <AddressesSection companyId={company.id} addresses={addresses} setAddresses={setAddresses} locale={locale} zones={zones} />
          {/* The three company contact columns are gone (Plan-ContactRoles Chunk 1). The people
              lists below replace them — a company's contact person is now a row in a role, so
              there is one place to edit it rather than two that could disagree. (An empty block
              stood here until T-13, drawing a double divider.) */}
          <div className="h-px" style={{ backgroundColor: C.border }} />
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('companies.editPanel.accessCode')}</p>
            <p className="text-xs" style={{ color: C.muted }}>{at('companies.editPanel.accessCodeHint')}</p>
            {!code.trim() && (
              <p className="text-xs rounded px-2 py-1.5" style={{ backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                {at('companies.editPanel.noCodeWarning')}
              </p>
            )}
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
  onRegistrationFeeSaved,
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
  onRegistrationFeeSaved: (companyId: string, fee: Tetri) => void
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
              isIndividual={isIndividual}
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
              {tierPriceLabels(isIndividual).map(([label, field]) => (
                <span key={label} className="text-xs" style={{ color: C.faint }}>
                  {at(label)}{' '}
                  {price[field] == null
                    ? <span style={{ fontStyle: 'italic' }}>{at('companies.priceTiers.notOffered')}</span>
                    : <span className="font-semibold" style={{ color: C.wine }}>{formatTetri(price[field]!)}/pp</span>}
                </span>
              ))}

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
          isIndividual={isIndividual}
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

      {!isIndividual && <RegistrationFeeRow company={company} locale={locale} onSaved={onRegistrationFeeSaved} />}
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
export default function CompaniesClient({ zones = [], vintages = [], companies: initial, roles = [], personCodesOn = false, bookingOn = true, wineOrdersOn = false, paymentModuleOn = false, locale = 'en', initialEditId = null }: { zones?: ZoneLite[]; vintages?: VintageLite[]; companies: Company[]; roles?: RoleLite[]; personCodesOn?: boolean; bookingOn?: boolean; wineOrdersOn?: boolean; paymentModuleOn?: boolean; locale?: string; initialEditId?: string | null }) {
  const at = (key: string) => adminT(locale, key)
  const availableModules: Module[] = [
    ...(bookingOn ? (['BOOKING'] as const) : []),
    ...(wineOrdersOn ? (['WINE_ORDER'] as const) : []),
  ]
  const [companies, setCompanies] = useState(initial)
  // `?edit=<id>` (read by the server page) opens that company's full edit form on
  // arrival — "Add company" lands here right after creating one, so the admin goes
  // straight into the form instead of finding an empty row and pressing Edit (T-6).
  // Lazy initialisers, not an effect, so server and client render the same thing.
  const initialEdit = initialEditId ? initial.find(c => c.id === initialEditId && !c.isIndividual) ?? null : null
  const [activeModule, setActiveModule] = useState<Module>(() =>
    initialEdit && !initialEdit.isBookingCompany && initialEdit.isWineOrderCompany && wineOrdersOn
      ? 'WINE_ORDER'
      : availableModules[0] ?? 'BOOKING'
  )
  // `?expand=first` opens the first company in the list on arrival.
  //
  // The rate ladders are the proof this screen exists to show, and every row
  // arrives collapsed — so a deep link into it landed on six instances of
  // "2 tiers" in grey microtext and nothing else (Plan-DemoFlowFixes Chunk 4,
  // task 4.6). Resolved lazily in the initialiser so it costs nothing on a
  // normal visit, and it is a plain deep-link parameter rather than demo
  // chrome: any link into this page can use it.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingCompany, setEditingCompany] = useState<Company | null>(initialEdit)
  // Drop `?edit=` from the address bar once used, so a later reload doesn't reopen the form.
  //
  // `null`, not `window.history.state`: Next.js's patched replaceState treats a state carrying
  // its own `__NA` marker as an internal call and skips updating the router. Passing the
  // current state did exactly that — the bar changed, the router kept `?edit=`, and the next
  // server-action refresh (e.g. saving a price tier) wrote `?edit=<id>` back into the URL.
  // Found by companies-crud.spec.ts on 2026-10-12; the documented form is `null`
  // (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md).
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('edit')) return
    url.searchParams.delete('edit')
    window.history.replaceState(null, '', url)
  }, [])
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
    if ('error' in result) { setError(result.error ?? ''); setLoading(false); return }
    // Reload with `?edit=` so the new company opens straight in the full form (T-6).
    const url = new URL(window.location.href)
    url.searchParams.set('edit', result.company.id)
    window.location.assign(url)
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
    onRegistrationFeeSaved: (companyId: string, fee: Tetri) =>
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, registrationFee: fee } : c)),
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
          zones={zones}
          vintages={vintages}
          wineOn={wineOrdersOn}
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
                className="flex items-center gap-x-2 gap-y-1 flex-wrap flex-1 min-w-0 text-left"
              >
                <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: '#b45309', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-semibold" style={{ color: '#92400e' }}>{at('companies.individuals.title')}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
                  {at('companies.individuals.publicPricing')}
                </span>
                {displayTier ? (
                  <span className="text-xs" style={{ color: '#b45309' }}>
                    {displayTier.tastingOnlyPrice != null ? formatTetri(displayTier.tastingOnlyPrice) : '—'} / {displayTier.tastingLunchPrice != null ? formatTetri(displayTier.tastingLunchPrice) : '—'} {at('companies.individuals.shownOnSite')}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: C.faint }}>
                    {at('companies.individuals.defaults')} · {individualsRow.prices.length} {individualsRow.prices.length !== 1 ? at('companies.individuals.tier.plural') : at('companies.individuals.tier.singular')}
                  </span>
                )}
              </button>
              <span className="flex-shrink-0"><HelpHint text={at('help.companies.individuals')} /></span>
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
                {/* Phone: summary on the left, Edit/Delete as icon buttons on the right
                    (the text buttons on their own line made each company ~119px tall).
                    Icons are 40px hit areas; the delete confirmation wraps onto its
                    own line so its words never squeeze the name. sm+ keeps the words. */}
                <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center px-4 sm:px-5 py-3 sm:py-4 gap-2 sm:gap-4">
                  {/* The summary button stops before the "needs details" hint.
                      HelpHint renders a <button>, and a button inside a button
                      is invalid HTML: the parser relocates the inner one, so
                      the server's tree and the client's disagree and every
                      /admin/companies load logged a hydration mismatch
                      (KnownBugs #15). Same shape the Individuals row above
                      already uses. Visual order is unchanged — the pieces below
                      simply sit beside the button rather than inside it. */}
                  <div className="flex items-center gap-x-2 gap-y-1 flex-wrap flex-1 min-w-0">
                  <button
                    onClick={() => setExpandedId(expanded ? null : company.id)}
                    className="flex items-center gap-x-2 gap-y-1 flex-wrap text-left min-w-0"
                  >
                    {/* Chevron and name are one unit: on a 320px phone a long name used to
                        wrap onto its own line and leave the chevron alone above it. */}
                    <span className="flex items-start gap-x-2 min-w-0">
                      <svg className="w-4 h-4 mt-1 flex-shrink-0 transition-transform" style={{ color: C.faint, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="font-medium" style={{ color: C.text }}>{company.name}</span>
                    </span>
                    {company.identificationCode && <span className="text-xs" style={{ color: C.faint }}>{at('companies.idLabel')} {company.identificationCode}</span>}
                    {company.accessCode ? (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                        {at('companies.codeSet')}
                      </span>
                    ) : !company.isIndividual && (
                      // No code = customers can't choose it (Max, 2026-10-14) — say so where it shows.
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                        {at('companies.noCodeBadge')}
                      </span>
                    )}
                    {company.isExporter && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>
                        {at('companies.exporter.badge')}
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
                        : ''}{(() => { const n = activeModule === 'BOOKING' ? company.orderCount : company.wineOrderCount; return `${n} ${n !== 1 ? at('packing.order.plural') : at('packing.order.singular')}` })()}
                    </span>
                  </div>

                  {deletingId === company.id ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="text-sm" style={{ color: C.muted }}>{at('companies.deleteConfirm')}</span>
                      <button onClick={() => handleDelete(company.id)} disabled={loading} className="text-sm px-3 py-2.5 md:py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>{loading ? at('companies.deleting') : at('companies.yesDelete')}</button>
                      <button onClick={() => setDeletingId(null)} disabled={loading} className="text-sm px-3 py-2.5 md:py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{at('settings.common.cancel')}</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditingCompany(company)}
                        aria-label={at('companies.priceTiers.edit')}
                        title={at('companies.priceTiers.edit')}
                        className="inline-flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto text-sm sm:px-3 sm:py-1.5 rounded-lg border"
                        style={{ borderColor: C.border, color: C.muted }}
                      >
                        <svg className="sm:hidden" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        <span className="hidden sm:inline">{at('companies.priceTiers.edit')}</span>
                      </button>
                      <button
                        onClick={() => setDeletingId(company.id)}
                        aria-label={at('companies.priceTiers.delete')}
                        title={at('companies.priceTiers.delete')}
                        className="inline-flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto text-sm sm:px-3 sm:py-1.5 rounded-lg border"
                        style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                      >
                        <svg className="sm:hidden" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                        <span className="hidden sm:inline">{at('companies.priceTiers.delete')}</span>
                      </button>
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
