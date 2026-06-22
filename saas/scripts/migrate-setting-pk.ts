/**
 * One-time migration: change Setting table PK from `key` to a new `id` column.
 *
 * Why: `key String @id` only allows one row per key globally.
 * Multi-tenant needs one row per (key, tenantId) pair.
 *
 * Steps:
 *   1. Add nullable `id` column, backfill with UUID values
 *   2. Drop the `key` primary key constraint
 *   3. Make `id` the new primary key
 *   4. Add @@unique([key, tenantId]) constraint
 *
 * Safe: reads current data first, verifies, then migrates.
 * Run: npx tsx scripts/migrate-setting-pk.ts
 */

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const db = new PrismaClient()

async function main() {
  // Verify current state
  const count = await db.setting.count()
  console.log(`\nFound ${count} rows in Setting table.`)

  // Step 1: Add the new id column (nullable, uuid from postgres)
  console.log('\n[1/4] Adding id column...')
  await db.$executeRaw`ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "new_id" TEXT`
  await db.$executeRaw`UPDATE "Setting" SET "new_id" = gen_random_uuid()::text WHERE "new_id" IS NULL`
  await db.$executeRaw`ALTER TABLE "Setting" ALTER COLUMN "new_id" SET NOT NULL`
  console.log('     Done.')

  // Step 2: Drop the old primary key constraint
  console.log('\n[2/4] Dropping old primary key (key)...')
  await db.$executeRaw`ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey"`
  console.log('     Done.')

  // Step 3: Rename new_id → id, make it the new primary key
  console.log('\n[3/4] Promoting id as primary key...')
  await db.$executeRaw`ALTER TABLE "Setting" RENAME COLUMN "new_id" TO "id"`
  await db.$executeRaw`ALTER TABLE "Setting" ADD PRIMARY KEY ("id")`
  console.log('     Done.')

  // Step 4: Add @@unique([key, tenantId]) constraint
  console.log('\n[4/4] Adding unique constraint (key, tenantId)...')
  // Drop first in case it partially exists
  await db.$executeRaw`ALTER TABLE "Setting" DROP CONSTRAINT IF EXISTS "Setting_key_tenantId_key"`
  await db.$executeRaw`ALTER TABLE "Setting" ADD CONSTRAINT "Setting_key_tenantId_key" UNIQUE ("key", "tenantId")`
  console.log('     Done.')

  // Verify
  const verify: Array<{ id: string; key: string; tenantId: string | null }> =
    await db.$queryRaw`SELECT id, key, "tenantId" FROM "Setting" LIMIT 3`
  console.log('\n✅ Migration complete. Sample rows:')
  verify.forEach(r => console.log(`   id=${r.id.slice(0, 8)}… key=${r.key} tenantId=${r.tenantId?.slice(0, 8)}…`))
  console.log(`\n   Total rows: ${count}`)
}

main()
  .catch(e => { console.error('\n❌ Migration failed:', e.message); process.exit(1) })
  .finally(() => db.$disconnect())
