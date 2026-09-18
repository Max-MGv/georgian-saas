import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { NOT_ABANDONED } from '@/lib/orderFilters'
import { adminT } from '@/lib/adminT'
import Link from 'next/link'
import WineOrdersClient from './WineOrdersClient'

const C = { wine: 'var(--color-brand)' }

export default async function WineOrdersPage() {
  await requireWineOrdersModule()
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const orders = await withTenantDb(tenantId, tx =>
    tx.wineOrder.findMany({
      // Abandoned checkouts are not orders and never appear here - they live
      // on /admin/abandoned. See lib/orderFilters.
      where: { tenantId, ...NOT_ABANDONED },
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
    <div data-tour="wine-orders-list" className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-y-2 mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{adminT(locale, 'nav.wineOrders')}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-secondary)' }}>
            {orders.length} {adminT(locale, 'wineOrders.total')}
          </span>
          <Link
            href="/admin/wine-orders/new"
            className="px-3 py-1.5 min-h-10 md:min-h-0 inline-flex items-center rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: C.wine }}
          >
            {adminT(locale, 'wineOrders.newOrder')}
          </Link>
        </div>
      </div>
      <WineOrdersClient orders={ordersWithTotal} locale={locale} />
    </div>
  )
}
