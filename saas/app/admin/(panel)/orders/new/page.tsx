import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import { orderRolesFor } from '@/lib/contactResolution'
import { localName } from '@/lib/addOns'
import NewOrderForm from './NewOrderForm'

const C = { wine: 'var(--color-brand)', faint: 'var(--site-secondary)' }

export default async function NewOrderPage() {
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const contactRoles = await orderRolesFor(tenantId, 'BOOKING')
  // Wine for the table (T-22): only when the wine module is on.
  const wineOn = (await headers()).get('x-tenant-modules-wine-orders') === 'true'
  const [companies, menuItems, masterclassItems, tenantFlags, individuals, bookableWines] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({
      // Same list the public booking form offers: booking companies only. Without this the
      // dropdown also listed the internal "Individuals" price container and wine-only companies.
      where: { tenantId, isBookingCompany: true, isIndividual: false },
      include: { prices: true, winePrices: true },
      orderBy: { name: 'asc' },
    })),
    withTenantDb(tenantId, tx => tx.menuItem.findMany({ where: { active: true, tenantId }, orderBy: { sortOrder: 'asc' } })),
    withTenantDb(tenantId, tx => tx.masterclassItem.findMany({
      where: { active: true, tenantId },
      orderBy: [{ group: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { group: { select: { nameEn: true, nameKa: true } } },
    })),
    // Read through `db` directly, like the public page does: Tenant has RLS enabled with no
    // policies, so withTenantDb would silently return null (MaintenanceNotes §27).
    db.tenant.findUnique({ where: { id: tenantId }, select: { enableCompanyNationalityBreakdown: true } }),
    // What an individual order is priced from (D-14) — the same row the public form reads.
    withTenantDb(tenantId, tx => tx.company.findFirst({ where: { tenantId, isIndividual: true }, include: { prices: true } })),
    wineOn
      ? withTenantDb(tenantId, tx => tx.wineVintage.findMany({
          where: { tenantId, bookable: true, active: true, wine: { active: true } },
          orderBy: [{ wine: { sortOrder: 'asc' } }, { year: 'desc' }],
          select: { id: true, year: true, price: true, wine: { select: { name: true, nameKa: true } } },
        }))
      : Promise.resolve([]),
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
          // Its own wine terms price the wine added to its bookings (T-22). An admin screen: the company is the admin's choice.
          wineTerms: { discountPercent: c.wineDiscountPercent, prices: Object.fromEntries(c.winePrices.map(p => [p.wineVintageId, p.price])) },
        }))}
        wineOptions={bookableWines.map(v => ({ vintageId: v.id, name: localName(v.wine.name, v.wine.nameKa, locale), year: v.year, price: v.price }))}
        individualsPrices={(individuals?.prices ?? []).map(tier)}
        menuItems={menuItems.map(i => ({ id: i.id, name: i.name, type: i.type }))}
        masterclassItems={masterclassItems.map(i => ({
          id: i.id,
          name: localName(i.name, i.nameKa, locale),
          unitType: i.unitType,
          pricePerUnit: i.pricePerUnit,
          groupName: i.group ? localName(i.group.nameEn, i.group.nameKa, locale) : null,
        }))}
      />
    </div>
  )
}
