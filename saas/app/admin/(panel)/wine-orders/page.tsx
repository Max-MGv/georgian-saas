import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { NOT_ABANDONED } from '@/lib/orderFilters'
import { wineOrderAmountDue } from '@/lib/wineOrderMoney'
import { isAdminLinkPayment, adminLinkExpiresAt } from '@/lib/payments/openLink'
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
        // Live payments: settled ones count towards what is owed; an unsettled delivery-fee card link
        // (its Flitt reference carries '-topup-') is shown so a second link is a conscious choice.
        payments: { where: { reversedAt: null }, select: { amount: true, settledAt: true, status: true, flittOrderId: true, createdAt: true } },
        // T-12 — the exporter label comes from the company, live (it is a label, not a fact of the order).
        company: { select: { isExporter: true } },
        // T-22 — a guest purchase says which visit it came from (a link, never a copy: the booking's date / company stay live).
        sourceOrder: { select: { id: true, date: true, bookingType: true, company: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
  )

  // displayTotal: what the customer owes in all — wines + delivery fee since T-8
  // (lib/wineOrderMoney.ts); an estimate from item snapshots for old rows with no total.
  // feeOwed: on a PAID order, due − paid, SIGNED: > 0 still owed (a delivery fee set after payment),
  // < 0 paid too much (shown as a credit, the way bookings show it — blind review 2026-10-13).
  // pendingLink: the newest delivery-fee card link that has not been paid.
  const ordersWithTotal = orders.map(({ payments, company, sourceOrder, ...rest }) => {
    const visit = sourceOrder
      ? { id: sourceOrder.id, date: sourceOrder.date.toISOString(), label: sourceOrder.bookingType === 'COMPANY' && sourceOrder.company ? sourceOrder.company.name : '' }
      : null
    const o = { ...rest, isExporter: company?.isExporter ?? false, visit }
    const paidSoFar = payments.filter(p => p.settledAt).reduce((sum, p) => sum + p.amount, 0)
    const due = wineOrderAmountDue(o)
    const feeOwed = o.paidAt && due != null ? due - paidSoFar : 0
    // Only a link that can still be paid: one past its lifetime (10 h for old links, 7 days for new
    // ones — lib/payments/openLink.ts) is dead and must not read as "a link is waiting".
    const now = new Date()
    const link = payments
      .filter(p => !p.settledAt && p.status === 'created' && isAdminLinkPayment(p.flittOrderId)
        && adminLinkExpiresAt(p.createdAt, p.flittOrderId) > now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const pendingLink = link ? { amount: link.amount, createdAt: link.createdAt.toISOString() } : null
    if (due != null) return { ...o, displayTotal: due, totalEstimated: false, feeOwed, pendingLink }
    const estimated = o.wineItems.reduce((sum, i) => sum + i.quantity * i.priceSnapshot, 0)
    return { ...o, displayTotal: estimated > 0 ? estimated : null, totalEstimated: estimated > 0, feeOwed, pendingLink }
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
