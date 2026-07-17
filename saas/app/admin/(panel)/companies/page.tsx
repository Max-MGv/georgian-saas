import { withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { headers } from 'next/headers'
import { ensureIndividualsCompany } from '@/app/actions/companies'
import CompaniesClient from './CompaniesClient'

export default async function CompaniesPage() {
  const [tenantId, h] = await Promise.all([getTenantId(), headers()])
  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  await ensureIndividualsCompany(tenantId)

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

  const tourOperators = companies.filter(c => !c.isIndividual)
  const bookingCount = tourOperators.filter(c => c.isBookingCompany ?? true).length
  const wineCount = tourOperators.filter(c => c.isWineOrderCompany ?? false).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Companies</h1>
        <span className="text-sm" style={{ color: '#a89070' }}>
          {bookingCount} booking · {wineCount} wine orders
        </span>
      </div>
      <CompaniesClient
        bookingOn={bookingOn}
        wineOrdersOn={wineOrdersOn}
        companies={companies.map(c => ({
          id: c.id,
          name: c.name,
          isIndividual: c.isIndividual,
          isBookingCompany: c.isBookingCompany ?? true,
          isWineOrderCompany: c.isWineOrderCompany ?? false,
          wineDiscountPercent: c.wineDiscountPercent,
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
