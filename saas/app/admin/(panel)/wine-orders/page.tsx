import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { NOT_ABANDONED } from '@/lib/orderFilters'
import { wineOrderAmountDue } from '@/lib/wineOrderMoney'
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
      include: {
        wineItems: true,
        // Settled, live payments — only to work out what is still owed (T-8, Chunk 6).
        payments: { where: { settledAt: { not: null }, reversedAt: null }, select: { amount: true } },
        // T-12 — the exporter label comes from the company, live (it is a label, not a fact of the order).
        company: { select: { isExporter: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  )

  // displayTotal: what the customer owes in all — wines + delivery fee since T-8
  // (lib/wineOrderMoney.ts); an estimate from item snapshots for old rows with no total.
  // feeOwed: on a PAID order, what is still outstanding (a delivery fee set after payment).
  const ordersWithTotal = orders.map(({ payments, company, ...rest }) => {
    const o = { ...rest, isExporter: company?.isExporter ?? false }
    const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0)
    const due = wineOrderAmountDue(o)
    const feeOwed = o.paidAt && due != null ? Math.max(0, due - paidSoFar) : 0
    if (due != null) return { ...o, displayTotal: due, totalEstimated: false, feeOwed }
    const estimated = o.wineItems.reduce((sum, i) => sum + i.quantity * i.priceSnapshot, 0)
    return { ...o, displayTotal: estimated > 0 ? estimated : null, totalEstimated: estimated > 0, feeOwed }
  })

  return (
    // md:p-6, not p-6: the admin <main> already pads the page, so on a phone this
    // doubled the side margin (and pushed the page 24px past a 320px screen).
    <div data-tour="wine-orders-list" className="md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-y-2 mb-3 md:mb-6">
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
