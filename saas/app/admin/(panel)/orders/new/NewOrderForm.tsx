'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createOrderAdmin } from '@/app/actions/orders'
import { findTier } from '@/lib/pricingUtils'
import { UNIT_LABELS } from '@/lib/masterclass'
import type { MasterclassUnit } from '@/lib/masterclass'
import { adminT } from '@/lib/adminT'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

const inputStyle: React.CSSProperties = {
  backgroundColor: '#fffdf9',
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
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}

type CompanyOption = { id: string; name: string; prices: Price[] }
type MenuItemRow = { id: string; name: string; type: string }
type MasterclassItemRow = { id: string; name: string; unitType: string; pricePerUnit: number }
type LineItem = { tempId: number; itemId: string; quantity: number; pricePerUnit: number; name: string; unitType: string }
type ExtraItem = { tempId: number; label: string; amount: number }

// ─── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border mb-4" style={{ borderColor: C.border }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: C.border, backgroundColor: '#f5efe6' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>
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
  menuItems,
  masterclassItems,
  locale = 'en',
}: {
  companies: CompanyOption[]
  menuItems: MenuItemRow[]
  masterclassItems: MasterclassItemRow[]
  locale?: string
}) {
  const router = useRouter()
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)

  // Booking details
  const [companyId, setCompanyId] = useState('')
  const [visitType, setVisitType] = useState<'TASTING' | 'TASTING_LUNCH'>('TASTING')
  const [date, setDate] = useState('')
  const [timeSlot, setTimeSlot] = useState('11:00')

  // Contact
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')

  // Guest counts
  const [guestCountStr, setGuestCountStr] = useState('4')       // individual total
  const [tastingGuestsStr, setTastingGuestsStr] = useState('0')
  const [lunchGuestsStr, setLunchGuestsStr] = useState('0')
  const [freeGuestsStr, setFreeGuestsStr] = useState('0')

  // Dishes
  const [hotDishVeg, setHotDishVeg] = useState('')
  const [hotDishMeat, setHotDishMeat] = useState('')
  const [foodNotes, setFoodNotes] = useState('')

  // Manual rates (for individual or company with no tiers)
  const [manualTastingRateStr, setManualTastingRateStr] = useState('0')
  const [manualLunchRateStr, setManualLunchRateStr] = useState('0')

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
  const selectedCompany = companies.find(c => c.id === companyId) ?? null
  const prices = selectedCompany?.prices ?? []

  const guestCount = Math.max(1, parseInt(guestCountStr) || 1)
  const tastingGuests = Math.max(0, parseInt(tastingGuestsStr) || 0)
  const lunchGuests = Math.max(0, parseInt(lunchGuestsStr) || 0)
  const freeGuests = Math.max(0, parseInt(freeGuestsStr) || 0)
  const payingGuests = tastingGuests + lunchGuests

  const manualTastingRate = Math.max(0, parseFloat(manualTastingRateStr) || 0)
  const manualLunchRate = Math.max(0, parseFloat(manualLunchRateStr) || 0)

  const totalGuestCount = isCompany ? tastingGuests + lunchGuests + freeGuests : guestCount

  const tier = useMemo(
    () => (prices.length > 0 && payingGuests > 0 ? findTier(prices, payingGuests) : null),
    [prices, payingGuests]
  )

  const masterclassAmt = lines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = extras.reduce((s, e) => s + e.amount, 0)

  const tastingAmt = tier ? tastingGuests * tier.pricePerPerson : tastingGuests * manualTastingRate
  const lunchAmt = tier ? lunchGuests * tier.tastingLunchPricePerPerson : lunchGuests * manualLunchRate
  const regFee = tier ? tier.registrationPrice : 0

  const showManualRates = !tier && (isCompany ? payingGuests > 0 : true)

  const computedTotal =
    tier
      ? tastingAmt + lunchAmt + regFee + masterclassAmt + extrasAmt
      : isCompany && payingGuests === 0
        ? masterclassAmt + extrasAmt
        : (isCompany ? tastingGuests : guestCount) * manualTastingRate +
          lunchGuests * manualLunchRate +
          masterclassAmt +
          extrasAmt

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
    if (item.unitType === 'PER_PERSON') setNewLineQty(String(payingGuests || guestCount || 1))
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
      amount: parseFloat(newExtraAmount) || 0,
    }])
    setNextTempId(n => n + 1)
    setNewExtraLabel('')
    setNewExtraAmount('')
    setAddingExtra(false)
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
      name,
      surname,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      guestCount: totalGuestCount || 1,
      tastingGuestCount: isCompany ? tastingGuests : 0,
      lunchGuestCount: isCompany ? lunchGuests : 0,
      freeGuestCount: isCompany ? freeGuests : 0,
      hotDishVegetable: hotDishVeg || null,
      hotDishMeat: hotDishMeat || null,
      foodNotes: foodNotes || null,
      manualTastingRate,
      manualLunchRate,
      masterclassLines: lines.map(l => ({
        masterclassItemId: l.itemId,
        quantity: l.quantity,
        pricePerUnit: l.pricePerUnit,
      })),
      extras: extras.map(e => ({ label: e.label, amount: e.amount })),
    })

    if ('error' in result) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    router.push(`/admin/orders/${result.orderId}`)
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
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={at('orderDetail.bookingInfo.time')} half>
            <select value={timeSlot} onChange={e => setTimeSlot(e.target.value)} style={inputStyle}>
              {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label={at('orderDetail.bookingInfo.visitType')}>
          <select value={visitType} onChange={e => setVisitType(e.target.value as 'TASTING' | 'TASTING_LUNCH')} style={inputStyle}>
            <option value="TASTING">{at('orders.visit.tasting')}</option>
            <option value="TASTING_LUNCH">{at('orders.visit.tastingLunch')}</option>
          </select>
        </Field>

        <Field label={at('newOrder.bookingDetails.company')}>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={inputStyle}>
            <option value="">{at('newOrder.bookingDetails.individual')}</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        {!isCompany && (
          <Field label={at('newOrder.bookingDetails.guestCount')}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={guestCountStr}
              onChange={e => setGuestCountStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => setGuestCountStr(String(Math.max(1, parseInt(e.target.value) || 1)))}
              style={inputStyle}
            />
          </Field>
        )}
      </Card>

      {/* ── Contact ── */}
      <Card title={at('newOrder.contact.title')}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label={at('newOrder.contact.firstName')} half>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </Field>
          <Field label={at('newOrder.contact.lastName')} half>
            <input value={surname} onChange={e => setSurname(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <Field label={at('orderDetail.bookingInfo.phone')}>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={at('orderDetail.bookingInfo.email')}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={at('orderDetail.bookingInfo.notes')}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder={at('orders.editPanel.notesPlaceholder')}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
      </Card>

      {/* ── Guest Breakdown & Dishes (company only) ── */}
      {isCompany && (
        <Card title={at('orderDetail.guestBreakdown.title')}>
          {prices.length === 0 && (
            <div className="text-xs rounded-lg p-3 mb-4" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
              <strong>{at('newOrder.guestBreakdown.noTiers', { name: selectedCompany?.name ?? '' })}</strong>{' '}
              {at('newOrder.guestBreakdown.wontCalc')}{' '}
              <a href="/admin/companies" style={{ textDecoration: 'underline' }}>{at('newOrder.guestBreakdown.addTiersLink')}</a>.
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            <Field label={at('orderDetail.guestBreakdown.tastingGuests')} half>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={tastingGuestsStr}
                onChange={e => setTastingGuestsStr(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={e => setTastingGuestsStr(String(Math.max(0, parseInt(e.target.value) || 0)))}
                style={inputStyle}
              />
            </Field>
            <Field label={at('orderDetail.guestBreakdown.lunchGuests')} half>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={lunchGuestsStr}
                onChange={e => setLunchGuestsStr(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={e => setLunchGuestsStr(String(Math.max(0, parseInt(e.target.value) || 0)))}
                style={inputStyle}
              />
            </Field>
            <div>
              <Field label={at('orderDetail.guestBreakdown.freeGuests')} half>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={freeGuestsStr}
                  onChange={e => setFreeGuestsStr(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={e => setFreeGuestsStr(String(Math.max(0, parseInt(e.target.value) || 0)))}
                  style={inputStyle}
                />
              </Field>
              <p className="text-xs mt-0.5" style={{ color: C.faint }}>{at('orderDetail.guestBreakdown.freeGuestsHint')}</p>
            </div>
          </div>

          {vegItems.length > 0 && (
            <Field label={at('orderDetail.guestBreakdown.hotDishVeg')}>
              <select value={hotDishVeg} onChange={e => setHotDishVeg(e.target.value)} style={inputStyle}>
                <option value="">{at('orderDetail.guestBreakdown.none')}</option>
                {vegItems.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
              </select>
            </Field>
          )}
          {meatItems.length > 0 && (
            <Field label={at('orderDetail.guestBreakdown.hotDishMeat')}>
              <select value={hotDishMeat} onChange={e => setHotDishMeat(e.target.value)} style={inputStyle}>
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
                <tr style={{ backgroundColor: '#f5efe6', borderBottom: `1px solid ${C.border}` }}>
                  {[at('orderDetail.masterclass.colItem'), at('orderDetail.masterclass.colUnit'), at('orderDetail.masterclass.colQty'), at('orderDetail.masterclass.colPricePerUnit'), at('orderDetail.masterclass.colTotal'), ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium" style={{ color: '#8b4513' }}>{h}</th>
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
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>{l.pricePerUnit}₾</td>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                      {(l.quantity * l.pricePerUnit).toFixed(2)}₾
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
              <div className="text-sm pb-2" style={{ color: C.muted }}>= {lineTotal.toFixed(2)}₾</div>
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
                <span className="text-sm font-medium" style={{ color: C.wine }}>{e.amount.toFixed(2)}₾</span>
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
        {/* Tier banner */}
        {tier && (
          <div className="text-xs rounded-lg px-3 py-2 mb-3" style={{ backgroundColor: '#f5efe6', color: '#8b4513' }}>
            <span className="font-semibold">{at('orderDetail.total.tierInUse')}</span>{' '}
            {tier.minGuests}–{tier.maxGuests} {at('orderDetail.total.guests')} ·{' '}
            {at('orders.col.tasting')} <strong>{tier.pricePerPerson}₾/pp</strong>
            {' · '}
            {at('orders.col.lunch')} <strong>{tier.tastingLunchPricePerPerson}₾/pp</strong>
            {' · '}
            {at('orderDetail.total.regFee')} <strong>{tier.registrationPrice}₾</strong>
          </div>
        )}
        {/* Manual rate inputs */}
        {showManualRates && (
          <div className="mb-3">
            <p className="text-xs mb-2" style={{ color: C.muted }}>
              {isCompany ? at('newOrder.total.manualRatesCompany') : at('newOrder.total.manualRatesIndividual')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.guestBreakdown.tastingRatePP')}</label>
                <input
                  type="text" inputMode="decimal"
                  value={manualTastingRateStr}
                  onChange={e => setManualTastingRateStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={e => setManualTastingRateStr(String(Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.guestBreakdown.lunchRatePP')}</label>
                <input
                  type="text" inputMode="decimal"
                  value={manualLunchRateStr}
                  onChange={e => setManualLunchRateStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={e => setManualLunchRateStr(String(Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}

        {/* Breakdown lines */}
        <div className="space-y-1.5 mb-3">
          {(tier || (!isCompany && manualTastingRate > 0) || (isCompany && tastingGuests > 0 && manualTastingRate > 0)) && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {at('orders.col.tasting')} ({isCompany ? tastingGuests : guestCount} × {tier ? tier.pricePerPerson : manualTastingRate}₾)
              </span>
              <span style={{ color: C.text }}>{tastingAmt.toFixed(2)}₾</span>
            </div>
          )}
          {(lunchGuests > 0 || (!isCompany && manualLunchRate > 0)) && (lunchAmt > 0) && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {at('orderDetail.total.tastingLunch')} ({lunchGuests} × {tier ? tier.tastingLunchPricePerPerson : manualLunchRate}₾)
              </span>
              <span style={{ color: C.text }}>{lunchAmt.toFixed(2)}₾</span>
            </div>
          )}
          {tier && tier.registrationPrice > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{at('orderDetail.total.registrationFee')}</span>
              <span style={{ color: C.text }}>{tier.registrationPrice.toFixed(2)}₾</span>
            </div>
          )}
          {lines.map(l => (
            <div key={l.tempId} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{l.name} × {l.quantity}</span>
              <span style={{ color: C.text }}>{(l.quantity * l.pricePerUnit).toFixed(2)}₾</span>
            </div>
          ))}
          {extras.map(e => (
            <div key={e.tempId} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{e.label}</span>
              <span style={{ color: C.text }}>{e.amount.toFixed(2)}₾</span>
            </div>
          ))}
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
          {submitting ? at('newOrder.total.creating') : at('newOrder.total.create')}
        </button>
      </Card>
    </div>
  )
}
