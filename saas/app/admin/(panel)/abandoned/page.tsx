import { withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { ONLY_ABANDONED } from '@/lib/orderFilters'
import { adminT } from '@/lib/adminT'
import AbandonedClient from './AbandonedClient'

/**
 * Incomplete orders — the ones that went to the card payment page and never
 * came back (Feature 191).
 *
 * **Its own route, deliberately.** Max's call: these are not orders, so they do
 * not belong anywhere in the order screens, not as a status, a tab, a filter or
 * a board column. The rows stay in `Order` / `WineOrder` rather than moving to a
 * table of their own for one specific reason: we are never told that someone
 * closed the tab, so there is no event at which we could move anything — and if
 * that payment does eventually land, Flitt's callback needs the original row to
 * land on (Plan-OnlinePayment §7.2, which is also why these are never
 * auto-expired).
 *
 * Both order types share the screen because they are the same problem, and a
 * winery with three abandoned bookings and two abandoned wine orders should not
 * have to look in two places for five rows.
 */
export default async function AbandonedOrdersPage() {
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'

  const [bookings, wineOrders] = await withTenantDb(tenantId, async tx => [
    await tx.order.findMany({
      where: { tenantId, ...ONLY_ABANDONED },
      select: {
        id: true, name: true, surname: true, email: true, phone: true,
        date: true, timeSlot: true, guestCount: true, totalPrice: true,
        abandonedAt: true, createdAt: true,
        company: { select: { name: true } },
      },
      // Newest first: a checkout abandoned an hour ago is the one that might
      // still be worth a phone call. Ones from months ago never are.
      orderBy: { abandonedAt: 'desc' },
    }),
    await tx.wineOrder.findMany({
      where: { tenantId, ...ONLY_ABANDONED },
      select: {
        id: true, businessName: true, contactName: true, contactPhone: true,
        contactEmail: true, totalAmount: true, abandonedAt: true, createdAt: true,
        wineItems: { select: { quantity: true } },
      },
      orderBy: { abandonedAt: 'desc' },
    }),
  ])

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--site-text)' }}>
        {adminT(locale, 'abandoned.pageTitle')}
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--site-muted)', maxWidth: '58ch' }}>
        {adminT(locale, 'abandoned.intro')}
      </p>

      <AbandonedClient
        locale={locale}
        bookings={bookings.map(o => ({
          id: o.id,
          who: `${o.name} ${o.surname}`.trim(),
          companyName: o.company?.name ?? null,
          contact: o.email || o.phone || null,
          detail: `${o.date.toLocaleDateString('en-GB')} · ${o.timeSlot} · ${o.guestCount}`,
          total: o.totalPrice,
          abandonedAt: o.abandonedAt ?? o.createdAt,
        }))}
        wineOrders={wineOrders.map(o => ({
          id: o.id,
          who: o.businessName,
          companyName: null,
          contact: o.contactEmail || o.contactPhone || null,
          detail: `${o.contactName} · ${o.wineItems.reduce((s, i) => s + i.quantity, 0)}`,
          total: o.totalAmount,
          abandonedAt: o.abandonedAt ?? o.createdAt,
        }))}
      />
    </div>
  )
}
