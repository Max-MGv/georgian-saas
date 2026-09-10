/**
 * Creates the "demo admin" Supabase user for the Vineworks Demo tenant
 * (see [[Plan-DemoSite]]). This account is intentionally public-facing —
 * its whole job is to let a website visitor one-click into the demo's
 * admin panel via the role-switcher banner (DemoModeBanner.tsx), so its
 * password is not treated as a real secret, just recorded in
 * credentials.txt for reference.
 *
 * Refuses to run against anything other than the known dev project ref,
 * same guard as create-super-admin-dev.ts.
 *
 * Usage: npm run create-demo-admin
 * (or: npx tsx scripts/create-demo-admin.ts)
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const DEV_PROJECT_REF = 'jpbkkngpgtvqmsocitjx'
const PROD_PROJECT_REF = 'dshsfkffcsgerdqinqst'
const DEMO_TENANT_ID = 'cmtvgl6e60000vl6w9se65t86'
const EMAIL = 'demo-admin@vineworks.ge'
const PASSWORD = 'VineworksDemo2026!'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
}

async function listUsers(): Promise<{ id: string; email: string; app_metadata: Record<string, unknown> }[]> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers })
  if (!res.ok) throw new Error(`List users failed: ${await res.text()}`)
  const body = await res.json() as { users: { id: string; email: string; app_metadata: Record<string, unknown> }[] }
  return body.users
}

async function createUser(email: string, password: string, tenantId: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { tenantId },
    }),
  })
  if (!res.ok) throw new Error(`Create user failed: ${await res.text()}`)
  return res.json()
}

async function main() {
  if (!SUPABASE_URL.includes(DEV_PROJECT_REF)) {
    console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL does not point at the dev project (${DEV_PROJECT_REF}).`)
    if (SUPABASE_URL.includes(PROD_PROJECT_REF)) console.error('This is the PRODUCTION project ref. Aborting.')
    process.exit(1)
  }

  const existing = (await listUsers()).find(u => u.email === EMAIL)
  if (existing) {
    console.log(`User ${EMAIL} already exists (id: ${existing.id}), app_metadata:`, existing.app_metadata)
    return
  }

  const created = await createUser(EMAIL, PASSWORD, DEMO_TENANT_ID) as { id: string; email: string }
  console.log(`✓ Created demo admin user in DEV project (${DEV_PROJECT_REF})`)
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  User ID:  ${created.id}`)
  console.log(`  tenantId: ${DEMO_TENANT_ID}`)
}

main().catch(e => { console.error(e); process.exit(1) })
