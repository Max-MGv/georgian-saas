import { withTenantDb } from '@/lib/db'
import { asTetri } from '@/lib/money'
import { getTenantId } from '@/lib/tenant'
import { headers } from 'next/headers'
import { ensureIndividualsCompany } from '@/app/actions/companies'
import { getSetting } from '@/app/actions/settings'
import { listContactRoles } from '@/app/actions/contactRoles'
import { adminT } from '@/lib/adminT'
import CompaniesClient from './CompaniesClient'

export default async function CompaniesPage() {
  const [tenantId, h, adminLanguage, personCodesEnabled, allRoles] = await Promise.all([
    getTenantId(), headers(), getSetting('admin_language'),
    getSetting('person_codes_enabled'), listContactRoles(),
  ])
  const personCodesOn = personCodesEnabled === 'true'
  const locale = adminLanguage || 'en'
  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  // Gates the per-company payment override (#148) — same source PaymentSetupBanner
  // and shouldTakePayment() use. A tenant without the module never sees the control.
  const paymentModuleOn = h.get('x-tenant-modules-online-payment') === 'true'
  await ensureIndividualsCompany(tenantId)

  const companies = await withTenantDb(tenantId, tx =>
    tx.company.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { orders: true } },
        prices: { orderBy: { minGuests: 'asc' } },
        // Only the columns the client actually renders. `code` is included solely so the
        // per-row code control can show it, and only when the tenant has person codes on —
        // see the projection below, which drops it otherwise (H17: F3 and F4 were both
        // over-broad projections into a client component).
        people: {
          orderBy: [{ roleId: 'asc' }, { name: 'asc' }],
          select: { id: true, roleId: true, name: true, phone: true, email: true, code: true, isActive: true },
        },
      },
    })
  )

  const tourOperators = companies.filter(c => !c.isIndividual)
  const bookingCount = tourOperators.filter(c => c.isBookingCompany ?? true).length
  const wineCount = tourOperators.filter(c => c.isWineOrderCompany ?? false).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{adminT(locale, 'nav.companies')}</h1>
        <span className="text-sm" style={{ color: 'var(--site-secondary)' }}>
          {bookingCount} {adminT(locale, 'companies.summary.booking')} · {wineCount} {adminT(locale, 'companies.summary.wineOrders')}
        </span>
      </div>
      <CompaniesClient
        roles={allRoles
          .filter(r => r.isActive && r.scope === 'PER_ORDER')
          .map(r => ({ id: r.id, key: r.key, labelEn: r.labelEn, labelKa: r.labelKa, sortOrder: r.sortOrder }))}
        personCodesOn={personCodesOn}
        bookingOn={bookingOn}
        wineOrdersOn={wineOrdersOn}
        paymentModuleOn={paymentModuleOn}
        locale={locale}
        companies={companies.map(c => ({
          id: c.id,
          name: c.name,
          isIndividual: c.isIndividual,
          isBookingCompany: c.isBookingCompany ?? true,
          isWineOrderCompany: c.isWineOrderCompany ?? false,
          wineDiscountPercent: c.wineDiscountPercent,
          skipPayment: c.skipPayment,
          identificationCode: c.identificationCode,
          address: c.address,
          accessCode: c.accessCode,
          orderCount: c._count.orders,
          // Prisma hands these back as plain numbers; re-brand at the boundary
          // so the client's Price type keeps its Tetri guarantee (chunk 3).
          prices: c.prices.map(pr => ({
            ...pr,
            pricePerPerson: asTetri(pr.pricePerPerson),
            tastingLunchPricePerPerson: asTetri(pr.tastingLunchPricePerPerson),
            registrationPrice: asTetri(pr.registrationPrice),
          })),
          // Inactive people are hidden from the panel; deactivating is how a person is
          // retired without erasing them from past orders.
          people: c.people
            .filter(p => p.isActive)
            .map(p => ({
              id: p.id,
              roleId: p.roleId,
              name: p.name,
              phone: p.phone,
              email: p.email,
              // Never ship a credential the UI will not render.
              code: personCodesOn ? p.code : null,
            })),
        }))}
      />
    </div>
  )
}
