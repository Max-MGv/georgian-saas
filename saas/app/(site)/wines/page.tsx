import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { headers } from 'next/headers'
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
  const [tenantId, h] = await Promise.all([getTenantId(), headers()])
  const logoUrl = h.get('x-tenant-logo') ?? '/icons/logo-dark.svg'
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const [wines, companies, hideCompanyDropdownStr] = await Promise.all([
    withTenantDb(tenantId, tx => tx.wine.findMany({
      where: { active: true, tenantId },
      orderBy: { sortOrder: 'asc' },
    })),
    withTenantDb(tenantId, tx => tx.company.findMany({
      where: { tenantId, isIndividual: false, isWineOrderCompany: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, identificationCode: true, contactName: true, contactPhone: true, address: true, accessCode: true },
    })),
    getSetting('hide_company_dropdown'),
  ])
  return (
    <WineCatalogueClient
      wines={wines}
      companies={companies}
      logoUrl={logoUrl}
      logoAlt={logoAlt}
      hideCompanyDropdown={hideCompanyDropdownStr === 'true'}
    />
  )
}
