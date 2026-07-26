import { adminT } from '@/lib/adminT'

type Order = {
  id: string
  date: Date
  timeSlot: string
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  name: string
  surname: string
  phone: string | null
  notes: string | null
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  company: { name: string } | null
}

type Props = { orders: Order[]; displayName?: string; locale?: string }

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Cell({ children, bold = false }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <td style={{ border: '1px solid #d8cbb0', padding: '6px 8px', fontSize: 11, verticalAlign: 'top', fontWeight: bold ? 700 : 400 }}>
      {children ?? '—'}
    </td>
  )
}

export default function BookingSheetPrint({ orders, displayName = 'Your Winery', locale = 'en' }: Props) {
  const at = (key: string) => adminT(locale, key)
  const sorted = [...orders].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime()
    return d !== 0 ? d : a.timeSlot.localeCompare(b.timeSlot)
  })
  const nowStr = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const rangeStr = sorted.length > 0
    ? `${formatDate(sorted[0].date)} – ${formatDate(sorted[sorted.length - 1].date)}`
    : '—'

  const headers = [
    at('orders.col.date'),
    at('orders.sheet.tastingGuests'),
    at('orders.sheet.lunchGuests'),
    at('orders.sheet.extraGuests'),
    at('orders.sheet.hotDishVeg'),
    at('orders.sheet.hotDishMeat'),
    at('orders.sheet.foodNotes'),
    at('orders.sheet.notes'),
    at('orders.col.company'),
    at('orders.sheet.contactName'),
    at('orders.sheet.contactPhone'),
  ]

  return (
    <div className="booking-sheet-print" style={{ fontFamily: 'Georgia, serif', color: '#1c1008', backgroundColor: '#fff', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14, borderBottom: '2px solid var(--color-brand)', paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{displayName}</div>
          <div style={{ fontSize: 14, color: '#6b5a47', marginTop: 2 }}>{at('orders.sheet.title')}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#6b5a47' }}>
          <div>{at('orders.sheet.dateRange')}: <strong style={{ color: '#1c1008' }}>{rangeStr}</strong></div>
          <div>{at('orders.sheet.generatedAt')}: {nowStr}</div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: '#6b5a47' }}>{at('orders.sheet.noOrders')}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ border: '1px solid #d8cbb0', padding: '6px 8px', fontSize: 11, textAlign: 'left', backgroundColor: '#f3e9d8', color: '#1c1008' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((o, i) => (
              <tr key={o.id} style={{ backgroundColor: i % 2 === 1 ? '#fbf6ec' : '#fff' }}>
                <Cell bold>{formatDate(o.date)} · {o.timeSlot}</Cell>
                <Cell bold>{o.tastingGuestCount > 0 ? o.tastingGuestCount : '—'}</Cell>
                <Cell bold>{o.lunchGuestCount > 0 ? o.lunchGuestCount : '—'}</Cell>
                <Cell bold>{o.freeGuestCount > 0 ? o.freeGuestCount : '—'}</Cell>
                <Cell>{o.hotDishVegetable}</Cell>
                <Cell>{o.hotDishMeat}</Cell>
                <Cell>{o.foodNotes}</Cell>
                <Cell>{o.notes}</Cell>
                <Cell>{o.company?.name ?? at('orders.sheet.individual')}</Cell>
                <Cell>{o.name} {o.surname}</Cell>
                <Cell>{o.phone}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
