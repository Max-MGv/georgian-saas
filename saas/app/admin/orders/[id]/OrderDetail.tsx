'use client'

import { useState, useMemo } from 'react'
import { updateOrderEnhanced } from '@/app/actions/orders'
import { findTier } from '@/lib/pricingUtils'
import { addMasterclassLine, removeMasterclassLine } from '@/app/actions/orderMasterclass'
import { addOrderExtra, removeOrderExtra } from '@/app/actions/orderExtras'
import { UNIT_LABELS } from '@/lib/masterclass'
import type { MasterclassUnit } from '@/lib/masterclass'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

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

// ─── Types ────────────────────────────────────────────────────────────────────

type Price = {
  id: string
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}

type MasterclassItemRow = {
  id: string
  name: string
  unitType: string
  pricePerUnit: number
  active: boolean
}

type MasterclassLine = {
  id: string
  masterclassItemId: string
  quantity: number
  pricePerUnit: number
  masterclassItem: MasterclassItemRow
}

type ExtraRow = { id: string; label: string; amount: number }
type MenuItemRow = { id: string; name: string; type: string }

type OrderProp = {
  id: string
  date: Date
  timeSlot: string
  bookingType: string
  visitType: string
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  name: string
  surname: string
  email: string | null
  phone: string | null
  notes: string | null
  totalPrice: number | null
  company: {
    id: string
    name: string
    identificationCode: string | null
    prices: Price[]
  } | null
  masterclassLines: MasterclassLine[]
  extras: ExtraRow[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border mb-4" style={{ borderColor: C.border }}>
      <div
        className="px-5 py-3 border-b"
        style={{ borderColor: C.border, backgroundColor: '#f5efe6' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#8b4513' }}
        >
          {title}
        </h3>
      </div>
      <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-xs w-28 flex-shrink-0 pt-0.5" style={{ color: C.faint }}>
        {label}
      </span>
      <span className="text-sm" style={{ color: C.text }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderDetail({
  order,
  menuItems,
  masterclassItems,
}: {
  order: OrderProp
  menuItems: MenuItemRow[]
  masterclassItems: MasterclassItemRow[]
}) {
  // ── Guest / dish / notes state ─────────────────────────────────────────────
  // String state so the user can clear the field and type a new number freely
  const [tastingGuestsStr, setTastingGuestsStr] = useState(String(order.tastingGuestCount))
  const [lunchGuestsStr, setLunchGuestsStr] = useState(String(order.lunchGuestCount))
  const [freeGuestsStr, setFreeGuestsStr] = useState(String(order.freeGuestCount))
  // Manual per-person rates for individual / no-tier orders
  const [manualTastingRateStr, setManualTastingRateStr] = useState('0')
  const [manualLunchRateStr, setManualLunchRateStr] = useState('0')
  // Parsed numbers for calculations
  const tastingGuests = Math.max(0, parseInt(tastingGuestsStr) || 0)
  const lunchGuests = Math.max(0, parseInt(lunchGuestsStr) || 0)
  const freeGuests = Math.max(0, parseInt(freeGuestsStr) || 0)
  const [hotDishVeg, setHotDishVeg] = useState(order.hotDishVegetable ?? '')
  const [hotDishMeat, setHotDishMeat] = useState(order.hotDishMeat ?? '')
  const [foodNotes, setFoodNotes] = useState(order.foodNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // ── Masterclass lines state ────────────────────────────────────────────────
  const [lines, setLines] = useState<MasterclassLine[]>(order.masterclassLines)
  const [addingLine, setAddingLine] = useState(false)
  const [newLineItemId, setNewLineItemId] = useState('')
  const [newLineQty, setNewLineQty] = useState('1')
  const [lineLoading, setLineLoading] = useState(false)

  // ── Extras state ───────────────────────────────────────────────────────────
  const [extras, setExtras] = useState<ExtraRow[]>(order.extras)
  const [addingExtra, setAddingExtra] = useState(false)
  const [newExtraLabel, setNewExtraLabel] = useState('')
  const [newExtraAmount, setNewExtraAmount] = useState('')
  const [extraLoading, setExtraLoading] = useState(false)

  // ── Pricing calculations ───────────────────────────────────────────────────
  const prices = order.company?.prices ?? []
  const payingGuests = tastingGuests + lunchGuests

  // Tier driven by paying guests. If no exact range match, falls back to the
  // highest-priced tier so small groups are never under-charged.
  const tier = useMemo(
    () => findTier(prices, payingGuests),
    [prices, payingGuests]
  )

  // Tier for original guestCount (pre-enhancement display fallback)
  const legacyTier = useMemo(
    () => findTier(prices, order.guestCount),
    [prices, order.guestCount]
  )
  // Base price derived from the original booking (guestCount × rate + reg fee)
  const legacyBase = legacyTier
    ? order.guestCount *
        (order.visitType === 'TASTING_LUNCH'
          ? legacyTier.tastingLunchPricePerPerson || legacyTier.pricePerPerson
          : legacyTier.pricePerPerson) +
      legacyTier.registrationPrice
    : (order.totalPrice ?? 0)

  const tastingAmt = tier ? tastingGuests * tier.pricePerPerson : null
  const lunchAmt = tier ? lunchGuests * tier.tastingLunchPricePerPerson : null
  const regFee = tier ? tier.registrationPrice : null
  const masterclassAmt = lines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = extras.reduce((s, e) => s + e.amount, 0)
  const manualTastingRate = Math.max(0, parseFloat(manualTastingRateStr) || 0)
  const manualLunchRate = Math.max(0, parseFloat(manualLunchRateStr) || 0)

  const computedTotal: number | null =
    tier != null
      ? // Company tier: split counts × tier rates
        tastingAmt! + lunchAmt! + regFee! + masterclassAmt + extrasAmt
      : payingGuests === 0
        ? // Pre-enhancement fallback: guestCount-based legacy total
          legacyBase + masterclassAmt + extrasAmt
        : // Individual / no-tier: use admin-supplied per-person rates
          tastingGuests * manualTastingRate + lunchGuests * manualLunchRate + masterclassAmt + extrasAmt

  // ── Selected item for add-line form ───────────────────────────────────────
  const selectedMcItem = masterclassItems.find(i => i.id === newLineItemId)
  const isFlatUnit = selectedMcItem?.unitType === 'FLAT'
  const lineTotal = selectedMcItem
    ? isFlatUnit
      ? selectedMcItem.pricePerUnit
      : (parseInt(newLineQty) || 1) * selectedMcItem.pricePerUnit
    : 0

  function handleNewLineItemChange(itemId: string) {
    setNewLineItemId(itemId)
    const item = masterclassItems.find(i => i.id === itemId)
    if (!item) return
    if (item.unitType === 'PER_PERSON') setNewLineQty(String(payingGuests || 1))
    else setNewLineQty('1')
  }

  // ── Save enhanced fields ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const result = await updateOrderEnhanced(order.id, {
      tastingGuestCount: tastingGuests,
      lunchGuestCount: lunchGuests,
      freeGuestCount: freeGuests,
      hotDishVegetable: hotDishVeg || null,
      hotDishMeat: hotDishMeat || null,
      foodNotes: foodNotes || null,
      ...(prices.length === 0 && payingGuests > 0
        ? { manualTastingRate, manualLunchRate }
        : {}),
    })
    setSaving(false)
    if ('error' in result) {
      setSaveMsg(result.error)
    } else {
      setSaveMsg('Saved ✓')
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  // ── Add / remove masterclass line ─────────────────────────────────────────
  async function handleAddLine() {
    if (!newLineItemId || !selectedMcItem) return
    setLineLoading(true)
    const qty = isFlatUnit ? 1 : parseInt(newLineQty) || 1
    const result = await addMasterclassLine(order.id, {
      masterclassItemId: newLineItemId,
      quantity: qty,
    })
    if ('lineId' in result) {
      setLines(prev => [
        ...prev,
        {
          id: result.lineId,
          masterclassItemId: newLineItemId,
          quantity: qty,
          pricePerUnit: selectedMcItem.pricePerUnit,
          masterclassItem: selectedMcItem,
        },
      ])
    }
    setNewLineItemId('')
    setNewLineQty('1')
    setAddingLine(false)
    setLineLoading(false)
  }

  async function handleRemoveLine(lineId: string) {
    setLineLoading(true)
    await removeMasterclassLine(lineId, order.id)
    setLines(prev => prev.filter(l => l.id !== lineId))
    setLineLoading(false)
  }

  // ── Add / remove extra ─────────────────────────────────────────────────────
  async function handleAddExtra() {
    if (!newExtraLabel.trim() || !newExtraAmount) return
    setExtraLoading(true)
    const amount = parseFloat(newExtraAmount) || 0
    const result = await addOrderExtra(order.id, { label: newExtraLabel, amount })
    if ('extraId' in result) {
      setExtras(prev => [...prev, { id: result.extraId, label: newExtraLabel, amount }])
    }
    setNewExtraLabel('')
    setNewExtraAmount('')
    setAddingExtra(false)
    setExtraLoading(false)
  }

  async function handleRemoveExtra(extraId: string) {
    setExtraLoading(true)
    await removeOrderExtra(extraId, order.id)
    setExtras(prev => prev.filter(e => e.id !== extraId))
    setExtraLoading(false)
  }

  const vegItems = menuItems.filter(i => i.type === 'VEGETABLE')
  const meatItems = menuItems.filter(i => i.type === 'MEAT')

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold" style={{ color: C.text }}>
          {order.name} {order.surname}
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          {formatDate(order.date)} · {order.timeSlot} ·{' '}
          <span className="font-mono text-xs">#{order.id.slice(-8)}</span>
        </p>
      </div>

      {/* ── Booking Info (read-only) ── */}
      <Card title="Booking Info">
        <InfoRow label="Date" value={formatDate(order.date)} />
        <InfoRow label="Time" value={order.timeSlot} />
        <InfoRow
          label="Visit type"
          value={order.visitType === 'TASTING' ? 'Wine Tasting' : 'Tasting + Lunch'}
        />
        <InfoRow
          label="Booking type"
          value={
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: order.bookingType === 'COMPANY' ? '#fef3c7' : '#f0fdf4',
                color: order.bookingType === 'COMPANY' ? '#92400e' : '#166534',
              }}
            >
              {order.bookingType === 'COMPANY' ? 'Company' : 'Individual'}
            </span>
          }
        />
        {order.company && <InfoRow label="Company" value={order.company.name} />}
        <InfoRow label="Total guests" value={order.guestCount} />
        <InfoRow label="Phone" value={order.phone} />
        <InfoRow label="Email" value={order.email} />
        {order.notes && <InfoRow label="Notes" value={order.notes} />}
      </Card>

      {/* ── Guest Breakdown & Dishes ── */}
      <Card title="Guest Breakdown & Dishes">
        {order.bookingType !== 'COMPANY' && (
          <div
            className="text-xs rounded-lg p-3 mb-4"
            style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
          >
            Split-count pricing applies to company bookings with price tiers. You can still
            record guest counts and dishes here.
          </div>
        )}
        {order.bookingType === 'COMPANY' && prices.length === 0 && (
          <div
            className="text-xs rounded-lg p-3 mb-4"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
          >
            <strong>No price tiers found for {order.company?.name ?? 'this company'}.</strong>{' '}
            Guest counts cannot affect the total without rates.{' '}
            <a href="/admin/companies" style={{ textDecoration: 'underline' }}>
              Add price tiers in Companies admin
            </a>{' '}
            then come back to save the guest breakdown.
          </div>
        )}

        {/* Guest count inputs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              Tasting guests
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={tastingGuestsStr}
              onChange={e => setTastingGuestsStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => setTastingGuestsStr(String(Math.max(0, parseInt(e.target.value) || 0)))}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              Lunch guests
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={lunchGuestsStr}
              onChange={e => setLunchGuestsStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => setLunchGuestsStr(String(Math.max(0, parseInt(e.target.value) || 0)))}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              Free guests
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={freeGuestsStr}
              onChange={e => setFreeGuestsStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => setFreeGuestsStr(String(Math.max(0, parseInt(e.target.value) || 0)))}
              style={inputStyle}
            />
            <p className="text-xs mt-0.5" style={{ color: C.faint }}>
              guide / driver / under-12
            </p>
          </div>
        </div>

        {/* Hot dishes */}
        {vegItems.length > 0 && (
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              Hot dish — Vegetable
            </label>
            <select
              value={hotDishVeg}
              onChange={e => setHotDishVeg(e.target.value)}
              style={inputStyle}
            >
              <option value="">— None —</option>
              {vegItems.map(i => (
                <option key={i.id} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        {meatItems.length > 0 && (
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              Hot dish — Meat
            </label>
            <select
              value={hotDishMeat}
              onChange={e => setHotDishMeat(e.target.value)}
              style={inputStyle}
            >
              <option value="">— None —</option>
              {meatItems.map(i => (
                <option key={i.id} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        {vegItems.length === 0 && meatItems.length === 0 && (
          <p className="text-xs mb-3" style={{ color: C.faint }}>
            No active menu items. Add them in{' '}
            <a href="/admin/menu-items" style={{ color: C.wine }}>
              Menu Items admin
            </a>
            .
          </p>
        )}

        {/* Food notes */}
        <div className="mb-4">
          <label className="text-xs block mb-1" style={{ color: C.faint }}>
            Food notes
          </label>
          <textarea
            value={foodNotes}
            onChange={e => setFoodNotes(e.target.value)}
            rows={2}
            placeholder="Allergies, preferences, kitchen notes…"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: C.wine }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saveMsg && (
            <span
              className="text-sm"
              style={{ color: saveMsg.includes('✓') ? '#16a34a' : '#b91c1c' }}
            >
              {saveMsg}
            </span>
          )}
        </div>
      </Card>

      {/* ── Masterclass Add-ons ── */}
      <Card title="Masterclass Add-ons">
        {lines.length > 0 && (
          <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: '#f5efe6',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {['Item', 'Unit', 'Qty', '₾/unit', 'Total', ''].map(h => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: '#8b4513' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr
                    key={l.id}
                    style={{
                      borderBottom:
                        i < lines.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <td className="px-3 py-2 text-sm" style={{ color: C.text }}>
                      {l.masterclassItem.name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
                      >
                        {UNIT_LABELS[l.masterclassItem.unitType as MasterclassUnit] ??
                          l.masterclassItem.unitType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>
                      {l.quantity}
                    </td>
                    <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>
                      {l.pricePerUnit}₾
                    </td>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                      {(l.quantity * l.pricePerUnit).toFixed(2)}₾
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleRemoveLine(l.id)}
                        disabled={lineLoading}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length === 0 && !addingLine && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>
            No masterclass items added yet.
          </p>
        )}

        {/* Add line form */}
        {addingLine ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 160px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                Item
              </label>
              <select
                value={newLineItemId}
                onChange={e => handleNewLineItemChange(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select item…</option>
                {masterclassItems.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({UNIT_LABELS[i.unitType as MasterclassUnit]})
                  </option>
                ))}
              </select>
            </div>

            {!isFlatUnit && (
              <div style={{ width: 80 }}>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  Qty
                </label>
                <input
                  type="number"
                  min={1}
                  value={newLineQty}
                  onChange={e => setNewLineQty(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {selectedMcItem && (
              <div className="text-sm pb-2" style={{ color: C.muted }}>
                = {lineTotal.toFixed(2)}₾
              </div>
            )}

            <button
              onClick={handleAddLine}
              disabled={lineLoading || !newLineItemId}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {lineLoading ? '…' : 'Add'}
            </button>
            <button
              onClick={() => {
                setAddingLine(false)
                setNewLineItemId('')
                setNewLineQty('1')
              }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              Cancel
            </button>
          </div>
        ) : masterclassItems.length > 0 ? (
          <button
            onClick={() => setAddingLine(true)}
            className="text-sm font-medium"
            style={{ color: C.wine }}
          >
            + Add masterclass
          </button>
        ) : (
          <p className="text-xs" style={{ color: C.faint }}>
            No active masterclass items.{' '}
            <a href="/admin/masterclass" style={{ color: C.wine }}>
              Add some in Masterclass admin
            </a>
            .
          </p>
        )}
      </Card>

      {/* ── Extra Charges ── */}
      <Card title="Extra Charges">
        {extras.length > 0 && (
          <div className="space-y-2 mb-3">
            {extras.map(e => (
              <div key={e.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm" style={{ color: C.text }}>
                  {e.label}
                </span>
                <span className="text-sm font-medium" style={{ color: C.wine }}>
                  {e.amount.toFixed(2)}₾
                </span>
                <button
                  onClick={() => handleRemoveExtra(e.id)}
                  disabled={extraLoading}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {extras.length === 0 && !addingExtra && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>
            No extra charges added yet.
          </p>
        )}

        {/* Add extra form */}
        {addingExtra ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 140px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                Description
              </label>
              <input
                value={newExtraLabel}
                onChange={e => setNewExtraLabel(e.target.value)}
                placeholder="e.g. Additional wine"
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <div style={{ width: 110 }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                Amount (₾)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={newExtraAmount}
                onChange={e => setNewExtraAmount(e.target.value)}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <button
              onClick={handleAddExtra}
              disabled={extraLoading || !newExtraLabel.trim() || !newExtraAmount}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {extraLoading ? '…' : 'Add'}
            </button>
            <button
              onClick={() => {
                setAddingExtra(false)
                setNewExtraLabel('')
                setNewExtraAmount('')
              }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingExtra(true)}
            className="text-sm font-medium"
            style={{ color: C.wine }}
          >
            + Add extra charge
          </button>
        )}
      </Card>

      {/* ── Order Total ── */}
      <Card title="Order Total">
        {/* Active tier info */}
        {tier && payingGuests > 0 && (
          <div
            className="text-xs rounded-lg px-3 py-2 mb-3"
            style={{ backgroundColor: '#f5efe6', color: '#8b4513' }}
          >
            <span className="font-semibold">Tier in use:</span>{' '}
            {tier.minGuests}–{tier.maxGuests} guests ·{' '}
            Tasting <strong>{tier.pricePerPerson}₾/pp</strong>
            {' · '}
            Lunch <strong>{tier.tastingLunchPricePerPerson}₾/pp</strong>
            {' · '}
            Reg fee <strong>{tier.registrationPrice}₾</strong>
          </div>
        )}
        {/* Manual rate inputs for individual / no-tier orders */}
        {!tier && payingGuests > 0 && (
          <div className="mb-3">
            <p className="text-xs mb-2" style={{ color: C.muted }}>
              No price tiers — enter rates manually:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  Tasting ₾/pp
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualTastingRateStr}
                  onChange={e => setManualTastingRateStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={e => setManualTastingRateStr(String(Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  Lunch ₾/pp
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualLunchRateStr}
                  onChange={e => setManualLunchRateStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={e => setManualLunchRateStr(String(Math.max(0, parseFloat(e.target.value) || 0)))}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}
        {/* Lunch rate = 0 warning */}
        {tier && lunchGuests > 0 && tier.tastingLunchPricePerPerson === 0 && (
          <div
            className="text-xs rounded-lg px-3 py-2 mb-3"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
          >
            <strong>Lunch rate is 0₾/pp</strong> — {lunchGuests} lunch guest
            {lunchGuests !== 1 ? 's' : ''} will not add to the total.{' '}
            <a href="/admin/companies" style={{ textDecoration: 'underline' }}>
              Set the Lunch ₾/pp in Companies admin
            </a>{' '}
            and reload this page.
          </div>
        )}
        <div className="space-y-1.5">
          {/* Company tier lines */}
          {tier && tastingGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                Tasting ({tastingGuests} × {tier.pricePerPerson}₾)
              </span>
              <span style={{ color: C.text }}>{tastingAmt!.toFixed(2)}₾</span>
            </div>
          )}
          {tier && lunchGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                Tasting+Lunch ({lunchGuests} × {tier.tastingLunchPricePerPerson}₾)
              </span>
              <span style={{ color: C.text }}>{lunchAmt!.toFixed(2)}₾</span>
            </div>
          )}
          {tier && tier.registrationPrice > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>Registration fee</span>
              <span style={{ color: C.text }}>{tier.registrationPrice.toFixed(2)}₾</span>
            </div>
          )}
          {/* Manual rate lines for individual / no-tier orders */}
          {!tier && payingGuests > 0 && tastingGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                Tasting ({tastingGuests} × {manualTastingRate}₾)
              </span>
              <span style={{ color: C.text }}>
                {(tastingGuests * manualTastingRate).toFixed(2)}₾
              </span>
            </div>
          )}
          {!tier && payingGuests > 0 && lunchGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                Tasting+Lunch ({lunchGuests} × {manualLunchRate}₾)
              </span>
              <span style={{ color: C.text }}>
                {(lunchGuests * manualLunchRate).toFixed(2)}₾
              </span>
            </div>
          )}
          {/* Pre-enhancement fallback: split counts not set yet */}
          {payingGuests === 0 && order.guestCount > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {legacyTier
                  ? `${order.visitType === 'TASTING_LUNCH' ? 'Tasting+Lunch' : 'Tasting'} (${order.guestCount} guests)`
                  : 'Base price (original)'}
              </span>
              <span style={{ color: C.text }}>{legacyBase.toFixed(2)}₾</span>
            </div>
          )}
          {lines.map(l => (
            <div key={l.id} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {l.masterclassItem.name} × {l.quantity}
              </span>
              <span style={{ color: C.text }}>
                {(l.quantity * l.pricePerUnit).toFixed(2)}₾
              </span>
            </div>
          ))}
          {extras.map(e => (
            <div key={e.id} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{e.label}</span>
              <span style={{ color: C.text }}>{e.amount.toFixed(2)}₾</span>
            </div>
          ))}
        </div>

        <div
          className="mt-3 pt-3 flex justify-between items-center border-t"
          style={{ borderColor: C.border }}
        >
          <span className="text-sm font-semibold" style={{ color: C.muted }}>
            Total
          </span>
          <span className="text-2xl font-bold" style={{ color: C.wine }}>
            {computedTotal != null
              ? `${computedTotal.toFixed(2)}₾`
              : order.totalPrice != null
                ? `${order.totalPrice.toFixed(2)}₾`
                : '—'}
          </span>
        </div>

        {payingGuests > 0 && (tier || prices.length === 0) && (
          <p className="text-xs mt-1 text-right" style={{ color: C.faint }}>
            Live preview — click "Save changes" above to persist.
          </p>
        )}
      </Card>
    </div>
  )
}
