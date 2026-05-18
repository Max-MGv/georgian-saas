import { db } from '@/lib/db'
import CompaniesClient from './CompaniesClient'

export default async function CompaniesPage() {
  const companies = await db.company.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { orders: true } },
      prices: { orderBy: { minGuests: 'asc' } },
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Companies</h1>
        <span className="text-sm" style={{ color: '#a89070' }}>
          {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}
        </span>
      </div>
      <CompaniesClient
        companies={companies.map(c => ({
          id: c.id,
          name: c.name,
          orderCount: c._count.orders,
          prices: c.prices,
        }))}
      />
    </div>
  )
}
