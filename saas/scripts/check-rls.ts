import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const db = new PrismaClient()

async function main() {
  // Check RLS enabled status on tables
  const rlsStatus = await db.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `
  console.log('\n=== RLS ENABLED STATUS ===')
  for (const row of rlsStatus) {
    console.log(`${row.rowsecurity ? '🟢' : '🔴'} ${row.tablename}`)
  }

  // Check existing policies
  const policies = await db.$queryRaw<{ tablename: string; policyname: string; cmd: string; roles: string; qual: string; with_check: string }[]>`
    SELECT
      tablename,
      policyname,
      cmd,
      roles::text,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `
  console.log('\n=== EXISTING POLICIES ===')
  for (const p of policies) {
    console.log(`\n[${p.tablename}] ${p.policyname}`)
    console.log(`  CMD: ${p.cmd}  ROLES: ${p.roles}`)
    if (p.qual) console.log(`  USING: ${p.qual}`)
    if (p.with_check) console.log(`  WITH CHECK: ${p.with_check}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
