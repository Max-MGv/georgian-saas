import { db } from '@/lib/db'
import ContentClient from './ContentClient'

const BG_KEYS = [
  'home_hero_bg_path',    'home_hero_bg_x',    'home_hero_bg_y',    'home_hero_bg_zoom',
  'about_hero_bg_path',   'about_hero_bg_x',   'about_hero_bg_y',   'about_hero_bg_zoom',
  'contact_hero_bg_path', 'contact_hero_bg_x', 'contact_hero_bg_y', 'contact_hero_bg_zoom',
  'home_hero_bg_mobile_path',    'home_hero_bg_mobile_x',    'home_hero_bg_mobile_y',    'home_hero_bg_mobile_zoom',
  'about_hero_bg_mobile_path',   'about_hero_bg_mobile_x',   'about_hero_bg_mobile_y',   'about_hero_bg_mobile_zoom',
  'contact_hero_bg_mobile_path', 'contact_hero_bg_mobile_x', 'contact_hero_bg_mobile_y', 'contact_hero_bg_mobile_zoom',
]

export default async function ContentPage() {
  const [allRows, bgRows] = await Promise.all([
    db.siteContent.findMany(),
    db.setting.findMany({ where: { key: { in: BG_KEYS } } }),
  ])

  const en = allRows.filter(r => r.locale === 'en')
  const ka = allRows.filter(r => r.locale === 'ka')
  const bgSettings = Object.fromEntries(bgRows.map(r => [r.key, r.value]))

  return <ContentClient rows={{ en, ka }} bgSettings={bgSettings} />
}
