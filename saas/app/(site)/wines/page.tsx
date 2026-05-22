import { getSetting } from '@/app/actions/settings'
import WineCatalogueClient from './WineCatalogueClient'

export const metadata = {
  title: 'Order Wine — Nikalas Marani',
  description: 'Order wine from Nikalas Marani winery. Saperavi, Rkatsiteli, Mtsvane, Chacha and more.',
}

export default async function WinesPage() {
  const raw = await getSetting('wine_images')
  const wineImages: Record<string, string> = JSON.parse(raw || '{}')
  return <WineCatalogueClient wineImages={wineImages} />
}
