import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { getProcessStatuses } from '@/lib/statusVocabulary'
import { adminT } from '@/lib/adminT'
import Link from 'next/link'
import WineOrdersClient from './WineOrdersClient'

const C = { wine: 'var(--color-brand)' }

export default async function WineOrdersPage() {
  await requireWineOrdersModule()
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  // The vocabulary is fetched once here and threaded down, rather than each
  // view asking for it: `getProcessStatuses` owns both required filters
  // (per-order-type scope, global-or-own tenant rows) and the flow-line is
  // pure, so the server is the right place to resolve it.
  const [orders, processSteps] = await Promise.all([
    withTenantDb(tenantId, tx =>
      tx.wineOrder.findMany({
        where: { tenantId },
        include: {
          wineItems: true,
          processStatus: { select: { code: true } },
          financialStatus: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    ),
    getProcessStatuses(tenantId, 'WINE_ORDER'),
  ])

  // Compute displayTotal: stored value if present, otherwise estimate from item price snapshots
  const ordersWithTotal = orders.map(o => {
    // Flattened to plain codes at the boundary: the client renders from codes,
    // and passing the relation objects through would ship two nested objects
    // per order for two strings.
    const base = {
      ...o,
      processCode: o.processStatus?.code ?? null,
      financialCode: o.financialStatus?.code ?? null,
    }
    if (o.totalAmount != null) return { ...base, displayTotal: o.totalAmount, totalEstimated: false }
    const estimated = o.wineItems.reduce((sum, i) => sum + i.quantity * i.priceSnapshot, 0)
    return { ...base, displayTotal: estimated > 0 ? estimated : null, totalEstimated: estimated > 0 }
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
      <WineOrdersClient orders={ordersWithTotal} processSteps={processSteps} locale={locale} />
    </div>
  )
}
