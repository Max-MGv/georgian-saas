import { db } from '@/lib/db'
import WinesClient from './WinesClient'

export default async function AdminWinesPage() {
  const wines = await db.wine.findMany({ orderBy: { sortOrder: 'asc' } })
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Wine Listings</h1>
          <p className="text-sm mt-1" style={{ color: '#a89070' }}>{wines.length} wine{wines.length !== 1 ? 's' : ''} in catalogue</p>
        </div>
      </div>
      <WinesClient wines={wines} />
    </div>
  )
}
