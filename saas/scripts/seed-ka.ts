import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const db = new PrismaClient()

// Default tenant — Nikalas Marani
const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? ''

const rows = [
  // Navigation (admin Site Content editor's "Navigation" tab preview only — the live
  // SiteNav.tsx already falls back to lib/t.ts 'nav.*' Georgian strings on its own;
  // these rows just make the editor's own KA toggle show the same text instead of English)
  { key: 'nav_home',    section: 'nav', label: 'Home link',             locale: 'ka', value: 'მთავარი' },
  { key: 'nav_about',   section: 'nav', label: 'About link',            locale: 'ka', value: 'ჩვენ შესახებ' },
  { key: 'nav_wines',   section: 'nav', label: 'Order Wine link',       locale: 'ka', value: 'ღვინის შეკვეთა' },
  { key: 'nav_contact', section: 'nav', label: 'Contact link',          locale: 'ka', value: 'კონტაქტი' },
  { key: 'nav_book',    section: 'nav', label: '"Book a Visit" button', locale: 'ka', value: 'ჯავშანი' },

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

  // Booking Form (#131 part 1 — previously unseeded; values match the equivalent
  // lib/t.ts 'form.*' Georgian strings so toggling KA here doesn't change what the
  // live public form already shows, it just makes the text independently editable)
  { key: 'form_booking_type',           section: 'form', label: 'Booking Type label',         locale: 'ka', value: 'ჯავშნის ტიპი' },
  { key: 'form_individual',             section: 'form', label: 'Individual Booking button',  locale: 'ka', value: 'ინდივიდუალური' },
  { key: 'form_company_type',           section: 'form', label: 'Tour Company button',        locale: 'ka', value: 'ტური კომპანია' },
  { key: 'form_visit_type',             section: 'form', label: 'Visit Type label',           locale: 'ka', value: 'ვიზიტის ტიპი' },
  { key: 'form_tasting',                section: 'form', label: 'Wine Tasting option',        locale: 'ka', value: 'ღვინის დეგუსტაცია' },
  { key: 'form_tasting_lunch',          section: 'form', label: 'Tasting + Lunch option',     locale: 'ka', value: 'დეგუსტაცია + სადილი' },
  { key: 'form_date',                   section: 'form', label: 'Date label',                 locale: 'ka', value: 'თარიღი' },
  { key: 'form_time_slot',              section: 'form', label: 'Time Slot label',            locale: 'ka', value: 'დრო' },
  { key: 'form_num_guests',             section: 'form', label: 'Number of Guests label',     locale: 'ka', value: 'სტუმრების რაოდენობა' },
  { key: 'form_first_name',             section: 'form', label: 'First Name label',           locale: 'ka', value: 'სახელი' },
  { key: 'form_last_name',              section: 'form', label: 'Last Name label',            locale: 'ka', value: 'გვარი' },
  { key: 'form_phone',                  section: 'form', label: 'Phone label',                locale: 'ka', value: 'ტელეფონი' },
  { key: 'form_email',                  section: 'form', label: 'Email label',                locale: 'ka', value: 'ელ-ფოსტა' },
  { key: 'form_food_notes',             section: 'form', label: 'Food Notes label',           locale: 'ka', value: 'შენიშვნები კვებაზე' },
  { key: 'form_food_notes_sub',         section: 'form', label: 'Food Notes subtitle',        locale: 'ka', value: 'ალერგია, დიეტური მოთხოვნები' },
  { key: 'form_food_notes_placeholder', section: 'form', label: 'Food Notes placeholder',     locale: 'ka', value: 'ნებისმიერი დიეტური შეზღუდვა ან სპეციალური მოთხოვნა სამზარეულოსთვის…' },
  { key: 'form_submit',                 section: 'form', label: 'Submit button',              locale: 'ka', value: 'ჯავშნის მოთხოვნა' },
  { key: 'form_submit_pay',             section: 'form', label: 'Submit button (online payment)', locale: 'ka', value: 'დაჯავშნა და გადახდა' },
  { key: 'form_cancel_policy',          section: 'form', label: 'Cancellation policy text',   locale: 'ka', value: 'გაუქმება შესაძლებელია 48 საათამდე. ჩვენ დაგიკავშირდებით დასადასტურებლად.' },
  { key: 'form_success_heading',        section: 'form', label: 'Success heading',            locale: 'ka', value: 'ჯავშანი მიღებულია!' },
  { key: 'form_success_body',           section: 'form', label: 'Success body text',          locale: 'ka', value: 'გმადლობთ. ჩვენ მალე დაგიკავშირდებით ვიზიტის დასადასტურებლად.' },
  // New in #131 part 2 — Detailed-variant section headers
  { key: 'form_guest_counts_header',    section: 'form', label: 'Guest Counts header',        locale: 'ka', value: 'სტუმრების რაოდენობა' },
  { key: 'form_hot_dish_header',        section: 'form', label: 'Hot Dish Selection header',  locale: 'ka', value: 'ცხელი კერძის შერჩევა' },
  { key: 'form_masterclass_header',     section: 'form', label: 'Masterclass Add-ons header', locale: 'ka', value: 'მასტერკლასის დამატებები' },
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
