import { db } from '@/lib/db'
import { getSetting } from '@/app/actions/settings'
import OrdersFilters from './OrdersFilters'
import OrdersTable from './OrdersTable'

const C = { faint: '#a89070', muted: '#6b5a47', border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23', text: '#1c1008' }

type SearchParams = {
  dateFrom?: string
  dateTo?: string
  companyId?: string   // a real company ID, or '__individual__' for individual-only
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const [companies, recipientName, personalNumber, bankName, bankCode, iban] = await Promise.all([
    db.company.findMany({ orderBy: { name: 'asc' } }),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
  ])

  const payment = { recipientName, personalNumber, bankName, bankCode, iban }

  const orders = await db.order.findMany({
    where: {
      ...(params.dateFrom || params.dateTo ? {
        date: {
          ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
          ...(params.dateTo   ? { lte: new Date(params.dateTo + 'T23:59:59') } : {}),
        },
      } : {}),
      ...(params.companyId === '__individual__'
        ? { bookingType: 'INDIVIDUAL' }
        : params.companyId
          ? { companyId: params.companyId }
          : {}),
    },
    include: { company: true },
    orderBy: { date: 'desc' },
  })

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: C.text }}>Orders</h1>
        <span className="text-sm" style={{ color: C.faint }}>{orders.length} booking{orders.length !== 1 ? 's' : ''}</span>
      </div>

      <OrdersFilters companies={companies} params={params} />

      {orders.length === 0 ? (
        <div className="rounded-xl border p-12 text-center mt-4" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>No orders found.</p>
        </div>
      ) : (
        <>
          <OrdersTable key={`${params.dateFrom}-${params.dateTo}-${params.companyId}`} orders={orders.map(o => ({
            id: o.id,
            date: o.date,
            timeSlot: o.timeSlot,
            bookingType: o.bookingType,
            visitType: o.visitType,
            guestCount: o.guestCount,
            name: o.name,
            surname: o.surname,
            email: o.email,
            phone: o.phone,
            notes: o.notes,
            totalPrice: o.totalPrice,
            company: o.company ? { name: o.company.name, identificationCode: o.company.identificationCode } : null,
          }))} payment={payment} />

          <div className="mt-4 flex justify-end">
            <div className="rounded-lg border px-6 py-3 flex items-center gap-6" style={{ borderColor: C.border, backgroundColor: C.bg }}>
              <span className="text-sm" style={{ color: C.muted }}>
                Total revenue {params.dateFrom || params.dateTo || params.companyId ? '(filtered)' : ''}
              </span>
              <span className="font-bold text-lg" style={{ color: C.wine }}>{totalRevenue}₾</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
