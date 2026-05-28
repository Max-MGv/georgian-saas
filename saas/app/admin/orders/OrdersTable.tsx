'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { deleteOrder, updateOrder, sendOrderInvoice, updateOrderStatus } from '@/app/actions/orders'
import InvoicePrint from './InvoicePrint'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type OrderStatus = 'NEW' | 'CONFIRMED' | 'INVOICE_SENT' | 'PAID' | 'COMPLETED' | 'CANCELLED'

const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; color: string }> = {
  NEW:          { label: 'New',          bg: '#f1f5f9', color: '#475569' },
  CONFIRMED:    { label: 'Confirmed',    bg: '#dbeafe', color: '#1d4ed8' },
  INVOICE_SENT: { label: 'Invoice Sent', bg: '#fef3c7', color: '#92400e' },
  PAID:         { label: 'Paid',         bg: '#dcfce7', color: '#166534' },
  COMPLETED:    { label: 'Completed',    bg: '#bbf7d0', color: '#065f46' },
  CANCELLED:    { label: 'Cancelled',    bg: '#fee2e2', color: '#b91c1c' },
}

const ALL_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'INVOICE_SENT', 'PAID', 'COMPLETED', 'CANCELLED']

function isDetailsComplete(order: { totalPrice: number | null; guestCount: number }) {
  return order.totalPrice != null && order.totalPrice > 0 && order.guestCount > 0
}

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

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

function visitLabel(v: string) {
  return v === 'TASTING' ? 'Wine Tasting' : 'Tasting + Lunch'
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

export default function OrdersTable({ orders: initial, payment, detailed, defaultEmailMessage }: { orders: Order[]; payment: Payment; detailed: boolean; defaultEmailMessage: string }) {
  const router = useRouter()
  const [orders, setOrders] = useState(initial)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const printPending = useRef(false)

  // Status menu
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null)

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

  // Close status menu on outside click
  useEffect(() => {
    if (!statusMenuId) return
    function handleClick() { setStatusMenuId(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
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

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setStatusMenuId(null)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    await updateOrderStatus(orderId, newStatus)
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

  return (
    <>
      <div className="rounded-xl border overflow-x-auto mt-4" style={{ borderColor: C.border }}>
        <table className="w-full text-sm border-collapse min-w-[700px]">
          <thead>
            <tr style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {['Date', 'Time', 'Guest', 'Type', 'Company', 'Guests', 'Visit', 'Total', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: C.muted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ backgroundColor: '#ffffff' }}>
            {orders.map((order, i) => (
              <tr
                key={order.id}
                onClick={() => router.push(`/admin/orders/${order.id}`)}
                style={{
                  borderBottom: i < orders.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                }}
                className="hover:bg-amber-50 transition-colors"
              >
                <td className="px-4 py-3" style={{ color: C.text }}>{formatDate(order.date)}</td>
                <td className="px-4 py-3" style={{ color: C.muted }}>{order.timeSlot}</td>
                <td className="px-4 py-3 font-medium" style={{ color: C.text }}>{order.name} {order.surname}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{
                    backgroundColor: order.bookingType === 'COMPANY' ? '#fef3c7' : '#f0fdf4',
                    color: order.bookingType === 'COMPANY' ? '#92400e' : '#166534',
                  }}>
                    {order.bookingType === 'COMPANY' ? 'Company' : 'Individual'}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: C.muted }}>{order.company?.name ?? '—'}</td>
                <td className="px-4 py-3" style={{ color: C.text }}>{order.guestCount}</td>
                <td className="px-4 py-3" style={{ color: C.muted }}>{visitLabel(order.visitType)}</td>
                <td className="px-4 py-3" style={{ color: C.wine }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{order.totalPrice != null ? `${order.totalPrice}₾` : '—'}</span>
                    {isDetailsComplete(order)
                      ? <span className="text-xs" style={{ color: '#16a34a' }}>✓ details</span>
                      : <span className="text-xs" style={{ color: C.faint }}>· details</span>
                    }
                  </div>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="relative">
                    {/* Status badge — click to open dropdown */}
                    <button
                      onClick={() => setStatusMenuId(statusMenuId === order.id ? null : order.id)}
                      className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: STATUS_CONFIG[order.status].bg,
                        color: STATUS_CONFIG[order.status].color,
                        border: `1px solid ${STATUS_CONFIG[order.status].color}22`,
                      }}
                    >
                      {STATUS_CONFIG[order.status].label} ▾
                    </button>
                    {statusMenuId === order.id && (
                      <div
                        className="absolute z-30 rounded-lg shadow-lg border py-1"
                        style={{ top: '110%', left: 0, minWidth: 140, backgroundColor: '#fff9f3', borderColor: C.border }}
                      >
                        {ALL_STATUSES.map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(order.id, s)}
                            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-amber-50"
                            style={{ color: s === order.status ? STATUS_CONFIG[s].color : C.text, fontWeight: s === order.status ? 600 : 400 }}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
                            {STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {deletingId === order.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: C.muted }}>Delete?</span>
                      <button onClick={() => handleDelete(order.id)} disabled={loading}
                        className="text-xs px-2 py-1 rounded font-medium text-white"
                        style={{ backgroundColor: '#b91c1c' }}>Yes</button>
                      <button onClick={() => setDeletingId(null)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: C.border, color: C.muted }}>No</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePrint(order)}
                        title={detailed ? 'Print detailed invoice' : 'Print invoice'}
                        className="p-1 rounded border"
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
                        title="Send invoice by email"
                        className="p-1 rounded border"
                        style={{ borderColor: C.border, color: order.email ? C.muted : C.faint }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2"/>
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                        </svg>
                      </button>
                      <button onClick={() => openEdit(order)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: C.border, color: C.muted }}>Edit</button>
                      <button onClick={() => setDeletingId(order.id)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invoice portal — renders directly into <body> so print CSS can isolate it */}
      {printOrder && typeof document !== 'undefined' && createPortal(
        <div id="invoice-portal">
          <InvoicePrint order={printOrder} payment={payment} detailed={detailed} />
        </div>,
        document.body
      )}

      {/* Send invoice email modal */}
      {emailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(28,16,8,0.45)' }}>
          <div className="w-full max-w-xl rounded-xl border shadow-lg flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: C.border, maxHeight: '90vh' }}>

            {/* Fixed header */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: C.border }}>
              <h2 className="font-semibold text-base" style={{ color: C.text }}>Send Invoice by Email</h2>
              <button onClick={() => setEmailOrder(null)} style={{ color: C.faint, fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>

            {/* Scrollable body */}
            <div className="px-6 py-5 overflow-y-auto">
              <p className="text-xs mb-0.5" style={{ color: C.faint }}>Order</p>
              <p className="text-sm font-medium mb-4" style={{ color: C.text }}>
                {emailOrder.name} {emailOrder.surname} · {formatDate(emailOrder.date)} {emailOrder.timeSlot}
              </p>

              {emailOrder.email ? (
                <>
                  {/* To field + validation */}
                  <p className="text-xs mb-0.5" style={{ color: C.faint }}>To</p>
                  <p className="text-sm mb-1 font-mono" style={{ color: C.text }}>{emailOrder.email}</p>
                  {!isValidEmail(emailOrder.email) ? (
                    <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 mb-3 text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                      ⚠ Invalid email format — edit the order to fix before sending
                    </div>
                  ) : (
                    <p className="text-xs mb-3" style={{ color: '#16a34a' }}>✓ Valid email</p>
                  )}

                  {/* Message */}
                  <label className="text-xs block mb-1" style={{ color: C.faint }}>Message (optional — edit before sending)</label>
                  <textarea
                    rows={3}
                    value={emailMessage}
                    onChange={e => setEmailMessage(e.target.value)}
                    placeholder="Add a personal message…"
                    style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
                  />

                  {/* Invoice preview — always visible */}
                  <p className="text-xs mb-1" style={{ color: C.faint }}>Invoice preview</p>
                  <div className="rounded-lg border overflow-auto mb-4" style={{ borderColor: C.border, backgroundColor: '#fff', maxHeight: 360 }}>
                    <div style={{ zoom: '75%' }}>
                      <InvoicePrint order={emailOrder} payment={payment} detailed={detailed} />
                    </div>
                  </div>

                  {/* Status */}
                  {emailStatus === 'error' && (
                    <p className="text-sm mb-3" style={{ color: '#b91c1c' }}>Failed to send. Please try again.</p>
                  )}
                  {emailStatus === 'sent' && (
                    <p className="text-sm mb-3" style={{ color: '#16a34a' }}>✓ Invoice sent successfully!</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleSendEmail}
                      disabled={emailSending || emailStatus === 'sent' || !isValidEmail(emailOrder.email)}
                      className="btn-wine flex-1 py-2 rounded-lg text-sm font-medium"
                    >
                      {emailSending ? 'Sending…' : emailStatus === 'sent' ? 'Sent ✓' : 'Send Invoice'}
                    </button>
                    <button
                      onClick={() => setEmailOrder(null)}
                      className="px-4 py-2 rounded-lg border text-sm"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      {emailStatus === 'sent' ? 'Close' : 'Cancel'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
                    No email address on file. Edit the order to add one first.
                  </div>
                  <button
                    onClick={() => setEmailOrder(null)}
                    className="px-4 py-2 rounded-lg border text-sm"
                    style={{ borderColor: C.border, color: C.muted }}
                  >
                    Close
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
              <h2 className="font-semibold text-base" style={{ color: C.text }}>Edit Order</h2>
              <button onClick={closeEdit} style={{ color: C.faint, fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Time">
                  <select value={editTime} onChange={e => setEditTime(e.target.value)} style={inputStyle}>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Number of Guests">
                <input type="number" min={1} value={editGuests} onChange={e => setEditGuests(e.target.value)} style={inputStyle} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name">
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Last Name">
                  <input value={editSurname} onChange={e => setEditSurname(e.target.value)} style={inputStyle} />
                </Field>
              </div>

              <Field label="Phone">
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} style={inputStyle} />
              </Field>

              <Field label="Email">
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} style={inputStyle} />
              </Field>

              <Field label="Notes">
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>

              <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#fdf6ee', color: C.muted }}>
                <strong>Visit type & price are not editable.</strong> To change them, delete this order and submit a new booking.
              </div>

              {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="btn-wine flex-1 py-2 rounded-lg text-sm font-medium"
                >
                  {loading ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
