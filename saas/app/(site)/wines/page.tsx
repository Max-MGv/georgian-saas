import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { wineDisplayName } from '@/lib/wineName'
import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { type Metadata } from 'next'
import WineCatalogueClient from './WineCatalogueClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const displayName = h.get('x-tenant-name') ?? 'Your Winery'
  return {
    title: `Order Wine — ${displayName}`,
    description: `Order wine from ${displayName} winery. Saperavi, Rkatsiteli, Mtsvane, Chacha and more.`,
  }
}

export default async function WinesPage() {
  const [tenantId, h, cookieStore, defaultLocale] = await Promise.all([
    getTenantId(), headers(), cookies(), getSetting('default_locale'),
  ])
  if (h.get('x-tenant-modules-wine-orders') !== 'true') redirect('/')
  const locale = cookieStore.get('site_locale')?.value ?? defaultLocale ?? 'en'
  const logoUrl = h.get('x-tenant-logo')
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const tenantName = h.get('x-tenant-name') ?? ''
  const [wineProducts, companies, hideCompanyDropdownStr] = await Promise.all([
    withTenantDb(tenantId, tx => tx.wine.findMany({
      where: { active: true, tenantId },
      orderBy: { sortOrder: 'asc' },
      include: { vintages: { where: { active: true }, orderBy: { year: 'desc' } } },
    })),
    withTenantDb(tenantId, tx => tx.company.findMany({
      where: { tenantId, isIndividual: false, isWineOrderCompany: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, identificationCode: true, contactName: true, contactPhone: true, address: true, accessCode: true, wineDiscountPercent: true },
    })),
    getSetting('hide_company_dropdown'),
  ])
  const wines = wineProducts.flatMap(wine => wine.vintages.map(v => ({
    vintageId: v.id,
    wineId: wine.id,
    name: wineDisplayName(wine, locale),
    wineType: wine.wineType,
    sweetness: wine.sweetness,
    sparkling: wine.sparkling,
    alcoholLevel: wine.alcoholLevel,
    description: wine.description,
    year: v.year,
    price: v.price,
    color: wine.color,
    imagePath: v.imagePath ?? wine.imagePath,
  })))
  return (
    <WineCatalogueClient
      wines={wines}
      companies={companies}
      logoUrl={logoUrl}
      logoAlt={logoAlt}
      tenantName={tenantName}
      hideCompanyDropdown={hideCompanyDropdownStr === 'true'}
      locale={locale}
    />
  )
}
