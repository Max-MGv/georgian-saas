import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import WineOrdersClient from './WineOrdersClient'

type WineSelection = { id: string; name: string; quantity: number; price?: number }

export default async function WineOrdersPage() {
  const tenantId = await getTenantId()
  const [orders, wines] = await Promise.all([
    withTenantDb(tenantId, tx => tx.wineOrder.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })),
    withTenantDb(tenantId, tx => tx.wine.findMany({ where: { tenantId }, select: { id: true, price: true } })),
  ])

  const priceMap = Object.fromEntries(wines.map(w => [w.id, w.price]))

  // Compute displayTotal: stored value if present, otherwise estimate from current prices
  const ordersWithTotal = orders.map(o => {
    if (o.totalAmount != null) return { ...o, displayTotal: o.totalAmount, totalEstimated: false }
    const items = o.wines as WineSelection[]
    const estimated = items.reduce((sum, w) => {
      const p = w.price ?? priceMap[w.id] ?? 0
      return sum + w.quantity * p
    }, 0)
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
