import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import WineCatalogueClient from './WineCatalogueClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Order Wine — Nikalas Marani',
  description: 'Order wine from Nikalas Marani winery. Saperavi, Rkatsiteli, Mtsvane, Chacha and more.',
}

export default async function WinesPage() {
  const tenantId = await getTenantId()
  const [wines, companies] = await Promise.all([
    withTenantDb(tenantId, tx => tx.wine.findMany({
      where: { active: true, tenantId },
      orderBy: { sortOrder: 'asc' },
    })),
    withTenantDb(tenantId, tx => tx.company.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, identificationCode: true, contactName: true, contactPhone: true, address: true, accessCode: true },
    })),
  ])
  return <WineCatalogueClient wines={wines} companies={companies} />
}
