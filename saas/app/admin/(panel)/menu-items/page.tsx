import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireBookingModule } from '@/lib/requireModule'
import MenuItemsClient from './MenuItemsClient'

export default async function MenuItemsPage() {
  await requireBookingModule()
  const tenantId = await getTenantId()
  const items = await withTenantDb(tenantId, tx =>
    tx.menuItem.findMany({
      where: { tenantId },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })
  )

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Menu Items</h1>
        <span className="text-sm" style={{ color: '#a89070' }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <MenuItemsClient items={items} />
    </div>
  )
}
