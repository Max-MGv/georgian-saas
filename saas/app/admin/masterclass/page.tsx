import { db } from '@/lib/db'
import MasterclassClient from './MasterclassClient'

export default async function MasterclassPage() {
  const items = await db.masterclassItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Masterclass</h1>
        <span className="text-sm" style={{ color: '#a89070' }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <MasterclassClient items={items} />
    </div>
  )
}
