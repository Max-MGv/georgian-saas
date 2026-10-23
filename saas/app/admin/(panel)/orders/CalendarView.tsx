'use client'

import { asTetriOrNull, formatTetriOrDash } from '@/lib/money'
import { useRouter, usePathname } from 'next/navigation'
import { adminT } from '@/lib/adminT'
import MonthCalendar from '@/components/MonthCalendar'

/**
 * Orders calendar — bookings by visit date. The grid itself lives in components/MonthCalendar.tsx
 * (shared with the Wine Orders calendar since T-14, Plan-WineOrderFeatures Chunk 8); this file
 * only says what a booking row looks like and where clicks go. Behaviour is unchanged: a mouse
 * click on a day opens the table filtered to it, a tap lists the day's bookings under the grid.
 */

const C = {
  muted: 'var(--site-muted)', faint: 'var(--site-secondary)', wine: 'var(--color-brand)', text: 'var(--site-text)',
}

// Keyed by BookingStage. Payment is not here on purpose - it is a separate
// fact and shows as its own mark beside the label, so a completed-but-unpaid
// booking says both things instead of one word having to pick.
const STATUS_COLORS: Record<string, string> = {
  NEW: '#ca8a04', CONFIRMED: '#2563eb', COMPLETED: '#16a34a', CANCELLED: '#dc2626',
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  NEW: 'orders.status.new', CONFIRMED: 'orders.status.confirmed',
  COMPLETED: 'orders.status.completed', CANCELLED: 'orders.status.cancelled',
}

type CalendarOrder = {
  id: string; name: string; surname: string; timeSlot: string
  guestCount: number; visitType: string; totalPrice: number | null
  stage: string
  paid: boolean
  /** Invoice sent, money not yet in. Bookings only - wine has no invoice flow. */
  invoiced: boolean
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

export default function CalendarView({ ordersByDate, initialYear, initialMonth, locale = 'en' }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const at = (key: string) => adminT(locale, key)

  function openDayInTable(d: string) {
    const sp = new URLSearchParams({ dateFrom: d, dateTo: d, view: 'table' })
    router.push(`${pathname}?${sp.toString()}`)
  }

  /** One booking's summary lines - shared by the hover popover and the touch panel. */
  function orderRow(o: CalendarOrder) {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium truncate" style={{ color: C.text }}>
            {o.name} {o.surname}
          </p>
          <span className="text-xs font-semibold flex-shrink-0 inline-flex items-center gap-1"
            style={{ color: STATUS_COLORS[o.stage] ?? C.muted }}>
            {(() => {
              const key = STATUS_LABEL_KEYS[o.stage]
              return key ? at(key) : o.stage
            })()}
            {o.paid ? (
              <span title={at('orders.status.paid')} style={{ color: '#14532d' }}>₾✓</span>
            ) : o.invoiced ? (
              <span title={at('orders.status.invoiceSent')} style={{ color: '#92400e' }}>✉</span>
            ) : null}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs" style={{ color: C.faint }}>{o.timeSlot}</span>
          <span className="text-xs" style={{ color: C.faint }}>·</span>
          <span className="text-xs" style={{ color: C.faint }}>{o.guestCount} {at('orders.guest.plural')}</span>
          <span className="text-xs" style={{ color: C.faint }}>·</span>
          <span className="text-xs" style={{ color: C.faint }}>
            {at(o.visitType === 'TASTING' ? 'orders.visit.tasting' : o.visitType === 'LUNCH' ? 'orders.visit.lunch' : 'orders.visit.tastingLunch')}
          </span>
        </div>
        {o.companyName && (
          <p className="text-xs mt-0.5 truncate" style={{ color: C.muted }}>{o.companyName}</p>
        )}
        {o.totalPrice != null && (
          <p className="text-xs font-semibold mt-0.5" style={{ color: C.wine }}>{formatTetriOrDash(asTetriOrNull(o.totalPrice))}</p>
        )}
      </>
    )
  }

  return (
    <MonthCalendar
      itemsByDate={ordersByDate}
      itemKey={o => o.id}
      renderItem={orderRow}
      countLabel={n => `${n} ${n !== 1 ? at('orders.booking.plural') : at('orders.booking.singular')}`}
      initialYear={initialYear}
      initialMonth={initialMonth}
      locale={locale}
      onDayClick={openDayInTable}
      onItemOpen={o => router.push(`/admin/orders/${o.id}`)}
      panelAction={{ label: at('orders.calendar.viewInTable'), onClick: openDayInTable }}
      emptyHint={at('orders.calendar.tapHint')}
    />
  )
}
