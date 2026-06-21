import { db } from '@/lib/db'
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

async function listUploadedImages(): Promise<string[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.storage.from('backgrounds').list('', { limit: 100 })
    if (!data) return []
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/backgrounds`
    return data
      .filter(f => f.name && !f.name.startsWith('.'))
      .map(f => `${base}/${f.name}`)
  } catch {
    return []
  }
}

export default async function ContentPage() {
  const [allRows, bgRows, uploadedImages] = await Promise.all([
    db.siteContent.findMany(),
    db.setting.findMany({ where: { key: { in: BG_KEYS } } }),
    listUploadedImages(),
  ])

  const en = allRows.filter(r => r.locale === 'en')
  const ka = allRows.filter(r => r.locale === 'ka')
  const bgSettings = Object.fromEntries(bgRows.map(r => [r.key, r.value]))

  return <ContentClient rows={{ en, ka }} bgSettings={bgSettings} uploadedImages={uploadedImages} />
}
