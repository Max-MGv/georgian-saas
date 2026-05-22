import { db } from '@/lib/db'
import StatisticsClient from './StatisticsClient'

export default async function StatisticsPage() {
  const [rawOrders, companies] = await Promise.all([
    db.order.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { date: 'asc' },
    }),
    db.company.findMany({ orderBy: { name: 'asc' } }),
  ])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // V1 pre-computed stats
  const totalOrders = rawOrders.length
  const totalRevenue = rawOrders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)
  const monthOrders = rawOrders.filter(o => o.date >= monthStart).length
  const monthRevenue = rawOrders.filter(o => o.date >= monthStart).reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)

  const months: { label: string; year: number; month: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ label: d.toLocaleString('en', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() })
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

  // V2 raw orders (serialise dates as ISO strings for client)
  const orders = rawOrders.map(o => ({
    id: o.id,
    date: o.date.toISOString(),
    totalPrice: o.totalPrice ?? 0,
    companyId: o.companyId,
    companyName: o.company?.name ?? null,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Statistics</h1>
        <span className="text-sm" style={{ color: '#a89070' }}>{totalOrders} orders total</span>
      </div>
      <StatisticsClient
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
      />
    </div>
  )
}
