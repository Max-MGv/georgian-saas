import { Fragment } from 'react'
import { adminT } from '@/lib/adminT'
import { countryName } from '@/lib/countries'
import { BOOKING_SHEET_COLUMNS, type BookingSheetColumnKey } from '@/lib/bookingSheetColumns'

type Order = {
  id: string
  date: Date
  timeSlot: string
  // The boxes (T-152): Tasting only / Lunch only / Tasting & Lunch / Free, and their sum — the kitchen count (D-4).
  tastingGuestCount: number
  lunchOnlyGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  guestCount: number
  name: string
  surname: string
  phone: string | null
  notes: string | null
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  /** The add-ons booked (T-7, C-5: the staff sheet lists them — it showed neither add-ons nor extras before). */
  masterclassLines?: { name: string; nameKa?: string | null; quantity: number }[]
  /** Wine for the table (T-22): shown for staff so the cellar knows what to bring (it is not on the packing list — that is wine orders only). */
  wineLines?: { name: string; year: number; quantity: number }[]
  company: { name: string } | null
  // Company bookings only (Plan-CompanyNationality) — shown here, not gated on the tenant's
  // enableCompanyNationalityBreakdown flag, since this just renders whatever the order already
  // has (per that plan's "toggle-off never hides existing data" decision).
  nationalities: string[]
  // The guide's own name/phone, not the guest's — this used to rely on autofill having copied
  // the guide's phone into the guest's own field, which is finding F1 (Plan-ContactRoles).
  contacts: { roleKey: string; name: string; phone: string | null }[]
}

type Props = { orders: Order[]; displayName?: string; locale?: string; /** Columns left off the sheet (T-151); empty = print all. */ hiddenColumns?: readonly string[] }

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

export default function BookingSheetPrint({ orders, displayName = 'Your Winery', locale = 'en', hiddenColumns = [] }: Props) {
  const at = (key: string) => adminT(locale, key)
  const sorted = [...orders].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime()
    return d !== 0 ? d : a.timeSlot.localeCompare(b.timeSlot)
  })
  const nowStr = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const rangeStr = sorted.length > 0
    ? `${formatDate(sorted[0].date)} – ${formatDate(sorted[sorted.length - 1].date)}`
    : '—'

  // The date/time column is always printed; the rest follow the winery's choice (T-151, lib/bookingSheetColumns.ts).
  const shown = BOOKING_SHEET_COLUMNS.filter(c => !hiddenColumns.includes(c.key))
  const headers = [at('orders.col.date'), ...shown.map(c => at(c.label))]

  const cellFor = (o: Order, key: BookingSheetColumnKey): React.ReactNode => {
    const guide = o.contacts.find(c => c.roleKey === 'guide')
    switch (key) {
      case 'tasting': return <Cell bold>{o.tastingGuestCount > 0 ? o.tastingGuestCount : '—'}</Cell>
      case 'lunchOnly': return <Cell bold>{o.lunchOnlyGuestCount > 0 ? o.lunchOnlyGuestCount : '—'}</Cell>
      case 'tastingLunch': return <Cell bold>{o.lunchGuestCount > 0 ? o.lunchGuestCount : '—'}</Cell>
      case 'free': return <Cell bold>{o.freeGuestCount > 0 ? o.freeGuestCount : '—'}</Cell>
      case 'kitchenTotal': return <Cell bold>{o.guestCount}</Cell>
      case 'hotDishVeg': return <Cell>{o.hotDishVegetable}</Cell>
      case 'hotDishMeat': return <Cell>{o.hotDishMeat}</Cell>
      case 'foodNotes': return <Cell>{o.foodNotes}</Cell>
      case 'addOns': return <Cell>{o.masterclassLines && o.masterclassLines.length > 0 ? o.masterclassLines.map(l => `${locale === 'ka' && l.nameKa ? l.nameKa : l.name} × ${l.quantity}`).join(', ') : null}</Cell>
      case 'tableWine': return <Cell>{o.wineLines && o.wineLines.length > 0 ? o.wineLines.map(l => `${l.name} ${l.year} × ${l.quantity}`).join(', ') : null}</Cell>
      case 'notes': return <Cell>{o.notes}</Cell>
      case 'company': return <Cell>{o.company?.name ?? at('orders.sheet.individual')}</Cell>
      case 'nationality': return <Cell>{o.nationalities.length > 0 ? o.nationalities.map(countryName).join(', ') : null}</Cell>
      case 'contactName': return <Cell>{o.name} {o.surname}</Cell>
      case 'contactPhone': return <Cell>{o.phone}</Cell>
      case 'guideName': return <Cell>{guide?.name}</Cell>
      case 'guidePhone': return <Cell>{guide?.phone}</Cell>
    }
  }

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
                {shown.map(c => <Fragment key={c.key}>{cellFor(o, c.key)}</Fragment>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
