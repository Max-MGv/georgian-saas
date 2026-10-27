import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { headers } from 'next/headers'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import StatisticsClient from './StatisticsClient'
import type { WineOrderStat } from './WineStatistics'
import { NOT_ABANDONED, NOT_CANCELLED } from '@/lib/orderFilters'
import { loadWineSales, bookingWine, BOOKING_WINE_SELECT, type WineSale } from '@/lib/wineSales'

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
          // BOOKING_WINE_SELECT: the booking's table wine and the guest purchases from its visit, for the revenue-level switch.
          include: { company: { select: { name: true } }, ...BOOKING_WINE_SELECT },
          orderBy: { date: 'asc' },
        }))
      : Promise.resolve([]),
    withTenantDb(tenantId, tx => tx.company.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })),
    // Wine sold, from every source (wine orders, guest purchases, table wine on bookings) — lib/wineSales.ts is the only reader.
    // The same exclusions as the bookings above apply to each parent: abandoned and cancelled are not sales (the old page summed
    // cancelled wine orders into revenue while leaving them out of its active count, so the two contradicted each other).
    wineOrdersOn
      ? withTenantDb(tenantId, tx => loadWineSales(tx, tenantId, { wineOrders: true, bookings: bookingOn, individualLabel: adminT(locale, 'orders.type.individual') }))
      : Promise.resolve([] as WineSale[]),
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

  // Three visit types since T-152 (Lunch only is a company visit type, D-10).
  const ofVisit = (v: string) => rawOrders.filter(o => o.visitType === v)
  const revenueOf = (list: typeof rawOrders) => Math.round(list.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0))
  const [tasting, tastingLunch, lunchOnly] = [ofVisit('TASTING'), ofVisit('TASTING_LUNCH'), ofVisit('LUNCH')]
  const byVisitType = {
    tastingOrders: tasting.length, tastingRevenue: revenueOf(tasting),
    tastingLunchOrders: tastingLunch.length, tastingLunchRevenue: revenueOf(tastingLunch),
    lunchOnlyOrders: lunchOnly.length, lunchOnlyRevenue: revenueOf(lunchOnly),
  }
  // Guests per product — every order stores its boxes (A-4), so this counts heads the kitchen actually served.
  const guestsByProduct = rawOrders.reduce((acc, o) => ({
    tastingOnly: acc.tastingOnly + (o.tastingOnlyGuests ?? 0),
    lunchOnly: acc.lunchOnly + (o.lunchOnlyGuests ?? 0),
    tastingLunch: acc.tastingLunch + (o.tastingLunchGuests ?? 0),
    free: acc.free + o.freeGuestCount,
  }), { tastingOnly: 0, lunchOnly: 0, tastingLunch: 0, free: 0 })

  const individual = rawOrders.filter(o => o.bookingType === 'INDIVIDUAL')
  const company = rawOrders.filter(o => o.bookingType === 'COMPANY')
  const byBookingType = {
    individualOrders: individual.length,
    individualRevenue: Math.round(individual.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
    companyOrders: company.length,
    companyRevenue: Math.round(company.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
  }

  const companyMap: Record<string, { name: string; orders: number; revenue: number }> = {}
  // Companies only: an individual booking is never a company, even one (older demo data) linked to the
  // "Individuals" price row — it is counted under By booking type instead (2026-10-23).
  for (const o of rawOrders.filter(o => o.bookingType === 'COMPANY' && o.company)) {
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
    // Wine around the visit, for the revenue-level switch (lib/revenueLevel.ts): table wine is inside totalPrice, guest purchases are not.
    ...bookingWine(o),
    // Individuals are one group ("Individual"), whatever row older demo data links them to (2026-10-23).
    companyId: o.bookingType === 'INDIVIDUAL' ? null : o.companyId,
    companyName: o.bookingType === 'INDIVIDUAL' ? null : o.company?.name ?? null,
  }))

  // Wine statistics: one row per sale; each line carries what it actually cost (its own lineTotal — % and agreed price included).
  const wineOrders: WineOrderStat[] = rawWineOrders.map(s => ({
    id: s.id,
    businessName: s.customer,
    source: s.source,
    wines: s.lines,
    displayTotal: s.amount,
    stage: s.stage,
    createdAt: s.date,
  }))

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
        guestsByProduct={guestsByProduct}
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
