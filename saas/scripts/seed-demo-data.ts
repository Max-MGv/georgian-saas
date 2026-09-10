/**
 * CLI wrapper around lib/demoSeed.ts — fills the Vineworks demo tenant with a
 * winery that is actually trading. The generation logic lives in lib/ because
 * the scheduled regeneration route (app/api/cron/reseed-demo, task 0.6) needs
 * the same code; this file only handles argument parsing and printing.
 *
 * See vault/DemoSite/Plan-DemoRedesign.md Phase 0.
 *
 * Run (dev — the default, reads DATABASE_URL from saas/.env):
 *       npx tsx scripts/seed-demo-data.ts
 *       npx tsx scripts/seed-demo-data.ts --dry-run     report, write nothing
 *
 * Run (production):
 *       npx tsx scripts/seed-demo-data.ts --prod              previews only
 *       npx tsx scripts/seed-demo-data.ts --prod --confirm    actually writes
 *
 *       --prod reads DIRECT_URL out of saas/.env.prod.backup itself, so no
 *       database password has to be pasted into a shell or a chat window.
 *       DIRECT_URL rather than the pooled URL because this makes several
 *       hundred sequential writes. --prod WITHOUT --confirm always dry-runs:
 *       a mistyped production command previews instead of wiping.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { seedDemoTenant } from '../lib/demoSeed'

const PROD = process.argv.includes('--prod')
const CONFIRMED = process.argv.includes('--confirm')
// --prod without --confirm is always a preview. Getting a production wipe
// should take a deliberate second flag, not a correctly-typed first one.
const DRY_RUN = process.argv.includes('--dry-run') || (PROD && !CONFIRMED)

/**
 * Production connection string, read from saas/.env.prod.backup rather than
 * taken as an argument — a password passed on a command line ends up in shell
 * history, and one pasted into a chat window ends up somewhere worse.
 * DIRECT_URL, not DATABASE_URL: the pooled/pgbouncer endpoint is the wrong
 * shape for the few hundred sequential writes this does.
 */
function prodUrl(): string {
  const path = join(__dirname, '..', '.env.prod.backup')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`--prod needs ${path}, which is not there. It is gitignored, so a fresh clone will not have it.`)
  }
  const line = raw.split(/\r?\n/).find(l => l.trim().startsWith('DIRECT_URL='))
  if (!line) throw new Error(`No DIRECT_URL line in ${path}`)
  const url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (!url.startsWith('postgres')) throw new Error('DIRECT_URL in .env.prod.backup does not look like a Postgres URL')
  return url
}

const db = PROD
  ? new PrismaClient({ datasources: { db: { url: prodUrl() } } })
  : new PrismaClient()

async function main() {
  const rawUrl = PROD ? prodUrl() : (process.env.DATABASE_URL ?? '')
  console.log(PROD ? '*** TARGET: PRODUCTION ***' : 'TARGET: dev (DATABASE_URL from .env)')
  console.log(`DB: ${rawUrl.replace(/:\/\/[^@]*@/, '://***@') || '(from .env)'}`)
  console.log(DRY_RUN
    ? (PROD ? 'MODE: preview — nothing will be written. Re-run with --confirm to write.\n' : 'MODE: dry run — nothing will be written\n')
    : 'MODE: WRITING\n')

  const r = await seedDemoTenant(db, { dryRun: DRY_RUN })

  console.log(`Tenant: ${r.tenantName} (${r.tenantId})\n`)
  console.log(`Existing: ${r.before.orders} orders, ${r.before.wineOrders} wine orders, ${r.before.companies} companies`)

  if (r.dryRun) {
    // Print the cast that is about to be destroyed. rebrand-demo-tenant.ts
    // scrubbed the tenant row, settings and site content when the demo was
    // built, but never touched Companies — so a demo tenant cloned from a real
    // winery can still be publishing that winery's B2B customers' names,
    // contact people, phone numbers and emails. Seeding overwrites the
    // evidence, so it gets shown here first, while it can still be checked.
    if (r.existingCompanies.length) {
      console.log('\nCompanies currently on this tenant (all of these will be deleted):')
      for (const c of r.existingCompanies) {
        const contact = [c.contactName, c.contactPhone, c.contactEmail].filter(Boolean).join(' · ')
        console.log(`  - ${c.name}${contact ? `  [${contact}]` : ''}`)
      }
      console.log('  ^ check these for real customer contact details before continuing.')
    }
    console.log(`\nWould delete all of the above and create ~${r.created.bookings} bookings, ${r.created.wineOrders} wine orders,`)
    console.log(`${r.created.companies} companies, ${r.created.menuItems} menu items, ${r.created.masterclassItems} masterclass items.`)
    if (PROD) console.log('\nNothing was written. Re-run with --prod --confirm to apply.')
    return
  }

  console.log('Cleared previous demo trading data + cast')
  console.log(`Companies: ${r.created.companies}`)
  console.log(`Menu items: ${r.created.menuItems} · Masterclass items: ${r.created.masterclassItems}`)
  console.log(`Bookings: ${r.created.bookings}`)
  console.log(`Wine orders: ${r.created.wineOrders}`)

  console.log('\n--- what the admin panel will show ---')
  console.log(`Total bookings: ${r.totals.bookings}   ·   lifetime revenue: ${r.totals.revenue.toLocaleString()} GEL`)
  console.log(`Upcoming bookings: ${r.totals.upcoming}   ·   future revenue: ${r.totals.futureRevenue.toLocaleString()} GEL`)
  console.log('Statistics chart (last 6 months):')
  for (const m of r.monthly) {
    console.log(`  ${m.label}  ${String(m.bookings).padStart(3)} bookings  ${String(m.revenue).padStart(7)} GEL`)
  }
}

main()
  .catch(e => { console.error('\nFAILED:', e.message); process.exitCode = 1 })
  .finally(() => db.$disconnect())
