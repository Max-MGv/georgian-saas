'use client'

import { useState, useMemo } from 'react'

const C = {
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
  inputBg: '#0b1120',
  wine: '#6366f1',
}

type Booking = {
  id: string
  status: string
  date: string
  timeSlot: string
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  visitType: 'TASTING' | 'TASTING_LUNCH'
  guestCount: number
  name: string
  surname: string
  totalPrice: number | null
  companyName: string | null
  tenantName: string
  tenantDomain: string | null
}

type WineOrder = {
  id: string
  businessName: string
  contactName: string
  status: string
  createdAt: string
  displayTotal: number
  bottleCount: number
  tenantName: string
  tenantDomain: string | null
}

type Mode = 'bookings' | 'wine'

const BOOKING_STATUS_LABEL: Record<string, string> = {
  NEW: 'New', CONFIRMED: 'Confirmed', INVOICE_SENT: 'Invoice Sent',
  PAID: 'Paid', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}
const WINE_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', paid: 'Paid',
  delivered: 'Delivered', cancelled: 'Cancelled',
}

const selectStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, fontSize: 13,
  border: `1px solid ${C.border}`, backgroundColor: C.inputBg, color: C.text, outline: 'none',
}

function StatusPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
        backgroundColor: active ? C.wine : '#1e293b',
        border: `1px solid ${active ? C.wine : '#334155'}`,
        color: active ? '#fff' : C.muted,
      }}
    >
      {label}
    </button>
  )
}

export default function OrdersActivityClient({ bookings, wineOrders }: { bookings: Booking[]; wineOrders: WineOrder[] }) {
  const [mode, setMode] = useState<Mode>('bookings')
  const [tenantFilter, setTenantFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [upcomingOnly, setUpcomingOnly] = useState(true)

  const tenantOptions = useMemo(() => {
    const names = new Set((mode === 'bookings' ? bookings : wineOrders).map(o => o.tenantName))
    return Array.from(names).sort()
  }, [mode, bookings, wineOrders])

  const filteredBookings = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return bookings.filter(b => {
      if (tenantFilter && b.tenantName !== tenantFilter) return false
      if (statusFilter && b.status !== statusFilter) return false
      if (upcomingOnly && new Date(b.date) < today) return false
      return true
    })
  }, [bookings, tenantFilter, statusFilter, upcomingOnly])

  const filteredWineOrders = useMemo(() => {
    return wineOrders.filter(w => {
      if (tenantFilter && w.tenantName !== tenantFilter) return false
      if (statusFilter && w.status !== statusFilter) return false
      return true
    })
  }, [wineOrders, tenantFilter, statusFilter])

  function switchMode(m: Mode) {
    setMode(m)
    setTenantFilter('')
    setStatusFilter(null)
  }

  return (
    <div>
      {/* Mode switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-5" style={{ backgroundColor: '#0b1120', border: `1px solid ${C.border}` }}>
        {([['bookings', `Bookings (${bookings.length})`], ['wine', `Wine Orders (${wineOrders.length})`]] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ backgroundColor: mode === m ? C.wine : 'transparent', color: mode === m ? '#fff' : C.muted }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)} style={selectStyle}>
          <option value="">All tenants</option>
          {tenantOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <div className="flex flex-wrap gap-2">
          <StatusPill label="All statuses" active={statusFilter === null} onClick={() => setStatusFilter(null)} />
          {Object.entries(mode === 'bookings' ? BOOKING_STATUS_LABEL : WINE_STATUS_LABEL).map(([value, label]) => (
            <StatusPill key={value} label={label} active={statusFilter === value} onClick={() => setStatusFilter(value)} />
          ))}
        </div>

        {mode === 'bookings' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.muted }}>
            <input type="checkbox" checked={upcomingOnly} onChange={e => setUpcomingOnly(e.target.checked)} />
            Upcoming only
          </label>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        {mode === 'bookings' ? (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.card, borderBottom: `1px solid ${C.border}` }}>
                {['Date', 'Tenant', 'Contact', 'Type', 'Guests', 'Total', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: C.faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 && (
                <tr><td colSpan={8} className="text-center px-4 py-10" style={{ color: C.faint }}>No bookings match these filters.</td></tr>
              )}
              {filteredBookings.map(b => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-4 py-3" style={{ color: C.text }}>
                    {new Date(b.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {b.timeSlot}
                  </td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{b.tenantName}</td>
                  <td className="px-4 py-3" style={{ color: C.text }}>
                    {b.name} {b.surname}
                    {b.companyName && <span style={{ color: C.faint }}> · {b.companyName}</span>}
                  </td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{b.visitType === 'TASTING' ? 'Tasting' : 'Tasting + Lunch'}</td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{b.guestCount}</td>
                  <td className="px-4 py-3" style={{ color: C.text }}>{b.totalPrice != null ? `${Math.round(b.totalPrice)}₾` : '—'}</td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{BOOKING_STATUS_LABEL[b.status] ?? b.status}</td>
                  <td className="px-4 py-3 text-right">
                    {b.tenantDomain && (
                      <a href={`https://${b.tenantDomain}/admin/orders/${b.id}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#818cf8', fontSize: 12 }}>
                        Open ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.card, borderBottom: `1px solid ${C.border}` }}>
                {['Date', 'Tenant', 'Business', 'Bottles', 'Total', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: C.faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredWineOrders.length === 0 && (
                <tr><td colSpan={7} className="text-center px-4 py-10" style={{ color: C.faint }}>No wine orders match these filters.</td></tr>
              )}
              {filteredWineOrders.map(w => (
                <tr key={w.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-4 py-3" style={{ color: C.text }}>
                    {new Date(w.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{w.tenantName}</td>
                  <td className="px-4 py-3" style={{ color: C.text }}>
                    {w.businessName}
                    <span style={{ color: C.faint }}> · {w.contactName}</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{w.bottleCount}</td>
                  <td className="px-4 py-3" style={{ color: C.text }}>{w.displayTotal}₾</td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{WINE_STATUS_LABEL[w.status] ?? w.status}</td>
                  <td className="px-4 py-3 text-right">
                    {w.tenantDomain && (
                      <a href={`https://${w.tenantDomain}/admin/wine-orders`} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#818cf8', fontSize: 12 }}>
                        Open ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
