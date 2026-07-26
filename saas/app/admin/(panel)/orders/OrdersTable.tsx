'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { deleteOrder, updateOrder, sendOrderInvoice, updateOrderStatus } from '@/app/actions/orders'
import { adminT } from '@/lib/adminT'
import InvoicePrint from './InvoicePrint'
import BookingSheetPrint from './BookingSheetPrint'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

type OrderStatus = 'NEW' | 'CONFIRMED' | 'INVOICE_SENT' | 'PAID' | 'COMPLETED' | 'CANCELLED'

const STATUS_CONFIG: Record<OrderStatus, { labelKey: string; bg: string; color: string }> = {
  NEW:          { labelKey: 'orders.status.new',          bg: '#fef9c3', color: '#a16207' },
  CONFIRMED:    { labelKey: 'orders.status.confirmed',     bg: '#dbeafe', color: '#1d4ed8' },
  INVOICE_SENT: { labelKey: 'orders.status.invoiceSent',   bg: '#fef3c7', color: '#92400e' },
  PAID:         { labelKey: 'orders.status.paid',          bg: '#dcfce7', color: '#166534' },
  COMPLETED:    { labelKey: 'orders.status.completed',     bg: '#bbf7d0', color: '#065f46' },
  CANCELLED:    { labelKey: 'orders.status.cancelled',     bg: '#fee2e2', color: '#b91c1c' },
}

const ALL_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'INVOICE_SENT', 'PAID', 'COMPLETED', 'CANCELLED']

import { COLUMN_DEFS, DEFAULT_VISIBLE, COLUMNS_STORAGE_KEY, type ColumnId } from './columnDefs'

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

// Actions column (print/email/edit/delete) is pinned to the right edge. Status is
// pinned right next to it, so both stay visible while scrolling a wide table —
// this width must comfortably fit the actions column in both its normal (icons)
// and delete-confirmation states, since Status's sticky offset is anchored to it.
const ACTIONS_COL_WIDTH = 190

const inputStyle = {
  backgroundColor: '#fffdf9', border: `1px solid ${C.border}`,
  borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem',
  color: C.text, outline: 'none', width: '100%',
}

type Order = {
  id: string
  status: OrderStatus
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
  company: { name: string; identificationCode: string | null } | null
  masterclassLines: { name: string; quantity: number; pricePerUnit: number }[]
  extras: { label: string; amount: number }[]
}

type Payment = {
  recipientName: string
  personalNumber: string
  bankName: string
  bankCode: string
  iban: string
}

function visitLabel(locale: string, v: string) {
  return v === 'TASTING' ? adminT(locale, 'orders.visit.tasting') : adminT(locale, 'orders.visit.tastingLunch')
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

export default function OrdersTable({ orders: initial, payment, detailed, defaultEmailMessage, displayName = 'Your Winery', locale = 'en' }: { orders: Order[]; payment: Payment; detailed: boolean; defaultEmailMessage: string; displayName?: string; locale?: string }) {
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
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(DEFAULT_VISIBLE)

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
  // can't be clipped by the table's sticky columns / scroll container; position is
  // captured from the trigger button's rect when opened.
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)
  const [statusMenuRect, setStatusMenuRect] = useState<{ top: number; bottom: number; left: number } | null>(null)

  // Hover preview
  const [hoverOrder, setHoverOrder] = useState<Order | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Email invoice state
  const [emailOrder, setEmailOrder] = useState<Order | null>(null)
  const [emailMessage, setEmailMessage] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'sent' | 'error' | null>(null)

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
    function handleClick() { setStatusMenuId(null); setStatusMenuRect(null) }
    function handleScroll() { setStatusMenuId(null); setStatusMenuRect(null) }
    document.addEventListener('click', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('click', handleClick)
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

  function openEmail(order: Order) {
    setEmailOrder(order)
    setEmailMessage(defaultEmailMessage)
    setEmailStatus(null)
  }

  async function handleSendEmail() {
    if (!emailOrder) return
    setEmailSending(true)
    setEmailStatus(null)
    const result = await sendOrderInvoice(emailOrder.id, emailMessage)
    setEmailSending(false)
    if ('error' in result) {
      setEmailStatus('error')
    } else {
      setEmailStatus('sent')
      // Reflect auto-advance in local state
      const advanceStatuses: OrderStatus[] = ['NEW', 'CONFIRMED']
      if (advanceStatuses.includes(emailOrder.status)) {
        setOrders(prev => prev.map(o => o.id === emailOrder.id ? { ...o, status: 'INVOICE_SENT' } : o))
        setEmailOrder(prev => prev ? { ...prev, status: 'INVOICE_SENT' } : prev)
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

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setStatusMenuId(null)
    setStatusMenuRect(null)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    await updateOrderStatus(orderId, newStatus)
  }

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
          const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.NEW
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
                  <span className="font-semibold" style={{ color: C.text, fontSize: '0.9375rem' }}>
                    {order.name} {order.surname}
                  </span>
                  <div
                    className="relative flex-shrink-0"
                    onClick={e => { e.stopPropagation(); setStatusMenuId(statusMenuId === order.id ? null : order.id) }}
                  >
                    <button
                      className="text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap"
                      style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}
                    >
                      {at(cfg.labelKey)} ▾
                    </button>
                    {statusMenuId === order.id && (
                      <div
                        className="absolute right-0 z-30 rounded-xl shadow-lg border py-1 mt-1"
                        style={{ minWidth: 160, backgroundColor: '#fff9f3', borderColor: C.border }}
                        onClick={e => e.stopPropagation()}
                      >
                        {ALL_STATUSES.map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(order.id, s)}
                            className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors active:bg-amber-100"
                            style={{ color: s === order.status ? STATUS_CONFIG[s].color : C.text, fontWeight: s === order.status ? 600 : 400 }}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
                            {at(STATUS_CONFIG[s].labelKey)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Date / time / guests */}
                <p className="text-sm mb-0.5" style={{ color: C.muted }}>
                  {formatDate(order.date)} · {order.timeSlot}
                </p>
                <p className="text-sm mb-0.5" style={{ color: C.muted }}>
                  {order.guestCount} {order.guestCount === 1 ? at('orders.guest.singular') : at('orders.guest.plural')} · {visitLabel(locale, order.visitType)}
                </p>
                {order.company && (
                  <p className="text-sm" style={{ color: C.faint }}>{order.company.name}</p>
                )}

                {/* Footer row: total + arrow */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
                  <span className="font-bold" style={{ color: order.totalPrice != null ? C.wine : C.faint, fontSize: '1rem' }}>
                    {order.totalPrice != null ? `${order.totalPrice}₾` : '—'}
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
                  <td className="px-4 py-3" style={{ color: C.muted }}>{order.company?.name ?? '—'}</td>
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
                      ? <div className="flex flex-col gap-0.5">
                          {order.masterclassLines.map((l, idx) => (
                            <span key={idx}>{l.name} <span style={{ color: C.faint }}>×{l.quantity}</span></span>
                          ))}
                        </div>
                      : <span style={{ color: C.faint }}>—</span>
                    }
                  </td>
                )}

                {/* Food */}
                {col('food') && (
                  <td className="px-4 py-3" style={{ fontSize: 12 }}>
                    {order.hotDishVegetable || order.hotDishMeat || order.foodNotes
                      ? <div className="flex flex-col gap-0.5">
                          {order.hotDishVegetable && <span style={{ color: C.muted }}><span style={{ color: C.faint }}>{at('orders.food.veg')}</span> {order.hotDishVegetable}</span>}
                          {order.hotDishMeat && <span style={{ color: C.muted }}><span style={{ color: C.faint }}>{at('orders.food.meat')}</span> {order.hotDishMeat}</span>}
                          {order.foodNotes && <span style={{ color: C.faint, fontStyle: 'italic' }}>{order.foodNotes}</span>}
                        </div>
                      : <span style={{ color: C.faint }}>—</span>
                    }
                  </td>
                )}

                {/* Total */}
                {col('total') && (
                  <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: C.wine }}>
                    {order.totalPrice != null ? `${order.totalPrice}₾` : '—'}
                  </td>
                )}

                {/* Additional */}
                {col('additional') && (
                  <td className="px-4 py-3" style={{ fontSize: 12 }}>
                    {(order.extras.length > 0 || order.notes)
                      ? <div className="flex flex-col gap-0.5">
                          {order.extras.map((e, idx) => (
                            <span key={idx} style={{ color: C.muted }}>{e.label}: <span style={{ color: C.wine }}>{e.amount}₾</span></span>
                          ))}
                          {order.notes && <span style={{ color: C.faint, fontStyle: 'italic' }}>{order.notes}</span>}
                        </div>
                      : <span style={{ color: C.faint }}>—</span>
                    }
                  </td>
                )}

                {/* Status — pinned next to the sticky actions column */}
                {col('status') && (
                  <td className="px-4 py-3 sticky-status" onClick={e => e.stopPropagation()} onMouseEnter={suppressRowHover} onMouseMove={e => e.stopPropagation()}
                    style={{ position: 'sticky', right: ACTIONS_COL_WIDTH, backgroundColor: '#ffffff', boxShadow: '-1px 0 0 ' + C.border }}>
                    <div className="relative">
                      {(() => {
                        const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.NEW
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
                            {at(cfg.labelKey)} ▾
                          </button>
                        )
                      })()}
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
      </div>{/* end hidden md:block */}

      {/* Status dropdown portal — renders into <body> as a fixed-position overlay so it
          can never be clipped by the table's sticky columns / scroll container (#140) */}
      {statusMenuId && statusMenuRect && typeof document !== 'undefined' && (() => {
        const order = orders.find(o => o.id === statusMenuId)
        if (!order) return null
        const menuW = 140
        const menuH = ALL_STATUSES.length * 33 + 8
        const vw = window.innerWidth
        const vh = window.innerHeight
        const left = Math.min(statusMenuRect.left, vw - menuW - 8)
        const top = statusMenuRect.bottom + 4 + menuH > vh
          ? Math.max(statusMenuRect.top - menuH - 4, 8)
          : statusMenuRect.bottom + 4
        return createPortal(
          <div
            className="rounded-lg shadow-lg border py-1"
            style={{ position: 'fixed', top, left, zIndex: 100, minWidth: menuW, backgroundColor: '#fff9f3', borderColor: C.border }}
            onClick={e => e.stopPropagation()}
          >
            {ALL_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => handleStatusChange(order.id, s)}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-amber-100"
                style={{ color: s === order.status ? STATUS_CONFIG[s].color : C.text, fontWeight: s === order.status ? 600 : 400 }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
                {at(STATUS_CONFIG[s].labelKey)}
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
          <div className="w-full max-w-4xl rounded-xl border shadow-lg flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: C.border, maxHeight: '90vh' }}>
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
          <div className="w-full max-w-xl rounded-xl border shadow-lg flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: C.border, maxHeight: '90vh' }}>

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

              {emailOrder.email ? (
                <>
                  {/* To field + validation */}
                  <p className="text-xs mb-0.5" style={{ color: C.faint }}>{at('orders.emailModal.to')}</p>
                  <p className="text-sm mb-1 font-mono" style={{ color: C.text }}>{emailOrder.email}</p>
                  {!isValidEmail(emailOrder.email) ? (
                    <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 mb-3 text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                      {at('orders.emailModal.invalidEmail')}
                    </div>
                  ) : (
                    <p className="text-xs mb-3" style={{ color: '#16a34a' }}>{at('orders.emailModal.validEmail')}</p>
                  )}

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
                      disabled={emailSending || emailStatus === 'sent' || !isValidEmail(emailOrder.email)}
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
          backgroundColor: '#fff9f3',
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
        const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.NEW
        const hasSplit = o.tastingGuestCount > 0 || o.lunchGuestCount > 0 || o.freeGuestCount > 0
        const mcAmt = o.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
        const extrasAmt = o.extras.reduce((s, e) => s + e.amount, 0)
        const bookingAmt = (o.totalPrice ?? 0) - mcAmt - extrasAmt
        return (
          <div
            style={{
              position: 'fixed', left, top, width: cardW, zIndex: 9999,
              backgroundColor: '#fff9f3', border: `1px solid ${C.border}`,
              borderRadius: 12, boxShadow: '0 8px 32px rgba(28,16,8,0.18)',
              fontFamily: 'Georgia, serif', fontSize: 13, color: C.text,
              pointerEvents: 'none', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ backgroundColor: C.wine, padding: '10px 14px' }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                {o.company?.name ?? `${o.name} ${o.surname}`}
              </div>
              <div style={{ color: '#f5c6c8', fontSize: 11, marginTop: 2 }}>
                {o.name} {o.surname}
              </div>
            </div>

            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Date / time / visit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: C.muted }}>{formatDate(o.date)} · {o.timeSlot}</span>
                <span style={{ fontSize: 11, fontFamily: 'sans-serif', backgroundColor: cfg.bg, color: cfg.color, borderRadius: 99, padding: '1px 8px', fontWeight: 600 }}>{at(cfg.labelKey)}</span>
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
                <PRow label={o.visitType === 'TASTING_LUNCH' ? at('orders.visit.tastingLunch') : at('orders.col.tasting')} value={`${bookingAmt}₾`} />
                {o.masterclassLines.map((l, i) => (
                  <PRow key={i} label={`${l.name} ×${l.quantity}`} value={`${l.quantity * l.pricePerUnit}₾`} />
                ))}
                {o.extras.map((e, i) => (
                  <PRow key={i} label={e.label} value={`${e.amount}₾`} />
                ))}
                <PRow label={at('orders.col.total')} value={`${o.totalPrice ?? '—'}₾`} bold wine />
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
      <span style={{ color: '#6b5a47' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, color: wine ? 'var(--color-brand)' : '#1c1008' }}>{value}</span>
    </div>
  )
}
