import { db } from '@/lib/db'

type WineSelection = { id: string; name: string; quantity: number }

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

      {orders.length === 0 ? (
        <div className="text-center py-20 text-sm" style={{ color: '#a89070' }}>
          No wine orders yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map(order => {
            const wines = order.wines as WineSelection[]
            return (
              <div key={order.id} className="rounded-xl border p-5" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-bold" style={{ color: '#1c1008' }}>{order.businessName}</p>
                    {order.llcName && (
                      <p className="text-sm" style={{ color: '#6b5a47' }}>{order.llcName}{order.llcId ? ` · ${order.llcId}` : ''}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      order.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {order.status}
                    </span>
                    <p className="text-xs mt-1" style={{ color: '#a89070' }}>
                      {new Date(order.createdAt).toLocaleDateString('ka-GE')}
                    </p>
                  </div>
                </div>

                {/* Wines ordered */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {wines.map(w => (
                    <span key={w.id} className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#e0d4c0', color: '#6b5a47', backgroundColor: '#f5efe6' }}>
                      {w.name} × {w.quantity}
                    </span>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-1 text-sm" style={{ color: '#6b5a47' }}>
                  <p>📍 {order.address}</p>
                  {order.workingHours && <p>🕐 {order.workingHours}</p>}
                  <p>👤 {order.contactName}</p>
                  <p>📞 {order.contactPhone}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
