'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changeBookingStatus } from '@/app/actions/orders'
import { changeWineOrderStatus } from '@/app/actions/wineOrders'
import { adminT } from '@/lib/adminT'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

export type AbandonedRow = {
  id: string
  who: string
  companyName: string | null
  contact: string | null
  /** Whatever identifies this order at a glance — date/slot/guests, or contact/bottles. */
  detail: string
  total: number | null
  abandonedAt: Date | string
}

type Kind = 'bookings' | 'wine'

function Tab({ label, active, onClick, count }: {
  label: string; active: boolean; onClick: () => void; count: number
}) {
  return (
    <button
      onClick={onClick}
      className="text-sm px-3 py-1.5 rounded-lg font-medium transition-colors"
      style={{
        backgroundColor: active ? C.wine : 'transparent',
        color: active ? '#fff' : C.faint,
        border: `1px solid ${active ? C.wine : C.border}`,
      }}
    >
      {label} ({count})
    </button>
  )
}

/**
 * One incomplete order, with the two ways back into the real order list.
 *
 * Both exist because an abandoned card checkout is not the end of the story:
 * the common case at these wineries is someone who closes the tab and then pays
 * by bank transfer, and a smaller one is someone who simply turns up. Without a
 * way back, that customer's order — with their date, slot, guest count and
 * contact details already in it — would have to be typed in again by hand.
 */
function Row({ row, locale, onRestore, busy }: {
  row: AbandonedRow
  locale: string
  onRestore: (id: string, paid: boolean) => void
  busy: boolean
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const when = new Date(row.abandonedAt).toLocaleDateString('en-GB')

  return (
    <div
      className="rounded-xl border p-4 flex flex-wrap items-start justify-between gap-3"
      style={{ borderColor: C.border, backgroundColor: C.bg, opacity: busy ? 0.55 : 1 }}
    >
      <div style={{ minWidth: 200, flex: 1 }}>
        <p className="font-medium text-sm" style={{ color: C.text }}>
          {row.who}
          {row.companyName && <span style={{ color: C.muted }}> · {row.companyName}</span>}
        </p>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{row.detail}</p>
        {row.contact && <p className="text-xs mt-0.5" style={{ color: C.faint }}>{row.contact}</p>}
        <p className="text-xs mt-1.5" style={{ color: C.faint }}>
          {at('abandoned.since', { date: when })}
          {row.total != null && <> · {Math.round(row.total)} ₾</>}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          onClick={() => onRestore(row.id, true)}
          disabled={busy}
          title={at('abandoned.markPaidHint')}
          className="text-xs px-3 py-2 rounded-lg font-medium"
          style={{ backgroundColor: '#dcfce7', color: '#14532d', border: '1px solid #86efac' }}
        >
          {at('abandoned.markPaid')}
        </button>
        <button
          onClick={() => onRestore(row.id, false)}
          disabled={busy}
          title={at('abandoned.restoreHint')}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: C.faint, border: `1px solid ${C.border}`, backgroundColor: 'transparent' }}
        >
          {at('abandoned.restore')}
        </button>
      </div>
    </div>
  )
}

export default function AbandonedClient({ bookings, wineOrders, locale = 'en' }: {
  bookings: AbandonedRow[]
  wineOrders: AbandonedRow[]
  locale?: string
}) {
  const router = useRouter()
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  // Open on whichever list actually has something in it, so a winery that only
  // sells wine is not met by an empty Bookings tab.
  const [kind, setKind] = useState<Kind>(bookings.length === 0 && wineOrders.length > 0 ? 'wine' : 'bookings')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  const rows = kind === 'bookings' ? bookings : wineOrders
  const visible = rows.filter(r => !done.has(r.id))

  function restore(id: string, paid: boolean) {
    // Marked locally rather than removed, so the row fades out where it was
    // instead of the list jumping under the cursor mid-click.
    setDone(prev => new Set([...prev, id]))
    startTransition(async () => {
      // `paid` does both jobs in one write: it stamps the payment and clears
      // `abandonedAt`, which the database requires anyway — a paid order that
      // stayed abandoned would fail the `*_abandoned_is_unpaid` constraint.
      const change = paid ? { kind: 'paid' as const, value: true } : { kind: 'restore' as const }
      if (kind === 'bookings') await changeBookingStatus(id, change)
      else await changeWineOrderStatus(id, change)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Tab label={at('abandoned.tab.bookings')} count={bookings.length}
          active={kind === 'bookings'} onClick={() => setKind('bookings')} />
        <Tab label={at('abandoned.tab.wine')} count={wineOrders.length}
          active={kind === 'wine'} onClick={() => setKind('wine')} />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>{at('abandoned.none')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(row => (
            <Row key={row.id} row={row} locale={locale} busy={done.has(row.id)} onRestore={restore} />
          ))}
        </div>
      )}
    </div>
  )
}
