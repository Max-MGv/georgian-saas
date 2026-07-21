import { getWinesWithVintages } from '@/app/actions/wines'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getTenantId } from '@/lib/tenant'
import { createServiceClient } from '@/lib/supabase/service'
import WinesClient from './WinesClient'

async function listUploadedWineImages(tenantId: string): Promise<string[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.storage.from('wine-photos').list(tenantId, { limit: 200 })
    if (!data) return []
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wine-photos`
    return data
      .filter(f => f.name && !f.name.startsWith('.'))
      .map(f => `${base}/${tenantId}/${f.name}`)
  } catch {
    return []
  }
}

export default async function AdminWinesPage() {
  await requireWineOrdersModule()
  const tenantId = await getTenantId()
  const [wines, uploadedImages] = await Promise.all([
    getWinesWithVintages(),
    listUploadedWineImages(tenantId),
  ])
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>Wine Listings</h1>
          <p className="text-sm mt-1" style={{ color: '#a89070' }}>{wines.length} wine{wines.length !== 1 ? 's' : ''} in catalogue</p>
        </div>
      </div>
      <WinesClient wines={wines} uploadedImages={uploadedImages} />
    </div>
  )
}
