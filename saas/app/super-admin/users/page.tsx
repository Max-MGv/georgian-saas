import { listAdminUsers } from '@/app/actions/superAdmin'
import { db } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const [users, tenants, supabase] = await Promise.all([
    listAdminUsers(),
    db.tenant.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    createClient(),
  ])

  const { data: { user: me } } = await supabase.auth.getUser()

  const mapped = users.map(u => ({
    id: u.id,
    email: u.email,
    role: (u.app_metadata?.role as string | undefined) ?? null,
    tenantId: (u.app_metadata?.tenantId as string | undefined) ?? null,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at ?? null,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>Admin Users</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            {users.length} account{users.length !== 1 ? 's' : ''} in Supabase
          </p>
        </div>
      </div>

      <UsersClient users={mapped} tenants={tenants} currentUserId={me?.id ?? ''} />
    </div>
  )
}
