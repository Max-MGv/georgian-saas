import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import CompaniesClient from './CompaniesClient'

export default async function CompaniesPage() {
  const tenantId = await getTenantId()
  const companies = await withTenantDb(tenantId, tx =>
    tx.company.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { orders: true } },
        prices: { orderBy: { minGuests: 'asc' } },
      },
    })
  )

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
          identificationCode: c.identificationCode,
          contactName: c.contactName,
          contactPhone: c.contactPhone,
          contactEmail: c.contactEmail,
          address: c.address,
          accessCode: c.accessCode,
          orderCount: c._count.orders,
          prices: c.prices,
        }))}
      />
    </div>
  )
}
