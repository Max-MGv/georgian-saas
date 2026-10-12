'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { adminT } from '@/lib/adminT'

/**
 * The admin month grid, shared by Orders (bookings by visit date) and Wine Orders (by preferred
 * delivery / pickup date, T-14 — vault/Plan-WineOrderFeatures.md Chunk 8). Lifted out of
 * app/admin/(panel)/orders/CalendarView.tsx, which is now a thin wrapper, so the two calendars
 * cannot drift apart. It knows nothing about what an item is: the caller renders each one.
 *
 * Mouse vs touch is decided by the input device, not the width (MaintenanceNotes §33): with a
 * mouse, hovering a day shows a popover and clicking it calls `onDayClick` (or selects it, when
 * the caller gives none); on a touch screen a tap selects the day and its items list under the
 * grid. Starts as "can hover" so the server render matches desktop.
 */

const C = {
  border: 'var(--site-border)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  wine: 'var(--color-brand)', text: 'var(--site-text)', bg: 'var(--site-surface)', inputBg: 'var(--site-surface)',
}

const DAY_KEYS = ['orders.calendar.mon', 'orders.calendar.tue', 'orders.calendar.wed', 'orders.calendar.thu', 'orders.calendar.fri', 'orders.calendar.sat', 'orders.calendar.sun']
const MONTH_KEYS = ['orders.calendar.jan', 'orders.calendar.feb', 'orders.calendar.mar', 'orders.calendar.apr', 'orders.calendar.may', 'orders.calendar.jun',
  'orders.calendar.jul', 'orders.calendar.aug', 'orders.calendar.sep', 'orders.calendar.oct', 'orders.calendar.nov', 'orders.calendar.dec']

export type MonthCalendarProps<T> = {
  /** Items per `YYYY-MM-DD` day. A day's count is its array's length. */
  itemsByDate: Record<string, T[]>
  itemKey: (item: T) => string
  /** One item's summary lines — used in the hover popover and the day panel alike. */
  renderItem: (item: T) => ReactNode
  /** "3 bookings" / "1 wine order". */
  countLabel: (n: number) => string
  initialYear: number
  initialMonth: number
  locale?: string
  /** Mouse click on a day. Absent → the click selects the day, the same as a tap. */
  onDayClick?: (date: string) => void
  /** A row in the day panel was chosen. */
  onItemOpen?: (item: T) => void
  /** Optional action in the day panel's header, e.g. "View in table ›". */
  panelAction?: { label: string; onClick: (date: string) => void }
  /** Shown under the grid when no day is selected. */
  emptyHint: string
}

export default function MonthCalendar<T>({
  itemsByDate, itemKey, renderItem, countLabel, initialYear, initialMonth, locale = 'en',
  onDayClick, onItemOpen, panelAction, emptyHint,
}: MonthCalendarProps<T>) {
  const at = (key: string) => adminT(locale, key)
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; alignRight: boolean } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The hover preview is a mouse feature. On a touch screen a tap fires an
  // emulated hover AND a click, and the click navigated away - the preview
  // flashed for a moment and vanished. Touch gets tap-to-select instead, with
  // the day's items in a panel under the grid. Decided by the input device,
  // not by screen width, so a tablet with a mouse and a narrow desktop window
  // both behave sensibly. Starts true so the server render matches desktop.
  const [canHover, setCanHover] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setCanHover(mq.matches)
    const onChange = () => setCanHover(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
    setSelectedDate(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    setHoveredDate(null)
    setSelectedDate(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // The panel shows when touch is in use, or when a mouse click selects rather than navigates.
  const showPanel = !canHover || !onDayClick

  function handleDayTap(day: number) {
    const ds = dateStr(day)
    if (canHover && onDayClick) { onDayClick(ds); return }
    setSelectedDate(prev => (prev === ds ? null : ds))
    // Bring the panel into view once it has rendered under the grid.
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  function handleMouseEnter(ds: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (!canHover) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (!itemsByDate[ds]?.length) return
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

  const hoveredItems = hoveredDate ? (itemsByDate[hoveredDate] ?? []) : []
  const selectedItems = selectedDate ? (itemsByDate[selectedDate] ?? []) : []
  const dayHeading = (ds: string, n: number) =>
    `${new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${countLabel(n)}`

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
          const count = itemsByDate[ds]?.length ?? 0
          const isToday = ds === today
          const isHovered = hoveredDate === ds
          return (
            <button
              key={ds}
              onClick={() => count > 0 && handleDayTap(day)}
              onMouseEnter={e => handleMouseEnter(ds, e)}
              onMouseLeave={handleMouseLeave}
              className="border-r border-b text-left p-2 transition-colors"
              style={{
                borderColor: C.border,
                minHeight: 64,
                backgroundColor: (isHovered || selectedDate === ds) && count > 0 ? '#fdf0e0' : isToday ? '#fef3e8' : C.bg,
                cursor: count > 0 ? 'pointer' : 'default',
                outline: selectedDate === ds ? `2px solid ${C.wine}` : isToday ? `2px solid ${C.faint}` : undefined,
                outlineOffset: isToday || selectedDate === ds ? -2 : undefined,
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
        {hoveredDate && hoveredItems.length > 0 && popoverPos && (
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
              backgroundColor: 'var(--site-surface)',
              borderColor: C.border,
              boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            }}
          >
            <div className="px-3 pb-1.5 mb-1 border-b" style={{ borderColor: C.border }}>
              <p className="text-xs font-semibold" style={{ color: C.faint }}>{dayHeading(hoveredDate, hoveredItems.length)}</p>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: C.border }}>
              {hoveredItems.map(item => (
                <div key={itemKey(item)} className="px-3 py-2">
                  {renderItem(item)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The selected day's items, under the grid. */}
      {showPanel && (
        <div ref={panelRef} className="border-t rounded-b-xl" style={{ borderColor: C.border }}>
          {selectedDate && selectedItems.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: C.border }}>
                <p className="text-sm font-semibold" style={{ color: C.text }}>{dayHeading(selectedDate, selectedItems.length)}</p>
                {panelAction && (
                  <button
                    onClick={() => panelAction.onClick(selectedDate)}
                    className="text-xs font-medium px-3 py-2 -my-1 rounded-lg border flex-shrink-0"
                    style={{ borderColor: C.border, color: C.wine, backgroundColor: C.inputBg }}
                  >
                    {panelAction.label} ›
                  </button>
                )}
              </div>
              <div className="divide-y" style={{ borderColor: C.border }}>
                {selectedItems.map(item => (
                  <button
                    key={itemKey(item)}
                    onClick={() => onItemOpen?.(item)}
                    className="w-full text-left px-4 py-3 active:bg-amber-50"
                  >
                    {renderItem(item)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs px-4 py-3" style={{ color: C.faint }}>{emptyHint}</p>
          )}
        </div>
      )}
    </div>
  )
}
