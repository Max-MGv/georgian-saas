import { db } from '@/lib/db'
import StatisticsClient from './StatisticsClient'

export default async function StatisticsPage() {
  const orders = await db.order.findMany({
    include: { company: { select: { name: true } } },
    orderBy: { date: 'asc' },
  })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Summary totals
  const totalOrders = orders.length
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)
  const monthOrders = orders.filter(o => o.date >= monthStart).length
  const monthRevenue = orders.filter(o => o.date >= monthStart).reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)

  // Last 6 months buckets
  const months: { label: string; year: number; month: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      label: d.toLocaleString('en', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
    })
  }

  const byMonth = months.map(({ label, year, month }) => {
    const bucket = orders.filter(o => {
      const d = new Date(o.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
    return {
      month: label,
      orders: bucket.length,
      revenue: Math.round(bucket.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
    }
  })

  // Visit type breakdown
  const tasting = orders.filter(o => o.visitType === 'TASTING')
  const tastingLunch = orders.filter(o => o.visitType === 'TASTING_LUNCH')
  const byVisitType = {
    tastingOrders: tasting.length,
    tastingRevenue: Math.round(tasting.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
    tastingLunchOrders: tastingLunch.length,
    tastingLunchRevenue: Math.round(tastingLunch.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
  }

  // Booking type breakdown
  const individual = orders.filter(o => o.bookingType === 'INDIVIDUAL')
  const company = orders.filter(o => o.bookingType === 'COMPANY')
  const byBookingType = {
    individualOrders: individual.length,
    individualRevenue: Math.round(individual.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
    companyOrders: company.length,
    companyRevenue: Math.round(company.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0)),
  }

  // Top companies
  const companyMap: Record<string, { name: string; orders: number; revenue: number }> = {}
  for (const o of orders.filter(o => o.company)) {
    const name = o.company!.name
    if (!companyMap[name]) companyMap[name] = { name, orders: 0, revenue: 0 }
    companyMap[name].orders++
    companyMap[name].revenue += o.totalPrice ?? 0
  }
  const topCompanies = Object.values(companyMap)
    .map(c => ({ ...c, revenue: Math.round(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

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
      />
    </div>
  )
}
