import { getTenants } from '@/app/actions/superAdmin'
import Link from 'next/link'
import TenantsClient from './TenantsClient'

export default async function TenantsPage() {
  const tenants = await getTenants()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>Tenants</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            {tenants.length} client{tenants.length !== 1 ? 's' : ''} on the platform
          </p>
        </div>
        <Link
          href="/super-admin/tenants/new"
          className="text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          style={{ backgroundColor: '#6366f1', color: '#fff' }}
        >
          + New Tenant
        </Link>
      </div>

      <TenantsClient tenants={tenants} />
    </div>
  )
}
