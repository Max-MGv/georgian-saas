import { headers } from 'next/headers'
import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { getPaymentCredentials } from '@/app/actions/paymentCredentials'
import { getOnboardingStatus } from '@/app/actions/onboarding'
import { ensureIndividualsCompany } from '@/app/actions/companies'
import { adminT } from '@/lib/adminT'
import OnboardingWizard, { type OnboardingData } from './OnboardingWizard'

const C = { faint: '#a89070', border: '#e0d4c0', bg: '#fff9f3', text: '#1c1008' }

export default async function OnboardingPage() {
  const [tenantId, h, adminLanguage] = await Promise.all([
    getTenantId(),
    headers(),
    getSetting('admin_language'),
  ])
  const locale = adminLanguage || 'en'
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)

  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  const onlinePaymentModuleOn = h.get('x-tenant-modules-online-payment') === 'true'
  const tenantName = h.get('x-tenant-name') ?? ''
  const logoUrl = h.get('x-tenant-logo') ?? null
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''

  // The wizard's Individuals-pricing section attaches to this row, same one
  // the real Companies page's "Public pricing" card edits — must exist before
  // the form can save anything against it, same precondition companies/page.tsx
  // already relies on.
  const individualsCompany = await ensureIndividualsCompany(tenantId)

  const [
    status, companies, individualsPrices, tenant, wines,
    enhancedBookingSetting, menuItems, masterclassItems,
    recipientName, personalNumber, bankName, bankCode, iban, onlinePayment,
    contactPhone, contactEmail, contactAddress, mapsEmbedUrl, heroBgPath,
  ] = await Promise.all([
    getOnboardingStatus(),
    withTenantDb(tenantId, tx =>
      tx.company.findMany({
        where: { tenantId, isIndividual: false },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          accessCode: true,
          prices: { select: { pricePerPerson: true } },
          contactName: true,
          contactPhone: true,
          contactEmail: true,
          address: true,
          identificationCode: true,
        },
      })
    ),
    withTenantDb(tenantId, tx =>
      tx.price.findMany({
        where: { company: { tenantId, isIndividual: true } },
        select: { pricePerPerson: true },
      })
    ),
    db.tenant.findUnique({ where: { id: tenantId }, select: { wineDetailLevel: true } }),
    wineOrdersOn
      ? withTenantDb(tenantId, tx =>
          tx.wine.findMany({
            where: { tenantId },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, color: true, vintages: { orderBy: { year: 'desc' }, take: 1, select: { year: true, price: true } } },
          })
        )
      : Promise.resolve([]),
    getSetting('enable_enhanced_company_booking'),
    withTenantDb(tenantId, tx =>
      tx.menuItem.findMany({ where: { tenantId }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, type: true } })
    ),
    withTenantDb(tenantId, tx =>
      tx.masterclassItem.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, unitType: true, pricePerUnit: true } })
    ),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
    getSetting('payment_iban'),
    // Same guard as the real Settings page — a tenant without the module never
    // gets the lookup, and getPaymentCredentials returns secretKeySet, never
    // the secret itself.
    onlinePaymentModuleOn ? getPaymentCredentials() : Promise.resolve(null),
    getSetting('contact_phone'),
    getSetting('contact_email'),
    getSetting('contact_address'),
    getSetting('maps_embed_url'),
    getSetting('home_hero_bg_path'),
  ])

  const companiesForWizard = companies.map(c => ({
    id: c.id,
    name: c.name,
    accessCode: c.accessCode,
    prices: c.prices,
    contactInfoSet: Boolean(c.contactName || c.contactPhone || c.contactEmail || c.address || c.identificationCode),
  }))

  const winesForWizard = wines
    .filter(w => w.vintages.length > 0)
    .map(w => ({ id: w.id, name: w.name, color: w.color, year: w.vintages[0].year, price: w.vintages[0].price }))

  const menuItemsForWizard = menuItems.map(i => ({ id: i.id, name: i.name, type: i.type as 'VEGETABLE' | 'MEAT' }))
  const masterclassItemsForWizard = masterclassItems.map(i => ({ id: i.id, name: i.name, unitType: i.unitType, pricePerUnit: i.pricePerUnit }))

  const data: OnboardingData = {
    locale,
    status,
    tenantName,
    bookingOn,
    wineOrdersOn,
    enhancedBookingOn: enhancedBookingSetting === 'true',
    wineDetailLevel: tenant?.wineDetailLevel ?? 'VINTAGE',
    companies: companiesForWizard,
    individualsCompanyId: individualsCompany.id,
    individualsPrices,
    wines: winesForWizard,
    menuItems: menuItemsForWizard,
    masterclassItems: masterclassItemsForWizard,
    payment: {
      recipientName: recipientName ?? '',
      personalNumber: personalNumber ?? '',
      bankName: bankName ?? '',
      bankCode: bankCode ?? '',
      iban: iban ?? '',
    },
    onlinePaymentModuleOn,
    onlinePayment: onlinePayment ? { merchantId: onlinePayment.merchantId, secretKeySet: onlinePayment.secretKeySet } : null,
    contact: {
      phone: contactPhone ?? '',
      email: contactEmail ?? '',
      address: contactAddress ?? '',
    },
    mapsEmbedUrl: mapsEmbedUrl ?? '',
    logoUrl,
    logoAlt,
    heroBgPath: heroBgPath || null,
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0ebe3' }}>
      <header className="border-b" style={{ backgroundColor: C.bg, borderColor: C.border }}>
        <div className="px-4 py-3 flex items-center justify-between gap-4 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={logoAlt} style={{ height: '28px', width: 'auto' }} />
            ) : (
              <span className="font-serif text-base font-semibold tracking-wide" style={{ color: 'var(--color-brand)' }}>
                {tenantName}
              </span>
            )}
          </div>
          <a href="/admin/companies" className="text-sm" style={{ color: C.faint }}>
            {at('onboarding.header.back')}
          </a>
        </div>
      </header>

      <main className="px-6 py-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" style={{ color: C.text }}>{at('onboarding.header.title')}</h1>
        <p className="text-sm mb-8" style={{ color: '#6b5a47' }}>{at('onboarding.header.subtitle')}</p>

        <OnboardingWizard data={data} />
      </main>
    </div>
  )
}
