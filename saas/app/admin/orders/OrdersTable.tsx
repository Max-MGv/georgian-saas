'use client'

import { useState, useEffect, useRef } from 'react'
import { deleteOrder, updateOrder } from '@/app/actions/orders'
import InvoicePrint from './InvoicePrint'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

const inputStyle = {
  backgroundColor: '#fffdf9', border: `1px solid ${C.border}`,
  borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem',
  color: C.text, outline: 'none', width: '100%',
}

type Order = {
  id: string
  date: Date
  timeSlot: string
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  visitType: 'TASTING' | 'TASTING_LUNCH'
  guestCount: number
  name: string
  surname: string
  email: string | null
  phone: string | null
  notes: string | null
  totalPrice: number | null
  company: { name: string; identificationCode: string | null } | null
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

export default function OrdersTable({ orders: initial, payment }: { orders: Order[]; payment: Payment }) {
  const [orders, setOrders] = useState(initial)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const printPending = useRef(false)

  // Edit form state
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editGuests, setEditGuests] = useState('')
  const [editName, setEditName] = useState('')
  const [editSurname, setEditSurname] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editNotes, setEditNotes] = useState('')

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
              {['Date', 'Time', 'Guest', 'Type', 'Company', 'Guests', 'Visit', 'Total', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: C.muted }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ backgroundColor: '#ffffff' }}>
            {orders.map((order, i) => (
              <tr key={order.id} style={{ borderBottom: i < orders.length - 1 ? `1px solid ${C.border}` : 'none' }}>
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
                <td className="px-4 py-3 font-semibold" style={{ color: C.wine }}>
                  {order.totalPrice != null ? `${order.totalPrice}₾` : '—'}
                </td>
                <td className="px-4 py-3">
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
                        title="Print invoice"
                        className="p-1 rounded border"
                        style={{ borderColor: C.border, color: C.muted }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"/>
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                          <rect x="6" y="14" width="12" height="8"/>
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

      {/* Hidden invoice for printing — positioned off-screen, not opacity:0 */}
      {printOrder && (
        <div style={{ position: 'fixed', top: 0, left: '-9999px', width: '100vw', pointerEvents: 'none' }}>
          <InvoicePrint order={printOrder} payment={payment} />
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
