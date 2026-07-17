import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireWineOrdersModule } from '@/lib/requireModule'
import WineOrdersClient from './WineOrdersClient'

export default async function WineOrdersPage() {
  await requireWineOrdersModule()
  const tenantId = await getTenantId()
  const orders = await withTenantDb(tenantId, tx =>
    tx.wineOrder.findMany({
      where: { tenantId },
      include: { wineItems: true },
      orderBy: { createdAt: 'desc' },
    })
  )

  // Compute displayTotal: stored value if present, otherwise estimate from item price snapshots
  const ordersWithTotal = orders.map(o => {
    if (o.totalAmount != null) return { ...o, displayTotal: o.totalAmount, totalEstimated: false }
    const estimated = o.wineItems.reduce((sum, i) => sum + i.quantity * i.priceSnapshot, 0)
    return { ...o, displayTotal: estimated > 0 ? estimated : null, totalEstimated: estimated > 0 }
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Wine Orders</h1>
        <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: '#f5ede0', color: '#8b4513' }}>
          {orders.length} total
        </span>
      </div>
      <WineOrdersClient orders={ordersWithTotal} />
    </div>
  )
}
