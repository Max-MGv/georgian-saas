import WineCatalogueClient from './WineCatalogueClient'

export const metadata = {
  title: 'Order Wine — Nikalas Marani',
  description: 'Order wine from Nikalas Marani winery. Saperavi, Rkatsiteli, Mtsvane, Chacha and more.',
}

export default function WinesPage() {
  return <WineCatalogueClient />
}
