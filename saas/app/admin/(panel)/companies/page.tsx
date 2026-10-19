import { withTenantDb } from '@/lib/db'
import { asTetri } from '@/lib/money'
import { getTenantId } from '@/lib/tenant'
import { headers } from 'next/headers'
import { ensureIndividualsCompany } from '@/app/actions/companies'
import { getSetting } from '@/app/actions/settings'
import { listContactRoles } from '@/app/actions/contactRoles'
import { adminT } from '@/lib/adminT'
import CompaniesClient from './CompaniesClient'

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const [tenantId, h, adminLanguage, personCodesEnabled, allRoles, { edit }] = await Promise.all([
    getTenantId(), headers(), getSetting('admin_language'),
    getSetting('person_codes_enabled'), listContactRoles(), searchParams,
  ])
  const personCodesOn = personCodesEnabled === 'true'
  const locale = adminLanguage || 'en'
  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  // Gates the per-company payment override (#148) — same source PaymentSetupBanner
  // and shouldTakePayment() use. A tenant without the module never sees the control.
  const paymentModuleOn = h.get('x-tenant-modules-online-payment') === 'true'
  // The three reads below are independent database round trips, so they run at the same time
  // (each one costs ~0.7s from a dev machine; one after another they added up — Chunk 11).
  // Delivery zones (T-8) for each address's zone dropdown. Only when the module is on.
  const zonesP = wineOrdersOn
    ? withTenantDb(tenantId, tx => tx.deliveryZone.findMany({
        where: { tenantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, nameEn: true, nameKa: true },
      }))
    : Promise.resolve([])

  // Every active vintage with its standard price, for the per-company negotiated prices (T-12).
  const vintagesP = wineOrdersOn
    ? withTenantDb(tenantId, tx => tx.wineVintage.findMany({
        where: { tenantId, active: true, wine: { active: true } },
        orderBy: [{ wine: { sortOrder: 'asc' } }, { year: 'desc' }],
        select: { id: true, year: true, price: true, wine: { select: { name: true } } },
      })).then(vs => vs.map(v => ({ id: v.id, label: `${v.wine.name} ${v.year}`, price: v.price })))
    : Promise.resolve([])

  // The Individuals company must exist before the list is read.
  const companiesP = ensureIndividualsCompany(tenantId).then(() => withTenantDb(tenantId, tx =>
    tx.company.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { orders: true, wineOrders: true } },
        prices: { orderBy: { minGuests: 'asc' } },
        // Only the columns the client actually renders. `code` is included solely so the
        // per-row code control can show it, and only when the tenant has person codes on —
        // see the projection below, which drops it otherwise (H17: F3 and F4 were both
        // over-broad projections into a client component).
        people: {
          orderBy: [{ roleId: 'asc' }, { name: 'asc' }],
          select: { id: true, roleId: true, name: true, phone: true, email: true, code: true, isActive: true },
        },
        // Delivery addresses (T-13). Inactive ones are hidden, the same as people above.
        addresses: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, label: true, address: true, workingHours: true, deliveryZoneId: true },
        },
        // Negotiated prices (T-12) — exceptions only.
        winePrices: { select: { wineVintageId: true, price: true } },
      },
    })
  ))

  const [zones, vintages, companies] = await Promise.all([zonesP, vintagesP, companiesP])

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
        zones={zones}
        vintages={vintages}
        roles={allRoles
          .filter(r => r.isActive && r.scope === 'PER_ORDER')
          .map(r => ({ id: r.id, key: r.key, labelEn: r.labelEn, labelKa: r.labelKa, sortOrder: r.sortOrder }))}
        personCodesOn={personCodesOn}
        bookingOn={bookingOn}
        wineOrdersOn={wineOrdersOn}
        paymentModuleOn={paymentModuleOn}
        locale={locale}
        initialEditId={edit ?? null}
        companies={companies.map(c => ({
          id: c.id,
          name: c.name,
          isIndividual: c.isIndividual,
          isBookingCompany: c.isBookingCompany ?? true,
          isWineOrderCompany: c.isWineOrderCompany ?? false,
          wineDiscountPercent: c.wineDiscountPercent,
          isExporter: c.isExporter,
          winePrices: Object.fromEntries(c.winePrices.map(p => [p.wineVintageId, p.price])),
          skipPayment: c.skipPayment,
          identificationCode: c.identificationCode,
          addresses: c.addresses,
          accessCode: c.accessCode,
          orderCount: c._count.orders,
          // The Wine Orders tab counts wine orders, not bookings (QA 2026-10-16 F12).
          wineOrderCount: c._count.wineOrders,
          // Prisma hands these back as plain numbers; re-brand at the boundary
          // so the client's Price type keeps its Tetri guarantee (chunk 3).
          prices: c.prices.map(pr => ({
            id: pr.id, minGuests: pr.minGuests, maxGuests: pr.maxGuests, isDisplayPrice: pr.isDisplayPrice,
            tastingOnlyPrice: pr.tastingOnlyPrice == null ? null : asTetri(pr.tastingOnlyPrice),
            lunchOnlyPrice: pr.lunchOnlyPrice == null ? null : asTetri(pr.lunchOnlyPrice),
            tastingLunchPrice: pr.tastingLunchPrice == null ? null : asTetri(pr.tastingLunchPrice),
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
