import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const db = new PrismaClient()

// Default tenant — Nikalas Marani
const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? ''

const rows = [
  // Home
  { key: 'home_hero_subtitle',   section: 'home',    label: 'Hero subtitle',           locale: 'ka', value: 'ოჯახური მარანი კახეთის გულში. ღვინის დეგუსტაცია, ტრადიციული სუფრა და ყოველი ბოთლის ამბავი.' },
  { key: 'home_package1_title',  section: 'home',    label: 'Wine Tasting title',      locale: 'ka', value: 'ღვინის დეგუსტაცია' },
  { key: 'home_package1_desc',   section: 'home',    label: 'Wine Tasting description',locale: 'ka', value: '2 წითელი ღვინო, 1 თეთრი, ჭაჭა — მევინეთხუცესის თანხლებით' },
  { key: 'home_package2_title',  section: 'home',    label: 'Tasting + Lunch title',   locale: 'ka', value: 'დეგუსტაცია + სადილი' },
  { key: 'home_package2_desc',   section: 'home',    label: 'Tasting + Lunch description', locale: 'ka', value: '3 ღვინო, ჭაჭის კონიაკი და სრული ტრადიციული ქართული სუფრა' },
  { key: 'home_booking_intro',   section: 'home',    label: 'Booking intro',           locale: 'ka', value: 'შეავსეთ ფორმა და ჩვენ მალე დაგიდასტუროთ თქვენი ჯავშანი.' },

  // About
  { key: 'about_story_p1',       section: 'about',   label: 'Story paragraph 1',       locale: 'ka', value: 'ნიკალას მარანი არის ოჯახური მარანი კარდანახის ვენახების სიღრმეში, გურჯაანის მუნიციპალიტეტში, კახეთში — საქართველოს ყველაზე ცნობილ სავენახე რეგიონში.' },
  { key: 'about_story_p2',       section: 'about',   label: 'Story paragraph 2',       locale: 'ka', value: 'თაობების განმავლობაში ჩვენი ოჯახი ერთ და იმავე მიწაზე აშენებს რქაწითელსა და საფერავს, ტრადიციული კახური მეღვინეობის მეთოდებით. ჩვენი ღვინოები მზადდება მინიმალური ჩარევით — ყურძენი, მზე და თიხის ჭურჭელი ძირითად სამუშაოს ასრულებს.' },
  { key: 'about_story_p3',       section: 'about',   label: 'Story paragraph 3',       locale: 'ka', value: 'ჩვენ გავხსენით ნიკალას მარანი სტუმრებისთვის, რომ ყველამ, ვისაც ქართული ღვინის კულტურა აინტერესებს, შეძლოს მისი განცდა ჩვენებური სახით — არა სადეგუსტაციო დარბაზში, არამედ სუფრასთან, საჭმელით, საუბრით და პირდაპირ მევინეთხუცესსთან.' },
  { key: 'about_expect1_label',  section: 'about',   label: 'Card label',              locale: 'ka', value: 'ღვინის დეგუსტაცია' },
  { key: 'about_expect1_text',   section: 'about',   label: 'Card text',               locale: 'ka', value: 'სახლის 2–3 ღვინოსა და ჭაჭის გემოვნებითი დეგუსტაცია, მევინეთხუცესის ახსნა-განმარტებით.' },
  { key: 'about_expect2_label',  section: 'about',   label: 'Card label',              locale: 'ka', value: 'ტრადიციული სადილი' },
  { key: 'about_expect2_text',   section: 'about',   label: 'Card text',               locale: 'ka', value: 'სურვილისამებრ სადილი კლასიკური კახური კერძებით — მწვადი, ლობიანი, ახალი პური გამოცხობილი.' },
  { key: 'about_expect3_label',  section: 'about',   label: 'Card label',              locale: 'ka', value: 'ვენახში სეირნობა' },
  { key: 'about_expect3_text',   section: 'about',   label: 'Card text',               locale: 'ka', value: 'მოკლე სეირნობა ვენახში და ჩვენი ქვევრების — თიხის ჭურჭლის — მარნის დათვალიერება.' },

  // Contact
  { key: 'contact_phone',        section: 'contact', label: 'Phone',                   locale: 'ka', value: '+995 599 96 33 17' },
  { key: 'contact_email',        section: 'contact', label: 'Email',                   locale: 'ka', value: 'nikalasmarani@gmail.com' },
  { key: 'contact_address',      section: 'contact', label: 'Address',                 locale: 'ka', value: 'კარდანახი, გურჯაანი' },
]

async function main() {
  for (const row of rows) {
    await db.siteContent.upsert({
      where: { key_locale_tenantId: { key: row.key, locale: row.locale, tenantId: TENANT_ID } },
      update: { value: row.value },
      create: { ...row, tenantId: TENANT_ID },
    })
    console.log(`✓ ${row.key}`)
  }
  console.log(`\nDone — ${rows.length} Georgian rows seeded.`)
}

main().catch(console.error).finally(() => db.$disconnect())
