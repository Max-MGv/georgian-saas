/**
 * Scrubs Nikalas Marani's real identity out of the cloned "Vineworks Demo"
 * tenant (see clone-nm-to-demo.ts + [[Plan-DemoSite]]). Replaces logo, the
 * content/setting rows that carried NM's real name/email/social links/map
 * embed, and — found only by a broad identifier sweep, not a brand-name
 * search alone — the real phone number, address, and banking details
 * (IBAN/bank code), which don't appear on the public site but would be
 * exposed to anyone who reached the demo tenant's admin settings panel.
 * Structural data (wines, prices, menu items) is left as-is — only literal
 * identity strings are touched.
 *
 * Looks the tenant up by slug (`vineworks-demo`), not a hardcoded ID, so
 * this same script works unchanged whether TARGET_URL points at dev or
 * prod — run it again after the prod clone during the go-live cutover.
 *
 * Run: npx tsx scripts/rebrand-demo-tenant.ts
 * Env: TARGET_URL (dev, or prod once the demo tenant lives there)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ datasources: { db: { url: process.env.TARGET_URL } } })

async function main() {
  if (!process.env.TARGET_URL) throw new Error('TARGET_URL env var is required')

  const tenant = await db.tenant.findFirst({ where: { slug: 'vineworks-demo' } })
  if (!tenant) throw new Error('No tenant with slug "vineworks-demo" found in TARGET db — run clone-nm-to-demo.ts first')
  const DEMO_ID = tenant.id
  console.log(`Rebranding tenant ${DEMO_ID} (${tenant.domain})`)

  await db.tenant.update({
    where: { id: DEMO_ID },
    data: { logoUrl: '/icons/logo-vineworks-demo.svg', logoAlt: 'VineWorks' },
  })
  console.log('Tenant logo updated')

  const contentUpdates: { key: string; locale: string; value: string }[] = [
    { key: 'home_hero_subtitle', locale: 'ka', value: 'საოჯახო მარანი ვენახებს შორის. ღვინის დეგუსტაცია, ტრადიციული სუფრა და სტუმართმოყვარეობა.' },
    { key: 'about_story_p1', locale: 'ka', value: 'ვაინვორქსი არის საოჯახო მარანი ვენახების სიღრმეში, კახეთში — საქართველოს ყველაზე ცნობილ სავენახე რეგიონში.' },
    { key: 'about_story_p3', locale: 'ka', value: 'ჩვენ გავხსენით ვაინვორქსი სტუმრებისთვის, რომ ყველამ, ვისაც ქართული ღვინის კულტურა აინტერესებს, შეძლოს მისი განცდა სუფრასთან, საჭმელით და საუბრით.' },
    { key: 'contact_email', locale: 'en', value: 'hello@vineworks.ge' },
    { key: 'contact_email', locale: 'ka', value: 'hello@vineworks.ge' },
    { key: 'contact_phone', locale: 'en', value: '+995 555 00 00 00' },
    { key: 'contact_phone', locale: 'ka', value: '+995 555 00 00 00' },
    { key: 'contact_address', locale: 'en', value: 'Kakheti, Georgia' },
    { key: 'contact_address', locale: 'ka', value: 'Kakheti, Georgia' },
  ]
  for (const u of contentUpdates) {
    const row = await db.siteContent.findFirst({ where: { tenantId: DEMO_ID, key: u.key, locale: u.locale } })
    if (row) {
      await db.siteContent.update({ where: { id: row.id }, data: { value: u.value } })
      console.log(`Updated SiteContent ${u.key} (${u.locale})`)
    }
  }

  const settingUpdates: Record<string, string> = {
    contact_email: 'hello@vineworks.ge',
    contact_instagram: 'https://www.instagram.com/vineworks',
    contact_facebook: 'https://www.facebook.com/vineworks',
    maps_embed_url: '',
    contact_phone: '+995 555 00 00 00',
    contact_address: 'Kakheti, Georgia',
    payment_iban: 'GE00XX0000000000000000',
    payment_bank_code: 'XXXXGE00',
    payment_bank_name: 'Demo Bank',
  }
  for (const [key, value] of Object.entries(settingUpdates)) {
    const row = await db.setting.findFirst({ where: { tenantId: DEMO_ID, key } })
    if (row) {
      await db.setting.update({ where: { id: row.id }, data: { value } })
      console.log(`Updated Setting ${key}`)
    }
  }

  console.log(`\nDone rebranding Vineworks Demo tenant (${DEMO_ID}).`)
}

main().finally(() => db.$disconnect())
