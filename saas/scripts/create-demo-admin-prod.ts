/**
 * Prod counterpart to create-demo-admin.ts — creates the same demo-admin
 * Supabase user, but in the PROD auth project, locked to the prod demo
 * tenant. See [[Plan-DemoSite]].
 *
 * Refuses to run against anything other than the known prod project ref
 * (inverse guard of the dev version, which refuses to run against prod).
 *
 * Usage: npx tsx scripts/create-demo-admin-prod.ts
 * Env: PROD_SUPABASE_URL, PROD_SERVICE_ROLE_KEY, DEMO_TENANT_ID (the prod tenant id)
 */
const DEV_PROJECT_REF = 'jpbkkngpgtvqmsocitjx'
const PROD_PROJECT_REF = 'dshsfkffcsgerdqinqst'
const EMAIL = 'demo-admin@vineworks.ge'
const PASSWORD = 'VineworksDemo2026!'

const SUPABASE_URL = process.env.PROD_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.PROD_SERVICE_ROLE_KEY!
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID!

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
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DEMO_TENANT_ID) {
    throw new Error('PROD_SUPABASE_URL, PROD_SERVICE_ROLE_KEY, and DEMO_TENANT_ID env vars are all required')
  }
  if (!SUPABASE_URL.includes(PROD_PROJECT_REF)) {
    console.error(`Refusing to run: PROD_SUPABASE_URL does not point at the prod project (${PROD_PROJECT_REF}).`)
    if (SUPABASE_URL.includes(DEV_PROJECT_REF)) console.error('This is the DEV project ref. Use create-demo-admin.ts instead.')
    process.exit(1)
  }

  const existing = (await listUsers()).find(u => u.email === EMAIL)
  if (existing) {
    console.log(`User ${EMAIL} already exists (id: ${existing.id}), app_metadata:`, existing.app_metadata)
    return
  }

  const created = await createUser(EMAIL, PASSWORD, DEMO_TENANT_ID) as { id: string; email: string }
  console.log(`✓ Created demo admin user in PROD project (${PROD_PROJECT_REF})`)
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  User ID:  ${created.id}`)
  console.log(`  tenantId: ${DEMO_TENANT_ID}`)
}

main().catch(e => { console.error(e); process.exit(1) })
