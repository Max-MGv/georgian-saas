import { db } from '@/lib/db'
import WineOrdersClient from './WineOrdersClient'

export default async function WineOrdersPage() {
  const orders = await db.wineOrder.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Wine Orders</h1>
        <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: '#f5ede0', color: '#8b4513' }}>
          {orders.length} total
        </span>
      </div>
      <WineOrdersClient orders={orders} />
    </div>
  )
}
