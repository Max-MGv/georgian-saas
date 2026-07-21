'use client'

import { useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { adminT } from '@/lib/adminT'

const C = {
  border: '#e0d4c0', muted: '#6b5a47', faint: '#a89070',
  wine: 'var(--color-brand)', text: '#1c1008', bg: '#fff9f3', inputBg: '#fffdf9',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#ca8a04', CONFIRMED: '#2563eb', INVOICE_SENT: '#7c3aed',
  PAID: '#16a34a', COMPLETED: '#16a34a', CANCELLED: '#dc2626',
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  NEW: 'orders.status.new', CONFIRMED: 'orders.status.confirmed', INVOICE_SENT: 'orders.status.invoiceSent',
  PAID: 'orders.status.paid', COMPLETED: 'orders.status.completed', CANCELLED: 'orders.status.cancelled',
}

type CalendarOrder = {
  id: string; name: string; surname: string; timeSlot: string
  guestCount: number; visitType: string; status: string; totalPrice: number | null
  companyName: string | null
}

type DaySummary = { date: string; count: number }

type Props = {
  daySummaries: DaySummary[]
  ordersByDate: Record<string, CalendarOrder[]>
  initialYear: number
  initialMonth: number
  locale?: string
}

const DAY_KEYS = ['orders.calendar.mon', 'orders.calendar.tue', 'orders.calendar.wed', 'orders.calendar.thu', 'orders.calendar.fri', 'orders.calendar.sat', 'orders.calendar.sun']
const MONTH_KEYS = ['orders.calendar.jan', 'orders.calendar.feb', 'orders.calendar.mar', 'orders.calendar.apr', 'orders.calendar.may', 'orders.calendar.jun',
  'orders.calendar.jul', 'orders.calendar.aug', 'orders.calendar.sep', 'orders.calendar.oct', 'orders.calendar.nov', 'orders.calendar.dec']

export default function CalendarView({ daySummaries, ordersByDate, initialYear, initialMonth, locale = 'en' }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const at = (key: string) => adminT(locale, key)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; alignRight: boolean } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const countByDate = new Map(daySummaries.map(d => [d.date, d.count]))
  const today = new Date().toISOString().split('T')[0]

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function pad(n: number) { return String(n).padStart(2, '0') }
  function dateStr(day: number) { return `${year}-${pad(month + 1)}-${pad(day)}` }

  function prevMonth() {
    setHoveredDate(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    setHoveredDate(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function handleDayClick(day: number) {
    const d = dateStr(day)
    const sp = new URLSearchParams({ dateFrom: d, dateTo: d, view: 'table' })
    router.push(`${pathname}?${sp.toString()}`)
  }

  function handleMouseEnter(ds: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (!ordersByDate[ds]?.length) return
    const target = e.currentTarget
    hoverTimer.current = setTimeout(() => {
      const rect = target.getBoundingClientRect()
      const grid = gridRef.current?.getBoundingClientRect()
      if (!grid) return
      const col = cells.indexOf(parseInt(ds.split('-')[2])) % 7
      setPopoverPos({
        top: rect.bottom - grid.top + 6,
        left: rect.left - grid.left,
        alignRight: col >= 4,
      })
      setHoveredDate(ds)
    }, 200)
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoveredDate(null), 150)
  }

  function handlePopoverEnter() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }

  const hoveredOrders = hoveredDate ? (ordersByDate[hoveredDate] ?? []) : []

  return (
    <div className="rounded-xl border overflow-visible mt-4 relative" style={{ borderColor: C.border, backgroundColor: C.bg }}>
      {/* Month nav */}
      <div className="flex items-center justify-between px-5 py-3 border-b rounded-t-xl" style={{ borderColor: C.border }}>
        <button onClick={prevMonth} className="rounded-lg border px-3 py-1 text-sm transition-opacity hover:opacity-70"
          style={{ borderColor: C.border, color: C.muted, backgroundColor: C.inputBg }}>‹</button>
        <p className="font-semibold text-sm" style={{ color: C.text }}>{at(MONTH_KEYS[month])} {year}</p>
        <button onClick={nextMonth} className="rounded-lg border px-3 py-1 text-sm transition-opacity hover:opacity-70"
          style={{ borderColor: C.border, color: C.muted, backgroundColor: C.inputBg }}>›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: C.border }}>
        {DAY_KEYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium" style={{ color: C.faint }}>{at(d)}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 relative" ref={gridRef}>
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`blank-${i}`} className="border-r border-b"
              style={{ borderColor: C.border, minHeight: 64, backgroundColor: '#fdf6ee' }} />
          }
          const ds = dateStr(day)
          const count = countByDate.get(ds) ?? 0
          const isToday = ds === today
          const isHovered = hoveredDate === ds
          return (
            <button
              key={ds}
              onClick={() => count > 0 && handleDayClick(day)}
              onMouseEnter={e => handleMouseEnter(ds, e)}
              onMouseLeave={handleMouseLeave}
              className="border-r border-b text-left p-2 transition-colors"
              style={{
                borderColor: C.border,
                minHeight: 64,
                backgroundColor: isHovered && count > 0 ? '#fdf0e0' : isToday ? '#fef3e8' : C.bg,
                cursor: count > 0 ? 'pointer' : 'default',
                outline: isToday ? `2px solid ${C.faint}` : undefined,
                outlineOffset: isToday ? -2 : undefined,
              }}
            >
              <span className="text-xs font-medium" style={{ color: isToday ? C.wine : C.muted }}>{day}</span>
              {count > 0 && (
                <div className="mt-1">
                  <span className="inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                    style={{ backgroundColor: C.wine, fontSize: '0.7rem' }}>{count}</span>
                </div>
              )}
            </button>
          )
        })}

        {/* Hover popover */}
        {hoveredDate && hoveredOrders.length > 0 && popoverPos && (
          <div
            onMouseEnter={handlePopoverEnter}
            onMouseLeave={handleMouseLeave}
            className="absolute z-50 rounded-xl border shadow-lg py-2"
            style={{
              top: popoverPos.top,
              ...(popoverPos.alignRight
                ? { right: 0 }
                : { left: popoverPos.left }),
              width: 260,
              backgroundColor: '#fffdf9',
              borderColor: C.border,
              boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            }}
          >
            <div className="px-3 pb-1.5 mb-1 border-b" style={{ borderColor: C.border }}>
              <p className="text-xs font-semibold" style={{ color: C.faint }}>
                {new Date(hoveredDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}{hoveredOrders.length} {hoveredOrders.length !== 1 ? at('orders.booking.plural') : at('orders.booking.singular')}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: C.border }}>
              {hoveredOrders.map(o => (
                <div key={o.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate" style={{ color: C.text }}>
                      {o.name} {o.surname}
                    </p>
                    <span className="text-xs font-semibold flex-shrink-0"
                      style={{ color: STATUS_COLORS[o.status] ?? C.muted }}>
                      {at(STATUS_LABEL_KEYS[o.status] ?? 'orders.status.new')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color: C.faint }}>{o.timeSlot}</span>
                    <span className="text-xs" style={{ color: C.faint }}>·</span>
                    <span className="text-xs" style={{ color: C.faint }}>{o.guestCount} {at('orders.guest.plural')}</span>
                    <span className="text-xs" style={{ color: C.faint }}>·</span>
                    <span className="text-xs" style={{ color: C.faint }}>
                      {o.visitType === 'TASTING' ? at('orders.col.tasting') : at('orders.visit.tastingLunch')}
                    </span>
                  </div>
                  {o.companyName && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: C.muted }}>{o.companyName}</p>
                  )}
                  {o.totalPrice != null && (
                    <p className="text-xs font-semibold mt-0.5" style={{ color: C.wine }}>{o.totalPrice}₾</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
