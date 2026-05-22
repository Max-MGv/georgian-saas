import { getSetting } from '@/app/actions/settings'
import ImageAssignClient from './ImageAssignClient'

const WINES = [
  { id: 'saperavi_2022',         name: 'Saperavi 2022' },
  { id: 'rkatsiteli_2023',       name: 'Rkatsiteli 2023' },
  { id: 'rkatsiteli_amber_2022', name: 'Rkatsiteli Amber 2022' },
  { id: 'mtsvane_2023',          name: 'Mtsvane 2023' },
  { id: 'rose_2023',             name: 'Rosé 2023' },
  { id: 'chacha',                name: 'Chacha' },
]

const PRODUCT_IMAGES = [
  { path: '/images/products/george.png',  label: 'george' },
  { path: '/images/products/john.png',    label: 'john' },
  { path: '/images/products/uwawo.png',   label: 'uwawo' },
  { path: '/images/products/axoebi.png',  label: 'axoebi' },
  { path: '/images/products/wine5.png',   label: 'wine5' },
  { path: '/images/products/qisi.png',    label: 'qisi' },
]

export default async function ImagesPage() {
  const raw = await getSetting('wine_images')
  const mapping: Record<string, string> = JSON.parse(raw || '{}')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Wine Images</h1>
        <p className="text-sm mt-1" style={{ color: '#a89070' }}>Assign a photo to each wine listing.</p>
      </div>
      <ImageAssignClient wines={WINES} images={PRODUCT_IMAGES} initialMapping={mapping} />
    </div>
  )
}
