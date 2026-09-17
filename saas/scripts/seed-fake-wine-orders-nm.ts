/**
 * ONE-OFF: seeds fake wine orders for Nikalas Marani (prod tenant
 * cmqou94er0000vl1sl9v0yv54) so the admin wine-orders packing view has
 * realistic multi-company data to test print layouts against.
 *
 * Targets PRODUCTION directly (reads DIRECT_URL from .env.prod.backup, same
 * pattern as seed-demo-data.ts) since the real Nikalas Marani tenant only
 * exists in the prod database — the dev DB's stand-in is a different tenant
 * (staging-winery). Defaults to a dry run; pass --confirm to actually write.
 *
 * Run:
 *       npx tsx scripts/seed-fake-wine-orders-nm.ts             preview only
 *       npx tsx scripts/seed-fake-wine-orders-nm.ts --confirm   actually writes
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { seedStatusColumns, type LegacyWineOrderStatus } from '../lib/statusBridge'

const NM_TENANT_ID = 'cmqou94er0000vl1sl9v0yv54'
const CONFIRMED = process.argv.includes('--confirm')

function prodUrl(): string {
  const path = join(__dirname, '..', '.env.prod.backup')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`Needs ${path}, which is not there. It is gitignored, so a fresh clone will not have it.`)
  }
  const line = raw.split(/\r?\n/).find(l => l.trim().startsWith('DIRECT_URL='))
  if (!line) throw new Error(`No DIRECT_URL line in ${path}`)
  const url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (!url.startsWith('postgres')) throw new Error('DIRECT_URL in .env.prod.backup does not look like a Postgres URL')
  return url
}

const db = new PrismaClient({ datasources: { db: { url: prodUrl() } } })

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function qty() { return Math.floor(Math.random() * 10) + 2 }

const BUSINESSES = [
  {
    businessName: 'Rustavi Wine & Dine',
    llcName: 'Rustavi Food Group LLC',
    llcId: '401234567',
    address: 'Kostava St 14, Rustavi 3700',
    workingHours: 'Mon-Sat 10:00-22:00',
    contactName: 'Giorgi Beridze',
    contactPhone: '+995 598 100 200',
    contactEmail: 'giorgi.beridze@rustaviwinedine.ge',
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
    contactEmail: 'nino.tsiklauri@batumiseaside.ge',
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
    contactEmail: 'luka.jikia@tbilisioldtown.ge',
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
    contactEmail: 'mariam.k@kutaisigrandcafe.ge',
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
    contactEmail: 'davit.alavidze@signagiwinehouse.ge',
    status: 'confirmed',
  },
]

async function main() {
  console.log('*** TARGET: PRODUCTION (Nikalas Marani) ***')
  console.log(CONFIRMED ? 'MODE: WRITING\n' : 'MODE: preview — nothing will be written. Re-run with --confirm to write.\n')

  const nm = await db.tenant.findUnique({ where: { id: NM_TENANT_ID } })
  if (!nm) throw new Error(`Tenant ${NM_TENANT_ID} not found`)
  console.log(`Tenant: ${nm.name} (${nm.id})\n`)

  const wines = await db.wine.findMany({
    where: { tenantId: nm.id, active: true },
    orderBy: { sortOrder: 'asc' },
    include: { vintages: { where: { tenantId: nm.id, active: true }, orderBy: { year: 'desc' } } },
  })
  const vintages = wines.flatMap(w => w.vintages.map(v => ({
    vintageId: v.id, name: w.name, year: v.year, price: v.price,
  })))
  if (vintages.length === 0) {
    console.log('No active vintages found for this tenant — nothing to seed.')
    return
  }
  console.log(`Found ${vintages.length} active vintage(s): ${vintages.map(v => `${v.name} ${v.year}`).join(', ')}\n`)

  function pickWines() {
    const shuffled = [...vintages].sort(() => Math.random() - 0.5)
    const count = Math.min(Math.floor(Math.random() * 3) + 1, vintages.length)
    return shuffled.slice(0, count).map(v => ({ ...v, quantity: qty() }))
  }

  if (!CONFIRMED) {
    console.log(`Would create ${BUSINESSES.length} wine orders:`)
    for (const biz of BUSINESSES) console.log(`  - ${biz.businessName} (${biz.status})`)
    console.log('\nNothing was written. Re-run with --confirm to apply.')
    return
  }

  let created = 0
  for (const biz of BUSINESSES) {
    const items = pickWines()
    await db.wineOrder.create({
      data: {
        ...biz,
        tenantId: nm.id,
        ...seedStatusColumns('wineOrder', biz.status as LegacyWineOrderStatus, new Date()),
        totalAmount: items.reduce((sum, i) => sum + i.quantity * i.price, 0),
        wineItems: {
          create: items.map(i => ({
            wineVintageId: i.vintageId,
            wineNameSnapshot: i.name,
            vintageYearSnapshot: i.year,
            priceSnapshot: i.price,
            quantity: i.quantity,
          })),
        },
      },
    })
    created++
    console.log(`  + ${biz.businessName} (${biz.status})`)
  }

  console.log(`\n-> ${created} wine order(s) created for Nikalas Marani.`)
}

main()
  .catch(e => { console.error('\nFAILED:', e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())
