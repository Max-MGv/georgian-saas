import { db } from '@/lib/db'
import WineCatalogueClient from './WineCatalogueClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Order Wine — Nikalas Marani',
  description: 'Order wine from Nikalas Marani winery. Saperavi, Rkatsiteli, Mtsvane, Chacha and more.',
}

export default async function WinesPage() {
  const wines = await db.wine.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  })
  return <WineCatalogueClient wines={wines} />
}
