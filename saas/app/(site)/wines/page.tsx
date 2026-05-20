import WineCatalogueClient from './WineCatalogueClient'

export const metadata = {
  title: 'ღვინის კატალოგი — Nikalas Marani',
  description: 'შეუკვეთეთ ნიკალას მარანის ღვინო. საფერავი, რქაწითელი, მწვანე და ჭაჭა.',
}

export default function WinesPage() {
  return <WineCatalogueClient />
}
