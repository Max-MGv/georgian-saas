'use client'

import { useState, useCallback } from 'react'
import { asTetri, asTetriOrNull, formatTetri, formatTetriOrDash, multiplyTetri, applyPercent } from '@/lib/money'
import { useRouter } from 'next/navigation'
import { createWineOrderAdmin } from '@/app/actions/wineOrders'
import { adminT } from '@/lib/adminT'
import { useContactSelection } from '@/lib/useContactSelection'
import type { ContactChoice, OrderRole, ResolvedAddress } from '@/lib/contactResolution'
import { formatAddressOption } from '@/lib/orderAddress'
import { zoneDisplayName } from '@/lib/wineOrderRules'
import DateInput from '@/components/DateInput'
import { priceWineOrder } from '@/lib/winePricing'
import type { DeliveryZoneOption } from '@/lib/wineOrderDelivery'

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
  // No contactName/contactPhone: replaced by CompanyPerson rows resolved per company
  // (Plan-ContactRoles Chunk 1). This form's old autofill from those columns, under a comment
  // reading "Mirrors WineCatalogueClient.tsx's applyProfile()", is what produced decision 10 -
  // the same job implemented twice and drifting. Both now call one resolver and one hook.
  // Saved addresses arrive through that same resolver too (T-13).
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
    // Half fields sit two to a row: when one label wraps to two lines on a phone, mt-auto
    // keeps both boxes on the same line instead of pushing one down. (QA 2026-10-15 F3)
    <div className={half ? 'flex flex-col min-w-0' : 'mb-3'}>
      <label className="text-xs block mb-1" style={{ color: C.faint }}>{label}{required ? ' *' : ''}</label>
      {half ? <div className="mt-auto">{children}</div> : children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function NewWineOrderForm({
  companies,
  contactRoles = [],
  wines,
  locale = 'en',
  zones = [],
}: {
  /** The winery's active delivery zones (T-8). Empty → no zone question, as before T-8. */
  zones?: DeliveryZoneOption[]
  companies: CompanyOption[]
  wines: WineOption[]
  locale?: string
  /**
   * The tenant's per-order roles that apply to wine orders, with no people attached. The
   * choices come per company from the resolver and render **inline** here, not in the popup
   * the public forms use: an admin has no code step to hang a popup off (plan §4b's "honest
   * asymmetry" - same resolver, same hook, different trigger).
   */
  contactRoles?: OrderRole[]
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
  // The company's saved delivery addresses (T-13) and which one: an id, 'other' (typed), or
  // '' (not chosen yet). Same three states as the public form.
  const [savedAddresses, setSavedAddresses] = useState<ResolvedAddress[]>([])
  const [addressChoice, setAddressChoice] = useState('other')
  const chosenSavedAddress = savedAddresses.find(a => a.id === addressChoice) ?? null
  // T-8 — an admin can record a pickup even when the public form does not offer one, and may
  // choose "Other" to set the fee later on the order. No minimum here (admin tool, like bookings).
  // T-9 — a business (as before) or a private person.
  const [customerType, setCustomerType] = useState<'COMPANY' | 'INDIVIDUAL'>('COMPANY')
  const isIndividual = customerType === 'INDIVIDUAL'
  const [fulfilment, setFulfilment] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY')
  const [zoneChoice, setZoneChoice] = useState('')
  // T-14 — optional here, and not held to lead time / Closed Days (what was agreed on the phone).
  const [preferredDate, setPreferredDate] = useState('')
  // T-12 — the chosen company's negotiated prices, per vintage (tetri).
  const [negotiatedPrices, setNegotiatedPrices] = useState<Record<string, number>>({})
  const isPickup = fulfilment === 'PICKUP'
  const chosenZone = !isPickup ? zones.find(z => z.id === zoneChoice) ?? null : null
  function chooseAddress(choice: string) {
    setAddressChoice(choice)
    const zoneId = savedAddresses.find(a => a.id === choice)?.deliveryZoneId
    if (zoneId && zones.some(z => z.id === zoneId)) setZoneChoice(zoneId)
  }
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // ── Contact roles ─────────────────────────────────────────────────────────
  // contact_person owns the three fields above, because those are what
  // WineOrder.contactName/contactPhone/contactEmail are written from. Matched on `key`, since
  // labels are renameable and `key` is what code matches on (Chunk 0).
  const contactPersonRole = contactRoles.find(r => r.key === 'contact_person') ?? null
  const extraRoles = contactRoles.filter(r => r.key !== 'contact_person')
  const roleLabel = (role: OrderRole) => (locale === 'ka' ? role.labelKa : role.labelEn) || role.labelEn

  const applyPickedPerson = useCallback((person: ContactChoice, role: OrderRole) => {
    if (contactPersonRole && role.roleId !== contactPersonRole.roleId) return
    setContactName(person.name)
    if (person.phone) setContactPhone(person.phone)
    if (person.email) setContactEmail(person.email)
  }, [contactPersonRole?.roleId])

  const {
    selected: selectedContacts,
    contacts: pickedContacts,
    roleChoices,
    resolve: resolveContacts,
    pickFor,
    clearRole,
    setTyped: setTypedContact,
    reset: resetContacts,
  } = useContactSelection({ module: 'WINE_ORDER', onApply: applyPickedPerson, asAdmin: true })

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

  // T-12 — the same pricing the server charges with: negotiated prices where the company has
  // them (admin resolution is trusted, so they are always visible here), the % on the rest.
  // Replaces a lari-era Math.round(*100)/100 that no longer matched the server's tetri rounding.
  const unitOf = (vintageId: string, standard: number) => negotiatedPrices[vintageId] ?? standard
  const pricing = priceWineOrder(
    lines.map(l => ({ vintageId: l.vintageId, quantity: l.quantity, standardPrice: l.price })),
    negotiatedPrices,
    selectedCompany?.wineDiscountPercent ?? null,
  )
  const subtotal = pricing.negotiatedTotal + pricing.standardSubtotal
  const computedTotal = pricing.total

  // ── Company autofill ──────────────────────────────────────────────────────
  // businessName/llcName take the company name unconditionally; everything else only
  // overwrites when the company actually has that field set, so switching company never
  // blanks out something the admin already typed.
  //
  // The contact person no longer comes off the company row — it is one of that company's
  // people, chosen from the inline dropdown below. A role with exactly one person fills itself
  // in, because making an admin pick from a list of one is the friction this feature exists to
  // remove. `resolve` hands the choices back rather than only storing them, since the stored
  // copy is state and would still be empty in this closure.
  function handleCompanyChange(id: string) {
    setCompanyId(id)
    resetContacts()
    // Never carry one company's saved address over to another; typed text stays (see above).
    setSavedAddresses([])
    setAddressChoice('other')
    setNegotiatedPrices({})
    if (!id) return
    const company = companies.find(c => c.id === id)
    if (!company) return
    setBusinessName(company.name)
    setLlcName(company.name)
    if (company.identificationCode) setLlcId(company.identificationCode)
    void resolveContacts({ companyId: id }).then(result => {
      if ('error' in result) return
      // One saved address is used straight away; several must be chosen; none → typed.
      setNegotiatedPrices(result.company.winePrices ?? {})
      const list = result.company.addresses
      setSavedAddresses(list)
      setAddressChoice(list.length === 1 ? list[0]!.id : list.length === 0 ? 'other' : '')
      if (list.length === 1 && list[0]!.deliveryZoneId && zones.some(z => z.id === list[0]!.deliveryZoneId)) {
        setZoneChoice(list[0]!.deliveryZoneId)
      }
      for (const choices of result.roleChoices) {
        if (choices.people.length === 1) pickFor(choices.people[0]!, choices)
      }
    })
  }

  /**
   * Who to record against this order, one entry per contact role. Same shape and same reasoning
   * as buildContacts() in BookingForm.tsx: contact_person is rebuilt from the live fields so an
   * edited autofill stays truthful, keeping its `personId` when one was picked.
   */
  function buildContacts() {
    if (!companyId) return undefined
    const others = pickedContacts.filter(c => c.roleId !== contactPersonRole?.roleId)
    const all = contactPersonRole && contactName.trim()
      ? [{
          roleId: contactPersonRole.roleId,
          personId: selectedContacts[contactPersonRole.roleId]?.personId,
          name: contactName.trim(),
          phone: contactPhone.trim() || null,
          email: contactEmail.trim() || null,
        }, ...others]
      : others
    return all.length > 0 ? all : undefined
  }

  // ── Wine line helpers ─────────────────────────────────────────────────────
  const selectedWine = wines.find(w => w.id === newLineWineId)
  const selectedVintage = selectedWine?.vintages.find(v => v.id === newLineVintageId)
  const lineTotal = selectedVintage ? (parseInt(newLineQty) || 1) * unitOf(selectedVintage.id, selectedVintage.price) : 0

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
      customerType,
      companyId: isIndividual ? null : companyId || null,
      businessName,
      llcName: llcName || null,
      llcId: llcId || null,
      companyAddressId: isPickup ? null : chosenSavedAddress?.id ?? null,
      fulfilment,
      zoneChoice: isPickup ? null : zoneChoice || null,
      preferredDate: preferredDate || null,
      address,
      workingHours: workingHours || null,
      contactName,
      contactPhone,
      contactEmail: contactEmail || null,
      // One entry per contact role. Chunk 9 turns these into OrderContact rows with
      // snapshots; until then createWineOrderAdmin accepts and ignores them.
      contacts: buildContacts(),
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
      {/* ── Ordering as (T-9) ── */}
      <Card title={at('newWineOrder.type.title')}>
        <select aria-label={at('newWineOrder.type.title')} value={customerType} style={inputStyle}
          onChange={e => {
            const next = e.target.value as 'COMPANY' | 'INDIVIDUAL'
            setCustomerType(next)
            if (next === 'INDIVIDUAL') handleCompanyChange('')
          }}>
          <option value="COMPANY">{at('newWineOrder.type.company')}</option>
          <option value="INDIVIDUAL">{at('newWineOrder.type.individual')}</option>
        </select>
      </Card>

      {/* ── Company ── */}
      {!isIndividual && (
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
      )}

      {/* ── Business / Contact ── */}
      <Card title={at('newWineOrder.contact.title')}>
        {!isIndividual && (<>
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
        </>)}
        {/* Saved delivery addresses (T-13). A saved one sends only its id; the server re-reads
            the text, so the typed boxes only appear for "Other address". */}
        <Field label={at('newWineOrder.delivery.method')}>
          <select value={fulfilment} onChange={e => setFulfilment(e.target.value as 'DELIVERY' | 'PICKUP')} style={inputStyle}>
            <option value="DELIVERY">{at('newWineOrder.delivery.delivery')}</option>
            <option value="PICKUP">{at('newWineOrder.delivery.pickup')}</option>
          </select>
        </Field>
        {!isPickup && savedAddresses.length > 0 && (
          <Field label={at('newWineOrder.contact.savedAddress')} required>
            <select value={addressChoice} onChange={e => chooseAddress(e.target.value)} style={inputStyle}>
              {addressChoice === '' && <option value="" disabled>{at('newWineOrder.contact.savedAddressChoose')}</option>}
              {savedAddresses.map(a => <option key={a.id} value={a.id}>{formatAddressOption(a)}</option>)}
              <option value="other">{at('newWineOrder.contact.savedAddressOther')}</option>
            </select>
            {chosenSavedAddress?.workingHours && (
              <p className="text-xs mt-1" style={{ color: C.faint }}>{chosenSavedAddress.workingHours}</p>
            )}
          </Field>
        )}
        {!isPickup && addressChoice === 'other' && (
          <>
            <Field label={at('newWineOrder.contact.address')} required>
              <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
            </Field>
            <Field label={at('newWineOrder.contact.workingHours')}>
              <input value={workingHours} onChange={e => setWorkingHours(e.target.value)} style={inputStyle} />
            </Field>
          </>
        )}
        {!isPickup && zones.length > 0 && (
          <Field label={at('newWineOrder.delivery.zone')} required>
            <select value={zoneChoice} onChange={e => setZoneChoice(e.target.value)} style={inputStyle}>
              <option value="" disabled>{at('newWineOrder.delivery.zoneChoose')}</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>{zoneDisplayName(z, locale)} — {formatTetri(asTetri(z.fee), { decimals: true })}</option>
              ))}
              <option value="other">{at('newWineOrder.delivery.zoneOther')}</option>
            </select>
          </Field>
        )}
        <Field label={at(isPickup ? 'newWineOrder.delivery.datePickup' : 'newWineOrder.delivery.dateDelivery')}>
          <DateInput value={preferredDate} onChange={setPreferredDate} style={inputStyle} />
        </Field>
        {/* Choose one of the company's people, inline. The public forms reach the same
            choices through a code popup; an admin has no code step, so the list is simply a
            dropdown (plan §4b). Rendered only when there is someone to choose: no company
            selected, nobody on file, or person codes switched on all mean no list, and a
            dropdown with nothing in it is worse than no dropdown. */}
        {contactPersonRole && (() => {
          const choices = roleChoices.find(r => r.roleId === contactPersonRole.roleId)
          if (!choices || choices.people.length === 0) return null
          const chosenId = selectedContacts[contactPersonRole.roleId]?.personId ?? ''
          return (
            <Field label={at('newWineOrder.contact.pickPerson', { role: roleLabel(contactPersonRole) })}>
              <select
                value={chosenId}
                onChange={e => {
                  const person = choices.people.find(pp => pp.id === e.target.value)
                  if (person) pickFor(person, choices)
                  else clearRole(contactPersonRole.roleId)
                }}
                style={inputStyle}
              >
                <option value="">{at('newWineOrder.contact.pickPersonNone')}</option>
                {choices.people.map(pp => (
                  <option key={pp.id} value={pp.id}>{pp.name}{pp.phone ? ` — ${pp.phone}` : ''}</option>
                ))}
              </select>
            </Field>
          )
        })()}
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

        {/* One block per wine-applicable role other than contact_person. None ship today -
            `guide` is BOOKING-only - but a role added on the Contact Types screen appears here
            with no code change. Same generic treatment as the public forms. */}
        {extraRoles.map(role => {
          const chosen = selectedContacts[role.roleId]
          const choices = roleChoices.find(r => r.roleId === role.roleId)
          return (
            <div key={role.roleId}>
              {choices && choices.people.length > 0 && (
                <Field label={at('newWineOrder.contact.pickPerson', { role: roleLabel(role) })}>
                  <select
                    value={chosen?.personId ?? ''}
                    onChange={e => {
                      const person = choices.people.find(pp => pp.id === e.target.value)
                      if (person) pickFor(person, choices)
                      else clearRole(role.roleId)
                    }}
                    style={inputStyle}
                  >
                    <option value="">{at('newWineOrder.contact.pickPersonNone')}</option>
                    {choices.people.map(pp => (
                      <option key={pp.id} value={pp.id}>{pp.name}{pp.phone ? ` — ${pp.phone}` : ''}</option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label={`${roleLabel(role)} — ${at('newWineOrder.contact.contactName')}`} half>
                  <input value={chosen?.name ?? ''} style={inputStyle}
                    onChange={e => setTypedContact(role.roleId, { name: e.target.value, phone: chosen?.phone, email: chosen?.email })} />
                </Field>
                <Field label={`${roleLabel(role)} — ${at('newWineOrder.contact.contactPhone')}`} half>
                  <input type="tel" value={chosen?.phone ?? ''} style={inputStyle}
                    onChange={e => setTypedContact(role.roleId, { name: chosen?.name ?? '', phone: e.target.value, email: chosen?.email })} />
                </Field>
              </div>
            </div>
          )
        })}
      </Card>

      {/* ── Wines ── */}
      <Card title={at('newWineOrder.wines.title')}>
        {lines.length > 0 && (
          // overflow-x-auto, not hidden: six columns don't fit a phone, and hidden cut off the
          // Total column. The table now scrolls sideways inside its box. (QA 2026-10-15 F11)
          <div className="rounded-lg border overflow-x-auto mb-3" style={{ borderColor: C.border }}>
            <table className="w-full text-sm whitespace-nowrap">
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
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted, fontWeight: l.vintageId in negotiatedPrices ? 700 : 400 }}>{formatTetri(asTetri(unitOf(l.vintageId, l.price)))}</td>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                      {formatTetri(multiplyTetri(asTetri(unitOf(l.vintageId, l.price)), l.quantity), { decimals: true })}
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
              <div style={{ flex: '1 1 130px' }}>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('newWineOrder.wines.colYear')}</label>
                <select value={newLineVintageId} onChange={e => setNewLineVintageId(e.target.value)} style={inputStyle}>
                  {selectedWine.vintages.map(v => (
                    <option key={v.id} value={v.id}>{v.year} — {formatTetri(asTetri(unitOf(v.id, v.price)))}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ width: 80 }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('newWineOrder.wines.colQty')}</label>
              <input type="number" min={1} value={newLineQty} onChange={e => setNewLineQty(e.target.value)} style={inputStyle} />
            </div>
            {selectedVintage && (
              <div className="text-sm pb-2" style={{ color: C.muted }}>= {formatTetri(asTetri(lineTotal), { decimals: true })}</div>
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
              <span style={{ color: C.text }}>{formatTetri(multiplyTetri(asTetri(unitOf(l.vintageId, l.price)), l.quantity), { decimals: true })}</span>
            </div>
          ))}
          {pricing.discountPercent != null && lines.length > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{at('newWineOrder.total.discount', { percent: pricing.discountPercent })}</span>
              <span style={{ color: C.text }}>−{formatTetri(asTetri(subtotal - computedTotal), { decimals: true })}</span>
            </div>
          )}
        </div>

        {chosenZone && (
          <div className="flex justify-between text-sm mb-3">
            <span style={{ color: C.muted }}>{at('newWineOrder.delivery.feeLine', { zone: zoneDisplayName(chosenZone, locale) })}</span>
            <span style={{ color: C.text }}>{formatTetri(asTetri(chosenZone.fee), { decimals: true })}</span>
          </div>
        )}
        {!isPickup && zoneChoice === 'other' && (
          <p className="text-xs mb-3" style={{ color: C.faint }}>{at('newWineOrder.delivery.feeLater')}</p>
        )}
        <div className="pt-3 flex justify-between items-center border-t" style={{ borderColor: C.border }}>
          <span className="text-sm font-semibold" style={{ color: C.muted }}>{at('orderDetail.total.totalLabel')}</span>
          <span className="text-2xl font-bold" style={{ color: C.wine }}>
            {/* Wines + delivery fee — display only; the server recomputes both. */}
            {formatTetri(asTetri(computedTotal + (chosenZone?.fee ?? 0)), { decimals: true })}
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
