import { getWinesWithVintages } from '@/app/actions/wines'
import { requireWineOrdersModule } from '@/lib/requireModule'
import { getTenantId } from '@/lib/tenant'
import { createServiceClient } from '@/lib/supabase/service'
import { getSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
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
  const [tenantId, adminLanguage] = await Promise.all([getTenantId(), getSetting('admin_language')])
  const locale = adminLanguage || 'en'
  const [wines, uploadedImages] = await Promise.all([
    getWinesWithVintages(),
    listUploadedWineImages(tenantId),
  ])
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1c1008' }}>{adminT(locale, 'wines.pageTitle')}</h1>
          <p className="text-sm mt-1" style={{ color: '#a89070' }}>
            {wines.length} {wines.length !== 1 ? adminT(locale, 'wines.count.plural') : adminT(locale, 'wines.count.singular')} {adminT(locale, 'wines.inCatalogue')}
          </p>
        </div>
      </div>
      <WinesClient wines={wines} uploadedImages={uploadedImages} locale={locale} />
    </div>
  )
}
