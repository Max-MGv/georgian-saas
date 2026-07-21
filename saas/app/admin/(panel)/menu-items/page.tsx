import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireBookingModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import MenuItemsClient from './MenuItemsClient'

export default async function MenuItemsPage() {
  await requireBookingModule()
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const items = await withTenantDb(tenantId, tx =>
    tx.menuItem.findMany({
      where: { tenantId },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })
  )

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>{adminT(locale, 'nav.menuItems')}</h1>
        <span className="text-sm" style={{ color: '#a89070' }}>
          {items.length} {items.length !== 1 ? adminT(locale, 'menuItems.item.plural') : adminT(locale, 'menuItems.item.singular')}
        </span>
      </div>
      <MenuItemsClient items={items} locale={locale} />
    </div>
  )
}
