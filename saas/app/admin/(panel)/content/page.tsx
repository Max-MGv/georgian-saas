import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getSetting } from '@/app/actions/settings'
import { createServiceClient } from '@/lib/supabase/service'
import ContentClient from './ContentClient'

const BG_KEYS = [
  'home_hero_bg_path',    'home_hero_bg_x',    'home_hero_bg_y',    'home_hero_bg_zoom',
  'about_hero_bg_path',   'about_hero_bg_x',   'about_hero_bg_y',   'about_hero_bg_zoom',
  'contact_hero_bg_path', 'contact_hero_bg_x', 'contact_hero_bg_y', 'contact_hero_bg_zoom',
  'home_hero_bg_mobile_path',    'home_hero_bg_mobile_x',    'home_hero_bg_mobile_y',    'home_hero_bg_mobile_zoom',
  'about_hero_bg_mobile_path',   'about_hero_bg_mobile_x',   'about_hero_bg_mobile_y',   'about_hero_bg_mobile_zoom',
  'contact_hero_bg_mobile_path', 'contact_hero_bg_mobile_x', 'contact_hero_bg_mobile_y', 'contact_hero_bg_mobile_zoom',
]

async function listUploadedImages(tenantId: string): Promise<string[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.storage.from('backgrounds').list(tenantId, { limit: 100 })
    if (!data) return []
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/backgrounds`
    return data
      .filter(f => f.name && !f.name.startsWith('.'))
      .map(f => `${base}/${tenantId}/${f.name}`)
  } catch {
    return []
  }
}

export default async function ContentPage() {
  const tenantId = await getTenantId()
  const [allRows, bgRows, uploadedImages, adminLanguage] = await Promise.all([
    withTenantDb(tenantId, tx => tx.siteContent.findMany({ where: { tenantId } })),
    withTenantDb(tenantId, tx => tx.setting.findMany({ where: { tenantId, key: { in: BG_KEYS } } })),
    listUploadedImages(tenantId),
    getSetting('admin_language'),
  ])

  const en = allRows.filter(r => r.locale === 'en')
  const ka = allRows.filter(r => r.locale === 'ka')
  const bgSettings = Object.fromEntries(bgRows.map(r => [r.key, r.value]))
  const adminLocale = adminLanguage || 'en'

  return <ContentClient rows={{ en, ka }} bgSettings={bgSettings} uploadedImages={uploadedImages} adminLocale={adminLocale} />
}
