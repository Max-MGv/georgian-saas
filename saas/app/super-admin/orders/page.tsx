import { getAllBookings, getAllWineOrders } from '@/app/actions/superAdmin'
import OrdersActivityClient from './OrdersActivityClient'

export default async function SuperAdminOrdersPage() {
  const [bookings, wineOrders] = await Promise.all([
    getAllBookings(),
    getAllWineOrders(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>Orders</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>
          All bookings and wine orders across every tenant. Read-only — click through to a tenant&apos;s own admin to take action.
        </p>
      </div>
      <OrdersActivityClient bookings={bookings} wineOrders={wineOrders} />
    </div>
  )
}
