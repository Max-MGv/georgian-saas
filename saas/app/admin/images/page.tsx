import { db } from '@/lib/db'
import ImageAssignClient from './ImageAssignClient'

const PRODUCT_IMAGES = [
  { path: '/images/products/george.png',  label: 'george' },
  { path: '/images/products/john.png',    label: 'john' },
  { path: '/images/products/uwawo.png',   label: 'uwawo' },
  { path: '/images/products/axoebi.png',  label: 'axoebi' },
  { path: '/images/products/wine5.png',   label: 'wine5' },
  { path: '/images/products/qisi.png',    label: 'qisi' },
]

export default async function ImagesPage() {
  const wines = await db.wine.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Wine Images</h1>
        <p className="text-sm mt-1" style={{ color: '#a89070' }}>Assign a photo to each wine listing.</p>
      </div>
      <ImageAssignClient wines={wines} images={PRODUCT_IMAGES} />
    </div>
  )
}
