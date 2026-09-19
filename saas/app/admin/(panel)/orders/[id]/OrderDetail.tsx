'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { asTetri, fromMajor, toMajor, formatTetri, multiplyTetri } from '@/lib/money'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { updateOrderEnhanced, changeBookingStatus, sendOrderInvoice, assignOrderCompany } from '@/app/actions/orders'
import { comboRatePerPerson, findTier, priceBooking, ratesForParty, ratesFromManual, ratesFromSnapshot } from '@/lib/pricingUtils'
import { addMasterclassLine, removeMasterclassLine } from '@/app/actions/orderMasterclass'
import { addOrderExtra, removeOrderExtra } from '@/app/actions/orderExtras'
import { UNIT_LABELS } from '@/lib/masterclass'
import type { MasterclassUnit } from '@/lib/masterclass'
import { adminT } from '@/lib/adminT'
import {
  bookingStagePatch,
  invoiceSentPatch,
  paidPatch,
  type BookingStatusChange,
} from '@/lib/statusWrite'
import { BOOKING_STAGES, buildFlowLine, unreachedStages, isCancelled, CANCELLED, type FlowState } from '@/lib/statusFlow'
import InvoicePrint from '../InvoicePrint'

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

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusStyle = { labelKey: string; bg: string; color: string }

/**
 * Mirrors OrdersTable's own map - the same statuses have to look the same on
 * the list and on the order's own page. Keyed by `BookingStage`, plus the two
 * payment milestones, which appear as flow-line steps and dropdown entries.
 */
const STATUS_CONFIG: Record<string, StatusStyle> = {
  NEW:       { labelKey: 'orders.status.new',       bg: '#fef9c3', color: '#a16207' },
  CONFIRMED: { labelKey: 'orders.status.confirmed', bg: '#dbeafe', color: '#1d4ed8' },
  COMPLETED: { labelKey: 'orders.status.completed', bg: '#bbf7d0', color: '#065f46' },
  CANCELLED: { labelKey: 'orders.status.cancelled', bg: '#fee2e2', color: '#b91c1c' },
  unpaid:       { labelKey: 'orders.status.unpaid',      bg: '#f5f5f4', color: '#44403c' },
  // Both spellings: the flow-line names its event steps INVOICE_SENT / PAID,
  // the dropdown and filters use the lowercase payment-state words.
  INVOICE_SENT: { labelKey: 'orders.status.invoiceSent', bg: '#fef3c7', color: '#92400e' },
  PAID:         { labelKey: 'orders.status.paid',        bg: '#dcfce7', color: '#166534' },
  invoiced:     { labelKey: 'orders.status.invoiceSent', bg: '#fef3c7', color: '#92400e' },
  paid:         { labelKey: 'orders.status.paid',        bg: '#dcfce7', color: '#166534' },
}

const UNKNOWN_STATUS_STYLE: StatusStyle = { labelKey: '', bg: '#f3f4f6', color: '#374151' }

function styleFor(code: string | null): StatusStyle {
  return (code && STATUS_CONFIG[code]) || UNKNOWN_STATUS_STYLE
}

function labelFor(locale: string, code: string | null): string {
  if (!code) return '—'
  const cfg = STATUS_CONFIG[code]
  return cfg ? adminT(locale, cfg.labelKey) : code
}

/**
 * "We have asked for money but it hasn't arrived" — the one financial state the
 * flow-line below cannot show, because the line's payment step is Paid and
 * `invoiced` sits before it. Without this the winery could set Invoice Sent and
 * then see no trace of it anywhere, which is what it used to say on the pill.
 *
 * Paid needs no marker here: the flow-line already ticks it, in the position it
 * actually happened.
 */
function InvoiceSentMark({ locale }: { locale: string }) {
  const label = adminT(locale, 'orders.status.invoiceSent')
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center rounded-full font-bold flex-shrink-0"
      style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.65rem', padding: '0.1rem 0.4rem', lineHeight: 1.5 }}
    >
      ✉
    </span>
  )
}

/**
 * The merged one-line flow (Plan-StatusModel chunk 4) — horizontal here,
 * because the detail page's action bar runs across the top rather than down a
 * card's edge like the wine-orders list.
 *
 * One line, with Paid where payment actually happened: an individual who paid
 * at checkout reads new → paid → confirmed → completed, a company on invoice
 * terms reads new → confirmed → completed → paid, both off the same two
 * columns. Read-only — the dropdown beside it is what changes the status, and
 * duplicating that as click targets would give the same action two places to
 * disagree.
 */
function FlowLine({ steps, locale }: { steps: ReturnType<typeof buildFlowLine>; locale: string }) {
  return (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5 mb-4">
      {steps.map((step, i) => (
        <div key={step.code} className="flex items-center gap-1">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: step.done ? styleFor(step.code).bg : 'transparent',
              color: step.done ? styleFor(step.code).color : C.faint,
              border: `1px solid ${step.done ? styleFor(step.code).color + '44' : C.border}`,
              fontWeight: step.active ? 700 : 400,
            }}
          >
            {step.done && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {labelFor(locale, step.code)}
          </span>
          {i < steps.length - 1 && (
            <span style={{ color: step.done && steps[i + 1].done ? C.wine : C.border, fontSize: '0.75rem' }}>→</span>
          )}
        </div>
      ))}
    </div>
  )
}

type Payment = { recipientName: string; personalNumber: string; bankName: string; bankCode: string; iban: string }

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
  stage: string
  createdAt: Date | string
  confirmedAt: Date | string | null
  completedAt: Date | string | null
  invoiceSentAt: Date | string | null
  paidAt: Date | string | null
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
  // The rates this order was actually sold at. The page's query already loaded
  // them (it uses `include`), but its prop literal listed fields one by one and
  // never passed these three down — so this screen had no way to know what the
  // order cost, and invented ₾50 instead (#50) while double-counting its lines
  // against the stored total (#52). Both fixes need these here.
  tastingRateSnapshot: number | null
  lunchRateSnapshot: number | null
  registrationFeeSnapshot: number | null
  requestedCompanyName: string | null
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
        style={{ borderColor: C.border, backgroundColor: 'var(--site-bg)' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--site-secondary)' }}
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
  payment,
  detailed,
  displayName = 'Your Winery',
  menuItems,
  masterclassItems,
  companies = [],
  locale = 'en',
}: {
  order: OrderProp
  payment: Payment
  detailed: boolean
  displayName?: string
  menuItems: MenuItemRow[]
  masterclassItems: MasterclassItemRow[]
  /** Real companies to link a no-company order to (Feature 180). Excludes
   * the isIndividual pricing-container row — see page.tsx's fetch. */
  companies?: { id: string; name: string }[]
  locale?: string
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const router = useRouter()

  // ── Link to a real company (Feature 180) ───────────────────────────────────
  // Only relevant for an order that came in with no companyId at all — see
  // assignOrderCompany's own doc comment for why this never happens
  // automatically.
  const [assignCompanyId, setAssignCompanyId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')
  const [assignError, setAssignError] = useState(false)

  async function handleAssignCompany() {
    if (!assignCompanyId) return
    setAssigning(true)
    setAssignMsg('')
    const result = await assignOrderCompany(order.id, assignCompanyId)
    setAssigning(false)
    if ('error' in result) {
      setAssignError(true)
      setAssignMsg(result.error)
      return
    }
    setAssignError(false)
    setAssignMsg('Linked — refreshing…')
    router.refresh()
  }
  // ── Guest / dish / notes state ─────────────────────────────────────────────
  // String state so the user can clear the field and type a new number freely
  // The party size. Editable since 2026-09-19 because it, not the split, picks
  // the price tier — and because it used to drift from the split on every edit
  // (#54), leaving the invoice and the price describing different bookings.
  const [guestCountStr, setGuestCountStr] = useState(String(order.guestCount))
  const [tastingGuestsStr, setTastingGuestsStr] = useState(String(order.tastingGuestCount))
  const [lunchGuestsStr, setLunchGuestsStr] = useState(String(order.lunchGuestCount))
  const [freeGuestsStr, setFreeGuestsStr] = useState(String(order.freeGuestCount))
  // Manual per-person rates for individual / no-tier orders.
  //
  // Seeded from the order's own rate snapshot, NOT from a constant. Both boxes
  // were `useState('50')` until 2026-09-19 (#50), which meant the screen showed
  // "Rate: 50/50" for every individual order as though that were what it had
  // been sold at — and, because handleSave sent the boxes whenever the order
  // had no company prices, a Save after editing guest counts re-priced a ₾70/pp
  // booking at ₾50 and overwrote its real snapshot. Empty when there is no
  // snapshot to show: inventing a number here is the bug.
  const snapshotTastingMajor = order.tastingRateSnapshot != null ? String(toMajor(asTetri(order.tastingRateSnapshot))) : ''
  const snapshotLunchMajor = order.lunchRateSnapshot != null ? String(toMajor(asTetri(order.lunchRateSnapshot))) : ''
  const [manualTastingRateStr, setManualTastingRateStr] = useState(snapshotTastingMajor)
  const [manualLunchRateStr, setManualLunchRateStr] = useState(snapshotLunchMajor)
  const [customRates, setCustomRates] = useState(false)
  // Parsed numbers for calculations
  const partyGuestCount = Math.max(1, parseInt(guestCountStr) || 1)
  const tastingGuests = Math.max(0, parseInt(tastingGuestsStr) || 0)
  const lunchGuests = Math.max(0, parseInt(lunchGuestsStr) || 0)
  const freeGuests = Math.max(0, parseInt(freeGuestsStr) || 0)
  const splitTotal = tastingGuests + lunchGuests + freeGuests
  const [hotDishVeg, setHotDishVeg] = useState(order.hotDishVegetable ?? '')
  const [hotDishMeat, setHotDishMeat] = useState(order.hotDishMeat ?? '')
  const [foodNotes, setFoodNotes] = useState(order.foodNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // ── Top action bar state ───────────────────────────────────────────────────
  // Both axes are local state now, so the flow-line and the pill move on click
  // rather than waiting for the server round trip.
  const [flow, setFlow] = useState<FlowState>({
    stage: order.stage,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    finishedAt: order.completedAt,
    invoiceSentAt: order.invoiceSentAt,
    paidAt: order.paidAt,
  })
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [printReady, setPrintReady] = useState(false)
  const printPending = useRef(false)

  useEffect(() => {
    if (!statusMenuOpen) return
    function close() { setStatusMenuOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [statusMenuOpen])

  useEffect(() => {
    if (printReady && printPending.current) {
      printPending.current = false
      setTimeout(() => { window.print(); setPrintReady(false) }, 100)
    }
  }, [printReady])

  /**
   * The optimistic mirror of one status change, using the same pure patch
   * functions the server action calls rather than restating the rules - two
   * copies of "which columns does this move" is where drift hides.
   */
  function applyLocally(change: BookingStatusChange) {
    setFlow(prev => {
      const now = new Date()
      const dates = {
        confirmedAt: prev.confirmedAt ? new Date(prev.confirmedAt) : null,
        finishedAt: prev.finishedAt ? new Date(prev.finishedAt) : null,
        invoiceSentAt: prev.invoiceSentAt ? new Date(prev.invoiceSentAt) : null,
        paidAt: prev.paidAt ? new Date(prev.paidAt) : null,
      }
      switch (change.kind) {
        case 'stage': {
          const patch = bookingStagePatch(change.stage as never, dates, now)
          return {
            ...prev,
            stage: patch.stage,
            confirmedAt: patch.confirmedAt !== undefined ? patch.confirmedAt : prev.confirmedAt,
            finishedAt: patch.completedAt !== undefined ? patch.completedAt : prev.finishedAt,
          }
        }
        case 'paid':
          return { ...prev, ...paidPatch(change.value, dates, now) }
        case 'invoiceSent':
          return { ...prev, ...invoiceSentPatch(change.value, dates, now) }
        case 'restore':
          return prev
      }
    })
  }

  async function handleStatusChange(change: BookingStatusChange) {
    setStatusMenuOpen(false)
    applyLocally(change)
    await changeBookingStatus(order.id, change)
  }

  async function handleSendInvoice() {
    setSending(true)
    setSendMsg('')
    const result = await sendOrderInvoice(order.id, '')
    setSending(false)
    if ('error' in result) {
      setSendMsg(at('orderDetail.sendFailed'))
    } else {
      setSendMsg(at('orders.emailModal.sent'))
      // Sending an invoice stamps a date and nothing else: it records that we
      // asked for money, not that the visit happened, so it applies at any
      // stage rather than only from NEW or CONFIRMED as the old status did.
      if (flow.invoiceSentAt == null) applyLocally({ kind: 'invoiceSent', value: true })
      setTimeout(() => setSendMsg(''), 3000)
    }
  }

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

  // Party size drives the tier (2026-09-19). If no exact range match, falls back
  // to the highest-priced tier so small groups are never under-charged.
  const tier = useMemo(
    () => findTier(prices, partyGuestCount),
    [prices, partyGuestCount]
  )

  // Same lookup as `tier` now that both key off the party size; kept as its own
  // name because the breakdown row below reads differently when it is the only
  // basis for the total.
  const legacyTier = tier
  // Base price derived from the original booking (guestCount × rate + reg fee).
  //
  // MUST exclude line items, because the caller adds masterclassAmt + extrasAmt
  // to it. The fallback was `order.totalPrice ?? 0` until 2026-09-19 (#52) —
  // a figure that already contains those lines, so they were counted twice on
  // every individual order (`prices` comes from order.company?.prices, and an
  // individual has no company). The database, the orders table and the invoice
  // said ₾240; this screen said ₾280.
  //
  // The snapshot is the honest source for a line-free base, and reconstructing
  // it here is exactly what recalcOrderTotal does (pricing.ts:47-54). When
  // there is no snapshot there is nothing to rebuild from, so legacyBase is
  // null and the total falls back to the stored figure untouched.
  const snapshotBase =
    order.tastingRateSnapshot != null || order.lunchRateSnapshot != null
      ? partyGuestCount *
          (order.visitType === 'TASTING_LUNCH'
            ? (order.lunchRateSnapshot ?? 0)
            : (order.tastingRateSnapshot ?? 0)) +
        (order.registrationFeeSnapshot ?? 0)
      : null

  const legacyBase: number | null = legacyTier
    ? order.guestCount *
        (order.visitType === 'TASTING_LUNCH'
          ? comboRatePerPerson(legacyTier)
          : legacyTier.pricePerPerson) +
      legacyTier.registrationPrice
    : snapshotBase

  const tastingAmt = tier ? tastingGuests * tier.pricePerPerson : null
  const lunchAmt = tier ? lunchGuests * comboRatePerPerson(tier) : null
  const masterclassAmt = lines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = extras.reduce((s, e) => s + e.amount, 0)
  // The inputs hold GEL; everything they feed into is tetri (chunk 3).
  const manualTastingRate = fromMajor(Math.max(0, parseFloat(manualTastingRateStr) || 0))
  const manualLunchRate = fromMajor(Math.max(0, parseFloat(manualLunchRateStr) || 0))

  // null means "this screen cannot derive a total" — the display then shows the
  // stored order.totalPrice rather than a computed one. Every branch used to
  // return a number, which made that fallback unreachable and meant the screen
  // never displayed the stored total at all (#52).
  // Whichever rates apply, the sum is priceBooking's — the same function the
  // server uses, so this screen cannot disagree with what a Save will store.
  const previewRates =
    tier != null
      ? ratesForParty(prices, partyGuestCount)
      : (order.tastingRateSnapshot != null || customRates)
        ? (customRates
            ? ratesFromManual(manualTastingRate, manualLunchRate)
            : ratesFromSnapshot(order))
        : null

  const computedTotal: number | null = previewRates
    ? priceBooking(
        previewRates,
        { guestCount: partyGuestCount, tastingGuests, lunchGuests },
        order.visitType as 'TASTING' | 'TASTING_LUNCH',
        { masterclass: masterclassAmt, extras: extrasAmt },
      )
    : null

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
      guestCount: partyGuestCount,
      tastingGuestCount: tastingGuests,
      lunchGuestCount: lunchGuests,
      freeGuestCount: freeGuests,
      hotDishVegetable: hotDishVeg || null,
      hotDishMeat: hotDishMeat || null,
      foodNotes: foodNotes || null,
      // Only send rates there is a reason to believe: one the order already
      // carries, or one the admin deliberately typed. Sending unconditionally
      // is what let a hardcoded ₾50 overwrite a real snapshot (#50). When
      // neither holds, updateOrderEnhanced's manual branch does not fire and
      // the stored total and snapshot are left alone — the same stance
      // recalcOrderTotal's legacy branch takes: say nothing rather than guess.
      ...(prices.length === 0 && payingGuests > 0 && (order.tastingRateSnapshot != null || customRates)
        ? { manualTastingRate, manualLunchRate }
        : {}),
    })
    setSaving(false)
    if ('error' in result) {
      setSaveMsg(result.error)
    } else {
      setSaveMsg(at('orderDetail.guestBreakdown.savedOk'))
      setCustomRates(false)
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
    // The field is labelled "Amount (₾)", so what the admin typed is lari.
    // Everything downstream — ExtraRow, extrasAmt, the formatTetri renders —
    // is tetri, so convert here (bug #45; NewOrderForm.tsx has always done it).
    const amount = fromMajor(parseFloat(newExtraAmount) || 0)
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

  // ── Derived status view ────────────────────────────────────────────────────
  const displayCode = flow.stage
  const flowSteps = buildFlowLine(BOOKING_STAGES, flow)
  // Only what this order has not reached, so the menu can never offer a step
  // the flow-line above it already shows as done. Invoice Sent and Paid are
  // appended rather than being part of the stage sequence: a booking can be
  // invoiced or paid at any stage, which is the whole point of the split.
  const menuSteps: { code: string; change: BookingStatusChange }[] = [
    ...unreachedStages(BOOKING_STAGES, flow)
      .filter(code => code !== CANCELLED)
      .map(code => ({ code, change: { kind: 'stage' as const, stage: code } })),
    ...(flow.invoiceSentAt == null && flow.paidAt == null
      ? [{ code: 'invoiced', change: { kind: 'invoiceSent' as const, value: true } }] : []),
    ...(flow.paidAt == null
      ? [{ code: 'paid', change: { kind: 'paid' as const, value: true } }] : []),
    ...(flow.stage !== CANCELLED
      ? [{ code: CANCELLED, change: { kind: 'stage' as const, stage: CANCELLED } }] : []),
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: C.text }}>
            {order.name} {order.surname}
          </h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {formatDate(order.date)} · {order.timeSlot} ·{' '}
            <span className="font-mono text-xs">#{order.id.slice(-8)}</span>
          </p>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status dropdown */}
          <div className="relative flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {(() => {
              const cfg = styleFor(displayCode)
              return (
                <button
                  onClick={() => setStatusMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold border"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.color + '44' }}
                >
                  {labelFor(locale, displayCode)} ▾
                </button>
              )
            })()}
            {flow.invoiceSentAt != null && flow.paidAt == null && <InvoiceSentMark locale={locale} />}
            {statusMenuOpen && (
              <div
                className="absolute left-0 z-30 rounded-lg shadow-lg border py-1 mt-1"
                style={{ minWidth: 150, backgroundColor: 'var(--site-surface)', borderColor: C.border }}
                onClick={e => e.stopPropagation()}
              >
                {menuSteps.map(step => (
                  <button
                    key={step.code}
                    onClick={() => handleStatusChange(step.change)}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-amber-50"
                    style={{ color: C.text }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: styleFor(step.code).color }} />
                    {labelFor(locale, step.code)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Print invoice */}
          <button
            onClick={() => { printPending.current = true; setPrintReady(true) }}
            title={at('orders.printInvoice')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
            style={{ borderColor: C.border, color: C.muted, backgroundColor: C.bg }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {at('orderDetail.print')}
          </button>

          {/* Send invoice */}
          <button
            onClick={handleSendInvoice}
            disabled={sending || !order.email}
            title={order.email ? at('orderDetail.sendInvoiceTitle') : at('orderDetail.noEmailTitle')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: order.email ? C.wine : '#c8b89a', cursor: order.email ? 'pointer' : 'not-allowed' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            {sending ? at('orders.emailModal.sending') : at('orders.emailModal.sendInvoice')}
          </button>

          {sendMsg && (
            <span className="text-xs font-medium" style={{ color: sendMsg.includes('✓') ? '#16a34a' : '#b91c1c' }}>
              {sendMsg}
            </span>
          )}
        </div>
      </div>

      {/* The merged one-line flow. Sits under the header rather than beside the
          pill because it is the whole story of the order, and the pill is only
          its current position. */}
      {!isCancelled(flow) && (
        <FlowLine steps={flowSteps} locale={locale} />
      )}

      {/* Print portal */}
      {printReady && typeof document !== 'undefined' && createPortal(
        <div id="invoice-portal">
          <InvoicePrint
            order={{
              id: order.id,
              date: order.date,
              timeSlot: order.timeSlot,
              visitType: order.visitType,
              guestCount: order.guestCount,
              tastingGuestCount: order.tastingGuestCount,
              lunchGuestCount: order.lunchGuestCount,
              freeGuestCount: order.freeGuestCount,
              name: order.name,
              surname: order.surname,
              totalPrice: order.totalPrice,
              company: order.company ? { name: order.company.name, identificationCode: order.company.identificationCode } : null,
              masterclassLines: lines.map(l => ({ name: l.masterclassItem.name, quantity: l.quantity, pricePerUnit: l.pricePerUnit })),
              extras: extras.map(e => ({ label: e.label, amount: e.amount })),
            }}
            payment={payment}
            detailed={detailed}
            displayName={displayName}
          />
        </div>,
        document.body
      )}

      {/* ── Booking Info (read-only) ── */}
      <Card title={at('orderDetail.bookingInfo.title')}>
        <InfoRow label={at('orderDetail.bookingInfo.date')} value={formatDate(order.date)} />
        <InfoRow label={at('orderDetail.bookingInfo.time')} value={order.timeSlot} />
        <InfoRow
          label={at('orderDetail.bookingInfo.visitType')}
          value={order.visitType === 'TASTING' ? at('orders.visit.tasting') : at('orders.visit.tastingLunch')}
        />
        <InfoRow
          label={at('orderDetail.bookingInfo.bookingType')}
          value={
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: order.bookingType === 'COMPANY' ? '#fef3c7' : '#f0fdf4',
                color: order.bookingType === 'COMPANY' ? '#92400e' : '#166534',
              }}
            >
              {order.bookingType === 'COMPANY' ? at('orders.type.company') : at('orders.type.individual')}
            </span>
          }
        />
        {order.company && <InfoRow label={at('orderDetail.bookingInfo.company')} value={order.company.name} />}
        {!order.company && order.bookingType === 'COMPANY' && (
          <div className="mt-2 mb-1 rounded-lg border p-3" style={{ borderColor: '#fbbf24', backgroundColor: '#fffbeb' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#92400e' }}>
              {order.requestedCompanyName
                ? `Requested company: ${order.requestedCompanyName} — not linked yet`
                : 'No company linked yet'}
            </p>
            <p className="text-xs mb-2" style={{ color: '#92400e' }}>
              This came in through the "New Company?" flow before an account existed
              (Feature 180). It stays unpriced and unlinked until you connect it below —
              nothing does this automatically.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={assignCompanyId}
                onChange={e => { setAssignCompanyId(e.target.value); setAssignMsg('') }}
                style={{ ...inputStyle, width: 'auto', flex: '1 1 200px' }}
              >
                <option value="">Select a company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                onClick={handleAssignCompany}
                disabled={!assignCompanyId || assigning}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
                style={{ backgroundColor: C.wine, opacity: (!assignCompanyId || assigning) ? 0.6 : 1 }}
              >
                {assigning ? 'Linking…' : 'Link Company'}
              </button>
            </div>
            {assignMsg && (
              <p className="text-xs mt-1.5" style={{ color: assignError ? '#b91c1c' : '#166534' }}>
                {assignMsg}
              </p>
            )}
          </div>
        )}
        <InfoRow label={at('orderDetail.bookingInfo.totalGuests')} value={order.guestCount} />
        <InfoRow label={at('orderDetail.bookingInfo.phone')} value={order.phone} />
        <InfoRow label={at('orderDetail.bookingInfo.email')} value={order.email} />
        {order.notes && <InfoRow label={at('orderDetail.bookingInfo.notes')} value={order.notes} />}
      </Card>

      {/* ── Guest Breakdown & Dishes ── */}
      <Card title={at('orderDetail.guestBreakdown.title')}>
        {order.bookingType === 'COMPANY' && prices.length === 0 && (
          <div
            className="text-xs rounded-lg p-3 mb-4"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
          >
            <strong>{at('orderDetail.guestBreakdown.noTiers', { name: order.company?.name ?? 'this company' })}</strong>{' '}
            {at('orderDetail.guestBreakdown.noTiersDetail')}{' '}
            <a href="/admin/companies" style={{ textDecoration: 'underline' }}>
              {at('orderDetail.guestBreakdown.addTiersLink')}
            </a>{' '}
            {at('orderDetail.guestBreakdown.thenComeBack')}
          </div>
        )}

        {/* Party size — what the price tier is chosen by. */}
        <div className="mb-3" style={{ maxWidth: 200 }}>
          <label className="text-xs block mb-1" style={{ color: C.faint }}>
            {at('orderDetail.guestBreakdown.partySize')}
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={guestCountStr}
            onChange={e => setGuestCountStr(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={e => setGuestCountStr(String(Math.max(1, parseInt(e.target.value) || 1)))}
            style={inputStyle}
          />
          <p className="text-xs mt-1" style={{ color: C.faint }}>
            {at('orderDetail.guestBreakdown.partySizeHint')}
          </p>
        </div>

        {splitTotal > partyGuestCount && (
          <p className="text-xs mb-3" style={{ color: '#b91c1c' }}>
            {at('orderDetail.guestBreakdown.splitExceeds', { split: splitTotal, party: partyGuestCount })}
          </p>
        )}

        {/* Guest count inputs */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              {at('orderDetail.guestBreakdown.tastingGuests')}
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
              {at('orderDetail.guestBreakdown.lunchGuests')}
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
              {at('orderDetail.guestBreakdown.freeGuests')}
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
              {at('orderDetail.guestBreakdown.freeGuestsHint')}
            </p>
          </div>
        </div>

        {/* Per-person rate — only for individual / no-tier orders */}
        {!order.company && (
          <div className="mb-4 pt-1">
            {!customRates ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: C.faint }}>{at('orderDetail.guestBreakdown.rate')}</span>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-secondary)' }}
                >
                  {/* An em dash when the order carries no rate and nobody has
                      set one. Showing "50 / 50" there was the display half of
                      #50 — a made-up figure presented as the agreed rate. */}
                  {order.tastingRateSnapshot == null && !customRates
                    ? '—'
                    : at('orderDetail.guestBreakdown.rateBadge', { t: formatTetri(manualTastingRate, { symbol: false }), l: formatTetri(manualLunchRate, { symbol: false }) })}
                </span>
                <button
                  onClick={() => setCustomRates(true)}
                  className="text-xs px-3 py-1 rounded-lg font-medium text-white"
                  style={{ backgroundColor: C.wine }}
                >
                  {at('orderDetail.guestBreakdown.editRates')}
                </button>
              </div>
            ) : (
              <div
                className="rounded-lg border p-3"
                style={{ borderColor: C.border, backgroundColor: 'var(--site-surface)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: C.muted }}>{at('orderDetail.guestBreakdown.customRates')}</span>
                  <button
                    onClick={() => {
                      // Back to what the order was sold at, not to a constant (#50).
                      setManualTastingRateStr(snapshotTastingMajor)
                      setManualLunchRateStr(snapshotLunchMajor)
                      setCustomRates(false)
                    }}
                    className="text-xs"
                    style={{ color: C.faint }}
                  >
                    {at('orderDetail.guestBreakdown.standardRate')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.guestBreakdown.tastingRatePP')}</label>
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
                      <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orderDetail.guestBreakdown.lunchRatePP')}</label>
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
          </div>
        )}

        {/* Hot dishes */}
        {vegItems.length > 0 && (
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              {at('orderDetail.guestBreakdown.hotDishVeg')}
            </label>
            <select
              value={hotDishVeg}
              onChange={e => setHotDishVeg(e.target.value)}
              style={inputStyle}
            >
              <option value="">{at('orderDetail.guestBreakdown.none')}</option>
              {vegItems.map(i => (
                <option key={i.id} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        {meatItems.length > 0 && (
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: C.faint }}>
              {at('orderDetail.guestBreakdown.hotDishMeat')}
            </label>
            <select
              value={hotDishMeat}
              onChange={e => setHotDishMeat(e.target.value)}
              style={inputStyle}
            >
              <option value="">{at('orderDetail.guestBreakdown.none')}</option>
              {meatItems.map(i => (
                <option key={i.id} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        {vegItems.length === 0 && meatItems.length === 0 && (
          <p className="text-xs mb-3" style={{ color: C.faint }}>
            {at('orderDetail.guestBreakdown.noMenuItems')}{' '}
            <a href="/admin/menu-items" style={{ color: C.wine }}>
              {at('orderDetail.guestBreakdown.menuItemsAdminLink')}
            </a>
            .
          </p>
        )}

        {/* Food notes */}
        <div className="mb-4">
          <label className="text-xs block mb-1" style={{ color: C.faint }}>
            {at('orderDetail.guestBreakdown.foodNotes')}
          </label>
          <textarea
            value={foodNotes}
            onChange={e => setFoodNotes(e.target.value)}
            rows={2}
            placeholder={at('orderDetail.guestBreakdown.foodNotesPlaceholder')}
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
            {saving ? at('orderDetail.guestBreakdown.saving') : at('orderDetail.guestBreakdown.saveChanges')}
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
      <Card title={at('orderDetail.masterclass.title')}>
        {lines.length > 0 && (
          <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.border }}>
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--site-bg)',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {[at('orderDetail.masterclass.colItem'), at('orderDetail.masterclass.colUnit'), at('orderDetail.masterclass.colQty'), at('orderDetail.masterclass.colPricePerUnit'), at('orderDetail.masterclass.colTotal'), ''].map(h => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: 'var(--site-secondary)' }}
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
                      {formatTetri(asTetri(l.pricePerUnit))}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                      {formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { decimals: true })}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleRemoveLine(l.id)}
                        disabled={lineLoading}
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
          <p className="text-sm mb-3" style={{ color: C.faint }}>
            {at('orderDetail.masterclass.none')}
          </p>
        )}

        {/* Add line form */}
        {addingLine ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 160px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.masterclass.colItem')}
              </label>
              <select
                value={newLineItemId}
                onChange={e => handleNewLineItemChange(e.target.value)}
                style={inputStyle}
              >
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
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  {at('orderDetail.masterclass.colQty')}
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
                = {formatTetri(asTetri(lineTotal), { decimals: true })}
              </div>
            )}

            <button
              onClick={handleAddLine}
              disabled={lineLoading || !newLineItemId}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {lineLoading ? '…' : at('orderDetail.masterclass.add')}
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
              {at('orderDetail.masterclass.cancel')}
            </button>
          </div>
        ) : masterclassItems.length > 0 ? (
          <button
            onClick={() => setAddingLine(true)}
            className="text-sm font-medium"
            style={{ color: C.wine }}
          >
            {at('orderDetail.masterclass.addBtn')}
          </button>
        ) : (
          <p className="text-xs" style={{ color: C.faint }}>
            {at('orderDetail.masterclass.noActiveItems')}{' '}
            <a href="/admin/masterclass" style={{ color: C.wine }}>
              {at('orderDetail.masterclass.addSomeLink')}
            </a>
            .
          </p>
        )}
      </Card>

      {/* ── Extra Charges ── */}
      <Card title={at('orderDetail.extras.title')}>
        {extras.length > 0 && (
          <div className="space-y-2 mb-3">
            {extras.map(e => (
              <div key={e.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm" style={{ color: C.text }}>
                  {e.label}
                </span>
                <span className="text-sm font-medium" style={{ color: C.wine }}>
                  {formatTetri(asTetri(e.amount), { decimals: true })}
                </span>
                <button
                  onClick={() => handleRemoveExtra(e.id)}
                  disabled={extraLoading}
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
          <p className="text-sm mb-3" style={{ color: C.faint }}>
            {at('orderDetail.extras.none')}
          </p>
        )}

        {/* Add extra form */}
        {addingExtra ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 140px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.extras.description')}
              </label>
              <input
                value={newExtraLabel}
                onChange={e => setNewExtraLabel(e.target.value)}
                placeholder={at('orderDetail.extras.descriptionPh')}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <div style={{ width: 110 }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.extras.amount')}
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
              {extraLoading ? '…' : at('orderDetail.extras.add')}
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
              {at('orderDetail.extras.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingExtra(true)}
            className="text-sm font-medium"
            style={{ color: C.wine }}
          >
            {at('orderDetail.extras.addBtn')}
          </button>
        )}
      </Card>

      {/* ── Order Total ── */}
      <Card title={at('orderDetail.total.title')}>
        {/* Active tier info */}
        {tier && payingGuests > 0 && (
          <div
            className="text-xs rounded-lg px-3 py-2 mb-3"
            style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-secondary)' }}
          >
            <span className="font-semibold">{at('orderDetail.total.tierInUse')}</span>{' '}
            {tier.minGuests}–{tier.maxGuests} {at('orderDetail.total.guests')} ·{' '}
            {at('orders.col.tasting')} <strong>{formatTetri(asTetri(tier.pricePerPerson))}/pp</strong>
            {' · '}
            {at('orders.col.lunch')} <strong>{formatTetri(asTetri(comboRatePerPerson(tier)))}/pp</strong>
            {' · '}
            {at('orderDetail.total.regFee')} <strong>{formatTetri(asTetri(tier.registrationPrice))}</strong>
          </div>
        )}
        {/* Lunch rate = 0 warning */}
        {tier && lunchGuests > 0 && tier.tastingLunchPricePerPerson === 0 && (
          <div
            className="text-xs rounded-lg px-3 py-2 mb-3"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
          >
            <strong>{at('orderDetail.total.lunchRateZero')}</strong> — {lunchGuests} {at(lunchGuests !== 1 ? 'orders.guest.plural' : 'orders.guest.singular')} {at('orderDetail.total.lunchGuestWontAdd')}{' '}
            <a href="/admin/companies" style={{ textDecoration: 'underline' }}>
              {at('orderDetail.total.setLunchRateLink')}
            </a>{' '}
            {at('orderDetail.total.andReload')}
          </div>
        )}
        <div className="space-y-1.5">
          {/* Company tier lines */}
          {tier && tastingGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {at('orders.col.tasting')} ({tastingGuests} × {formatTetri(asTetri(tier.pricePerPerson))})
              </span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(tastingAmt!), { decimals: true })}</span>
            </div>
          )}
          {tier && lunchGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {at('orderDetail.total.tastingLunch')} ({lunchGuests} × {formatTetri(asTetri(comboRatePerPerson(tier)))})
              </span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(lunchAmt!), { decimals: true })}</span>
            </div>
          )}
          {tier && tier.registrationPrice > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{at('orderDetail.total.registrationFee')}</span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(tier.registrationPrice), { decimals: true })}</span>
            </div>
          )}
          {/* Manual rate lines for individual / no-tier orders */}
          {!tier && payingGuests > 0 && tastingGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {at('orders.col.tasting')} ({tastingGuests} × {formatTetri(manualTastingRate)})
              </span>
              <span style={{ color: C.text }}>
                {formatTetri(multiplyTetri(manualTastingRate, tastingGuests), { decimals: true })}
              </span>
            </div>
          )}
          {!tier && payingGuests > 0 && lunchGuests > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {at('orderDetail.total.tastingLunch')} ({lunchGuests} × {formatTetri(manualLunchRate)})
              </span>
              <span style={{ color: C.text }}>
                {formatTetri(multiplyTetri(manualLunchRate, lunchGuests), { decimals: true })}
              </span>
            </div>
          )}
          {/* Pre-enhancement fallback: split counts not set yet. Hidden when
              legacyBase is null — no tier and no snapshot means there is no
              line-free base to show, and printing the stored total here would
              list it beside the very lines it already contains (#52). */}
          {payingGuests === 0 && order.guestCount > 0 && legacyBase != null && (
            <div className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {legacyTier
                  ? `${order.visitType === 'TASTING_LUNCH' ? at('orderDetail.total.tastingLunch') : at('orders.col.tasting')} (${order.guestCount} ${at('orderDetail.total.guests')})`
                  : at('orderDetail.total.basePriceOriginal')}
              </span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(legacyBase), { decimals: true })}</span>
            </div>
          )}
          {lines.map(l => (
            <div key={l.id} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {l.masterclassItem.name} × {l.quantity}
              </span>
              <span style={{ color: C.text }}>
                {formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { decimals: true })}
              </span>
            </div>
          ))}
          {extras.map(e => (
            <div key={e.id} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{e.label}</span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(e.amount), { decimals: true })}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-3 pt-3 flex justify-between items-center border-t"
          style={{ borderColor: C.border }}
        >
          <span className="text-sm font-semibold" style={{ color: C.muted }}>
            {at('orderDetail.total.totalLabel')}
          </span>
          <span className="text-2xl font-bold" style={{ color: C.wine }}>
            {computedTotal != null
              ? formatTetri(asTetri(computedTotal), { decimals: true })
              : order.totalPrice != null
                ? formatTetri(asTetri(order.totalPrice), { decimals: true })
                : '—'}
          </span>
        </div>

        {/* Shown whenever the figure above is NOT what is stored, rather than on
            a guess about which path produced it. The old `payingGuests > 0`
            gate hid it on exactly the path where the number was wrong (#52),
            so a live preview read as the settled total. */}
        {computedTotal != null && computedTotal !== order.totalPrice && (
          <p className="text-xs mt-1 text-right" style={{ color: C.faint }}>
            {at('orderDetail.total.livePreview')}
          </p>
        )}
      </Card>
    </div>
  )
}
