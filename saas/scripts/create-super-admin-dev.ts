/**
 * Creates a dev-only super-admin user directly via the Supabase Admin API.
 * Refuses to run against anything other than the known dev project ref.
 *
 * Usage:
 *   npm run create-super-admin-dev -- --email super-admin-dev@nikalasmarani.test
 */
import * as dotenv from 'dotenv'
import * as crypto from 'crypto'
dotenv.config({ path: '.env' })

const DEV_PROJECT_REF = 'jpbkkngpgtvqmsocitjx'
const PROD_PROJECT_REF = 'dshsfkffcsgerdqinqst'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
}

function generatePassword(): string {
  return crypto.randomBytes(18).toString('base64').replace(/[+/=]/g, '') + '!A1'
}

async function listUsers(): Promise<{ id: string; email: string; app_metadata: Record<string, unknown> }[]> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers })
  if (!res.ok) throw new Error(`List users failed: ${await res.text()}`)
  const body = await res.json() as { users: { id: string; email: string; app_metadata: Record<string, unknown> }[] }
  return body.users
}

async function createUser(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'super_admin' },
    }),
  })
  if (!res.ok) throw new Error(`Create user failed: ${await res.text()}`)
  return res.json()
}

async function main() {
  const args = process.argv.slice(2)
  const emailIdx = args.indexOf('--email')
  if (emailIdx === -1) {
    console.error('Usage: npm run create-super-admin-dev -- --email <email>')
    process.exit(1)
  }
  const email = args[emailIdx + 1]

  if (!SUPABASE_URL.includes(DEV_PROJECT_REF)) {
    console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL does not point at the dev project (${DEV_PROJECT_REF}).`)
    console.error(`Current URL: ${SUPABASE_URL}`)
    if (SUPABASE_URL.includes(PROD_PROJECT_REF)) {
      console.error('This is the PRODUCTION project ref. Aborting.')
    }
    process.exit(1)
  }

  const existing = (await listUsers()).find(u => u.email === email)
  if (existing) {
    console.error(`A user with email ${email} already exists (id: ${existing.id}). Aborting — not modifying existing users.`)
    process.exit(1)
  }

  const password = generatePassword()
  const created = await createUser(email, password) as { id: string; email: string }

  const users = await listUsers()
  const verify = users.find(u => u.id === created.id)

  console.log(`✓ Created super-admin user in DEV project (${DEV_PROJECT_REF})`)
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`  User ID:  ${created.id}`)
  console.log(`  app_metadata (verified via list):`, verify?.app_metadata)
}

main().catch(e => { console.error(e); process.exit(1) })
