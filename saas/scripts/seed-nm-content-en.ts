import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const db = new PrismaClient()

// Nikalas Marani — hardcoded on purpose: this script materializes NM's English
// content into its own SiteContent rows. The values are VERBATIM copies of the
// code fallbacks as of #125 (2026-07-18), because until then NM's EN site
// rendered entirely from those fallbacks and they are being neutralized.
// Do not "improve" the wording here — that would change the live site.
const TENANT_ID = 'cmqou94er0000vl1sl9v0yv54'

const rows = [
  // Home
  { key: 'home_hero_subtitle',    section: 'home',    label: 'Hero subtitle',            locale: 'en', value: 'Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle.' },
  { key: 'home_location_eyebrow', section: 'home',    label: 'Location eyebrow',         locale: 'en', value: 'Kakheti, Georgia' },
  // KA site also shows this English fallback today (no ka row exists) — preserved verbatim
  { key: 'home_location_eyebrow', section: 'home',    label: 'Location eyebrow',         locale: 'ka', value: 'Kakheti, Georgia' },
  { key: 'home_package1_desc',    section: 'home',    label: 'Wine Tasting description', locale: 'en', value: '2 red wines, 1 white, chacha — guided by the winemaker' },
  { key: 'home_package2_desc',    section: 'home',    label: 'Tasting + Lunch description', locale: 'en', value: '3 wines, chacha brandy, and a full traditional Georgian meal' },

  // About
  { key: 'about_story_p1',      section: 'about', label: 'Story paragraph 1', locale: 'en', value: 'A family winery producing traditional Georgian wine.' },
  { key: 'about_story_p2',      section: 'about', label: 'Story paragraph 2', locale: 'en', value: 'For generations, our family has grown Rkatsiteli and Saperavi grapes on the same land, using traditional Kakhetian methods passed down through the years. Our wines are made with minimal intervention — the grapes, the sun, and the clay vessels do most of the work.' },
  { key: 'about_story_p3',      section: 'about', label: 'Story paragraph 3', locale: 'en', value: 'We welcome visitors to experience Georgian wine culture firsthand — at the table, with food, conversation, and the winemaker.' },
  { key: 'about_expect1_label', section: 'about', label: 'Card label',        locale: 'en', value: 'Wine Tasting' },
  { key: 'about_expect1_text',  section: 'about', label: 'Card text',         locale: 'en', value: 'Guided tasting of 2–3 house wines and chacha, explained by the winemaker himself.' },
  { key: 'about_expect2_label', section: 'about', label: 'Card label',        locale: 'en', value: 'Traditional Meal' },
  { key: 'about_expect2_text',  section: 'about', label: 'Card text',         locale: 'en', value: 'Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani, fresh bread from the oven.' },
  { key: 'about_expect3_label', section: 'about', label: 'Card label',        locale: 'en', value: 'Vineyard Walk' },
  { key: 'about_expect3_text',  section: 'about', label: 'Card text',         locale: 'en', value: 'A short walk through the vineyard and a look at our qvevri (clay vessel) cellar.' },

  // Contact — bonus fix: NM's EN contact page showed empty values (only ka rows
  // existed and the fallback is ''). Values match NM's admin Settings.
  { key: 'contact_phone',   section: 'contact', label: 'Phone',   locale: 'en', value: '+995 599 96 33 17' },
  { key: 'contact_email',   section: 'contact', label: 'Email',   locale: 'en', value: 'nikalasmarani@gmail.com' },
  { key: 'contact_address', section: 'contact', label: 'Address', locale: 'en', value: 'Kardanakhi, Gurjaani' },
]

async function main() {
  for (const row of rows) {
    const existing = await db.siteContent.findUnique({
      where: { key_locale_tenantId: { key: row.key, locale: row.locale, tenantId: TENANT_ID } },
    })
    if (existing) {
      console.log(`- ${row.key} (${row.locale}) already exists — left untouched`)
      continue
    }
    await db.siteContent.create({ data: { ...row, tenantId: TENANT_ID } })
    console.log(`✓ ${row.key} (${row.locale})`)
  }
  console.log(`\nDone.`)
}

main().then(() => db.$disconnect()).catch(e => { console.error(e); process.exit(1) })
