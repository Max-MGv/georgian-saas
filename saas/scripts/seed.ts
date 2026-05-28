/**
 * Seed script — Nikalas Marani test data
 * Run: npm run seed
 *
 * Sections (add new ones at the bottom, each is independent):
 *   1. Wine Orders   <- active
 *   2. (future) Test Companies + Price Tiers
 *   3. (future) Test Booking Orders
 */

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const db = new PrismaClient()

// --- helpers ------------------------------------------------------------------

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function qty() { return Math.floor(Math.random() * 10) + 2 }

// --- 1. Wine Orders -----------------------------------------------------------

async function seedWineOrders() {
  console.log('\n-- Wine Orders --')

  // Pull active wines from DB so names/IDs match the real catalogue
  const wines = await db.wine.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })

  if (wines.length === 0) {
    console.log('  WARNING: No active wines found — add wines in the admin panel first, then re-run.')
    return
  }

  console.log(`  Found ${wines.length} active wine(s): ${wines.map((w: { name: string }) => w.name).join(', ')}`)

  // Pick 1-3 random wines for an order
  function pickWines() {
    const shuffled = [...wines].sort(() => Math.random() - 0.5)
    const count = Math.min(Math.floor(Math.random() * 3) + 1, wines.length)
    return shuffled.slice(0, count).map((w: { id: string; name: string }) => ({ id: w.id, name: w.name, quantity: qty() }))
  }

  const BUSINESSES = [
    {
      businessName: 'Rustavi Wine & Dine',
      llcName: 'Rustavi Food Group LLC',
      llcId: '401234567',
      address: 'Kostava St 14, Rustavi 3700',
      workingHours: 'Mon-Sat 10:00-22:00',
      contactName: 'Giorgi Beridze',
      contactPhone: '+995 598 100 200',
      status: 'pending',
    },
    {
      businessName: 'Batumi Seaside Restaurant',
      llcName: null,
      llcId: null,
      address: 'Rustaveli Ave 3, Batumi 6010',
      workingHours: 'Daily 12:00-23:00',
      contactName: 'Nino Tsiklauri',
      contactPhone: '+995 577 300 400',
      status: 'confirmed',
    },
    {
      businessName: 'Tbilisi Old Town Hotel',
      llcName: 'Tbilisi Hospitality LLC',
      llcId: '405678901',
      address: 'Shardeni St 7, Tbilisi 0105',
      workingHours: '24/7',
      contactName: 'Luka Jikia',
      contactPhone: '+995 591 500 600',
      status: 'pending',
    },
    {
      businessName: 'Kutaisi Grand Cafe',
      llcName: null,
      llcId: null,
      address: 'Tamar Mepe St 22, Kutaisi 4600',
      workingHours: 'Tue-Sun 11:00-21:00',
      contactName: 'Mariam Kvaratskhelia',
      contactPhone: '+995 555 700 800',
      status: 'pending',
    },
    {
      businessName: 'Signagi Wine House',
      llcName: 'Kakheti Wine Retail LLC',
      llcId: '407891234',
      address: 'Chavchavadze St 1, Signagi 4200',
      workingHours: 'Mon-Sun 10:00-20:00',
      contactName: 'Davit Alavidze',
      contactPhone: '+995 599 900 100',
      status: 'confirmed',
    },
  ]

  let created = 0
  for (const biz of BUSINESSES) {
    await db.wineOrder.create({
      data: {
        ...biz,
        wines: pickWines(),
      },
    })
    created++
    console.log(`  + ${biz.businessName} (${biz.status})`)
  }

  console.log(`  -> ${created} wine order(s) created.`)
}

// --- 2. Test Companies (placeholder - uncomment & fill when needed) -----------

// async function seedTestCompanies() {
//   console.log('\n-- Test Companies --')
//   // TODO: add test companies with price tiers here
// }

// --- 3. Test Booking Orders (placeholder) ------------------------------------

// async function seedTestOrders() {
//   console.log('\n-- Test Booking Orders --')
//   // TODO: add test booking orders here
// }

// --- runner ------------------------------------------------------------------

async function main() {
  console.log('Seeding Nikalas Marani test data...')

  await seedWineOrders()
  // await seedTestCompanies()
  // await seedTestOrders()

  console.log('\nDone.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
