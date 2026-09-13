// One-time backfill: reinterprets Price.tastingLunchPricePerPerson from "full
// tasting+lunch combo rate" to "lunch add-on only" (2026-09-13 pricing model
// change — see comboRatePerPerson in lib/pricingUtils.ts). All booking/order
// calculations now charge pricePerPerson + tastingLunchPricePerPerson for a
// combo guest instead of tastingLunchPricePerPerson alone, so every existing
// row's stored value is reduced by its own pricePerPerson to keep today's
// real combo prices unchanged. Floored at 0 (a row where the old combo value
// was already <= the tasting rate becomes a 0 add-on, not negative).
//
// Safe to re-run: a second pass would double-subtract, so this checks a
// companion flag file to avoid running twice. Delete
// scripts/.migrate-lunch-price-to-addon.done to force a re-run.
//
// Run: npx tsx scripts/migrate-lunch-price-to-addon.ts

import { PrismaClient } from '@prisma/client'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'

const db = new PrismaClient()
const FLAG_PATH = join(__dirname, '.migrate-lunch-price-to-addon.done')

async function main() {
  if (existsSync(FLAG_PATH)) {
    console.log('Already migrated (flag file present). Delete it to force a re-run.')
    await db.$disconnect()
    return
  }

  const prices = await db.price.findMany({
    select: { id: true, companyId: true, pricePerPerson: true, tastingLunchPricePerPerson: true },
  })

  let migrated = 0
  for (const p of prices) {
    const newAddon = Math.max(0, p.tastingLunchPricePerPerson - p.pricePerPerson)
    if (newAddon === p.tastingLunchPricePerPerson) continue
    await db.price.update({ where: { id: p.id }, data: { tastingLunchPricePerPerson: newAddon } })
    console.log(`Price ${p.id} (company ${p.companyId}): ${p.tastingLunchPricePerPerson} -> ${newAddon}`)
    migrated++
  }

  writeFileSync(FLAG_PATH, new Date().toISOString())
  console.log(`Done. ${migrated}/${prices.length} row(s) migrated.`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
