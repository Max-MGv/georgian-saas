'use client'

import { useState, useEffect, useRef } from 'react'
import { asTetri, asTetriOrNull, formatTetri, formatTetriOrDash, multiplyTetri } from '@/lib/money'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { deleteOrder, updateOrder, sendOrderInvoice, changeBookingStatus } from '@/app/actions/orders'
import { adminT } from '@/lib/adminT'
import InvoicePrint from './InvoicePrint'
import BookingSheetPrint from './BookingSheetPrint'
import { countryName } from '@/lib/countries'
import {
  bookingStagePatch,
  invoiceSentPatch,
  paidPatch,
  type BookingStatusChange,
} from '@/lib/statusWrite'
import { BOOKING_STAGES, unreachedStages, CANCELLED, type FlowState } from '@/lib/statusFlow'
import { paymentStateOf } from '@/lib/orderFilters'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}
type StatusStyle = { labelKey: string; bg: string; color: string }

/**
 * Keyed by `BookingStage`, plus the two payment states that appear as dropdown
 * entries and marks. There is no PENDING_PAYMENT entry any more: an abandoned
 * checkout is not a status a booking can be in, it is a booking that never
 * became one, and it lives on /admin/abandoned instead of on this screen.
 */
const STATUS_CONFIG: Record<string, StatusStyle> = {
  NEW:       { labelKey: 'orders.status.new',       bg: '#fef9c3', color: '#a16207' },
  CONFIRMED: { labelKey: 'orders.status.confirmed', bg: '#dbeafe', color: '#1d4ed8' },
  COMPLETED: { labelKey: 'orders.status.completed', bg: '#bbf7d0', color: '#065f46' },
  CANCELLED: { labelKey: 'orders.status.cancelled', bg: '#fee2e2', color: '#b91c1c' },
  // Payment. Not stages - these appear in the dropdown and as row marks.
  unpaid:   { labelKey: 'orders.status.unpaid',      bg: '#f5f5f4', color: '#44403c' },
  invoiced: { labelKey: 'orders.status.invoiceSent', bg: '#fef3c7', color: '#92400e' },
  paid:     { labelKey: 'orders.status.paid',        bg: '#dcfce7', color: '#166534' },
}

const UNKNOWN_STATUS_STYLE: StatusStyle = { labelKey: '', bg: '#f3f4f6', color: '#374151' }

function styleFor(code: string | null): StatusStyle {
  return (code && STATUS_CONFIG[code]) || UNKNOWN_STATUS_STYLE
}

/** Falls back to the raw code, so an unlabelled status is legible, not blank. */
function labelFor(locale: string, code: string | null): string {
  if (!code) return '—'
  const cfg = STATUS_CONFIG[code]
  return cfg ? adminT(locale, cfg.labelKey) : code
}

import { COLUMN_DEFS, defaultVisibleFor, COLUMNS_STORAGE_KEY, type ColumnId } from './columnDefs'

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

// Actions column (print/email/edit/delete) is pinned to the right edge. Status is
// pinned right next to it, so both stay visible while scrolling a wide table —
// this width must comfortably fit the actions column in both its normal (icons)
// and delete-confirmation states, since Status's sticky offset is anchored to it.
const ACTIONS_COL_WIDTH = 190

const inputStyle = {
  backgroundColor: 'var(--site-surface)', border: `1px solid ${C.border}`,
  borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem',
  color: C.text, outline: 'none', width: '100%',
}

type Order = {
  id: string
  stage: string
  createdAt: Date | string
  confirmedAt: Date | string | null
  completedAt: Date | string | null
  invoiceSentAt: Date | string | null
  paidAt: Date | string | null
  date: Date
  timeSlot: string
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  visitType: 'TASTING' | 'TASTING_LUNCH'
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  name: string
  surname: string
  email: string | null
  phone: string | null
  notes: string | null
  totalPrice: number | null
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  nationalities: string[]
  company: { name: string; identificationCode: string | null } | null
  requestedCompanyName: string | null
  masterclassLines: { name: string; quantity: number; pricePerUnit: number }[]
  extras: { label: string; amount: number }[]
  contacts: { roleKey: string; roleLabelEn: string; roleLabelKa: string; name: string; phone: string | null; email: string | null }[]
  /** People eligible to receive this order's invoice email — see lib/contactResolution.ts's
   *  INVOICE_RECIPIENT_ROLE_KEYS (Plan-ContactRoles Chunk 11). Never carries a `code`. */
  invoiceRecipients: { id: string; name: string; email: string }[]
}

/** The subset the flow-line needs - every order row already satisfies it. */
function flowStateOf(o: Order): FlowState {
  return {
    stage: o.stage,
    createdAt: o.createdAt,
    confirmedAt: o.confirmedAt,
    finishedAt: o.completedAt,
    invoiceSentAt: o.invoiceSentAt,
    paidAt: o.paidAt,
  }
}

const isPaid = (o: { paidAt: Date | string | null }) => o.paidAt != null

/**
 * The changes this order can still be made, for its dropdown.
 *
 * Stages come from `unreachedStages`, so an already-completed booking has no
 * "Completed" entry to click and the menu can never contradict the flow-line on
 * its detail page. The two payment entries are appended rather than being part
 * of that sequence, because they are not stages: a booking can be invoiced at
 * any stage, and paid at any stage, which is the whole point of the split.
 *
 * Cancel stays last - it is an exit from the flow, not a position in it.
 */
type MenuStep = { code: string; change: BookingStatusChange }

function menuSteps(order: Order): MenuStep[] {
  const stages = unreachedStages(BOOKING_STAGES, flowStateOf(order))
  const steps: MenuStep[] = stages
    .filter(code => code !== CANCELLED)
    .map(code => ({ code, change: { kind: 'stage', stage: code } as const }))

  // "We have asked for money" only makes sense while the money has not arrived.
  if (order.invoiceSentAt == null && order.paidAt == null) {
    steps.push({ code: 'invoiced', change: { kind: 'invoiceSent', value: true } })
  }
  if (order.paidAt == null) {
    steps.push({ code: 'paid', change: { kind: 'paid', value: true } })
  }
  if (order.stage !== CANCELLED) {
    steps.push({ code: CANCELLED, change: { kind: 'stage', stage: CANCELLED } })
  }
  return steps
}

/**
 * The optimistic client-side mirror of one status change.
 *
 * Calls the same pure patch functions the server action calls, rather than
 * restating the rules — two copies of "which columns does this change move" is
 * exactly the drift that an optimistic update hides until someone reloads.
 */
function optimisticPatch(o: Order, change: BookingStatusChange) {
  const now = new Date()
  const dates = {
    confirmedAt: o.confirmedAt ? new Date(o.confirmedAt) : null,
    finishedAt: o.completedAt ? new Date(o.completedAt) : null,
    invoiceSentAt: o.invoiceSentAt ? new Date(o.invoiceSentAt) : null,
    paidAt: o.paidAt ? new Date(o.paidAt) : null,
  }
  switch (change.kind) {
    case 'stage':       return bookingStagePatch(change.stage as never, dates, now)
    case 'paid':        return paidPatch(change.value, dates, now)
    case 'invoiceSent': return invoiceSentPatch(change.value, dates, now)
    case 'restore':     return {}
  }
}

function Mark({ label, glyph, bg, color }: { label: string; glyph: string; bg: string; color: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center rounded-full font-bold flex-shrink-0"
      style={{ backgroundColor: bg, color, fontSize: '0.65rem', padding: '0.05rem 0.3rem', lineHeight: 1.5 }}
    >
      {glyph}
    </span>
  )
}

/**
 * Where the money is, for surfaces laid out along the process axis — the table
 * rows, the list, the card list, the board and the hover card, none of which
 * have room for a second status pill. The two axes are merged into one line on
 * the order's own page; here the financial axis is a mark on the row rather
 * than a position in it.
 *
 * Bookings have three payment states, not two, so a single paid/not-paid mark
 * was not enough: it left `invoiced` — which the winery sets by sending the
 * invoice, and which used to be the pill itself — with nowhere to show at all.
 * Deliberately one component with the precedence inside it rather than a
 * conditional at five call sites, since the rule ("paid beats invoiced") has to
 * be the same everywhere.
 *
 * Paid wins, and cannot collide in practice anyway: once money arrives the
 * financial axis has already moved off `invoiced`.
 */
function PaymentMark({ order, locale }: {
  order: { paidAt: Date | string | null; invoiceSentAt: Date | string | null }
  locale: string
}) {
  if (paymentStateOf(order) === 'paid') {
    return <Mark label={adminT(locale, 'orders.status.paid')} glyph="₾✓" bg="#dcfce7" color="#14532d" />
  }
  if (paymentStateOf(order) === 'invoiced') {
    return <Mark label={adminT(locale, 'orders.status.invoiceSent')} glyph="✉" bg="#fef3c7" color="#92400e" />
  }
  return null
}

type Payment = {
  recipientName: string
  personalNumber: string
  bankName: string
  bankCode: string
  iban: string
}

/**
 * One line, ellipsised, with the full value on hover.
 *
 * Plan-DemoFlowFixes Chunk 7 task 7.2: Masterclass, Food and Additional each
 * stacked their parts in a `flex-col`, so a booking with a vegetable dish, a
 * meat dish and a note pushed its row to ~150px and only about five bookings
 * fitted a 900px screen. Nothing is lost — the title attribute carries the
 * whole value and clicking the row still opens the detail view that always
 * held it.
 */
function OneLine({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      title={title}
      style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {children}
    </div>
  )
}

function visitLabel(locale: string, v: string) {
  return v === 'TASTING' ? adminT(locale, 'orders.visit.tasting') : adminT(locale, 'orders.visit.tastingLunch')
}

// `timeZone` is pinned deliberately. This is a client component, so it renders
// once on the server and again at hydration — and without a fixed zone those two
// runs use *different* ones (UTC on Vercel, the viewer's in the browser). A date
// stored at midnight UTC then reads a day earlier for anyone at a negative offset,
// and any value carrying a 20:00–24:00 UTC time reads a day later from Georgia,
// which React reports as a hydration text mismatch (#418). Asia/Tbilisi is the
// winery's own zone, so a booking for 20 Oct says 20 Oct to everyone — including
// an owner checking bookings from abroad. See Chunk 2 of Plan-DemoFlowFixes.
function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Tbilisi' })
}

function toInputDate(d: Date) {
  return new Date(d).toISOString().split('T')[0]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label style={{ fontSize: '0.75rem', color: C.faint }}>{label}</label>
      {children}
    </div>
  )
}

const LIST_GRID_COLS = '108px minmax(0,1.7fr) 70px 90px 130px 150px'

/**
 * Compact-density desktop rows — one line per booking, a color stripe for
 * status instead of a pinned pill column, everything else the table's Contact/
 * Type/Company/Guests/Total/Status/Actions reduced to what's needed to scan a
 * list quickly. Same click-to-open, same status dropdown portal (rendered once
 * in the parent, keyed off statusMenuId) and the same print/email/edit/delete
 * handlers as the table — this only changes row density, not what a row does.
 *
 * No hover-preview card here (unlike the table): a row is already a one-line
 * summary, so the card would duplicate what's already visible — and it used to
 * sit on top of the status dropdown and delete confirm, since those need their
 * own click target inside a row that's otherwise one big click-to-open link.
 */
function OrdersListRows({
  orders, locale, deletingId, loading, detailed,
  onRowClick, onToggleStatusMenu, onPrint, onEmail, onEdit,
  onRequestDelete, onConfirmDelete, onCancelDelete,
}: {
  orders: Order[]
  locale: string
  deletingId: string | null
  loading: boolean
  detailed: boolean
  onRowClick: (id: string) => void
  onToggleStatusMenu: (orderId: string, e: React.MouseEvent<HTMLButtonElement>) => void
  onPrint: (order: Order) => void
  onEmail: (order: Order) => void
  onEdit: (order: Order) => void
  onRequestDelete: (id: string | null) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
}) {
  const at = (key: string) => adminT(locale, key)
  return (
    <div className="mt-4 overflow-x-auto">
      {/* Capped, not full-bleed — a name/company column that's already narrow
          gets unreadably wide (and unrelated to the date/total columns beside
          it) on a wide monitor otherwise. Min-width is the horizontal-scroll
          floor for narrow desktop widths; max-width is the readability ceiling. */}
      <div style={{ minWidth: 640, maxWidth: 900 }}>
      <div className="grid px-4 pb-2" style={{ gridTemplateColumns: LIST_GRID_COLS, gap: 12 }}>
        {['orders.col.date', 'orders.col.contact', 'orders.col.guests', 'orders.col.total', 'orders.col.status'].map((k, i) => (
          <span key={k} className={i === 2 ? 'text-center' : ''} style={{ color: C.faint, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{at(k)}</span>
        ))}
        <span />
      </div>
      <div className="flex flex-col gap-2">
        {orders.map(order => {
          const cfg = styleFor(order.stage)
          const heading = order.company?.name ?? (order.requestedCompanyName ? `${order.requestedCompanyName} (new)` : `${order.name} ${order.surname}`)
          const subheading = order.company || order.requestedCompanyName ? `${order.name} ${order.surname}` : visitLabel(locale, order.visitType)
          return (
            <div
              key={order.id}
              onClick={() => onRowClick(order.id)}
              className="grid items-center rounded-xl border cursor-pointer hover:bg-amber-50 transition-colors relative overflow-hidden"
              style={{ gridTemplateColumns: LIST_GRID_COLS, borderColor: C.border, backgroundColor: '#ffffff', padding: '10px 14px 10px 16px', gap: 12 }}
            >
              <span className="absolute left-0 top-0 bottom-0" style={{ width: 4, backgroundColor: cfg.color }} />

              <div style={{ color: C.text, fontSize: '0.8125rem' }}>
                {formatDate(order.date)}
                <div style={{ color: C.faint, fontSize: '0.75rem' }}>{order.timeSlot}</div>
              </div>

              <div className="min-w-0">
                <div className="font-medium truncate" style={{ color: C.text, fontSize: '0.875rem' }} title={heading}>{heading}</div>
                <div className="truncate" style={{ color: C.faint, fontSize: '0.75rem' }} title={subheading}>{subheading}</div>
              </div>

              <div className="text-center" style={{ color: C.text, fontSize: '0.8125rem' }}>{order.guestCount}</div>

              <div className="font-semibold" style={{ color: order.totalPrice != null ? C.wine : C.faint, fontSize: '0.875rem' }}>
                {formatTetriOrDash(asTetriOrNull(order.totalPrice))}
              </div>

              <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
                <button
                  onClick={e => onToggleStatusMenu(order.id, e)}
                  className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-opacity hover:opacity-75"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}22` }}
                >
                  {labelFor(locale, order.stage)} ▾
                </button>
                <PaymentMark order={order} locale={locale} />
              </div>

              <div onClick={e => e.stopPropagation()} className="flex items-center justify-end gap-1.5">
                {deletingId === order.id ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onConfirmDelete(order.id)} disabled={loading}
                      className="text-xs px-2 py-1 rounded font-medium text-white"
                      style={{ backgroundColor: '#b91c1c' }}>{at('orders.yes')}</button>
                    <button onClick={onCancelDelete}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: C.border, color: C.muted }}>{at('orders.no')}</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => onPrint(order)} title={detailed ? at('orders.printDetailedInvoice') : at('orders.printInvoice')}
                      className="p-1 rounded border transition-colors hover:bg-amber-100" style={{ borderColor: C.border, color: C.muted }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9"/>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                      </svg>
                    </button>
                    <button onClick={() => onEmail(order)} title={at('orders.sendInvoiceEmail')}
                      className="p-1 rounded border transition-colors hover:bg-amber-100" style={{ borderColor: C.border, color: order.email ? C.muted : C.faint }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                      </svg>
                    </button>
                    <button onClick={() => onEdit(order)} title={at('orders.editOrder')}
                      className="p-1 rounded border transition-colors hover:bg-amber-100" style={{ borderColor: C.border, color: C.muted }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={() => onRequestDelete(order.id)} title={at('orders.deleteOrder')}
                      className="p-1 rounded border transition-colors hover:bg-red-50" style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

// Columns are the **process axis only** since chunk 4 (Max's call,
// 2026-09-17). A grid has one shared left-to-right layout, so it can only
// group by one axis; giving Paid a column of its own meant an unpaid booking
// skipping over it to Completed and then moving back leftward into it once
// paid, at which point the column would be asserting that a completed visit's
// stage is "Paid" — the exact conflation the split exists to remove. Payment
// shows as a marker on the card instead, and cards only ever move forward.
//
// Every process column is always shown, unlike the wine-orders board (whose
// payment-limbo columns hide when empty, matching that page's existing
// FilterBar convention): a booking board that hides "no orders confirmed
// today" is a worse tool for exactly the winery that most needs to see it.
// The limbo column is the one exception, since it is not a stage at all.
const BOARD_COL_WIDTH = 232

/**
 * Status Board — orders grouped into columns by pipeline stage, horizontally
 * scrollable. Same click-to-open as every other view; status changes go
 * through the same portal-rendered dropdown Table and List already share
 * (`onToggleStatusMenu` → `statusMenuId`/`statusMenuRect` in the parent), not
 * drag-and-drop — see Plan-StatusBoard.md for why.
 *
 * Deliberately no print/email/edit/delete icons on the card (unlike List,
 * which got full action-icon parity): a 232px column has no room for four
 * icons without cramming, and the order detail page (one click away) already
 * has all of them.
 */
function OrdersBoardColumns({
  orders, locale, onRowClick, onToggleStatusMenu,
}: {
  orders: Order[]
  locale: string
  onRowClick: (id: string) => void
  onToggleStatusMenu: (orderId: string, e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const at = (key: string) => adminT(locale, key)
  const columns: string[] = [
    ...BOOKING_STAGES,
  ]
  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <div className="flex gap-3 items-start" style={{ width: 'max-content' }}>
        {columns.map(status => {
          const items = orders.filter(o => o.stage === status)
          const cfg = styleFor(status)
          return (
            <div
              key={status}
              className="flex flex-col rounded-xl border flex-shrink-0"
              style={{ width: BOARD_COL_WIDTH, backgroundColor: 'rgba(0,0,0,0.015)', borderColor: C.border }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: C.border }}>
                <span className="text-xs font-bold whitespace-nowrap" style={{ color: cfg.color }}>{labelFor(locale, status)}</span>
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
                  const heading = order.company?.name ?? (order.requestedCompanyName ? `${order.requestedCompanyName} (new)` : `${order.name} ${order.surname}`)
                  const subheading = order.company || order.requestedCompanyName ? `${order.name} ${order.surname}` : visitLabel(locale, order.visitType)
                  return (
                    <div
                      key={order.id}
                      onClick={() => onRowClick(order.id)}
                      className="rounded-lg border p-2.5 cursor-pointer hover:shadow-md transition-shadow"
                      style={{ borderColor: C.border, backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(28,16,8,0.04)' }}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="font-semibold truncate" style={{ color: C.text, fontSize: '0.8125rem' }} title={heading}>{heading}</div>
                            <PaymentMark order={order} locale={locale} />
                          </div>
                          <div className="truncate" style={{ color: C.faint, fontSize: '0.7rem' }} title={subheading}>{subheading}</div>
                        </div>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          style={{
                            backgroundColor: order.bookingType === 'COMPANY' ? '#fef3c7' : '#f0fdf4',
                            color: order.bookingType === 'COMPANY' ? '#92400e' : '#166534',
                          }}
                        >
                          {order.bookingType === 'COMPANY' ? at('orders.type.company') : at('orders.type.individual')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2" style={{ fontSize: '0.7rem', color: C.muted }}>
                        <span>{formatDate(order.date)} · {order.timeSlot}</span>
                        <span>{order.guestCount} {order.guestCount === 1 ? at('orders.guest.singular') : at('orders.guest.plural')}</span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: C.border }}>
                        <div onClick={e => e.stopPropagation()}>
                          <button
                            onClick={e => onToggleStatusMenu(order.id, e)}
                            className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-opacity hover:opacity-75"
                            style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}22` }}
                          >
                            {labelFor(locale, order.stage)} ▾
                          </button>
                        </div>
                        <span className="font-bold" style={{ color: order.totalPrice != null ? C.wine : C.faint, fontSize: '0.8125rem' }}>
                          {formatTetriOrDash(asTetriOrNull(order.totalPrice))}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OrdersTable({ orders: initial, payment, detailed, defaultEmailMessageKa, defaultEmailMessageEn, displayName = 'Your Winery', locale = 'en', tenantId = null, view = 'table' }: { orders: Order[]; payment: Payment; detailed: boolean; defaultEmailMessageKa: string; defaultEmailMessageEn: string; displayName?: string; locale?: string; /** Only to pick the first-visit column defaults — see defaultVisibleFor. */ tenantId?: string | null; /** Desktop density — mobile always uses the card list below regardless of this. */ view?: 'table' | 'list' | 'board' }) {
  const router = useRouter()
  const at = (key: string) => adminT(locale, key)
  const [orders, setOrders] = useState(initial)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const printPending = useRef(false)
  const [showBookingSheet, setShowBookingSheet] = useState(false)

  useEffect(() => {
    function openSheet() { setShowBookingSheet(true) }
    window.addEventListener('ordersPrintRequested', openSheet)
    return () => window.removeEventListener('ordersPrintRequested', openSheet)
  }, [])

  // Column visibility — state lives in OrdersFilters (same row as filter bar)
  // Table listens for changes via a custom event + re-reads localStorage
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() => defaultVisibleFor(tenantId))

  useEffect(() => {
    function readCols() {
      try {
        const saved = localStorage.getItem(COLUMNS_STORAGE_KEY)
        if (saved) setVisibleCols(new Set(JSON.parse(saved) as ColumnId[]))
      } catch {}
    }
    readCols()
    window.addEventListener('ordersColumnsChanged', readCols)
    return () => window.removeEventListener('ordersColumnsChanged', readCols)
  }, [])

  // Status menu — menu itself renders in a portal (see bottom of component) so it
  // can't be clipped by an ancestor's overflow (the table's sticky columns / scroll
  // container, or the mobile card list's own `overflow-hidden` — #62); position is
  // captured from the trigger element's rect when opened.
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)
  const [statusMenuRect, setStatusMenuRect] = useState<{ top: number; bottom: number; left: number } | null>(null)
  // Set instead of firing the 'paid' change immediately when its step is
  // clicked — the menu stays open and swaps to a "how was this paid?" picker
  // (Bank transfer / Cash) so the ledger records what the admin actually
  // asserted rather than a guessed MANUAL. CARD is never offered here — it's
  // only ever set by a real Flitt settlement (lib/payments/settle.ts).
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null)

  // Hover preview
  const [hoverOrder, setHoverOrder] = useState<Order | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Email invoice state
  const [emailOrder, setEmailOrder] = useState<Order | null>(null)
  const [emailMessage, setEmailMessage] = useState('')
  // Which language to send the invoice in — independent of the admin panel's
  // own `locale` prop. Defaults to Georgian, the only language this email
  // supported before the 2026-09-14 bilingual follow-up.
  const [sendLocale, setSendLocale] = useState<'en' | 'ka'>('ka')
  const [emailSending, setEmailSending] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'sent' | 'error' | null>(null)
  // Which address to actually send to (Plan-CompanyGuidesAndReps Chunk 9) — defaults to the
  // order's own email, but a company booking can pick one of its Representatives instead.
  const [recipientEmail, setRecipientEmail] = useState('')

  // Edit form state
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editGuests, setEditGuests] = useState('')
  const [editName, setEditName] = useState('')
  const [editSurname, setEditSurname] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Close status dropdown on outside click, or if the table scrolls under it
  // (the menu is a fixed-position portal, so it won't track the trigger button on scroll)
  useEffect(() => {
    if (!statusMenuId) return
    // Next's App Router hydrates at `document`, so React's own delegated click
    // listener lives on that same node — not a descendant of it. The nested
    // `onClick={e => e.stopPropagation()}` wrappers around the menu (and the
    // mobile card's trigger div) only stop the event bubbling to further
    // *ancestors*; they cannot stop this second, independently-registered
    // `document` listener from also running for the same click.
    //
    // A plain containment check (`e.target.closest('[data-status-menu]')`) on
    // a *bubble*-phase listener is not enough either, confirmed live: clicking
    // "Paid" swaps the menu's content (the step list unmounts, the Bank
    // Transfer/Cash picker mounts in its place), and React flushes that
    // synchronously while dispatching the click to its own (earlier-
    // registered) bubble listener — before this listener's turn on the same
    // `document` node. By then `e.target` (the old "Paid" button) had already
    // been removed from the DOM, so `.closest()` on a detached node found
    // nothing and this handler wrongly concluded the click was "outside" and
    // closed what the click had just opened. Running in the *capture* phase
    // fixes this: capture fires top-down before the click ever reaches the
    // target, so the containment check runs while the DOM is still exactly as
    // the user clicked it.
    function handleClick(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('[data-status-menu]')) return
      setStatusMenuId(null); setStatusMenuRect(null); setPayingOrderId(null)
    }
    function handleScroll() { setStatusMenuId(null); setStatusMenuRect(null); setPayingOrderId(null) }
    document.addEventListener('click', handleClick, true)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [statusMenuId])

  useEffect(() => {
    if (printOrder && printPending.current) {
      printPending.current = false
      setTimeout(() => {
        window.print()
        setPrintOrder(null)
      }, 100)
    }
  }, [printOrder])

  function handlePrint(order: Order) {
    printPending.current = true
    setPrintOrder(order)
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }

  function invoiceRecipientOptions(order: Order): { label: string; email: string }[] {
    const options: { label: string; email: string }[] = []
    if (order.email) options.push({ label: at('orders.emailModal.guestEmail'), email: order.email })
    // A company person's own record can share the guest's address — the contact_person picked
    // for this very booking is exactly that case. Same inbox either way, so one option, not two
    // (and a duplicate `email` key would collide in the <select> below).
    for (const r of order.invoiceRecipients) {
      if (!options.some(o => o.email === r.email)) options.push({ label: r.name, email: r.email })
    }
    return options
  }

  function openEmail(order: Order) {
    setEmailOrder(order)
    setSendLocale('ka')
    setEmailMessage(defaultEmailMessageKa)
    setEmailStatus(null)
    setRecipientEmail(invoiceRecipientOptions(order)[0]?.email ?? '')
  }

  function changeSendLocale(next: 'en' | 'ka') {
    // Only swap the box's text if it still matches the *other* language's
    // default — an admin's own edits are never silently overwritten.
    if (emailMessage === defaultEmailMessageKa || emailMessage === defaultEmailMessageEn) {
      setEmailMessage(next === 'ka' ? defaultEmailMessageKa : defaultEmailMessageEn)
    }
    setSendLocale(next)
  }

  async function handleSendEmail() {
    if (!emailOrder) return
    setEmailSending(true)
    setEmailStatus(null)
    const result = await sendOrderInvoice(emailOrder.id, emailMessage, sendLocale, recipientEmail || undefined)
    setEmailSending(false)
    if ('error' in result) {
      setEmailStatus('error')
    } else {
      setEmailStatus('sent')
      // Reflect the invoice date in local state. It is recorded whatever stage
      // the booking is at — sending an invoice says nothing about whether the
      // visit happened — so unlike the old INVOICE_SENT status there is no
      // "only advance from NEW or CONFIRMED" guard to mirror.
      const sentAt = new Date()
      if (emailOrder.invoiceSentAt == null) {
        setOrders(prev => prev.map(o => o.id === emailOrder.id ? { ...o, invoiceSentAt: sentAt } : o))
        setEmailOrder(prev => prev ? { ...prev, invoiceSentAt: sentAt } : prev)
      }
    }
  }

  function handleRowMouseEnter(order: Order, e: React.MouseEvent) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    const x = e.clientX
    const y = e.clientY
    hoverTimer.current = setTimeout(() => {
      setHoverPos({ x, y })
      setHoverOrder(order)
    }, 380)
  }

  function handleRowMouseMove(e: React.MouseEvent) {
    setHoverPos({ x: e.clientX, y: e.clientY })
  }

  function handleRowMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHoverOrder(null)
  }

  // Status badge + action-icon columns sit on top of / next to the sticky
  // right edge — the preview card must never render over them, so stop it
  // from triggering (or dismiss it immediately) while hovering those cells.
  function suppressRowHover(e: React.MouseEvent) {
    e.stopPropagation()
    handleRowMouseLeave()
  }

  async function handleStatusChange(orderId: string, change: BookingStatusChange) {
    setStatusMenuId(null)
    setStatusMenuRect(null)
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      // Literally the same patch functions the server is about to call, so the
      // pill and the payment mark move on click instead of waiting for the
      // round trip — and the optimistic view cannot drift from the real write,
      // which is where that kind of drift would be invisible.
      return { ...o, ...optimisticPatch(o, change) }
    }))
    await changeBookingStatus(orderId, change)
  }

  // Typed HTMLElement, not HTMLButtonElement — the mobile card list's trigger is
  // the wrapping div (see #17's hit-area note), not the button itself, so this
  // needs to accept a rect from either.
  function toggleStatusMenu(orderId: string, e: React.MouseEvent<HTMLElement>) {
    if (statusMenuId === orderId) {
      setStatusMenuId(null)
      setStatusMenuRect(null)
      setPayingOrderId(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setStatusMenuRect({ top: rect.top, bottom: rect.bottom, left: rect.left })
    setStatusMenuId(orderId)
    setPayingOrderId(null)
  }

  /** A step was clicked in the menu — 'paid' swaps to the method picker
   * instead of firing right away; everything else fires immediately as before. */
  function handleStepClick(orderId: string, step: MenuStep) {
    if (step.code === 'paid') {
      setPayingOrderId(orderId)
      return
    }
    handleStatusChange(orderId, step.change)
  }

  function handlePaymentMethodChosen(orderId: string, method: 'BANK_TRANSFER' | 'CASH') {
    setPayingOrderId(null)
    handleStatusChange(orderId, { kind: 'paid', value: true, method })
  }

  function openEdit(order: Order) {
    setEditingOrder(order)
    setEditDate(toInputDate(order.date))
    setEditTime(order.timeSlot)
    setEditGuests(String(order.guestCount))
    setEditName(order.name)
    setEditSurname(order.surname)
    setEditPhone(order.phone ?? '')
    setEditEmail(order.email ?? '')
    setEditNotes(order.notes ?? '')
    setError('')
  }

  function closeEdit() {
    setEditingOrder(null)
    setError('')
  }

  async function handleDelete(id: string) {
    setLoading(true)
    await deleteOrder(id)
    setOrders(prev => prev.filter(o => o.id !== id))
    setDeletingId(null)
    setLoading(false)
  }

  async function handleUpdate() {
    if (!editingOrder) return
    setLoading(true)
    setError('')
    const result = await updateOrder(editingOrder.id, {
      date: editDate,
      timeSlot: editTime,
      guestCount: Number(editGuests),
      name: editName,
      surname: editSurname,
      phone: editPhone,
      email: editEmail,
      notes: editNotes,
    })
    if ('error' in result) {
      setError(result.error ?? '')
      setLoading(false)
      return
    }
    setOrders(prev => prev.map(o => o.id === editingOrder.id ? {
      ...o,
      date: new Date(editDate),
      timeSlot: editTime,
      guestCount: Number(editGuests),
      name: editName,
      surname: editSurname,
      phone: editPhone || null,
      email: editEmail || null,
      notes: editNotes || null,
    } : o))
    closeEdit()
    setLoading(false)
  }

  const col = (id: ColumnId) => visibleCols.has(id)

  return (
    <>
      {/* ── Mobile card list (hidden on md+) ──────────────────── */}
      <div className="flex flex-col gap-2 mt-4 md:hidden">
        {orders.length === 0 && (
          <p className="text-center py-12 text-sm" style={{ color: C.faint }}>{at('orders.noOrders')}</p>
        )}
        {orders.map(order => {
          const cfg = styleFor(order.stage)
          return (
            <div
              key={order.id}
              className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: '#ffffff', borderColor: C.border, borderLeftWidth: 4, borderLeftColor: cfg.color }}
            >
              <div
                onClick={() => router.push(`/admin/orders/${order.id}`)}
                className="p-4 cursor-pointer active:bg-amber-50"
              >
                {/* Name + status badge */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-semibold inline-flex items-center gap-1.5" style={{ color: C.text, fontSize: '0.9375rem' }}>
                    {order.name} {order.surname}
                    <PaymentMark order={order} locale={locale} />
                  </span>
                  {/* The click handler is on this wrapper, not the pill, so
                      padding here buys hit area for free: the badge still reads
                      as a 26px badge, the thumb gets 42px. Vertical only — the
                      whole card is a link to the order, so widening sideways
                      would turn taps meant for the guest's name into status
                      changes. Card list = the phone view of /admin/orders. */}
                  <div
                    className="relative flex-shrink-0 py-2 -my-2"
                    data-status-menu
                    onClick={e => { e.stopPropagation(); toggleStatusMenu(order.id, e) }}
                  >
                    <button
                      className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap"
                      style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}
                    >
                      {labelFor(locale, order.stage)} ▾
                    </button>
                    {/* Menu itself renders in the shared portal at the bottom of this
                        component (#62) — same trigger→toggleStatusMenu→statusMenuRect
                        path the desktop table/list/board views use, so it can't be
                        clipped by this card's own overflow-hidden. */}
                  </div>
                </div>

                {/* Date / time / guests */}
                <p className="text-sm mb-0.5" style={{ color: C.muted }}>
                  {formatDate(order.date)} · {order.timeSlot}
                </p>
                <p className="text-sm mb-0.5" style={{ color: C.muted }}>
                  {order.guestCount} {order.guestCount === 1 ? at('orders.guest.singular') : at('orders.guest.plural')} · {visitLabel(locale, order.visitType)}
                </p>
                {(order.company || order.requestedCompanyName) && (
                  <p className="text-sm" style={{ color: order.requestedCompanyName && !order.company ? '#92400e' : C.faint }}>
                    {order.company?.name ?? `${order.requestedCompanyName} (new)`}
                  </p>
                )}

                {/* Footer row: total + arrow */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
                  <span className="font-bold" style={{ color: order.totalPrice != null ? C.wine : C.faint, fontSize: '1rem' }}>
                    {formatTetriOrDash(asTetriOrNull(order.totalPrice))}
                  </span>
                  <span className="text-xs flex items-center gap-1" style={{ color: C.faint }}>
                    {at('orders.viewDetails')}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop table (hidden on mobile) ──────────────────── */}
      <div className="hidden md:block">
      {view === 'board' ? (
        <OrdersBoardColumns
          orders={orders}
          locale={locale}
          onRowClick={id => router.push(`/admin/orders/${id}`)}
          onToggleStatusMenu={toggleStatusMenu}
        />
      ) : view === 'list' ? (
        <OrdersListRows
          orders={orders}
          locale={locale}
          deletingId={deletingId}
          loading={loading}
          onRowClick={id => router.push(`/admin/orders/${id}`)}
          onToggleStatusMenu={toggleStatusMenu}
          onPrint={handlePrint}
          onEmail={openEmail}
          onEdit={openEdit}
          onRequestDelete={setDeletingId}
          onConfirmDelete={handleDelete}
          onCancelDelete={() => setDeletingId(null)}
          detailed={detailed}
        />
      ) : (
      <div className="rounded-xl border overflow-auto max-h-[70vh] mt-4" style={{ borderColor: C.border }}>
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {COLUMN_DEFS.filter(c => visibleCols.has(c.id)).map(c => (
                c.id === 'status' ? (
                  <th key={c.id} className="text-left px-4 py-3 font-medium whitespace-nowrap sticky-status"
                    style={{ color: C.muted, position: 'sticky', top: 0, right: ACTIONS_COL_WIDTH, zIndex: 30, backgroundColor: C.bg, boxShadow: `-1px 0 0 ${C.border}, 0 1px 0 ${C.border}` }}>
                    {at(c.labelKey)}
                  </th>
                ) : (
                  <th key={c.id} className="text-left px-4 py-3 font-medium whitespace-nowrap"
                    style={{ color: C.muted, position: 'sticky', top: 0, zIndex: 20, backgroundColor: C.bg, boxShadow: `0 1px 0 ${C.border}` }}>
                    {at(c.labelKey)}
                  </th>
                )
              ))}
              <th className="text-left px-4 py-3 font-medium"
                style={{ color: C.muted, position: 'sticky', top: 0, right: 0, zIndex: 30, width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, backgroundColor: C.bg, boxShadow: `-1px 0 0 ${C.border}, 0 1px 0 ${C.border}` }}></th>
            </tr>
          </thead>
          <tbody style={{ backgroundColor: '#ffffff' }}>
            {orders.map((order, i) => (
              <tr
                key={order.id}
                onClick={() => router.push(`/admin/orders/${order.id}`)}
                onMouseEnter={e => handleRowMouseEnter(order, e)}
                onMouseMove={handleRowMouseMove}
                onMouseLeave={handleRowMouseLeave}
                style={{
                  borderBottom: i < orders.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                }}
                className="hover:bg-amber-50 transition-colors"
              >
                {/* Order ID */}
                {col('orderId') && (
                  <td className="px-4 py-3" style={{ color: C.faint, fontFamily: 'monospace', fontSize: 11 }}>
                    {order.id.slice(0, 8)}…
                  </td>
                )}

                {/* Date */}
                {col('date') && (
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.text }}>{formatDate(order.date)}</td>
                )}

                {/* Time */}
                {col('time') && (
                  <td className="px-4 py-3" style={{ color: C.muted }}>{order.timeSlot}</td>
                )}

                {/* Contact */}
                {col('contact') && (
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium" style={{ color: C.text }}>{order.name} {order.surname}</span>
                      {order.phone && <span style={{ color: C.faint, fontSize: 11 }}>{order.phone}</span>}
                      {order.email && <span style={{ color: C.faint, fontSize: 11 }}>{order.email}</span>}
                    </div>
                  </td>
                )}

                {/* Type */}
                {col('type') && (
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: order.bookingType === 'COMPANY' ? '#fef3c7' : '#f0fdf4',
                      color: order.bookingType === 'COMPANY' ? '#92400e' : '#166534',
                    }}>
                      {order.bookingType === 'COMPANY' ? at('orders.type.company') : at('orders.type.individual')}
                    </span>
                  </td>
                )}

                {/* Company */}
                {col('company') && (
                  <td className="px-4 py-3" style={{ color: order.requestedCompanyName && !order.company ? '#92400e' : C.muted }}>
                    {order.company?.name ?? (order.requestedCompanyName ? `${order.requestedCompanyName} (new)` : '—')}
                  </td>
                )}

                {/* Nationality (Plan-CompanyNationality) — company bookings only, may be empty */}
                {col('nationality') && (
                  <td className="px-4 py-3" style={{ color: order.nationalities.length > 0 ? C.muted : C.faint }}>
                    {order.nationalities.length > 0 ? order.nationalities.map(countryName).join(', ') : '—'}
                  </td>
                )}

                {/* Tasting guests */}
                {col('tasting') && (
                  <td className="px-4 py-3 text-center" style={{ color: order.tastingGuestCount > 0 ? C.text : C.faint }}>
                    {order.tastingGuestCount > 0 ? order.tastingGuestCount : '—'}
                  </td>
                )}

                {/* Lunch guests */}
                {col('lunch') && (
                  <td className="px-4 py-3 text-center" style={{ color: order.lunchGuestCount > 0 ? C.text : C.faint }}>
                    {order.lunchGuestCount > 0 ? order.lunchGuestCount : '—'}
                  </td>
                )}

                {/* Total guests */}
                {col('guests') && (
                  <td className="px-4 py-3 text-center" style={{ color: C.text }}>{order.guestCount}</td>
                )}

                {/* Visit type */}
                {col('visit') && (
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.muted }}>{visitLabel(locale, order.visitType)}</td>
                )}

                {/* Masterclass */}
                {col('masterclass') && (
                  <td className="px-4 py-3" style={{ color: C.muted, fontSize: 12 }}>
                    {order.masterclassLines.length > 0
                      ? <OneLine title={order.masterclassLines.map(l => `${l.name} ×${l.quantity}`).join(', ')}>
                          {order.masterclassLines.map((l, idx) => (
                            <span key={idx}>
                              {idx > 0 && <span style={{ color: C.faint }}> · </span>}
                              {l.name} <span style={{ color: C.faint }}>×{l.quantity}</span>
                            </span>
                          ))}
                        </OneLine>
                      : <span style={{ color: C.faint }}>—</span>
                    }
                  </td>
                )}

                {/* Food */}
                {col('food') && (
                  <td className="px-4 py-3" style={{ fontSize: 12 }}>
                    {order.hotDishVegetable || order.hotDishMeat || order.foodNotes
                      ? <OneLine title={[
                          order.hotDishVegetable && `${at('orders.food.veg')} ${order.hotDishVegetable}`,
                          order.hotDishMeat && `${at('orders.food.meat')} ${order.hotDishMeat}`,
                          order.foodNotes,
                        ].filter(Boolean).join(' · ')}>
                          {order.hotDishVegetable && <span style={{ color: C.muted }}><span style={{ color: C.faint }}>{at('orders.food.veg')}</span> {order.hotDishVegetable}</span>}
                          {order.hotDishMeat && <span style={{ color: C.muted }}>{order.hotDishVegetable && <span style={{ color: C.faint }}> · </span>}<span style={{ color: C.faint }}>{at('orders.food.meat')}</span> {order.hotDishMeat}</span>}
                          {order.foodNotes && <span style={{ color: C.faint, fontStyle: 'italic' }}>{(order.hotDishVegetable || order.hotDishMeat) && ' · '}{order.foodNotes}</span>}
                        </OneLine>
                      : <span style={{ color: C.faint }}>—</span>
                    }
                  </td>
                )}

                {/* Total */}
                {col('total') && (
                  <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: C.wine }}>
                    {formatTetriOrDash(asTetriOrNull(order.totalPrice))}
                  </td>
                )}

                {/* Additional */}
                {col('additional') && (
                  <td className="px-4 py-3" style={{ fontSize: 12 }}>
                    {(order.extras.length > 0 || order.notes)
                      ? <OneLine title={[
                          ...order.extras.map(e => `${e.label}: ${formatTetri(asTetri(e.amount))}`),
                          order.notes,
                        ].filter(Boolean).join(' · ')}>
                          {order.extras.map((e, idx) => (
                            <span key={idx} style={{ color: C.muted }}>
                              {idx > 0 && <span style={{ color: C.faint }}> · </span>}
                              {e.label}: <span style={{ color: C.wine }}>{formatTetri(asTetri(e.amount))}</span>
                            </span>
                          ))}
                          {order.notes && <span style={{ color: C.faint, fontStyle: 'italic' }}>{order.extras.length > 0 && ' · '}{order.notes}</span>}
                        </OneLine>
                      : <span style={{ color: C.faint }}>—</span>
                    }
                  </td>
                )}

                {/* Status — pinned next to the sticky actions column */}
                {col('status') && (
                  <td className="px-4 py-3 sticky-status" onClick={e => e.stopPropagation()} onMouseEnter={suppressRowHover} onMouseMove={e => e.stopPropagation()}
                    style={{ position: 'sticky', right: ACTIONS_COL_WIDTH, backgroundColor: '#ffffff', boxShadow: '-1px 0 0 ' + C.border }}>
                    <div className="relative flex items-center gap-1.5">
                      {(() => {
                        const cfg = styleFor(order.stage)
                        return (
                          <button
                            onClick={e => toggleStatusMenu(order.id, e)}
                            className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-opacity hover:opacity-75"
                            style={{
                              backgroundColor: cfg.bg,
                              color: cfg.color,
                              border: `1px solid ${cfg.color}22`,
                            }}
                          >
                            {labelFor(locale, order.stage)} ▾
                          </button>
                        )
                      })()}
                      <PaymentMark order={order} locale={locale} />
                    </div>
                  </td>
                )}
                <td className="px-4 py-3 sticky-actions" onClick={e => e.stopPropagation()} onMouseEnter={suppressRowHover} onMouseMove={e => e.stopPropagation()} style={{ position: 'sticky', right: 0, width: ACTIONS_COL_WIDTH, minWidth: ACTIONS_COL_WIDTH, backgroundColor: '#ffffff', boxShadow: '-1px 0 0 ' + C.border }}>
                  {deletingId === order.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: C.muted }}>{at('orders.deleteConfirm')}</span>
                      <button onClick={() => handleDelete(order.id)} disabled={loading}
                        className="text-xs px-2 py-1 rounded font-medium text-white"
                        style={{ backgroundColor: '#b91c1c' }}>{at('orders.yes')}</button>
                      <button onClick={() => setDeletingId(null)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: C.border, color: C.muted }}>{at('orders.no')}</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePrint(order)}
                        title={detailed ? at('orders.printDetailedInvoice') : at('orders.printInvoice')}
                        className="p-1 rounded border transition-colors hover:bg-amber-100"
                        style={{ borderColor: C.border, color: C.muted }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"/>
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                          <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => openEmail(order)}
                        title={at('orders.sendInvoiceEmail')}
                        className="p-1 rounded border transition-colors hover:bg-amber-100"
                        style={{ borderColor: C.border, color: order.email ? C.muted : C.faint }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2"/>
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                        </svg>
                      </button>
                      {/* Edit */}
                      <button onClick={() => openEdit(order)} title={at('orders.editOrder')}
                        className="p-1 rounded border transition-colors hover:bg-amber-100"
                        style={{ borderColor: C.border, color: C.muted }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      {/* Delete */}
                      <button onClick={() => setDeletingId(order.id)} title={at('orders.deleteOrder')}
                        className="p-1 rounded border transition-colors hover:bg-red-50"
                        style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      </div>{/* end hidden md:block */}

      {/* Status dropdown portal — renders into <body> as a fixed-position overlay so it
          can never be clipped by the table's sticky columns / scroll container (#140) */}
      {statusMenuId && statusMenuRect && typeof document !== 'undefined' && (() => {
        const order = orders.find(o => o.id === statusMenuId)
        if (!order) return null
        const menuW = 140
        const steps = menuSteps(order)
        const choosingPayment = payingOrderId === order.id
        const menuH = choosingPayment ? 110 : steps.length * 33 + 8
        const vw = window.innerWidth
        const vh = window.innerHeight
        const left = Math.min(statusMenuRect.left, vw - menuW - 8)
        const top = statusMenuRect.bottom + 4 + menuH > vh
          ? Math.max(statusMenuRect.top - menuH - 4, 8)
          : statusMenuRect.bottom + 4
        return createPortal(
          <div
            className="rounded-lg shadow-lg border py-1"
            data-status-menu
            style={{ position: 'fixed', top, left, zIndex: 100, minWidth: menuW, backgroundColor: 'var(--site-surface)', borderColor: C.border }}
            onClick={e => e.stopPropagation()}
          >
            {choosingPayment ? (
              <div className="px-3 py-2">
                <p className="text-xs mb-1.5" style={{ color: C.muted }}>{at('paymentMethod.howPaid')}</p>
                <div className="flex flex-col gap-1">
                  <button onClick={() => handlePaymentMethodChosen(order.id, 'BANK_TRANSFER')}
                    className="text-left text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#16a34a' }}>
                    {at('paymentMethod.bankTransfer')}
                  </button>
                  <button onClick={() => handlePaymentMethodChosen(order.id, 'CASH')}
                    className="text-left text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#16a34a' }}>
                    {at('paymentMethod.cash')}
                  </button>
                  <button onClick={() => setPayingOrderId(null)}
                    className="text-left text-xs px-2 py-0.5" style={{ color: C.muted }}>
                    {at('paymentMethod.cancel')}
                  </button>
                </div>
              </div>
            ) : steps.map(step => (
              <button
                key={step.code}
                onClick={() => handleStepClick(order.id, step)}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-amber-100"
                style={{ color: C.text }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: styleFor(step.code).color }} />
                {labelFor(locale, step.code)}
              </button>
            ))}
          </div>,
          document.body
        )
      })()}

      {/* Invoice portal — renders directly into <body> so print CSS can isolate it */}
      {printOrder && typeof document !== 'undefined' && createPortal(
        <div id="invoice-portal">
          <InvoicePrint order={printOrder} payment={payment} detailed={detailed} displayName={displayName} />
        </div>,
        document.body
      )}

      {/* Booking sheet preview modal — shows what will print before committing to it */}
      {showBookingSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(28,16,8,0.45)' }}>
          <div className="w-full max-w-4xl rounded-xl border shadow-lg flex flex-col" style={{ backgroundColor: 'var(--site-surface)', borderColor: C.border, maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: C.border }}>
              <h2 className="font-semibold text-base" style={{ color: C.text }}>{at('orders.sheet.previewTitle')}</h2>
              <button onClick={() => setShowBookingSheet(false)} style={{ color: C.faint, fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>
            <div className="px-6 py-5 overflow-auto">
              <div className="rounded-lg border overflow-auto" style={{ borderColor: C.border, backgroundColor: '#fff' }}>
                <BookingSheetPrint orders={orders} displayName={displayName} locale={locale} />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => window.print()}
                  className="btn-wine flex-1 py-2 rounded-lg text-sm font-medium"
                >
                  {at('orders.sheet.print')}
                </button>
                <button
                  onClick={() => setShowBookingSheet(false)}
                  className="px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  {at('orders.sheet.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking sheet print portal — only mounted while the preview is open, so
          window.print() (triggered from the modal above) picks up the same content (#141) */}
      {showBookingSheet && typeof document !== 'undefined' && createPortal(
        <div id="booking-sheet-portal">
          <BookingSheetPrint orders={orders} displayName={displayName} locale={locale} />
        </div>,
        document.body
      )}

      {/* Send invoice email modal */}
      {emailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(28,16,8,0.45)' }}>
          <div className="w-full max-w-xl rounded-xl border shadow-lg flex flex-col" style={{ backgroundColor: 'var(--site-surface)', borderColor: C.border, maxHeight: '90vh' }}>

            {/* Fixed header */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: C.border }}>
              <h2 className="font-semibold text-base" style={{ color: C.text }}>{at('orders.emailModal.title')}</h2>
              <button onClick={() => setEmailOrder(null)} style={{ color: C.faint, fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>

            {/* Scrollable body */}
            <div className="px-6 py-5 overflow-y-auto">
              <p className="text-xs mb-0.5" style={{ color: C.faint }}>{at('orders.emailModal.order')}</p>
              <p className="text-sm font-medium mb-4" style={{ color: C.text }}>
                {emailOrder.name} {emailOrder.surname} · {formatDate(emailOrder.date)} {emailOrder.timeSlot}
              </p>

              {invoiceRecipientOptions(emailOrder).length > 0 ? (
                <>
                  {/* To field + validation. A company order with Representatives configured
                      can send to one of them instead of the guest's own email
                      (Plan-CompanyGuidesAndReps Chunk 9). */}
                  <p className="text-xs mb-0.5" style={{ color: C.faint }}>{at('orders.emailModal.to')}</p>
                  {invoiceRecipientOptions(emailOrder).length > 1 ? (
                    <select
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      className="text-sm mb-1 font-mono w-full rounded-lg border px-2 py-1.5"
                      style={{ borderColor: C.border, color: C.text, backgroundColor: 'var(--site-surface)' }}
                    >
                      {invoiceRecipientOptions(emailOrder).map(opt => (
                        <option key={opt.email} value={opt.email}>{opt.label} — {opt.email}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm mb-1 font-mono" style={{ color: C.text }}>{recipientEmail}</p>
                  )}
                  {!isValidEmail(recipientEmail) ? (
                    <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 mb-3 text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                      {at('orders.emailModal.invalidEmail')}
                    </div>
                  ) : (
                    <p className="text-xs mb-3" style={{ color: '#16a34a' }}>{at('orders.emailModal.validEmail')}</p>
                  )}

                  {/* Language */}
                  <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orders.emailModal.language')}</label>
                  <div className="flex gap-1 p-1 rounded-lg w-fit mb-3" style={{ backgroundColor: '#ede5d8' }}>
                    {(['ka', 'en'] as const).map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => changeSendLocale(l)}
                        className="px-4 py-1 rounded-md text-xs font-semibold uppercase transition-all"
                        style={{
                          backgroundColor: sendLocale === l ? 'var(--site-surface)' : 'transparent',
                          color: sendLocale === l ? C.wine : C.muted,
                          boxShadow: sendLocale === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {l === 'ka' ? at('orders.emailModal.languageKa') : at('orders.emailModal.languageEn')}
                      </button>
                    ))}
                  </div>

                  {/* Message */}
                  <label className="text-xs block mb-1" style={{ color: C.faint }}>{at('orders.emailModal.message')}</label>
                  <textarea
                    rows={3}
                    value={emailMessage}
                    onChange={e => setEmailMessage(e.target.value)}
                    placeholder={at('orders.emailModal.messagePlaceholder')}
                    style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
                  />

                  {/* Invoice preview — always visible */}
                  <p className="text-xs mb-1" style={{ color: C.faint }}>{at('orders.emailModal.invoicePreview')}</p>
                  <div className="rounded-lg border overflow-auto mb-4" style={{ borderColor: C.border, backgroundColor: '#fff', maxHeight: 360 }}>
                    <div style={{ zoom: '75%' }}>
                      <InvoicePrint order={emailOrder} payment={payment} detailed={detailed} displayName={displayName} />
                    </div>
                  </div>

                  {/* Status */}
                  {emailStatus === 'error' && (
                    <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>{at('orders.emailModal.sendFailed')}</p>
                  )}
                  {emailStatus === 'sent' && (
                    <p className="text-sm mb-3" style={{ color: '#16a34a' }}>{at('orders.emailModal.sentSuccess')}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleSendEmail}
                      disabled={emailSending || emailStatus === 'sent' || !isValidEmail(recipientEmail)}
                      className="btn-wine flex-1 py-2 rounded-lg text-sm font-medium"
                    >
                      {emailSending ? at('orders.emailModal.sending') : emailStatus === 'sent' ? at('orders.emailModal.sent') : at('orders.emailModal.sendInvoice')}
                    </button>
                    <button
                      onClick={() => setEmailOrder(null)}
                      className="px-4 py-2 rounded-lg border text-sm"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      {emailStatus === 'sent' ? at('orders.emailModal.close') : at('orders.emailModal.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
                    {at('orders.emailModal.noEmail')}
                  </div>
                  <button
                    onClick={() => setEmailOrder(null)}
                    className="px-4 py-2 rounded-lg border text-sm"
                    style={{ borderColor: C.border, color: C.muted }}
                  >
                    {at('orders.emailModal.close')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit panel backdrop */}
      {editingOrder && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(28,16,8,0.3)' }}
          onClick={closeEdit}
        />
      )}

      {/* Edit slide-over panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 overflow-y-auto w-full sm:w-[400px]"
        style={{
          backgroundColor: 'var(--site-surface)',
          borderLeft: `1px solid ${C.border}`,
          transform: editingOrder ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
          padding: '24px',
        }}
      >
        {editingOrder && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-base" style={{ color: C.text }}>{at('orders.editPanel.title')}</h2>
              <button onClick={closeEdit} style={{ color: C.faint, fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={at('orders.editPanel.date')}>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputStyle} />
                </Field>
                <Field label={at('orders.editPanel.time')}>
                  <select value={editTime} onChange={e => setEditTime(e.target.value)} style={inputStyle}>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>

              <Field label={at('orders.editPanel.guests')}>
                <input type="number" min={1} value={editGuests} onChange={e => setEditGuests(e.target.value)} style={inputStyle} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={at('orders.editPanel.firstName')}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label={at('orders.editPanel.lastName')}>
                  <input value={editSurname} onChange={e => setEditSurname(e.target.value)} style={inputStyle} />
                </Field>
              </div>

              <Field label={at('orders.editPanel.phone')}>
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} style={inputStyle} />
              </Field>

              <Field label={at('orders.editPanel.email')}>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} style={inputStyle} />
              </Field>

              <Field label={at('orders.editPanel.notes')}>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder={at('orders.editPanel.notesPlaceholder')}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>

              <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#fdf6ee', color: C.muted }}>
                <strong>{at('orders.editPanel.notEditable')}</strong> {at('orders.editPanel.notEditableDetail')}
              </div>

              {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="btn-wine flex-1 py-2 rounded-lg text-sm font-medium"
                >
                  {loading ? at('orders.editPanel.saving') : at('orders.editPanel.save')}
                </button>
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  {at('orders.editPanel.cancel')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hover preview card */}
      {hoverOrder && (() => {
        const o = hoverOrder
        const cardW = 300
        const cardH = 420
        const pad = 16
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800
        const left = hoverPos.x + 20 + cardW > vw - pad ? hoverPos.x - cardW - 12 : hoverPos.x + 20
        const top = Math.min(Math.max(hoverPos.y - 60, pad), vh - cardH - pad)
        const cfg = styleFor(o.stage)
        const hasSplit = o.tastingGuestCount > 0 || o.lunchGuestCount > 0 || o.freeGuestCount > 0
        const mcAmt = o.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
        const extrasAmt = o.extras.reduce((s, e) => s + e.amount, 0)
        const bookingAmt = (o.totalPrice ?? 0) - mcAmt - extrasAmt
        return (
          <div
            style={{
              position: 'fixed', left, top, width: cardW, zIndex: 9999,
              backgroundColor: 'var(--site-surface)', border: `1px solid ${C.border}`,
              borderRadius: 12, boxShadow: '0 8px 32px rgba(28,16,8,0.18)',
              fontFamily: 'Georgia, serif', fontSize: 13, color: C.text,
              pointerEvents: 'none', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ backgroundColor: C.wine, padding: '10px 14px' }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                {o.company?.name ?? (o.requestedCompanyName ? `${o.requestedCompanyName} (new)` : `${o.name} ${o.surname}`)}
              </div>
              <div style={{ color: '#f5c6c8', fontSize: 11, marginTop: 2 }}>
                {o.name} {o.surname}
              </div>
            </div>

            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Date / time / visit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: C.muted }}>{formatDate(o.date)} · {o.timeSlot}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, fontFamily: 'sans-serif', backgroundColor: cfg.bg, color: cfg.color, borderRadius: 99, padding: '1px 8px', fontWeight: 600 }}>{labelFor(locale, o.stage)}</span>
                  <PaymentMark order={o} locale={locale} />
                </span>
              </div>
              <div style={{ color: C.faint, fontSize: 12 }}>{visitLabel(locale, o.visitType)}</div>

              <div style={{ height: 1, backgroundColor: C.border }} />

              {/* Guests */}
              <div>
                <div style={{ color: C.faint, fontSize: 11, marginBottom: 4 }}>{at('orders.preview.guests')}</div>
                {hasSplit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {o.tastingGuestCount > 0 && <PRow label={at('orders.col.tasting')} value={`${o.tastingGuestCount}`} />}
                    {o.lunchGuestCount > 0 && <PRow label={at('orders.col.lunch')} value={`${o.lunchGuestCount}`} />}
                    {o.freeGuestCount > 0 && <PRow label={at('orders.preview.guide')} value={`${o.freeGuestCount}`} />}
                    <PRow label={at('orders.col.total')} value={`${o.guestCount}`} bold />
                  </div>
                ) : (
                  <PRow label={at('orders.col.total')} value={`${o.guestCount}`} bold />
                )}
              </div>

              <div style={{ height: 1, backgroundColor: C.border }} />

              {/* Amounts */}
              <div>
                <div style={{ color: C.faint, fontSize: 11, marginBottom: 4 }}>{at('orders.preview.amount')}</div>
                <PRow label={o.visitType === 'TASTING_LUNCH' ? at('orders.visit.tastingLunch') : at('orders.col.tasting')} value={formatTetri(asTetri(bookingAmt))} />
                {o.masterclassLines.map((l, i) => (
                  <PRow key={i} label={`${l.name} ×${l.quantity}`} value={formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity))} />
                ))}
                {o.extras.map((e, i) => (
                  <PRow key={i} label={e.label} value={formatTetri(asTetri(e.amount))} />
                ))}
                <PRow label={at('orders.col.total')} value={formatTetriOrDash(asTetriOrNull(o.totalPrice))} bold wine />
              </div>

              {/* Contact */}
              {(o.phone || o.email) && (
                <>
                  <div style={{ height: 1, backgroundColor: C.border }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {o.phone && <span style={{ color: C.muted, fontSize: 12 }}>📞 {o.phone}</span>}
                    {o.email && <span style={{ color: C.muted, fontSize: 12 }}>✉ {o.email}</span>}
                  </div>
                </>
              )}

              {/* Hot dishes */}
              {(o.hotDishVegetable || o.hotDishMeat) && (
                <>
                  <div style={{ height: 1, backgroundColor: C.border }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {o.hotDishVegetable && <PRow label={at('orders.preview.vegetable')} value={o.hotDishVegetable} />}
                    {o.hotDishMeat && <PRow label={at('orders.preview.meat')} value={o.hotDishMeat} />}
                    {o.foodNotes && <span style={{ color: C.faint, fontSize: 11, marginTop: 2 }}>{o.foodNotes}</span>}
                  </div>
                </>
              )}

              {/* Notes */}
              {o.notes && (
                <>
                  <div style={{ height: 1, backgroundColor: C.border }} />
                  <span style={{ color: C.faint, fontSize: 12, fontStyle: 'italic' }}>{o.notes}</span>
                </>
              )}
            </div>
          </div>
        )
      })()}
    </>
  )
}

function PRow({ label, value, bold, wine }: { label: string; value: string; bold?: boolean; wine?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '1px 0' }}>
      <span style={{ color: 'var(--site-muted)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, color: wine ? 'var(--color-brand)' : 'var(--site-text)' }}>{value}</span>
    </div>
  )
}
