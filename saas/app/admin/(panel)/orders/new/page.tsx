import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import { orderRolesFor } from '@/lib/contactResolution'
import NewOrderForm from './NewOrderForm'

const C = { wine: 'var(--color-brand)', faint: 'var(--site-secondary)' }

export default async function NewOrderPage() {
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const contactRoles = await orderRolesFor(tenantId, 'BOOKING')
  const [companies, menuItems, masterclassItems, tenantFlags, individuals] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({
      // Same list the public booking form offers: booking companies only. Without this the
      // dropdown also listed the internal "Individuals" price container and wine-only companies.
      where: { tenantId, isBookingCompany: true, isIndividual: false },
      include: { prices: true },
      orderBy: { name: 'asc' },
    })),
    withTenantDb(tenantId, tx => tx.menuItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    withTenantDb(tenantId, tx => tx.masterclassItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    // Read through `db` directly, like the public page does: Tenant has RLS enabled with no
    // policies, so withTenantDb would silently return null (MaintenanceNotes §27).
    db.tenant.findUnique({ where: { id: tenantId }, select: { enableCompanyNationalityBreakdown: true } }),
    // What an individual order is priced from (D-14) — the same row the public form reads.
    withTenantDb(tenantId, tx => tx.company.findFirst({ where: { tenantId, isIndividual: true }, include: { prices: true } })),
  ])
  const tier = (p: { id: string; minGuests: number; maxGuests: number; tastingOnlyPrice: number | null; lunchOnlyPrice: number | null; tastingLunchPrice: number | null }) => ({
    id: p.id,
    minGuests: p.minGuests,
    maxGuests: p.maxGuests,
    tastingOnlyPrice: p.tastingOnlyPrice,
    lunchOnlyPrice: p.lunchOnlyPrice,
    tastingLunchPrice: p.tastingLunchPrice,
  })

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-sm mb-5"
        style={{ color: C.wine }}
      >
        {adminT(locale, 'orderDetail.backToOrders')}
      </Link>

      <h1 className="text-lg font-bold mb-5" style={{ color: 'var(--site-text)' }}>
        {adminT(locale, 'newOrder.pageTitle')}
      </h1>

      <NewOrderForm
        locale={locale}
        contactRoles={contactRoles}
        nationalityEnabled={tenantFlags?.enableCompanyNationalityBreakdown ?? false}
        companies={companies.map(c => ({
          id: c.id,
          name: c.name,
          prices: c.prices.map(tier),
          registrationFee: c.registrationFee,
        }))}
        individualsPrices={(individuals?.prices ?? []).map(tier)}
        menuItems={menuItems.map(i => ({ id: i.id, name: i.name, type: i.type }))}
        masterclassItems={masterclassItems.map(i => ({
          id: i.id,
          name: i.name,
          unitType: i.unitType,
          pricePerUnit: i.pricePerUnit,
        }))}
      />
    </div>
  )
}
