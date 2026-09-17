'use client'

import { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { updateWineOrderStatus } from '@/app/actions/wineOrders'
import {
  legacyWineStatusForCode,
  statusPatchCodes,
  wineOrderStatusPatch,
  type LegacyWineOrderStatus,
  type SettableWineOrderStatus,
} from '@/lib/statusBridge'
import {
  buildFlowLine,
  unreachedSteps,
  isCancelled,
  type FlowState,
} from '@/lib/statusFlow'
import type { StatusOption } from '@/lib/statusVocabulary'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'
import PackingView, { type WineOrderItem, type BoxMode } from './PackingView'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

type StatusStyle = { border: string; pill: string; pillText: string; labelKey: string }

/**
 * Keyed by **vocabulary code** since chunk 4, not by the legacy status value.
 * The only rename is `pending` → `new` (the process axis's first state is
 * coded `new`); the wine UI keeps displaying "Pending" as its label, which is
 * why the label key did not move with it.
 *
 * Display metadata stays in frontend code rather than moving into the
 * dimension rows — Max's call, 2026-09-17. The consequence is
 * `UNKNOWN_STATUS_STYLE` below: a status a tenant inserts later renders in
 * neutral grey under its own code until someone ships a label for it.
 */
const STATUS_COLOR: Record<string, StatusStyle> = {
  new:       { border: '#ca8a04', pill: '#fef9c3', pillText: '#713f12', labelKey: 'wineOrders.status.pending' },
  confirmed: { border: '#2563eb', pill: '#dbeafe', pillText: '#1e3a8a', labelKey: 'orders.status.confirmed' },
  delivered: { border: '#7c3aed', pill: '#ede9fe', pillText: '#4c1d95', labelKey: 'wineOrders.status.delivered' },
  cancelled: { border: '#dc2626', pill: '#fee2e2', pillText: '#7f1d1d', labelKey: 'orders.status.cancelled' },
  // Financial axis. `paid` keeps the green it had as a legacy status value.
  paid:      { border: '#16a34a', pill: '#dcfce7', pillText: '#14532d', labelKey: 'orders.status.paid' },
  unpaid:    { border: '#78716c', pill: '#f5f5f4', pillText: '#44403c', labelKey: 'wineOrders.status.unpaid' },
  // Online payment states. Still keyed by the legacy `status` value, because
  // the two axes deliberately cannot tell them apart — both map to process
  // `new` + financial `unpaid` (Plan-StatusModel decision 11). They are not
  // fulfilment stages; they are "went to the gateway and never came back".
  pending_payment: { border: '#ea580c', pill: '#ffedd5', pillText: '#c2410c', labelKey: 'wineOrders.status.pendingPayment' },
  payment_failed:  { border: '#9f1239', pill: '#ffe4e6', pillText: '#881337', labelKey: 'wineOrders.status.paymentFailed' },
}

const UNKNOWN_STATUS_STYLE: StatusStyle = { border: '#9ca3af', pill: '#f3f4f6', pillText: '#374151', labelKey: '' }

function styleFor(code: string | null): StatusStyle {
  return (code && STATUS_COLOR[code]) || UNKNOWN_STATUS_STYLE
}

/** Falls back to the raw code, so an unlabelled status is legible, not blank. */
function labelFor(locale: string, code: string | null): string {
  if (!code) return '—'
  const sc = STATUS_COLOR[code]
  return sc ? adminT(locale, sc.labelKey) : code
}

/**
 * For the pending-confirmation line, which still holds a **legacy** value —
 * that is what gets written, and what the confirm button will send. The two
 * vocabularies differ in exactly one place: legacy `pending` is coded `new`.
 */
function labelForLegacy(locale: string, legacy: string): string {
  return labelFor(locale, legacy === 'pending' ? 'new' : legacy)
}

/** The payment pills, and the only two financial codes wine orders can hold. */
const PAYMENT_FILTER_CODES = ['paid', 'unpaid'] as const

/**
 * Orders that went to the payment gateway and never came back paid.
 *
 * Held apart from the fulfilment lifecycle on purpose. They are not orders the
 * winery is working on, and — since payments are deliberately never auto-expired
 * (a late gateway callback would otherwise cancel something that did get paid) —
 * they accumulate forever. Left in the default view they would slowly bury the
 * real orders, so "All" excludes them and each gets its own tab with a count.
 *
 * "Awaiting" is not "failed": the common case is someone closing the tab, and
 * plenty of those people pay later by transfer. Labelling them all as failures
 * would invite the winery to write off live business.
 */
const PAYMENT_LIMBO_STATUSES = ['pending_payment', 'payment_failed'] as const

type WineOrder = {
  id: string
  businessName: string
  llcName: string | null
  llcId: string | null
  address: string
  workingHours: string | null
  contactName: string
  contactPhone: string
  wineItems: WineOrderItem[]
  totalAmount: number | null
  discountPercent: number | null
  displayTotal: number | null
  totalEstimated: boolean
  /**
   * The legacy column. Still read for **one** thing: payment limbo, which the
   * two axes deliberately do not encode. Everything else on this screen now
   * renders from the four fields below.
   */
  status: string
  processCode: string | null
  financialCode: string | null
  paidAt: Date | string | null
  paidAtStage: string | null
  createdAt: Date | string
}

/** The subset the flow-line needs — every order row already satisfies it. */
function flowStateOf(o: WineOrder): FlowState {
  return { processCode: o.processCode, paidAt: o.paidAt, paidAtStage: o.paidAtStage }
}

const isPaid = (o: WineOrder) => o.paidAt != null
const isLimbo = (o: WineOrder) => (PAYMENT_LIMBO_STATUSES as readonly string[]).includes(o.status)

/**
 * Off the working list: delivered or cancelled. Reads the process axis now, so
 * a delivered order that has not been paid for still dims — being owed money
 * is not a reason to keep it in the winery's packing queue, it is a reason for
 * it to show up under the Unpaid filter.
 */
const isInactiveOrder = (o: WineOrder) =>
  o.processCode === 'delivered' || o.processCode === 'cancelled' || o.status === 'payment_failed'

function itemLabel(i: WineOrderItem) {
  return `${i.wineNameSnapshot} · ${i.vintageYearSnapshot} × ${i.quantity} bottle${i.quantity !== 1 ? 's' : ''}`
}

type Mode = 'cards' | 'table' | 'pack' | 'board'
// Typed rather than `string` since chunk 3: updateWineOrderStatus now takes the
// legacy union, so a retired or mistyped status fails to compile here instead
// of being written straight through to the database.
type PendingChange = { orderId: string; toStatus: LegacyWineOrderStatus }

/**
 * The statuses this order can still be moved to, for a dropdown.
 *
 * `unreachedSteps` decides *what* is offered — only steps ahead of where this
 * order actually is, so an already-paid order simply has no "Paid" entry to
 * click and the menu can never contradict the flow-line beside it. This adds
 * the one practical constraint on top: a step with no legacy equivalent is
 * dropped rather than shown, because there would be nothing to write while the
 * old column is still dual-written.
 */
type MenuStep = { code: string; legacy: SettableWineOrderStatus }

function menuSteps(processSteps: StatusOption[], order: WineOrder): MenuStep[] {
  return unreachedSteps(processSteps, flowStateOf(order))
    .map(s => ({ code: s.code, legacy: legacyWineStatusForCode(s.code) }))
    .filter((s): s is MenuStep => s.legacy != null)
}

/**
 * The paid marker, for the surfaces that show a single status pill rather than
 * the whole flow-line — the table, the board and the packing list.
 *
 * Those are grouped or laid out along the process axis, which has no room for
 * a second one. So payment shows as a mark on the row rather than a position
 * in it, and the flow-line on the card remains the place where the two axes
 * are merged into one line.
 */
function PaidMark({ locale }: { locale: string }) {
  return (
    <span
      title={adminT(locale, 'orders.status.paid')}
      aria-label={adminT(locale, 'orders.status.paid')}
      className="inline-flex items-center rounded-full font-bold flex-shrink-0"
      style={{ backgroundColor: '#dcfce7', color: '#14532d', fontSize: '0.65rem', padding: '0.05rem 0.3rem', lineHeight: 1.5 }}
    >
      ₾✓
    </span>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 5h5a4 4 0 1 1 0 8H4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 5l2.5-2.5M2 5l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── StepButton ─────────────────────────────────────────────────────────

function StepButton({ label, index, isDone, isActive, isClickable, panelHovered, onClick, tooltip }: {
  label: string; index: number; isDone: boolean; isActive: boolean
  isClickable: boolean; panelHovered: boolean; onClick: () => void; tooltip?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tooltip}
      className="flex items-center gap-2.5"
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <div
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150"
        style={{
          borderColor: isDone ? C.wine : panelHovered && isClickable ? '#8a4a30' : C.border,
          backgroundColor: isDone ? C.wine : hovered && isClickable ? '#fdf0e8' : 'var(--site-surface)',
          transform: hovered && isClickable ? 'scale(1.45)' : 'scale(1)',
          boxShadow: isActive
            ? `0 0 0 4px ${C.wine}22, 0 0 0 7px ${C.wine}12`
            : hovered && isClickable ? `0 0 0 6px ${C.wine}35` : undefined,
        }}
      >
        {isDone && !isActive ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5l2.5 2.5 4.5-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="text-xs font-semibold" style={{ color: isDone ? 'white' : C.faint }}>{index + 1}</span>
        )}
      </div>
      <span
        className="transition-all duration-150"
        style={{
          color: hovered && isClickable ? C.wine : isActive ? C.wine : isDone ? C.muted : C.faint,
          fontSize: isActive ? '0.875rem' : '0.72rem',
          fontWeight: isActive ? 800 : hovered && isClickable ? 600 : 400,
          opacity: !isActive && !hovered ? 0.55 : 1,
        }}
      >
        {label}
      </span>
    </button>
  )
}

// ── FlowLine (cards only) ──────────────────────────────────────────────

/**
 * The merged one-line flow (Plan-StatusModel chunk 4), replacing the old
 * four-stage stepper whose `STAGES` array hard-coded `paid` between
 * `confirmed` and `delivered` — the assumption that money always arrives
 * before the goods, which is false for every B2B customer on invoice terms.
 *
 * The steps come from `buildFlowLine`, so the Paid step sits where payment
 * actually happened: second for an individual who paid at checkout, last for a
 * restaurant that will settle its invoice in a month. One line either way —
 * not a fulfilment stepper with a payment badge beside it.
 */
function FlowLine({ order, processSteps, onRequestChange, pendingToStatus, onConfirm, onCancel, locale }: {
  order: WineOrder
  processSteps: StatusOption[]
  onRequestChange: (toStatus: LegacyWineOrderStatus) => void
  pendingToStatus?: string
  onConfirm: () => void
  onCancel: () => void
  locale: string
}) {
  const [panelHovered, setPanelHovered] = useState(false)
  const state = flowStateOf(order)
  const cancelled = isCancelled(state)
  const limbo = isLimbo(order)
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const steps = buildFlowLine(processSteps, state)

  // Payment limbo replaces the flow-line rather than adding a step to it. The
  // steps are a fulfilment sequence; "the customer never paid" is not a stage
  // of fulfilling an order, and rendering it as one would imply the winery has
  // work to do on it.
  //
  // "Mark as paid" is the important control here. Without it an order whose
  // customer abandoned card payment and then paid by bank transfer — which will
  // be common given how these wineries already work — would be stuck in limbo
  // permanently with no way back into the normal flow.
  if (limbo) {
    const sc = styleFor(order.status)
    return (
      <div className="flex flex-col gap-2" style={{ minWidth: 115 }}>
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: sc.pill, border: `1px solid ${sc.border}` }}>
          <p className="text-xs font-bold" style={{ color: sc.pillText }}>{labelFor(locale, order.status)}</p>
          <p className="text-xs mt-1 leading-snug" style={{ color: sc.pillText }}>
            {at(order.status === 'payment_failed' ? 'wineOrders.payment.failedHint' : 'wineOrders.payment.awaitingHint')}
          </p>
        </div>
        <button
          onClick={() => onRequestChange('paid')}
          className="text-xs px-3 py-2 rounded-lg font-medium"
          style={{ backgroundColor: '#dcfce7', color: '#14532d', border: '1px solid #86efac' }}
        >
          {at('wineOrders.payment.markPaid')}
        </button>
        <button
          onClick={() => onRequestChange('cancelled')}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: C.faint, border: `1px solid ${C.border}`, backgroundColor: '#fff' }}
        >
          {at('orders.status.cancelled')}
        </button>
        {pendingToStatus && (
          <div className="pt-2 border-t flex items-center gap-1.5 text-xs" style={{ borderColor: C.border }}>
            <span style={{ color: C.muted, flex: 1 }}>→ {labelForLegacy(locale, pendingToStatus)}?</span>
            <button onClick={onConfirm} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#16a34a' }}>✓</button>
            <button onClick={onCancel} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#dc2626' }}>✗</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      style={{ minWidth: 115 }}
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
    >
      {cancelled ? (
        <>
          <div className="flex flex-col items-start">
            {steps.map((step, i) => (
              <div key={step.code} className="flex flex-col items-start">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: '#d1b9a0', backgroundColor: 'var(--site-bg)' }}>
                    <span className="text-xs" style={{ color: '#d1b9a0' }}>{i + 1}</span>
                  </div>
                  <span className="text-xs" style={{ color: '#d1b9a0' }}>{labelFor(locale, step.code)}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-0.5 h-4 ml-3 my-0.5" style={{ backgroundColor: '#e8ddd0' }} />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => onRequestChange('pending')}
            className="mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-medium"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            <UndoIcon /> {at('wineOrders.undo')}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-start">
          {steps.map((step, i) => {
            const legacy = legacyWineStatusForCode(step.code)
            // A step with no legacy equivalent — a status this tenant inserted
            // — has nothing to write while the old column is still dual-written,
            // so it renders as a position on the line but cannot be clicked.
            // Chunk 5 removes the restriction along with the old column.
            const unwritable = legacy == null
            // Paid is never un-done from the line. Reversing a payment is a
            // deliberate correction, not a click away from a step label.
            const isClickable = !unwritable && !step.active && !(step.kind === 'paid' && step.done)
            const label = labelFor(locale, step.code)
            return (
              <div key={step.code} className="flex flex-col items-start">
                <StepButton
                  label={label}
                  index={i}
                  isDone={step.done}
                  isActive={step.active}
                  isClickable={isClickable}
                  panelHovered={panelHovered}
                  onClick={() => { if (isClickable && legacy) onRequestChange(legacy) }}
                  tooltip={
                    unwritable ? at('wineOrders.stepNotSettable')
                      : !isClickable ? undefined
                      : step.done ? at('wineOrders.revertTo', { label })
                      : at('wineOrders.advanceTo', { label })
                  }
                />
                {i < steps.length - 1 && (
                  <div
                    className="w-0.5 h-4 ml-3 my-0.5 transition-colors duration-150"
                    style={{ backgroundColor: step.done && steps[i + 1].done ? C.wine : 'var(--site-border)' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
      {pendingToStatus && (
        <div className="mt-2 pt-2 border-t flex items-center gap-1.5 text-xs" style={{ borderColor: C.border }}>
          <span style={{ color: C.muted, flex: 1 }}>→ {labelForLegacy(locale, pendingToStatus)}?</span>
          <button onClick={onConfirm} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#16a34a' }}>✓</button>
          <button onClick={onCancel} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#dc2626' }}>✗</button>
        </div>
      )}
    </div>
  )
}

// ── FilterBar ──────────────────────────────────────────────────────────

/**
 * Two groups of pills since chunk 4, because there are now two axes to filter
 * on and they answer different questions.
 *
 * Within a group the pills are OR'd; **across groups they are AND'd**. That is
 * the whole point: "Delivered" + "Unpaid" together is the list of invoices the
 * winery is still chasing, which the old single column could not express at
 * all — an order was either delivered or paid, never both facts at once.
 */
function FilterBar({ filters, onToggleFilter, onClearFilters, search, onSearch, dateFrom, onDateFrom, dateTo, onDateTo, locale, statusCounts, processSteps }: {
  filters: Set<string>; onToggleFilter: (f: string) => void; onClearFilters: () => void
  search: string; onSearch: (s: string) => void
  /** Per-code totals, used to badge the limbo tabs. */
  statusCounts: Record<string, number>
  processSteps: StatusOption[]
  dateFrom: string; onDateFrom: (d: string) => void
  dateTo: string; onDateTo: (d: string) => void
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const hasExtra = search || dateFrom || dateTo

  function pill(code: string, opts?: { count?: number }) {
    const isActive = filters.has(code)
    const sc = styleFor(code)
    return (
      <button
        key={code}
        onClick={() => onToggleFilter(code)}
        className="font-medium rounded-full transition-all duration-150 inline-flex items-center gap-1.5"
        style={{
          backgroundColor: isActive ? sc.border : '#fff',
          color: isActive ? '#fff' : C.faint,
          border: `1px solid ${isActive ? sc.border : C.border}`,
          fontSize: isActive ? '0.8rem' : '0.72rem',
          padding: isActive ? '0.3rem 0.85rem' : '0.2rem 0.7rem',
        }}
      >
        {labelFor(locale, code)}
        {opts?.count != null && (
          <span
            className="rounded-full font-bold"
            style={{
              backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : sc.pill,
              color: isActive ? '#fff' : sc.pillText,
              fontSize: '0.65rem', padding: '0.05rem 0.35rem', lineHeight: 1.4,
            }}
          >
            {opts.count}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={onClearFilters}
          className="font-medium rounded-full transition-all duration-150"
          style={{
            backgroundColor: filters.size === 0 ? C.wine : '#fff',
            color: filters.size === 0 ? '#fff' : C.faint,
            border: `1px solid ${filters.size === 0 ? C.wine : C.border}`,
            fontSize: filters.size === 0 ? '0.8rem' : '0.72rem',
            padding: filters.size === 0 ? '0.3rem 0.85rem' : '0.2rem 0.7rem',
          }}
        >
          {at('wineOrders.filter.all')}
        </button>
        {processSteps.map(s => pill(s.code))}

        {/* Payment axis. Separated so it reads as a second question rather than
            five more stages — and so it is visually obvious that picking one
            from each group narrows rather than widens. */}
        <span className="w-px self-stretch mx-1" style={{ backgroundColor: C.border }} />
        {PAYMENT_FILTER_CODES.map(code => pill(code))}

        {/* Limbo tabs come last — an exception list, not part of the normal
            flow. A tab with nothing in it is noise (the common case for any
            winery not taking card payments at all), so it hides until it
            matters. */}
        {PAYMENT_LIMBO_STATUSES.filter(code => (statusCounts[code] ?? 0) > 0)
          .map(code => pill(code, { count: statusCounts[code] ?? 0 }))}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="text"
          placeholder={at('wineOrders.filter.searchPlaceholder')}
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: C.border, color: C.text, backgroundColor: '#fff', minWidth: 160 }}
        />
        <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)} title={at('orders.filters.from')}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: C.border, color: dateFrom ? C.text : C.faint, backgroundColor: '#fff' }}
        />
        <span className="text-xs" style={{ color: C.faint }}>→</span>
        <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)} title={at('orders.filters.to')}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: C.border, color: dateTo ? C.text : C.faint, backgroundColor: '#fff' }}
        />
        {hasExtra && (
          <button onClick={() => { onSearch(''); onDateFrom(''); onDateTo('') }}
            className="text-xs px-2.5 py-1.5 rounded-lg border"
            style={{ borderColor: C.border, color: C.faint, backgroundColor: '#fff' }}>
            {at('wineOrders.filter.clear')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── TableView (Orders-page style) ──────────────────────────────────────

function TableView({ orders, processSteps, pendingChange, onRequestChange, onConfirm, onCancel, locale }: {
  orders: WineOrder[]
  processSteps: StatusOption[]
  pendingChange: PendingChange | null
  onRequestChange: (orderId: string, toStatus: LegacyWineOrderStatus) => void
  onConfirm: () => void
  onCancel: () => void
  locale: string
}) {
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)
  const at = (key: string) => adminT(locale, key)

  useEffect(() => {
    if (!statusMenuId) return
    function handler() { setStatusMenuId(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [statusMenuId])

  if (orders.length === 0) {
    return <p className="text-center py-12 text-sm" style={{ color: C.faint }}>{at('wineOrders.noOrdersMatch')}</p>
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: C.border }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: 580 }}>
        <thead>
          <tr style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>{at('orders.col.company')}</th>
            <th className="text-right px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>{at('wineOrders.table.amount')}</th>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>{at('orders.col.date')}</th>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>{at('orders.col.status')}</th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: '#ffffff' }}>
          {orders.map((order, i) => {
            // The row now reads from the process axis; the paid marker beside
            // the pill carries the financial one.
            const sc = styleFor(isLimbo(order) ? order.status : order.processCode)
            const isInactive = isInactiveOrder(order)
            const isPending = pendingChange?.orderId === order.id
            const isLast = i === orders.length - 1

            return (
              <tr
                key={order.id}
                className="hover:bg-amber-50 transition-colors"
                style={{
                  borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                  borderLeft: `4px solid ${sc.border}`,
                  opacity: isInactive ? 0.6 : 1,
                  transition: 'opacity 0.3s, background-color 0.15s',
                }}
              >
                {/* Company + wines */}
                <td className="px-4 py-3">
                  <p className="font-semibold" style={{ color: C.text }}>{order.businessName}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {order.wineItems.map(item => (
                      <span key={item.id} className="text-xs px-1.5 py-0.5 rounded border"
                        style={{ borderColor: C.border, color: C.muted, backgroundColor: 'var(--site-bg)' }}>
                        {itemLabel(item)}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Amount */}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="font-medium" style={{ color: order.displayTotal != null ? C.wine : C.faint }}>
                    {order.displayTotal != null
                      ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾`
                      : '—'}
                  </span>
                  {order.discountPercent && order.discountPercent > 0 && (
                    <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                      −{order.discountPercent}%
                    </span>
                  )}
                </td>

                {/* Date */}
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.muted, fontSize: '0.8rem' }}>
                  {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                </td>

                {/* Status — dropdown pill + inline confirm */}
                <td className="px-4 py-3">
                  <div className="relative">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={e => { e.stopPropagation(); setStatusMenuId(statusMenuId === order.id ? null : order.id) }}
                        className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap"
                        style={{ backgroundColor: sc.pill, color: sc.pillText, border: `1px solid ${sc.border}44` }}
                      >
                        {labelFor(locale, isLimbo(order) ? order.status : order.processCode)} ▾
                      </button>
                      {isPaid(order) && <PaidMark locale={locale} />}
                    </div>
                    {statusMenuId === order.id && (
                      <div
                        className="absolute left-0 z-20 rounded-xl border shadow-lg py-1 mt-1"
                        style={{ minWidth: 150, backgroundColor: C.bg, borderColor: C.border }}
                        onClick={e => e.stopPropagation()}
                      >
                        {menuSteps(processSteps, order).map(step => (
                          <button
                            key={step.code}
                            onClick={() => { setStatusMenuId(null); onRequestChange(order.id, step.legacy) }}
                            className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                            style={{ color: C.text }}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: styleFor(step.code).border }} />
                            {labelFor(locale, step.code)}
                          </button>
                        ))}
                      </div>
                    )}
                    {isPending && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                        <span style={{ color: C.muted }}>
                          → {labelForLegacy(locale, pendingChange.toStatus)}?
                        </span>
                        <button onClick={onConfirm} className="px-2 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: '#16a34a' }}>✓</button>
                        <button onClick={onCancel} className="px-2 py-0.5 rounded font-bold text-white"
                          style={{ backgroundColor: '#dc2626' }}>✗</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── BoardView ──────────────────────────────────────────────────────────

const BOARD_COL_WIDTH = 232

/**
 * Status Board — wine orders grouped into columns, horizontally scrollable.
 * No navigation (wine orders have no detail page, unlike bookings) — the card
 * itself is the whole surface. Status changes reuse the same pill → dropdown →
 * confirm/cancel interaction as `TableView`, not drag-and-drop (see
 * Plan-StatusBoard.md).
 *
 * **Columns are the process axis only** (Max's call, 2026-09-17). A grid has
 * one shared left-to-right layout, so it can only group by one axis, and
 * giving Paid a column of its own meant an unpaid order skipping over it to
 * Delivered and then moving *back* into it once paid — at which point the
 * column would be asserting that a delivered order's stage is "Paid", which is
 * the exact conflation this whole split exists to remove. So payment shows as
 * a marker on the card instead, and cards only ever move forward.
 *
 * Limbo columns still appear, but only when they hold something — matching
 * FilterBar's own rule (a winery not taking card payments should never see two
 * permanently-empty columns). This is the one deliberate difference from the
 * Booking Orders board, which always shows every column.
 */
function BoardView({ orders, processSteps, pendingChange, onRequestChange, onConfirm, onCancel, locale }: {
  orders: WineOrder[]
  processSteps: StatusOption[]
  pendingChange: PendingChange | null
  onRequestChange: (orderId: string, toStatus: LegacyWineOrderStatus) => void
  onConfirm: () => void
  onCancel: () => void
  locale: string
}) {
  // Menu renders in a portal (see bottom of this component), not inline —
  // each column scrolls independently (`overflow-y-auto`, `maxHeight: 65vh`
  // below), and an absolutely-positioned menu nested inside that container
  // gets silently clipped by it for any card near the column's bottom edge.
  // Found live during QA of this feature: the dropdown became geometrically
  // unreachable (not just visually cut off — a hit-test at its own position
  // resolved to nothing) for the last card in a 7-card Cancelled column.
  // Booking Orders' equivalent board never had this bug because it already
  // portals to `document.body`; this mirrors that fix.
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)
  const [statusMenuRect, setStatusMenuRect] = useState<{ top: number; bottom: number; left: number } | null>(null)
  const at = (key: string) => adminT(locale, key)

  useEffect(() => {
    if (!statusMenuId) return
    function close() { setStatusMenuId(null); setStatusMenuRect(null) }
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [statusMenuId])

  function toggleStatusMenu(orderId: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (statusMenuId === orderId) {
      setStatusMenuId(null)
      setStatusMenuRect(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setStatusMenuRect({ top: rect.top, bottom: rect.bottom, left: rect.left })
    setStatusMenuId(orderId)
  }

  const columns: string[] = [
    ...processSteps.map(s => s.code),
    ...PAYMENT_LIMBO_STATUSES.filter(s => orders.some(o => o.status === s)),
  ]

  // A limbo order sits in its own column, not under `new`. Both map to process
  // `new` on the axes — deliberately, since an abandoned checkout leaves the
  // order where it started — so the legacy value is what tells them apart.
  const columnOf = (o: WineOrder) => (isLimbo(o) ? o.status : o.processCode)

  if (orders.length === 0) {
    return <p className="text-center py-12 text-sm" style={{ color: C.faint }}>{at('wineOrders.noOrdersMatch')}</p>
  }

  return (
    <div className="mt-2 overflow-x-auto pb-2">
      <div className="flex gap-3 items-start" style={{ width: 'max-content' }}>
        {columns.map(status => {
          const items = orders.filter(o => columnOf(o) === status)
          const sc = styleFor(status)
          return (
            <div
              key={status}
              className="flex flex-col rounded-xl border flex-shrink-0"
              style={{ width: BOARD_COL_WIDTH, backgroundColor: 'rgba(0,0,0,0.015)', borderColor: C.border }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: C.border }}>
                <span className="text-xs font-bold whitespace-nowrap" style={{ color: sc.border }}>{labelFor(locale, status)}</span>
                <span
                  className="text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: '#fff', border: `1px solid ${C.border}`, color: C.muted }}
                >
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                {items.length === 0 ? (
                  <p className="text-center text-xs py-5" style={{ color: C.faint }}>{at('orders.board.empty')}</p>
                ) : items.map(order => {
                  const bottles = order.wineItems.reduce((s, item) => s + item.quantity, 0)
                  const isPending = pendingChange?.orderId === order.id
                  return (
                    <div
                      key={order.id}
                      className="rounded-lg border p-2.5"
                      style={{ borderColor: C.border, backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(28,16,8,0.04)' }}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="font-semibold truncate" style={{ color: C.text, fontSize: '0.8125rem' }} title={order.businessName}>
                          {order.businessName}
                        </div>
                        {isPaid(order) && <PaidMark locale={locale} />}
                      </div>
                      <div className="truncate" style={{ color: C.faint, fontSize: '0.7rem' }}>
                        {order.wineItems.length} {order.wineItems.length === 1 ? at('wineOrders.board.wine') : at('wineOrders.board.wines')} · {bottles} {at('wineOrders.board.bottles')}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold" style={{ fontSize: '0.8125rem', color: order.displayTotal != null ? C.wine : C.faint }}>
                          {order.displayTotal != null ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾` : '—'}
                        </span>
                        {order.discountPercent && order.discountPercent > 0 && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                            −{order.discountPercent}%
                          </span>
                        )}
                      </div>

                      <div className="mt-2 pt-2 border-t" style={{ borderColor: C.border }}>
                        <button
                          onClick={e => { e.stopPropagation(); toggleStatusMenu(order.id, e) }}
                          className="w-full text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                          style={{ backgroundColor: sc.pill, color: sc.pillText, border: `1px solid ${sc.border}44` }}
                        >
                          {labelFor(locale, columnOf(order))} ▾
                        </button>
                        {isPending && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                            <span style={{ color: C.muted }}>
                              → {labelForLegacy(locale, pendingChange.toStatus)}?
                            </span>
                            <button onClick={onConfirm} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#16a34a' }}>✓</button>
                            <button onClick={onCancel} className="px-2 py-0.5 rounded font-bold text-white" style={{ backgroundColor: '#dc2626' }}>✗</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Status dropdown portal — see the comment above `statusMenuId`'s
          declaration for why this can't render inline inside a column. */}
      {statusMenuId && statusMenuRect && typeof document !== 'undefined' && (() => {
        const order = orders.find(o => o.id === statusMenuId)
        if (!order) return null
        const menuW = 150
        const steps = menuSteps(processSteps, order)
        const menuH = steps.length * 33 + 8
        const vw = window.innerWidth
        const vh = window.innerHeight
        const left = Math.min(statusMenuRect.left, vw - menuW - 8)
        const top = statusMenuRect.bottom + 4 + menuH > vh
          ? Math.max(statusMenuRect.top - menuH - 4, 8)
          : statusMenuRect.bottom + 4
        return createPortal(
          <div
            className="rounded-xl border shadow-lg py-1"
            style={{ position: 'fixed', top, left, zIndex: 100, minWidth: menuW, backgroundColor: C.bg, borderColor: C.border }}
            onClick={e => e.stopPropagation()}
          >
            {steps.map(step => (
              <button
                key={step.code}
                onClick={() => { setStatusMenuId(null); setStatusMenuRect(null); onRequestChange(order.id, step.legacy) }}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                style={{ color: C.text }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: styleFor(step.code).border }} />
                {labelFor(locale, step.code)}
              </button>
            ))}
          </div>,
          document.body
        )
      })()}
    </div>
  )
}

// ── PackingTable ───────────────────────────────────────────────────────

function PackingTable({ orders, selected, onToggle, onToggleAll, locale }: {
  orders: WineOrder[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (check: boolean) => void
  locale: string
}) {
  const allChecked = orders.length > 0 && orders.every(o => selected.has(o.id))
  const someChecked = !allChecked && orders.some(o => selected.has(o.id))
  const at = (key: string) => adminT(locale, key)

  if (orders.length === 0) {
    return <p className="text-center py-12 text-sm" style={{ color: C.faint }}>{at('wineOrders.noOrdersMatch')}</p>
  }

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ borderColor: C.border }}>
      <table className="w-full text-sm border-collapse" style={{ minWidth: 520 }}>
        <thead>
          <tr style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <th className="px-4 py-3 text-left w-10">
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked }}
                onChange={e => onToggleAll(e.target.checked)}
                className="cursor-pointer"
              />
            </th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: C.muted }}>{at('orders.col.company')}</th>
            <th className="text-right px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>{at('wineOrders.table.bottles')}</th>
            <th className="text-left px-4 py-3 font-medium" style={{ color: C.muted }}>{at('orders.col.status')}</th>
            <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: C.muted }}>{at('orders.col.date')}</th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: '#ffffff' }}>
          {orders.map((order, i) => {
            const bottles = order.wineItems.reduce((s, item) => s + item.quantity, 0)
            const sc = styleFor(isLimbo(order) ? order.status : order.processCode)
            const isSelected = selected.has(order.id)
            const isLast = i === orders.length - 1
            return (
              <tr
                key={order.id}
                onClick={() => onToggle(order.id)}
                className="transition-colors select-none"
                style={{
                  borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                  borderLeft: `4px solid ${sc.border}`,
                  backgroundColor: isSelected ? '#fffbf5' : '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={() => onToggle(order.id)} className="cursor-pointer" />
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold" style={{ color: C.text }}>{order.businessName}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {order.wineItems.map(item => (
                      <span key={item.id} className="text-xs px-1.5 py-0.5 rounded border"
                        style={{ borderColor: C.border, color: C.muted, backgroundColor: 'var(--site-bg)' }}>
                        {itemLabel(item)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: C.wine }}>{bottles}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                      style={{ backgroundColor: sc.pill, color: sc.pillText }}>
                      {labelFor(locale, isLimbo(order) ? order.status : order.processCode)}
                    </span>
                    {isPaid(order) && <PaidMark locale={locale} />}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.muted, fontSize: '0.8rem' }}>
                  {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export default function WineOrdersClient({ orders: initial, processSteps, locale = 'en' }: {
  orders: WineOrder[]
  /** The fulfilment vocabulary for wine orders, resolved once on the server. */
  processSteps: StatusOption[]
  locale?: string
}) {
  const at = (key: string) => adminT(locale, key)
  const [orders, setOrders] = useState<WineOrder[]>(initial)
  const [mode, setMode] = useState<Mode>('cards')
  const [filters, setFilters] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [boxMode, setBoxMode] = useState<BoxMode>('six')
  const [recentlyInactive, setRecentlyInactive] = useState<Set<string>>(new Set())
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listRef] = useAutoAnimate({ duration: 400 })
  const [, startTransition] = useTransition()

  // Counted across every order, not the filtered set — a tab badge has to keep
  // showing its total while a different tab is selected. Keyed by vocabulary
  // code, plus the legacy limbo values, which are the only thing the badges
  // are actually used for.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of orders) {
      const key = isLimbo(o) ? o.status : o.processCode
      if (key) counts[key] = (counts[key] ?? 0) + 1
      counts[isPaid(o) ? 'paid' : 'unpaid'] = (counts[isPaid(o) ? 'paid' : 'unpaid'] ?? 0) + 1
    }
    return counts
  }, [orders])

  /**
   * One pill set, two axes.
   *
   * Pills are OR'd inside a group and AND'd across groups, so "Delivered" +
   * "Unpaid" narrows to the invoices still outstanding rather than widening to
   * everything that is either. `filters` stays a single Set because it is also
   * the toggle state for one row of buttons; the partition happens here.
   */
  const activeFilters = useMemo(() => {
    const processCodes = new Set(processSteps.map(s => s.code))
    const picked = [...filters]
    return {
      process: new Set(picked.filter(f => processCodes.has(f))),
      payment: new Set(picked.filter(f => (PAYMENT_FILTER_CODES as readonly string[]).includes(f))),
      limbo: new Set(picked.filter(f => (PAYMENT_LIMBO_STATUSES as readonly string[]).includes(f))),
    }
  }, [filters, processSteps])

  const matchesSearchAndDates = useCallback((o: WineOrder) => {
    if (search && !o.businessName.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && new Date(o.createdAt) < new Date(dateFrom + 'T00:00:00')) return false
    if (dateTo && new Date(o.createdAt) > new Date(dateTo + 'T23:59:59')) return false
    return true
  }, [search, dateFrom, dateTo])

  const matchesPayment = useCallback((o: WineOrder) =>
    activeFilters.payment.size === 0 || activeFilters.payment.has(isPaid(o) ? 'paid' : 'unpaid'),
  [activeFilters])

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (!matchesSearchAndDates(o)) return false
    // "All" means all *real* orders. Unpaid gateway leftovers are reachable only
    // through their own tabs, whose counts keep them from being forgotten — and
    // never through a process pill, since on the axes they sit at `new` like
    // any freshly placed order.
    if (isLimbo(o)) return activeFilters.limbo.has(o.status) && matchesPayment(o)
    if (activeFilters.process.size > 0 && !(o.processCode && activeFilters.process.has(o.processCode))) return false
    return matchesPayment(o)
  }), [orders, activeFilters, matchesPayment, matchesSearchAndDates])

  // Same filters as `filteredOrders`, minus the "hide limbo unless a tab is
  // picked" rule — the board already isolates every status into its own
  // column, so a limbo order isn't clutter there the way it would be in an
  // undifferentiated Cards/Table list. Using `filteredOrders` here silently
  // left the Awaiting Payment / Payment Failed columns permanently empty
  // (caught live while verifying: 3 real pending_payment orders, board showed
  // "None").
  const boardOrders = useMemo(() => orders.filter(o => {
    if (!matchesSearchAndDates(o)) return false
    if (!matchesPayment(o)) return false
    // Limbo shows unfiltered (that is the board's whole reason for having its
    // own order list), but a *process* pill still hides it: asking for
    // Delivered and being shown abandoned checkouts is noise. It cannot come
    // back through the Pending pill either, because on the axes a limbo order
    // does sit at `new` — which would read as 'the winery has work to do on
    // this', the thing holding limbo apart is meant to prevent.
    if (isLimbo(o)) {
      if (activeFilters.limbo.has(o.status)) return true
      return activeFilters.process.size === 0 && activeFilters.limbo.size === 0
    }
    if (activeFilters.process.size > 0 && !(o.processCode && activeFilters.process.has(o.processCode))) return false
    return true
  }), [orders, activeFilters, matchesPayment, matchesSearchAndDates])

  const cardsVisible = useMemo(() => [...filteredOrders].sort((a, b) => {
    const aI = isInactiveOrder(a) && !recentlyInactive.has(a.id)
    const bI = isInactiveOrder(b) && !recentlyInactive.has(b.id)
    return Number(aI) - Number(bI)
  }), [filteredOrders, recentlyInactive])

  const selectedOrders = useMemo(() =>
    orders.filter(o => selected.has(o.id)),
    [orders, selected]
  )

  /**
   * Everything confirmed but not yet out the door.
   *
   * Was `status === 'confirmed' || status === 'paid'` — which only needed the
   * `paid` half because `paid` used to sit *after* `confirmed` in the single
   * column, so a paid order had stopped being a confirmed one. On the process
   * axis a paid order is still exactly where it was, and payment says nothing
   * about whether the wine has been packed. One of the audit's silent-failure
   * cases: left as it was, paid wine would have dropped off the packing list.
   */
  const packableOrders = useCallback(
    () => orders.filter(o => o.processCode === 'confirmed'),
    [orders]
  )

  function switchMode(m: Mode) {
    // Pre-selection happens here rather than in an effect on `mode`: the
    // selection is a consequence of the click, not of the render that follows
    // it, and writing it in an effect was the source of the standing
    // set-state-in-effect lint error on this component.
    if (m === 'pack' && mode !== 'pack') setSelected(new Set(packableOrders().map(o => o.id)))
    setMode(m)
  }

  function handleUpdate(id: string, status: LegacyWineOrderStatus) {
    const prev = orders.find(o => o.id === id)
    if (!prev) return
    const wasActive = !isInactiveOrder(prev)
    // The same patch the server is about to write, restated in codes, so the
    // flow-line moves on click instead of waiting for the round trip. Derived
    // from `statusBridge` rather than re-implemented, so the two cannot drift.
    const patch = statusPatchCodes(wineOrderStatusPatch(status, {
      processCode: prev.processCode,
      paidAt: prev.paidAt ? new Date(prev.paidAt) : null,
    }))
    const next: WineOrder = { ...prev, status, ...patch }
    const isNowInactive = isInactiveOrder(next)
    setOrders(p => p.map(o => o.id === id ? next : o))
    if (wasActive && isNowInactive) {
      setRecentlyInactive(s => new Set([...s, id]))
      setTimeout(() => setRecentlyInactive(s => { const n = new Set(s); n.delete(id); return n }), 520)
    }
    startTransition(async () => { await updateWineOrderStatus(id, status) })
  }

  function requestChange(orderId: string, toStatus: LegacyWineOrderStatus) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPendingChange({ orderId, toStatus })
    timerRef.current = setTimeout(() => setPendingChange(null), 5000)
  }

  function confirmChange() {
    if (!pendingChange) return
    if (timerRef.current) clearTimeout(timerRef.current)
    handleUpdate(pendingChange.orderId, pendingChange.toStatus)
    setPendingChange(null)
  }

  function cancelChange() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPendingChange(null)
  }

  function toggleOrder(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll(check: boolean) {
    setSelected(check ? new Set(filteredOrders.map(o => o.id)) : new Set())
  }

  if (orders.length === 0) {
    return <div className="text-center py-20 text-sm" style={{ color: 'var(--site-secondary)' }}>{at('wineOrders.noOrdersYet')}</div>
  }

  const modeLabel = (m: Mode) => m === 'cards' ? at('wineOrders.mode.cards') : m === 'table' ? at('orders.view.table') : m === 'board' ? at('wineOrders.mode.board') : at('wineOrders.mode.pack')

  const modeToggle = (
    <div className="flex items-center gap-1.5 mb-5 self-start">
      <div className="flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: '#f0e8dc' }}>
        {(['cards', 'table', 'board', 'pack'] as const).map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className="text-sm px-4 py-1.5 rounded-md font-medium transition-all"
            style={{
              backgroundColor: mode === m ? '#fff' : 'transparent',
              color: mode === m ? C.wine : C.faint,
              fontWeight: mode === m ? 700 : 400,
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
            }}
          >
            {modeLabel(m)}
          </button>
        ))}
      </div>
      <HelpHint text={at('help.wineOrders.packMode')} />
    </div>
  )

  function toggleFilter(f: string) {
    setFilters(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  const filterBar = (
    <FilterBar
      filters={filters} onToggleFilter={toggleFilter} onClearFilters={() => setFilters(new Set())}
      search={search} onSearch={setSearch}
      dateFrom={dateFrom} onDateFrom={setDateFrom}
      dateTo={dateTo} onDateTo={setDateTo}
      locale={locale}
      statusCounts={statusCounts}
      processSteps={processSteps}
    />
  )

  // ── Cards ───────────────────────────────────────────────────

  if (mode === 'cards') {
    return (
      <div className="flex flex-col">
        {modeToggle}
        {filterBar}
        {cardsVisible.length === 0 && (
          <p className="text-center py-12 text-sm" style={{ color: C.faint }}>{at('wineOrders.noOrdersMatch')}</p>
        )}
        <div className="flex flex-col gap-4" ref={listRef}>
          {cardsVisible.map(order => {
            const isInactive = isInactiveOrder(order)
            const sc = styleFor(isLimbo(order) ? order.status : order.processCode)
            const isPending = pendingChange?.orderId === order.id
            const isSelected = selected.has(order.id)
            return (
              <div
                key={order.id}
                className="rounded-xl border overflow-hidden flex flex-col md:flex-row"
                style={{
                  backgroundColor: C.bg, borderColor: C.border,
                  opacity: isInactive ? 0.55 : 1, transition: 'opacity 0.45s ease',
                  borderLeftWidth: 4, borderLeftColor: sc.border,
                }}
              >
                {/* Col 1 — name, wines, address */}
                <div className="flex-1 min-w-0 p-5 flex flex-col justify-between">
                  <div>
                    <p className="font-bold mb-1" style={{ color: C.text }}>{order.businessName}</p>
                    <p className="text-sm mb-3" style={{ color: C.muted, minHeight: '1.25rem' }}>
                      {order.llcName ? `${order.llcName}${order.llcId ? ` · ${order.llcId}` : ''}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {order.wineItems.map(item => (
                        <span key={item.id} className="text-xs px-2 py-1 rounded border"
                          style={{ borderColor: C.border, color: C.muted, backgroundColor: 'var(--site-bg)' }}>
                          {itemLabel(item)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-sm mt-3" style={{ color: C.muted }}>
                    <p>&#128205; {order.address}</p>
                    {order.workingHours && <p>&#128336; {order.workingHours}</p>}
                  </div>
                </div>

                {/* Col 2 — amount, contact, pack toggle */}
                <div
                  className="flex-shrink-0 flex flex-col justify-center items-center gap-1.5 px-6 py-4 text-sm border-t md:border-t-0 md:border-l"
                  style={{ color: C.muted, borderColor: C.border, minWidth: 160 }}
                >
                  <p className="font-bold leading-none" style={{ fontSize: '1.35rem', color: order.displayTotal != null ? C.wine : C.faint }}>
                    {order.displayTotal != null ? `${order.totalEstimated ? '~' : ''}${order.displayTotal}₾` : '—'}
                  </p>
                  {order.discountPercent && order.discountPercent > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                      −{order.discountPercent}%
                    </span>
                  )}
                  <p>&#128100; {order.contactName}</p>
                  <p>&#128222; {order.contactPhone}</p>
                  <button
                    onClick={() => toggleOrder(order.id)}
                    className="mt-1 text-xs px-3 py-1 rounded-full font-medium border transition-all duration-150"
                    style={{
                      backgroundColor: isSelected ? C.wine : 'transparent',
                      color: isSelected ? '#fff' : C.faint,
                      borderColor: isSelected ? C.wine : C.border,
                    }}
                  >
                    {isSelected ? at('wineOrders.card.inPack') : at('wineOrders.card.addPack')}
                  </button>
                </div>

                {/* Col 3 — flow-line */}
                <div
                  className="flex-shrink-0 flex items-center p-5 pl-4 border-t md:border-t-0 md:border-l"
                  style={{ borderColor: C.border, backgroundColor: '#fdf8f2' }}
                >
                  <FlowLine
                    order={order}
                    processSteps={processSteps}
                    onRequestChange={(toStatus: LegacyWineOrderStatus) => requestChange(order.id, toStatus)}
                    pendingToStatus={isPending ? pendingChange.toStatus : undefined}
                    onConfirm={confirmChange}
                    onCancel={cancelChange}
                    locale={locale}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Table ───────────────────────────────────────────────────

  if (mode === 'table') {
    return (
      <div className="flex flex-col">
        {modeToggle}
        {filterBar}
        <TableView
          orders={filteredOrders}
          processSteps={processSteps}
          pendingChange={pendingChange}
          onRequestChange={requestChange}
          onConfirm={confirmChange}
          onCancel={cancelChange}
          locale={locale}
        />
      </div>
    )
  }

  // ── Board ───────────────────────────────────────────────────

  if (mode === 'board') {
    return (
      <div className="flex flex-col">
        {modeToggle}
        {filterBar}
        <BoardView
          orders={boardOrders}
          processSteps={processSteps}
          pendingChange={pendingChange}
          onRequestChange={requestChange}
          onConfirm={confirmChange}
          onCancel={cancelChange}
          locale={locale}
        />
      </div>
    )
  }

  // ── Pack ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {modeToggle}
      {filterBar}
      <PackingView
        selectedOrders={selectedOrders}
        boxMode={boxMode}
        onBoxModeChange={setBoxMode}
        locale={locale}
      >
        <PackingTable
          orders={filteredOrders.filter(o => o.processCode !== 'cancelled' && o.processCode !== 'delivered')}
          selected={selected}
          onToggle={toggleOrder}
          onToggleAll={toggleAll}
          locale={locale}
        />
      </PackingView>
    </div>
  )
}
