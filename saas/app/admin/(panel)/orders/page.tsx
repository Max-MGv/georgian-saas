import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { OrderStatus } from '@prisma/client'
import { getSetting } from '@/app/actions/settings'
import { requireBookingModule } from '@/lib/requireModule'
import { headers } from 'next/headers'
import Link from 'next/link'
import { adminT } from '@/lib/adminT'
import PaymentSetupBanner from '../PaymentSetupBanner'
import OrdersFilters from './OrdersFilters'
import OrdersTable from './OrdersTable'
import CalendarView from './CalendarView'
import ViewToggle from './ViewToggle'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import DemoRevenueStrip from '@/components/DemoRevenueStrip'

const C = { faint: 'var(--site-secondary)', muted: 'var(--site-muted)', border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)', text: 'var(--site-text)' }

type SearchParams = {
  dateFrom?: string
  dateTo?: string
  companyId?: string   // a real company ID, or '__individual__' for individual-only
  status?: string      // NEW | CONFIRMED | INVOICE_SENT | PENDING_PAYMENT | PAID | COMPLETED | CANCELLED
  view?: 'table' | 'calendar'
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireBookingModule()
  const params = await searchParams
  const [tenantId, h] = await Promise.all([getTenantId(), headers()])
  const displayName = h.get('x-tenant-name') ?? 'Your Winery'
  const [companies, recipientName, personalNumber, bankName, bankCode, iban, invoiceDetailed, invoiceEmailMessage, adminLanguage] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
    getSetting('invoice_detailed'),
    getSetting('invoice_email_message'),
    getSetting('admin_language'),
  ])
  const locale = adminLanguage || 'en'
  const at = (key: string) => adminT(locale, key)

  const payment = { recipientName, personalNumber, bankName, bankCode, iban }
  const detailed = invoiceDetailed === 'true'

  const view = params.view === 'calendar' ? 'calendar' : 'table'

  // For calendar view: fetch all orders with enough detail for day hover preview
  const calendarOrders = view === 'calendar'
    ? await withTenantDb(tenantId, tx => tx.order.findMany({
        where: { tenantId },
        select: {
          id: true,
          date: true,
          name: true,
          surname: true,
          timeSlot: true,
          guestCount: true,
          visitType: true,
          status: true,
          totalPrice: true,
          company: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
      }))
    : []

  type CalendarOrder = {
    id: string; name: string; surname: string; timeSlot: string
    guestCount: number; visitType: string; status: string; totalPrice: number | null
    companyName: string | null
  }
  const ordersByDate: Record<string, CalendarOrder[]> = {}
  for (const o of calendarOrders) {
    const d = o.date.toISOString().split('T')[0]
    if (!ordersByDate[d]) ordersByDate[d] = []
    ordersByDate[d].push({
      id: o.id, name: o.name, surname: o.surname, timeSlot: o.timeSlot,
      guestCount: o.guestCount, visitType: o.visitType, status: o.status,
      totalPrice: o.totalPrice, companyName: o.company?.name ?? null,
    })
  }

  const daySummaries = Object.entries(ordersByDate).map(([date, orders]) => ({ date, count: orders.length }))

  const now = new Date()

  // Count orders per status within current date+company context (ignores status filter so counts are always visible)
  const baseWhere = {
    tenantId,
    ...(params.dateFrom || params.dateTo ? {
      date: {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo   ? { lte: new Date(params.dateTo + 'T23:59:59') } : {}),
      },
    } : {}),
    ...(params.companyId === '__individual__'
      ? { bookingType: 'INDIVIDUAL' as const }
      : params.companyId
        ? { companyId: params.companyId }
        : {}),
  }

  const statusCountRows = view === 'table'
    ? await withTenantDb(tenantId, tx => tx.order.groupBy({ by: ['status'], where: baseWhere, _count: { status: true } }))
    : []
  const statusCounts = Object.fromEntries(statusCountRows.map(r => [r.status, r._count.status]))

  const orders = view === 'table' ? await withTenantDb(tenantId, tx => tx.order.findMany({
    where: {
      ...baseWhere,
      ...(params.status ? { status: params.status as OrderStatus } : {}),
    },
    include: {
      company: true,
      masterclassLines: { include: { masterclassItem: true } },
      extras: true,
    },
    orderBy: { date: 'desc' },
  })) : []

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)

  // ── Demo-only revenue strip ───────────────────────────────────────
  // "I run a winery" lands here, and the first impression of the back office was
  // a thirteen-column table — data entry, not a business — while ₾30,785 of
  // committed future revenue sat two clicks away on Statistics. This puts three
  // of those numbers above the table. Plan-DemoFlowFixes Chunk 7 task 7.3.
  //
  // Demo-only by decision: the task left "is this a genuine improvement for
  // every winery?" open, and shipping an undesigned strip onto every tenant's
  // landing page to answer it is the wrong order. It is one `if` to widen once
  // Max says so. The numbers deliberately match Statistics' own definition
  // (upcoming = date >= today, over ALL orders, not the current filter) so the
  // two screens can never disagree.
  const demoStrip = tenantId === DEMO_TENANT_ID
    ? await (async () => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const upcoming = await withTenantDb(tenantId, tx => tx.order.findMany({
          where: { tenantId, date: { gte: today }, status: { not: 'CANCELLED' } },
          select: { date: true, totalPrice: true },
          orderBy: { date: 'asc' },
        }))
        return {
          count: upcoming.length,
          revenue: Math.round(upcoming.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
          nextDate: upcoming[0]?.date ?? null,
        }
      })()
    : null

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-y-2 mb-6">
        <h1 className="text-xl font-bold" style={{ color: C.text }}>{at('orders.pageTitle')}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {view === 'table' && <span className="text-sm" style={{ color: C.faint }}>{orders.length} {orders.length !== 1 ? at('orders.booking.plural') : at('orders.booking.singular')}</span>}
          <ViewToggle view={view} params={params} locale={locale} />
          <Link
            href="/admin/orders/new"
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: C.wine }}
          >
            {at('orders.newOrder')}
          </Link>
        </div>
      </div>

      <PaymentSetupBanner />

      {view === 'calendar' ? (
        <CalendarView
          daySummaries={daySummaries}
          ordersByDate={ordersByDate}
          initialYear={now.getFullYear()}
          initialMonth={now.getMonth()}
          locale={locale}
        />
      ) : (
        <>
      {demoStrip && <DemoRevenueStrip {...demoStrip} locale={locale} />}

      <div data-tour="orders-filters">
        <OrdersFilters companies={companies} params={params} statusCounts={statusCounts} locale={locale} tenantId={tenantId} />
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border p-12 text-center mt-4" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>{at('orders.noOrders')}</p>
        </div>
      ) : (
        <div data-tour="orders-table">
          <OrdersTable key={`${params.dateFrom}-${params.dateTo}-${params.companyId}-${params.status}`} tenantId={tenantId} detailed={detailed} defaultEmailMessage={invoiceEmailMessage} displayName={displayName} locale={locale} orders={orders.map(o => ({
            id: o.id,
            status: (o.status ?? 'NEW') as 'NEW' | 'CONFIRMED' | 'INVOICE_SENT' | 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED',
            date: o.date,
            timeSlot: o.timeSlot,
            bookingType: o.bookingType,
            visitType: o.visitType,
            guestCount: o.guestCount,
            tastingGuestCount: o.tastingGuestCount,
            lunchGuestCount: o.lunchGuestCount,
            freeGuestCount: o.freeGuestCount,
            name: o.name,
            surname: o.surname,
            email: o.email,
            phone: o.phone,
            notes: o.notes,
            totalPrice: o.totalPrice,
            hotDishVegetable: o.hotDishVegetable,
            hotDishMeat: o.hotDishMeat,
            foodNotes: o.foodNotes,
            company: o.company ? { name: o.company.name, identificationCode: o.company.identificationCode } : null,
            masterclassLines: o.masterclassLines.map(l => ({
              name: l.masterclassItem.name,
              quantity: l.quantity,
              pricePerUnit: l.pricePerUnit,
            })),
            extras: o.extras.map(e => ({ label: e.label, amount: e.amount })),
          }))} payment={payment} />

          <div className="mt-4 flex justify-end">
            <div className="rounded-lg border px-6 py-3 flex items-center gap-6" style={{ borderColor: C.border, backgroundColor: C.bg }}>
              <span className="text-sm" style={{ color: C.muted }}>
                {at('orders.totalRevenue')} {params.dateFrom || params.dateTo || params.companyId ? at('orders.filtered') : ''}
              </span>
              <span className="font-bold text-lg" style={{ color: C.wine }}>{totalRevenue}₾</span>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
