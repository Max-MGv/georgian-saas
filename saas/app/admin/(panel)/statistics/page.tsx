import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { headers } from 'next/headers'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import StatisticsClient from './StatisticsClient'
import { NOT_ABANDONED, NOT_CANCELLED } from '@/lib/orderFilters'

export default async function StatisticsPage() {
  const [tenantId, h, adminLanguage] = await Promise.all([getTenantId(), headers(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'

  const [rawOrders, companies, rawWineOrders] = await Promise.all([
    bookingOn
      ? withTenantDb(tenantId, tx => tx.order.findMany({
          // Abandoned checkouts never reached the winery, so they are not
          // revenue and not activity — they are excluded here as on every
          // other order surface.
          //
          // Cancelled bookings are excluded too (2026-09-18). They are real
          // and they stay visible in the order screens, but they are not
          // money and not volume. This page had counted them while the Orders
          // page's own revenue strip did not, so the two disagreed by 7.2% on
          // the dev tenant. Every figure below derives from this one query, so
          // excluding here keeps counts and revenue consistent with each other
          // — an average order value computed from a revenue that skips
          // cancellations and a count that does not would be wrong.
          where: { tenantId, ...NOT_ABANDONED, ...NOT_CANCELLED },
          include: { company: { select: { name: true } } },
          orderBy: { date: 'asc' },
        }))
      : Promise.resolve([]),
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })),
    wineOrdersOn
      ? withTenantDb(tenantId, tx => tx.wineOrder.findMany({
          // Same exclusions, same reasoning — WineStatistics.tsx summed
          // cancelled wine orders into its revenue total while already
          // excluding them from its "active orders" count, so the two
          // contradicted each other on one screen.
          where: { tenantId, ...NOT_ABANDONED, ...NOT_CANCELLED },
          include: { wineItems: true },
          orderBy: { createdAt: 'desc' },
        }))
      : Promise.resolve([]),
  ])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Booking stats (pre-computed)
  const totalOrders = rawOrders.length
  const totalRevenue = rawOrders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)
  const monthOrders = rawOrders.filter(o => o.date >= monthStart).length
  const monthRevenue = rawOrders.filter(o => o.date >= monthStart).reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)

  const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const months: { label: string; year: number; month: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ label: adminT(locale, `statistics.month.${MONTH_KEYS[d.getMonth()]}`), year: d.getFullYear(), month: d.getMonth() })
  }
  const byMonth = months.map(({ label, year, month }) => {
    const bucket = rawOrders.filter(o => { const d = new Date(o.date); return d.getFullYear() === year && d.getMonth() === month })
    return { month: label, orders: bucket.length, revenue: Math.round(bucket.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)) }
  })

  const tasting = rawOrders.filter(o => o.visitType === 'TASTING')
  const tastingLunch = rawOrders.filter(o => o.visitType === 'TASTING_LUNCH')
  const byVisitType = {
    tastingOrders: tasting.length,
    tastingRevenue: Math.round(tasting.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
    tastingLunchOrders: tastingLunch.length,
    tastingLunchRevenue: Math.round(tastingLunch.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
  }

  const individual = rawOrders.filter(o => o.bookingType === 'INDIVIDUAL')
  const company = rawOrders.filter(o => o.bookingType === 'COMPANY')
  const byBookingType = {
    individualOrders: individual.length,
    individualRevenue: Math.round(individual.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
    companyOrders: company.length,
    companyRevenue: Math.round(company.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
  }

  const companyMap: Record<string, { name: string; orders: number; revenue: number }> = {}
  for (const o of rawOrders.filter(o => o.company)) {
    const name = o.company!.name
    if (!companyMap[name]) companyMap[name] = { name, orders: 0, revenue: 0 }
    companyMap[name].orders++
    companyMap[name].revenue += o.totalPrice ?? 0
  }
  const topCompanies = Object.values(companyMap)
    .map(c => ({ ...c, revenue: Math.round(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const orders = rawOrders.map(o => ({
    id: o.id,
    date: o.date.toISOString(),
    totalPrice: o.totalPrice ?? 0,
    companyId: o.companyId,
    companyName: o.company?.name ?? null,
  }))

  // Wine order stats — line items carry price snapshots from order time
  const wineOrders = rawWineOrders.map(o => {
    const items = o.wineItems.map(i => ({
      id: i.wineVintageId ?? i.id,
      name: i.wineNameSnapshot,
      quantity: i.quantity,
      price: i.priceSnapshot,
    }))
    const displayTotal = o.totalAmount != null
      ? o.totalAmount
      : items.reduce((sum, w) => sum + w.quantity * w.price, 0)
    return {
      id: o.id,
      businessName: o.businessName,
      wines: items,
      displayTotal: Math.round(displayTotal),
      stage: o.stage,
      createdAt: o.createdAt.toISOString(),
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{adminT(locale, 'nav.statistics')}</h1>
      </div>
      <StatisticsClient
        bookingOn={bookingOn}
        wineOrdersOn={wineOrdersOn}
        totalOrders={totalOrders}
        totalRevenue={Math.round(totalRevenue)}
        monthOrders={monthOrders}
        monthRevenue={Math.round(monthRevenue)}
        byMonth={byMonth}
        byVisitType={byVisitType}
        byBookingType={byBookingType}
        topCompanies={topCompanies}
        orders={orders}
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        wineOrders={wineOrders}
        locale={locale}
      />
    </div>
  )
}
