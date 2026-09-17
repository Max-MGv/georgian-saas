import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getProcessStatuses, getFinancialStatuses } from '@/lib/statusVocabulary'
import { getSetting } from '@/app/actions/settings'
import { getContent } from '@/app/actions/siteContent'
import { getDistinctOrderNationalities } from '@/app/actions/orders'
import { DEFAULT_INVOICE_MESSAGE_EN, DEFAULT_INVOICE_MESSAGE_KA } from '@/lib/emails/templates/invoiceEmailTemplate'
import { requireBookingModule } from '@/lib/requireModule'
import { headers } from 'next/headers'
import Link from 'next/link'
import { adminT } from '@/lib/adminT'
import PaymentSetupBanner from '../PaymentSetupBanner'
import OrdersFilters from './OrdersFilters'
import OrdersTable from './OrdersTable'
import CalendarView from './CalendarView'
import ViewToggle from './ViewToggle'
import RevenueStrip from './RevenueStrip'

const C = { faint: 'var(--site-secondary)', muted: 'var(--site-muted)', border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)', text: 'var(--site-text)' }

type SearchParams = {
  dateFrom?: string
  dateTo?: string
  companyId?: string   // a real company ID, or '__individual__' for individual-only
  /**
   * Process status **code** (new | confirmed | completed | cancelled), or the
   * legacy `PENDING_PAYMENT` — payment limbo is the one thing the two axes
   * deliberately cannot express, so it is still matched on the old column.
   */
  status?: string
  /** Financial status code: unpaid | invoiced | paid. AND'd with `status`. */
  payment?: string
  nationality?: string // ISO 3166-1 code (Plan-CompanyNationality)
  view?: 'table' | 'list' | 'calendar' | 'board'
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireBookingModule()
  const params = await searchParams
  const [tenantId, h] = await Promise.all([getTenantId(), headers()])
  const displayName = h.get('x-tenant-name') ?? 'Your Winery'
  const [companies, recipientName, personalNumber, bankName, bankCode, iban, invoiceDetailed, invoiceEmailMessageKa, invoiceEmailMessageEn, adminLanguage, nationalityOptions] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
    getSetting('invoice_detailed'),
    getContent('email_invoice_message', DEFAULT_INVOICE_MESSAGE_KA, 'ka'),
    getContent('email_invoice_message', DEFAULT_INVOICE_MESSAGE_EN, 'en'),
    getSetting('admin_language'),
    // Plan-CompanyNationality Chunk 8 — distinct nationalities actually on this tenant's orders,
    // not the full ~195-country list, same "only show what's in use" pattern as the company filter.
    getDistinctOrderNationalities(tenantId),
  ])
  const locale = adminLanguage || 'en'
  const at = (key: string) => adminT(locale, key)

  const payment = { recipientName, personalNumber, bankName, bankCode, iban }
  const detailed = invoiceDetailed === 'true'

  const view = params.view === 'calendar' ? 'calendar' : params.view === 'list' ? 'list' : params.view === 'board' ? 'board' : 'table'
  const isTableLike = view === 'table' || view === 'list' || view === 'board'

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
          processStatus: { select: { code: true } },
          financialStatus: { select: { code: true } },
          paidAt: true,
          totalPrice: true,
          requestedCompanyName: true,
          company: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
      }))
    : []

  type CalendarOrder = {
    id: string; name: string; surname: string; timeSlot: string
    guestCount: number; visitType: string; totalPrice: number | null
    /** The legacy value, kept only so payment limbo stays distinguishable. */
    status: string
    processCode: string | null
    paid: boolean
    /** Invoice sent, money not yet in. Bookings only — wine has no invoice flow. */
    invoiced: boolean
    companyName: string | null
  }
  const ordersByDate: Record<string, CalendarOrder[]> = {}
  for (const o of calendarOrders) {
    const d = o.date.toISOString().split('T')[0]
    if (!ordersByDate[d]) ordersByDate[d] = []
    ordersByDate[d].push({
      id: o.id, name: o.name, surname: o.surname, timeSlot: o.timeSlot,
      guestCount: o.guestCount, visitType: o.visitType, status: o.status,
      processCode: o.processStatus?.code ?? null,
      paid: o.paidAt != null,
      invoiced: o.financialStatus?.code === 'invoiced' && o.paidAt == null,
      totalPrice: o.totalPrice,
      companyName: o.company?.name ?? (o.requestedCompanyName ? `${o.requestedCompanyName} (new)` : null),
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
    ...(params.nationality ? { nationalities: { has: params.nationality } } : {}),
  }

  // The vocabulary, resolved once and threaded down. `getProcessStatuses` /
  // `getFinancialStatuses` own both required filters (per-order-type scope,
  // global-or-own tenant rows), so no view below filters for itself.
  const [processSteps, financialSteps] = await Promise.all([
    getProcessStatuses(tenantId, 'BOOKING'),
    getFinancialStatuses(tenantId, 'BOOKING'),
  ])
  const processCodeById = Object.fromEntries(processSteps.map(s => [s.id, s.code]))
  const financialCodeById = Object.fromEntries(financialSteps.map(s => [s.id, s.code]))

  // Counts per status within the current date+company context, ignoring the
  // status filters themselves so the numbers stay visible while one is active.
  // Two groupBys now rather than one, because there are two axes to count.
  //
  // The process count excludes payment limbo. On the axes a limbo order sits at
  // `new` like any freshly placed one — deliberately, since an abandoned
  // checkout leaves the order where it started — so counting it under both
  // would double it, and the two entries in the picker would overlap rather
  // than partition. Its own count comes from the legacy column below.
  const processWhere = { ...baseWhere, status: { not: 'PENDING_PAYMENT' as const } }
  const [processCountRows, financialCountRows] = isTableLike
    ? await withTenantDb(tenantId, async tx => [
        await tx.order.groupBy({ by: ['processStatusId'], where: processWhere, _count: { processStatusId: true } }),
        await tx.order.groupBy({ by: ['financialStatusId'], where: baseWhere, _count: { financialStatusId: true } }),
      ] as const)
    : [[], []]
  const statusCounts: Record<string, number> = {}
  for (const r of processCountRows) {
    const code = r.processStatusId ? processCodeById[r.processStatusId] : null
    if (code) statusCounts[code] = (statusCounts[code] ?? 0) + r._count.processStatusId
  }
  // Payment limbo is not a position on either axis (it maps to process `new`),
  // so its count comes from the legacy column, which is still the only place
  // that distinguishes it.
  const limboCount = isTableLike
    ? await withTenantDb(tenantId, tx => tx.order.count({ where: { ...baseWhere, status: 'PENDING_PAYMENT' } }))
    : 0
  if (limboCount > 0) statusCounts.PENDING_PAYMENT = limboCount

  const paymentCounts: Record<string, number> = {}
  for (const r of financialCountRows) {
    const code = r.financialStatusId ? financialCodeById[r.financialStatusId] : null
    if (code) paymentCounts[code] = (paymentCounts[code] ?? 0) + r._count.financialStatusId
  }

  const orders = isTableLike ? await withTenantDb(tenantId, tx => tx.order.findMany({
    where: {
      ...baseWhere,
      // Uppercase means the legacy limbo value; anything else is a process
      // code. The two vocabularies are disjoint, so one param carries both
      // without needing a prefix.
      ...(params.status === 'PENDING_PAYMENT'
        ? { status: 'PENDING_PAYMENT' as const }
        : params.status
          // Limbo excluded for the same reason it is excluded from the counts:
          // picking "New" must not hand back ten abandoned checkouts as if the
          // winery had work waiting on them.
          ? { processStatus: { code: params.status }, status: { not: 'PENDING_PAYMENT' as const } }
          : {}),
      ...(params.payment ? { financialStatus: { code: params.payment } } : {}),
    },
    include: {
      company: { include: { representatives: true } },
      masterclassLines: { include: { masterclassItem: true } },
      extras: true,
      processStatus: { select: { code: true } },
      financialStatus: { select: { code: true } },
    },
    orderBy: { date: 'desc' },
  })) : []

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)

  // ── Revenue strip ─────────────────────────────────────────────────
  // Three numbers above the table: upcoming bookings, the revenue they
  // represent, and when the next one is. Built demo-only in Plan-DemoFlowFixes
  // Chunk 7 task 7.3, rolled out to every tenant on Max's call 2026-09-11.
  // The design decisions behind it are documented in RevenueStrip.tsx.
  //
  // Two queries, only on the table/list views — the calendar view has its own
  // shape and does not need them:
  //  - `upcoming` drives the numbers. Deliberately unfiltered: it is the whole
  //    business, not the current view.
  //  - `hasAnyOrders` decides whether the strip renders at all. A brand-new
  //    winery with no bookings should not be met by a row of zeros; a winery
  //    that has traded but has nothing upcoming still gets it, because there
  //    the zero is real information.
  //
  // Same definition Statistics uses (date >= today, cancelled excluded) so the
  // two screens cannot disagree.
  const [upcoming, hasAnyOrders] = isTableLike
    ? await Promise.all([
        (() => {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          return withTenantDb(tenantId, tx => tx.order.findMany({
            where: { tenantId, date: { gte: today }, status: { not: 'CANCELLED' } },
            select: { date: true, totalPrice: true },
            orderBy: { date: 'asc' },
          }))
        })(),
        withTenantDb(tenantId, tx => tx.order.count({ where: { tenantId } })).then(c => c > 0),
      ])
    : [[], false]

  const revenueStrip = hasAnyOrders
    ? {
        count: upcoming.length,
        revenue: Math.round(upcoming.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
        nextDate: upcoming[0]?.date ?? null,
      }
    : null

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-y-2 mb-6">
        <h1 className="text-xl font-bold" style={{ color: C.text }}>{at('orders.pageTitle')}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {isTableLike && <span className="text-sm" style={{ color: C.faint }}>{orders.length} {orders.length !== 1 ? at('orders.booking.plural') : at('orders.booking.singular')}</span>}
          <ViewToggle view={view} params={params} locale={locale} />
          <Link
            href="/admin/orders/new"
            className="px-3 py-1.5 min-h-10 md:min-h-0 inline-flex items-center rounded-lg text-sm font-medium text-white"
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
      {revenueStrip && <RevenueStrip {...revenueStrip} locale={locale} />}

      <div data-tour="orders-filters">
        <OrdersFilters companies={companies} params={params} statusCounts={statusCounts} paymentCounts={paymentCounts} processSteps={processSteps} financialSteps={financialSteps} locale={locale} tenantId={tenantId} nationalityOptions={nationalityOptions} />
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border p-12 text-center mt-4" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p style={{ color: C.faint }}>{at('orders.noOrders')}</p>
        </div>
      ) : (
        <div data-tour="orders-table">
          <OrdersTable key={`${params.dateFrom}-${params.dateTo}-${params.companyId}-${params.status}-${params.payment}-${params.nationality}`} view={view === 'list' ? 'list' : view === 'board' ? 'board' : 'table'} tenantId={tenantId} detailed={detailed} defaultEmailMessageKa={invoiceEmailMessageKa} defaultEmailMessageEn={invoiceEmailMessageEn} displayName={displayName} locale={locale} processSteps={processSteps} financialSteps={financialSteps} orders={orders.map(o => ({
            id: o.id,
            status: (o.status ?? 'NEW') as 'NEW' | 'CONFIRMED' | 'INVOICE_SENT' | 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED',
            processCode: o.processStatus?.code ?? null,
            financialCode: o.financialStatus?.code ?? null,
            paidAt: o.paidAt,
            paidAtStage: o.paidAtStage,
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
            nationalities: o.nationalities,
            company: o.company ? { name: o.company.name, identificationCode: o.company.identificationCode, representatives: o.company.representatives } : null,
            requestedCompanyName: o.requestedCompanyName,
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
