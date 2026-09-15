import { withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import Link from 'next/link'
import NewWineOrderForm from './NewWineOrderForm'

const C = { wine: 'var(--color-brand)' }

export default async function NewWineOrderPage() {
  await requireWineOrdersModule()
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'

  const [companies, wines] = await withTenantDb(tenantId, tx => Promise.all([
    tx.company.findMany({
      where: { tenantId },
      select: { id: true, name: true, wineDiscountPercent: true, contactName: true, contactPhone: true, address: true, identificationCode: true },
      orderBy: { name: 'asc' },
    }),
    tx.wine.findMany({
      where: { tenantId, active: true },
      include: { vintages: { where: { active: true }, orderBy: { year: 'desc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ]))

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/wine-orders"
        className="inline-flex items-center gap-1 text-sm mb-5"
        style={{ color: C.wine }}
      >
        {adminT(locale, 'newWineOrder.backToWineOrders')}
      </Link>

      <h1 className="text-lg font-bold mb-5" style={{ color: 'var(--site-text)' }}>
        {adminT(locale, 'newWineOrder.pageTitle')}
      </h1>

      <NewWineOrderForm
        locale={locale}
        companies={companies}
        wines={wines
          .filter(w => w.vintages.length > 0)
          .map(w => ({
            id: w.id,
            name: w.name,
            vintages: w.vintages.map(v => ({ id: v.id, year: v.year, price: v.price })),
          }))}
      />
    </div>
  )
}
