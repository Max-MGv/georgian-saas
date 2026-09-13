// One-time corrective fix: the dev/staging Price migration (scripts/migrate-
// lunch-price-to-addon.ts) was accidentally re-applied a second time on dev
// via a manual SQL UPDATE, double-subtracting pricePerPerson from every
// already-migrated row and flooring nearly all of them to 0. This restores
// the exact correct post-single-migration values for the rows that existed
// during the original (correct) run, taken verbatim from that run's own
// console log.
//
// Run: DATABASE_URL="<dev pooler URL>" npx tsx scripts/restore-dev-lunch-addon.ts

import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const CORRECT_VALUES: Record<string, number> = {
  cmrxb882z002uvlc0ypc6hls9: 0,
  cmrxb882z002vvlc0vscibq58: 0,
  cmrxb88ng002xvlc0nh7nkqkb: 30,
  cmtxciwlq0005vluop1yvxk2t: 60,
  cmtxciwlq0006vluor2dxp5oa: 50,
  cmtxciwlq0007vluoppk8m0m1: 45,
  cmrxb89n70034vlc0bz91ttwy: 50,
  cmrxb89n70035vlc0rlhbrwg0: 40,
  cmtxcix3b0009vluojgbqzx1s: 40,
  cmseny23f000gvln4ufi7c0qo: 0,
  cmtxcix3b000avluoti60tykr: 40,
  cmsep042x000ovln4sze9yq9r: 0,
  cmtxcix3b000bvluo4o1874ss: 37,
  cmtvchdkc000wvl6overmvadw: 0,
  cmtvchijx0010vl6ouq6ws27g: 0,
  cmtxcixkd000dvluo6gke0luo: 40,
  cmtxcixkd000evluog8usrtnw: 40,
  cmsepyjtg000tvln4265996d5: 0,
  cmtxciy10000gvluodowumjig: 40,
  cmtxciy10000hvluo6lgft18e: 38,
  cmtxciyhm000jvluokcf6av5x: 40,
  cmtxciyhm000kvluo2bk5g8ve: 40,
  cmtxciyy6000mvluozx1yaad9: 40,
  cmtxciyy7000nvluopww51dk1: 38,
}

async function main() {
  let fixed = 0
  for (const [id, value] of Object.entries(CORRECT_VALUES)) {
    const existing = await db.price.findUnique({ where: { id }, select: { tastingLunchPricePerPerson: true } })
    if (!existing) { console.log(`SKIP ${id}: not found (deleted since?)`); continue }
    if (existing.tastingLunchPricePerPerson === value) { console.log(`OK   ${id}: already ${value}`); continue }
    await db.price.update({ where: { id }, data: { tastingLunchPricePerPerson: value } })
    console.log(`FIX  ${id}: ${existing.tastingLunchPricePerPerson} -> ${value}`)
    fixed++
  }
  console.log(`Done. ${fixed} row(s) restored.`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
