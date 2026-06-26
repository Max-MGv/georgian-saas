/**
 * Sets app_metadata on a Supabase admin user.
 *
 * Usage:
 *   npm run set-admin -- --email user@example.com --super
 *   npm run set-admin -- --email user@example.com --tenantId <tenantId>
 *
 * --super         Marks the user as super_admin (can access all tenants)
 * --tenantId <id> Locks the user to a specific tenant
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const headers = {
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
}

async function listUsers(): Promise<{ id: string; email: string }[]> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers })
  if (!res.ok) throw new Error(`List users failed: ${await res.text()}`)
  const body = await res.json() as { users: { id: string; email: string }[] }
  return body.users
}

async function setMetadata(userId: string, metadata: Record<string, string>) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ app_metadata: metadata }),
  })
  if (!res.ok) throw new Error(`Update failed: ${await res.text()}`)
}

async function main() {
  const args = process.argv.slice(2)

  const emailIdx = args.indexOf('--email')
  const tenantIdIdx = args.indexOf('--tenantId')
  const isSuper = args.includes('--super')

  if (emailIdx === -1 || (!isSuper && tenantIdIdx === -1)) {
    console.error('Usage:')
    console.error('  npm run set-admin -- --email <email> --super')
    console.error('  npm run set-admin -- --email <email> --tenantId <tenantId>')
    process.exit(1)
  }

  const email = args[emailIdx + 1]
  const tenantId = tenantIdIdx !== -1 ? args[tenantIdIdx + 1] : undefined

  const users = await listUsers()
  const user = users.find(u => u.email === email)
  if (!user) {
    console.error(`No user found with email: ${email}`)
    process.exit(1)
  }

  const metadata = isSuper ? { role: 'super_admin' } : { tenantId: tenantId! }
  await setMetadata(user.id, metadata)

  console.log(`✓ Updated ${email}`)
  console.log(`  app_metadata:`, metadata)
}

main().catch(e => { console.error(e); process.exit(1) })
