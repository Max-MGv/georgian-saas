import { db } from '@/lib/db'
import Link from 'next/link'
import NewOrderForm from './NewOrderForm'

const C = { wine: '#7c1d23', faint: '#a89070' }

export default async function NewOrderPage() {
  const [companies, menuItems, masterclassItems] = await Promise.all([
    db.company.findMany({
      include: { prices: true },
      orderBy: { name: 'asc' },
    }),
    db.menuItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    db.masterclassItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
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
