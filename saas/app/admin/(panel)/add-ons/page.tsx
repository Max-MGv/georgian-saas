import { withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireBookingModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import AddOnsClient from './AddOnsClient'

export default async function AddOnsPage() {
  await requireBookingModule()
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const { groups, ungrouped, wineCount } = await withTenantDb(tenantId, async tx => {
    const groups = await tx.addOnGroup.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
    })
    // Items with no group are only possible between the T-7 migration and the release of the code that always
    // sets one (the old onboarding / admin code on a shared database). They are shown so they can be moved.
    const ungrouped = await tx.masterclassItem.findMany({
      where: { tenantId, groupId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    // The "Wine for the table" group has no items: its contents are the wines switched on for bookings (Admin → Wines).
    const wineCount = await tx.wineVintage.count({ where: { tenantId, bookable: true, active: true, wine: { active: true } } })
    return { groups, ungrouped, wineCount }
  })
  const itemCount = groups.reduce((n, g) => n + g.items.length, 0) + ungrouped.length

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{adminT(locale, 'nav.addons')}</h1>
        <span className="text-sm" style={{ color: 'var(--site-secondary)' }}>
          {itemCount} {itemCount !== 1 ? adminT(locale, 'menuItems.item.plural') : adminT(locale, 'menuItems.item.singular')}
        </span>
      </div>
      <AddOnsClient
        locale={locale}
        wineCount={wineCount}
        groups={groups.map(g => ({
          id: g.id, kind: g.kind, nameEn: g.nameEn, nameKa: g.nameKa, showToCompanies: g.showToCompanies,
          showToIndividuals: g.showToIndividuals, visitTypes: g.visitTypes, active: g.active, sortOrder: g.sortOrder,
          items: g.items.map(i => ({ id: i.id, name: i.name, nameKa: i.nameKa, unitType: i.unitType, pricePerUnit: i.pricePerUnit, active: i.active, sortOrder: i.sortOrder })),
        }))}
        ungrouped={ungrouped.map(i => ({ id: i.id, name: i.name, nameKa: i.nameKa, unitType: i.unitType, pricePerUnit: i.pricePerUnit, active: i.active, sortOrder: i.sortOrder }))}
      />
    </div>
  )
}
