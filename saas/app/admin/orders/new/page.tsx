import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import Link from 'next/link'
import NewOrderForm from './NewOrderForm'

const C = { wine: '#7c1d23', faint: '#a89070' }

export default async function NewOrderPage() {
  const tenantId = await getTenantId()
  const [companies, menuItems, masterclassItems] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({
      where: { tenantId },
      include: { prices: true },
      orderBy: { name: 'asc' },
    })),
    withTenantDb(tenantId, tx => tx.menuItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    withTenantDb(tenantId, tx => tx.masterclassItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
  ])

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm mb-5"
        style={{ color: C.wine }}
      >
        ← Back to orders
      </Link>

      <h1 className="text-lg font-bold mb-5" style={{ color: '#1c1008' }}>
        New Order
      </h1>

      <NewOrderForm
        companies={companies.map(c => ({
          id: c.id,
          name: c.name,
          prices: c.prices.map(p => ({
            id: p.id,
            minGuests: p.minGuests,
            maxGuests: p.maxGuests,
            pricePerPerson: p.pricePerPerson,
            tastingLunchPricePerPerson: p.tastingLunchPricePerPerson,
            registrationPrice: p.registrationPrice,
          })),
        }))}
        menuItems={menuItems.map(i => ({ id: i.id, name: i.name, type: i.type }))}
        masterclassItems={masterclassItems.map(i => ({
          id: i.id,
          name: i.name,
          unitType: i.unitType,
          pricePerUnit: i.pricePerUnit,
        }))}
      />
    </div>
  )
}
