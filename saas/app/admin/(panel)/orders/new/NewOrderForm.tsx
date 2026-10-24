'use client'

import { useState, useCallback } from 'react'
import { asTetri, fromMajor, formatTetri, multiplyTetri } from '@/lib/money'
import { useRouter } from 'next/navigation'
import { createOrderAdmin } from '@/app/actions/orders'
import type { BookingVisitType, Product } from '@/lib/pricingUtils'
import { lineTotals } from '@/lib/orderLines'
import { adminOrderView, manualFromStrings, NO_TYPED_RATES, type BoxField, type BoxStrings } from '@/lib/adminOrderView'
import { GuestFields, PriceLines, problemText, RateFields } from '../OrderGuestFields'
import { UNIT_LABELS } from '@/lib/masterclass'
import type { MasterclassUnit } from '@/lib/masterclass'
import { adminT } from '@/lib/adminT'
import { useContactSelection } from '@/lib/useContactSelection'
import type { ContactChoice, OrderRole } from '@/lib/contactResolution'
import { splitFullName } from '@/lib/splitFullName'
import ContactRoleFields from '@/components/ContactRoleFields'
import NationalityPicker from '@/components/NationalityPicker'
import { ADMIN_TIME_SLOTS as TIME_SLOTS } from '../timeSlots'
import DateInput from '@/components/DateInput'

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

type Price = {
  id: string
  minGuests: number
  maxGuests: number
  // Product model (T-152): tetri per person, null = not offered; tastingLunchPrice is all-in.
  tastingOnlyPrice: number | null
  lunchOnlyPrice: number | null
  tastingLunchPrice: number | null
}

/** registrationFee: the company's flat fee per booking (T-152 D-6). */
type CompanyOption = { id: string; name: string; prices: Price[]; registrationFee: number }
type MenuItemRow = { id: string; name: string; type: string }
type MasterclassItemRow = { id: string; name: string; unitType: string; pricePerUnit: number }
type LineItem = { tempId: number; itemId: string; quantity: number; pricePerUnit: number; name: string; unitType: string }
type ExtraItem = { tempId: number; label: string; amount: number }

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

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div className={half ? '' : 'mb-3'}>
      <label className="text-xs block mb-1" style={{ color: C.faint }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function NewOrderForm({
  companies,
  individualsPrices,
  menuItems,
  masterclassItems,
  contactRoles = [],
  nationalityEnabled = false,
  locale = 'en',
}: {
  companies: CompanyOption[]
  /** The tenant's Individuals price table — what an individual order is priced from (D-14). Empty = none yet. */
  individualsPrices: Price[]
  menuItems: MenuItemRow[]
  masterclassItems: MasterclassItemRow[]
  /** Tenant flag `enableCompanyNationalityBreakdown` — the same gate the public form uses. */
  nationalityEnabled?: boolean
  /**
   * The tenant's per-order roles that apply to bookings, with no people attached. Choices come
   * per company from the resolver and render inline here — this screen has no code step to hang
   * a popup off, same "honest asymmetry" as NewWineOrderForm (Plan-ContactRoles §4b).
   */
  contactRoles?: OrderRole[]
  locale?: string
}) {
  const router = useRouter()
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)

  // Booking details
  const [companyId, setCompanyId] = useState('')
  const [visitType, setVisitType] = useState<BookingVisitType>('TASTING')
  const [date, setDate] = useState('')
  const [timeSlot, setTimeSlot] = useState('11:00')

  // Contact — one Name box like the public form; split into name/surname at submit.
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  // Company-booking nationality tags (Plan-CompanyNationality) — ISO codes.
  const [nationalities, setNationalities] = useState<string[]>([])

  // ── Contact roles ─────────────────────────────────────────────────────────
  // contact_person owns the four fields above — matched on `key`, since labels are
  // renameable and `key` is what code matches on (Plan-ContactRoles Chunk 0).
  const contactPersonRole = contactRoles.find(r => r.key === 'contact_person') ?? null
  const extraRoles = contactRoles.filter(r => r.key !== 'contact_person')
  const roleLabel = (role: OrderRole) => (locale === 'ka' ? role.labelKa : role.labelEn) || role.labelEn

  const applyPickedPerson = useCallback((person: ContactChoice, role: OrderRole) => {
    if (contactPersonRole && role.roleId !== contactPersonRole.roleId) return
    setFullName(person.name.trim())
    if (person.phone) setPhone(person.phone)
    if (person.email) setEmail(person.email)
  }, [contactPersonRole])

  const {
    selected: selectedContacts,
    contacts: pickedContacts,
    roleChoices,
    resolve: resolveContacts,
    pickFor,
    clearRole,
    setTyped: setTypedContact,
    reset: resetContacts,
  } = useContactSelection({ module: 'BOOKING', onApply: applyPickedPerson, asAdmin: true })

  // Guests: individuals type one count (D-5); companies fill the four boxes and the total is their sum (D-3).
  const [guestCountStr, setGuestCountStr] = useState('4')
  const [boxes, setBoxes] = useState<BoxStrings>({ tastingOnly: '0', lunchOnly: '0', tastingLunch: '0', free: '0' })
  const setBox = (f: BoxField, v: string) => setBoxes(prev => ({ ...prev, [f]: v }))

  // Dishes
  const [hotDishVeg, setHotDishVeg] = useState('')
  const [hotDishMeat, setHotDishMeat] = useState('')
  const [foodNotes, setFoodNotes] = useState('')

  // Typed per-person rates (GEL) — for products the company's table does not price, or when there is no table.
  // Companies only: an individual order is priced from the Individuals table (D-14).
  const [manualRates, setManualRates] = useState<Record<Product, string>>({ tastingOnly: '', lunchOnly: '', tastingLunch: '' })

  // Masterclass lines (client-side only until submit)
  const [lines, setLines] = useState<LineItem[]>([])
  const [addingLine, setAddingLine] = useState(false)
  const [newLineItemId, setNewLineItemId] = useState('')
  const [newLineQty, setNewLineQty] = useState('1')

  // Extras
  const [extras, setExtras] = useState<ExtraItem[]>([])
  const [addingExtra, setAddingExtra] = useState(false)
  const [newExtraLabel, setNewExtraLabel] = useState('')
  const [newExtraAmount, setNewExtraAmount] = useState('')

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [nextTempId, setNextTempId] = useState(1)

  // ── Derived ────────────────────────────────────────────────────────────────
  const isCompany = companyId !== ''
  // Same rule as the public form: a company booking, on a tenant with the flag on.
  const showNationalityPicker = nationalityEnabled && isCompany
  const selectedCompany = companies.find(c => c.id === companyId) ?? null
  const prices = isCompany ? selectedCompany?.prices ?? [] : individualsPrices
  const companyRegistrationFee = selectedCompany?.registrationFee ?? 0

  const { masterclass: masterclassAmt, extras: extrasAmt } = lineTotals({ masterclassLines: lines, extras })

  // Everything the preview shows comes from the same check and pricing createOrderAdmin runs (Chunk 8), so the
  // total here is the total that will be stored — it drifted from the server until 2026-09-19 (#51).
  const view = adminOrderView({
    bookingType: isCompany ? 'COMPANY' : 'INDIVIDUAL', visitType, guests: guestCountStr, boxes,
    prices, registration: companyRegistrationFee, manual: manualRates,
    masterclassAmt, extrasAmt,
  })
  const payingGuests = view.counts ? view.counts.tastingOnly + view.counts.lunchOnly + view.counts.tastingLunch : 0
  const problem = problemText(at, view)

  // ── Masterclass helpers ───────────────────────────────────────────────────
  const selectedMcItem = masterclassItems.find(i => i.id === newLineItemId)
  const isFlatUnit = selectedMcItem?.unitType === 'FLAT'
  const lineTotal = selectedMcItem
    ? isFlatUnit ? selectedMcItem.pricePerUnit : (parseInt(newLineQty) || 1) * selectedMcItem.pricePerUnit
    : 0

  function handleNewLineItemChange(itemId: string) {
    setNewLineItemId(itemId)
    const item = masterclassItems.find(i => i.id === itemId)
    if (!item) return
    // Per person = the paying guests, the three boxes together (Free guests are never charged).
    if (item.unitType === 'PER_PERSON') setNewLineQty(String(payingGuests || 1))
    else setNewLineQty('1')
  }

  function handleAddLine() {
    if (!selectedMcItem) return
    const qty = isFlatUnit ? 1 : parseInt(newLineQty) || 1
    setLines(prev => [...prev, {
      tempId: nextTempId,
      itemId: newLineItemId,
      quantity: qty,
      pricePerUnit: selectedMcItem.pricePerUnit,
      name: selectedMcItem.name,
      unitType: selectedMcItem.unitType,
    }])
    setNextTempId(n => n + 1)
    setNewLineItemId('')
    setNewLineQty('1')
    setAddingLine(false)
  }

  function handleAddExtra() {
    if (!newExtraLabel.trim() || !newExtraAmount) return
    setExtras(prev => [...prev, {
      tempId: nextTempId,
      label: newExtraLabel,
      amount: fromMajor(parseFloat(newExtraAmount) || 0),
    }])
    setNextTempId(n => n + 1)
    setNewExtraLabel('')
    setNewExtraAmount('')
    setAddingExtra(false)
  }

  // ── Company change ────────────────────────────────────────────────────────
  // Resets any previously picked contacts and asks who this new company's people are. A role
  // with exactly one person fills itself in — making an admin pick from a list of one is the
  // friction this feature exists to remove (same asymmetry as NewWineOrderForm).
  function handleCompanyChange(id: string) {
    setCompanyId(id)
    resetContacts()
    // Individuals book Tasting or Tasting + Lunch only (D-5).
    if (!id && visitType === 'LUNCH') setVisitType('TASTING')
    if (!id) { setNationalities([]); return }
    void resolveContacts({ companyId: id }).then(result => {
      if ('error' in result) return
      for (const choices of result.roleChoices) {
        if (choices.people.length === 1) pickFor(choices.people[0]!, choices)
      }
    })
  }

  /**
   * Who to record against this order, one entry per contact role. contact_person is rebuilt
   * from the live fields so an edited autofill stays truthful, keeping its `personId` when one
   * was picked — same shape as buildContacts() in BookingForm.tsx and NewWineOrderForm.tsx.
   */
  function buildContacts() {
    if (!isCompany) return undefined
    const others = pickedContacts.filter(c => c.roleId !== contactPersonRole?.roleId)
    const typedName = fullName.trim()
    const all = contactPersonRole && typedName
      ? [{
          roleId: contactPersonRole.roleId,
          personId: selectedContacts[contactPersonRole.roleId]?.personId,
          name: typedName,
          phone: phone.trim() || null,
          email: email.trim() || null,
        }, ...others]
      : others
    return all.length > 0 ? all : undefined
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true)
    setError('')

    const result = await createOrderAdmin({
      companyId: companyId || null,
      visitType,
      date,
      timeSlot,
      ...splitFullName(fullName),
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      ...(isCompany ? { boxes: view.counts ?? undefined } : { guestCount: parseInt(guestCountStr) || 0 }),
      // No lunch guest, no dish (A-11): a dish picked earlier is not sent.
      hotDishVegetable: view.lunchGuests > 0 ? hotDishVeg || null : null,
      hotDishMeat: view.lunchGuests > 0 ? hotDishMeat || null : null,
      foodNotes: foodNotes || null,
      manualRates: isCompany ? manualFromStrings(manualRates) : NO_TYPED_RATES,
      // The server takes each line's price from the catalogue (Q-1); only the item and quantity go up.
      masterclassLines: lines.map(l => ({ masterclassItemId: l.itemId, quantity: l.quantity })),
      extras: extras.map(e => ({ label: e.label, amount: e.amount })),
      contacts: buildContacts(),
      nationalities: showNationalityPicker && nationalities.length > 0 ? nationalities : undefined,
    })

    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    router.push(`/admin/orders/${result.orderId}`)
  }

  // ── Contact-role helpers (shared by every role's ContactRoleFields) ──────────
  const roleLabels = {
    name: at('newOrder.contact.name'),
    phone: at('orderDetail.bookingInfo.phone'),
    email: at('newOrder.contact.email'),
  }
  const roleTitleStyle: React.CSSProperties = { color: C.faint, marginBottom: 6 }

  /** "Choose one of this company's people" dropdown for a role — null when there is nobody to choose. */
  function rolePicker(role: OrderRole) {
    const choices = roleChoices.find(r => r.roleId === role.roleId)
    if (!choices || choices.people.length === 0) return undefined
    return (
      <select
        aria-label={at('newWineOrder.contact.pickPerson', { role: roleLabel(role) })}
        value={selectedContacts[role.roleId]?.personId ?? ''}
        onChange={e => {
          const person = choices.people.find(pp => pp.id === e.target.value)
          if (person) pickFor(person, choices)
          else clearRole(role.roleId)
        }}
        style={inputStyle}
      >
        <option value="">{at('newWineOrder.contact.pickPerson', { role: roleLabel(role) })}</option>
        {choices.people.map(pp => (
          <option key={pp.id} value={pp.id}>{pp.name}{pp.phone ? ` — ${pp.phone}` : ''}</option>
        ))}
      </select>
    )
  }

  const vegItems = menuItems.filter(i => i.type === 'VEGETABLE')
  const meatItems = menuItems.filter(i => i.type === 'MEAT')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Booking Details ── */}
      <Card title={at('newOrder.bookingDetails.title')}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label={at('orderDetail.bookingInfo.date')} half>
            {/* Day-first, like the public form and every other order screen (T-215 part 2) — keeps a native date
                input underneath for the calendar, which is also what the specs fill. */}
            <DateInput value={date} onChange={setDate} style={inputStyle} />
          </Field>
          <Field label={at('orderDetail.bookingInfo.time')} half>
            <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)} style={inputStyle}>
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label={at('newOrder.bookingDetails.company')}>
          <select value={companyId} onChange={e => handleCompanyChange(e.target.value)} style={inputStyle}>
            <option value="">{at('newOrder.bookingDetails.individual')}</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        {showNationalityPicker && (
          <Field label={at('newOrder.contact.nationality')}>
            <NationalityPicker
              value={nationalities}
              onChange={setNationalities}
              placeholder={at('newOrder.contact.nationalityPlaceholder')}
              emptyText={at('newOrder.contact.nationalityEmpty')}
            />
          </Field>
        )}

        {isCompany && prices.length === 0 && (
          <div className="text-xs rounded-lg p-3 mb-3" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
            <strong>{at('newOrder.guestBreakdown.noTiers', { name: selectedCompany?.name ?? '' })}</strong>{' '}
            {at('newOrder.guestBreakdown.wontCalc')}{' '}
            <a href="/admin/companies" style={{ textDecoration: 'underline' }}>{at('newOrder.guestBreakdown.addTiersLink')}</a>.
          </div>
        )}

        <GuestFields
          at={at} isCompany={isCompany} visitType={visitType} onVisitType={setVisitType}
          guests={guestCountStr} onGuests={setGuestCountStr} boxes={boxes} onBox={setBox}
          view={view} inputStyle={inputStyle}
        />
      </Card>

      {/* ── Contact ── */}
      <Card title={at('newOrder.contact.title')}>
        {/* Every contact role — Contact Person first, then Guide etc. — renders through the same
            ContactRoleFields block (title, optional "choose" dropdown, then Name / Phone / Email in
            one row), the layout the public booking form gives each role. They used to be two
            differently shaped sets of boxes for the same kind of information. The "choose" control
            is an inline dropdown rather than the public forms' popup: there is no code step on this
            screen to hang a popup off (Plan-ContactRoles §4b). A role added on the Contact Types
            screen appears here with no code change. */}
        <div className="flex flex-col gap-4">
          <ContactRoleFields
            title={contactPersonRole ? roleLabel(contactPersonRole) : at('newOrder.contact.title')}
            titleStyle={roleTitleStyle}
            picker={contactPersonRole && isCompany ? rolePicker(contactPersonRole) : undefined}
            name={fullName}
            phone={phone}
            email={email}
            onChange={(field, value) => {
              if (field === 'name') setFullName(value)
              else if (field === 'phone') setPhone(value)
              else setEmail(value)
            }}
            labels={roleLabels}
            inputStyle={inputStyle}
          />

          {isCompany && extraRoles.map(role => {
            const chosen = selectedContacts[role.roleId]
            return (
              <ContactRoleFields
                key={role.roleId}
                title={roleLabel(role)}
                titleStyle={roleTitleStyle}
                picker={rolePicker(role)}
                name={chosen?.name ?? ''}
                phone={chosen?.phone ?? ''}
                email={chosen?.email ?? ''}
                onChange={(field, value) => setTypedContact(role.roleId, {
                  name: field === 'name' ? value : (chosen?.name ?? ''),
                  phone: field === 'phone' ? value : chosen?.phone,
                  email: field === 'email' ? value : chosen?.email,
                })}
                labels={roleLabels}
                inputStyle={inputStyle}
              />
            )
          })}

          <Field label={at('orderDetail.bookingInfo.notes')}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder={at('orders.editPanel.notesPlaceholder')}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>
      </Card>

      {/* ── Dishes (company only) — the guest boxes moved up to Booking Details ── */}
      {isCompany && (
        <Card title={at('orderDetail.guestBreakdown.title')}>
          {/* A hot dish needs a lunch guest (A-11): the selects are off until there is one. */}
          {view.lunchGuests === 0 && (vegItems.length > 0 || meatItems.length > 0) && (
            <p className="text-xs mb-3" style={{ color: C.faint }}>{at(isCompany && visitType !== 'TASTING' ? 'orderForm.hotDishNeedsLunch' : 'orderForm.hotDishSwitchVisit')}</p>
          )}
          {vegItems.length > 0 && (
            <Field label={at('orderDetail.guestBreakdown.hotDishVeg')}>
              <select value={view.lunchGuests > 0 ? hotDishVeg : ''} onChange={e => setHotDishVeg(e.target.value)} disabled={view.lunchGuests === 0} style={view.lunchGuests === 0 ? { ...inputStyle, opacity: 0.6 } : inputStyle}>
                <option value="">{at('orderDetail.guestBreakdown.none')}</option>
                {vegItems.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
              </select>
            </Field>
          )}
          {meatItems.length > 0 && (
            <Field label={at('orderDetail.guestBreakdown.hotDishMeat')}>
              <select value={view.lunchGuests > 0 ? hotDishMeat : ''} onChange={e => setHotDishMeat(e.target.value)} disabled={view.lunchGuests === 0} style={view.lunchGuests === 0 ? { ...inputStyle, opacity: 0.6 } : inputStyle}>
                <option value="">{at('orderDetail.guestBreakdown.none')}</option>
                {meatItems.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
              </select>
            </Field>
          )}

          <Field label={at('orderDetail.guestBreakdown.foodNotes')}>
            <textarea
              value={foodNotes}
              onChange={e => setFoodNotes(e.target.value)}
              rows={2}
              placeholder={at('orderDetail.guestBreakdown.foodNotesPlaceholder')}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </Card>
      )}

      {/* ── Masterclass Add-ons ── */}
      <Card title={at('orderDetail.masterclass.title')}>
        {lines.length > 0 && (
          <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--site-bg)', borderBottom: `1px solid ${C.border}` }}>
                  {[at('orderDetail.masterclass.colItem'), at('orderDetail.masterclass.colUnit'), at('orderDetail.masterclass.colQty'), at('orderDetail.masterclass.colPricePerUnit'), at('orderDetail.masterclass.colTotal'), ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--site-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.tempId} style={{ borderBottom: i < lines.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <td className="px-3 py-2 text-sm" style={{ color: C.text }}>{l.name}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                        {UNIT_LABELS[l.unitType as MasterclassUnit] ?? l.unitType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>{l.quantity}</td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>{formatTetri(asTetri(l.pricePerUnit))}</td>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                      {formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { decimals: true })}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setLines(prev => prev.filter(x => x.tempId !== l.tempId))}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                      >
                        {at('orderDetail.masterclass.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length === 0 && !addingLine && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>{at('orderDetail.masterclass.none')}</p>
        )}

        {addingLine ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 160px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.masterclass.colItem')}</label>
              <select value={newLineItemId} onChange={e => handleNewLineItemChange(e.target.value)} style={inputStyle}>
                <option value="">{at('orderDetail.masterclass.selectItem')}</option>
                {masterclassItems.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({UNIT_LABELS[i.unitType as MasterclassUnit]})
                  </option>
                ))}
              </select>
            </div>
            {!isFlatUnit && (
              <div style={{ width: 80 }}>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.masterclass.colQty')}</label>
                <input type="number" min={1} value={newLineQty} onChange={e => setNewLineQty(e.target.value)} style={inputStyle} />
              </div>
            )}
            {selectedMcItem && (
              <div className="text-sm pb-2" style={{ color: C.muted }}>= {formatTetri(asTetri(lineTotal), { decimals: true })}</div>
            )}
            <button
              onClick={handleAddLine}
              disabled={!newLineItemId}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {at('orderDetail.masterclass.add')}
            </button>
            <button
              onClick={() => { setAddingLine(false); setNewLineItemId(''); setNewLineQty('1') }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {at('orderDetail.masterclass.cancel')}
            </button>
          </div>
        ) : masterclassItems.length > 0 ? (
          <button onClick={() => setAddingLine(true)} className="text-sm font-medium" style={{ color: C.wine }}>
            {at('orderDetail.masterclass.addBtn')}
          </button>
        ) : (
          <p className="text-xs" style={{ color: C.faint }}>
            {at('orderDetail.masterclass.noActiveItems')}{' '}
            <a href="/admin/masterclass" style={{ color: C.wine }}>{at('orderDetail.masterclass.addSomeLink')}</a>.
          </p>
        )}
      </Card>

      {/* ── Extra Charges ── */}
      <Card title={at('orderDetail.extras.title')}>
        {extras.length > 0 && (
          <div className="space-y-2 mb-3">
            {extras.map(e => (
              <div key={e.tempId} className="flex items-center gap-2">
                <span className="flex-1 text-sm" style={{ color: C.text }}>{e.label}</span>
                <span className="text-sm font-medium" style={{ color: C.wine }}>{formatTetri(asTetri(e.amount), { decimals: true })}</span>
                <button
                  onClick={() => setExtras(prev => prev.filter(x => x.tempId !== e.tempId))}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                >
                  {at('orderDetail.extras.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
        {extras.length === 0 && !addingExtra && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>{at('orderDetail.extras.none')}</p>
        )}
        {addingExtra ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 140px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.extras.description')}</label>
              <input
                value={newExtraLabel}
                onChange={e => setNewExtraLabel(e.target.value)}
                placeholder={at('orderDetail.extras.descriptionPh')}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <div style={{ width: 110 }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.extras.amount')}</label>
              <input
                type="number" min={0} step="0.01"
                value={newExtraAmount}
                onChange={e => setNewExtraAmount(e.target.value)}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <button
              onClick={handleAddExtra}
              disabled={!newExtraLabel.trim() || !newExtraAmount}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {at('orderDetail.extras.add')}
            </button>
            <button
              onClick={() => { setAddingExtra(false); setNewExtraLabel(''); setNewExtraAmount('') }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {at('orderDetail.extras.cancel')}
            </button>
          </div>
        ) : (
          <button onClick={() => setAddingExtra(true)} className="text-sm font-medium" style={{ color: C.wine }}>
            {at('orderDetail.extras.addBtn')}
          </button>
        )}
      </Card>

      {/* ── Order Total ── */}
      <Card title={at('orderDetail.total.title')}>
        {/* Typed rates for what the table does not price (or no table at all) */}
        <RateFields
          at={at} view={view} hasTable={prices.length > 0} companyName={selectedCompany?.name ?? ''}
          manual={manualRates} onManual={(p, v) => setManualRates(prev => ({ ...prev, [p]: v }))} inputStyle={inputStyle}
        />

        {/* Breakdown lines: one per product, each with the price-table row it used (finding 7) */}
        <div className="space-y-1.5 mb-3">
          <PriceLines at={at} view={view} />
          {lines.map(l => (
            <div key={l.tempId} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{l.name} × {l.quantity}</span>
              <span style={{ color: C.text }}>{formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { decimals: true })}</span>
            </div>
          ))}
          {extras.map(e => (
            <div key={e.tempId} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{e.label}</span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(e.amount), { decimals: true })}</span>
            </div>
          ))}
        </div>

        <div className="pt-3 flex justify-between items-center border-t" style={{ borderColor: C.border }}>
          <span className="text-sm font-semibold" style={{ color: C.muted }}>{at('orderDetail.total.totalLabel')}</span>
          <span className="text-2xl font-bold" style={{ color: C.wine }}>
            {view.total != null ? formatTetri(asTetri(view.total), { decimals: true }) : '—'}
          </span>
        </div>

        {error && (
          <p className="text-sm mt-3" style={{ color: '#b91c1c' }}>{error}</p>
        )}

        {/* Why it cannot be created yet — the same check the server runs, shown before the admin loses the form. */}
        {problem && (
          <p className="text-sm mt-3" style={{ color: '#b91c1c' }}>{problem}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !!problem}
          className="mt-4 w-full py-3 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: C.wine, opacity: submitting || problem ? 0.7 : 1 }}
        >
          {submitting ? at('newOrder.total.creating') : at('newOrder.total.create')}
        </button>
      </Card>
    </div>
  )
}
