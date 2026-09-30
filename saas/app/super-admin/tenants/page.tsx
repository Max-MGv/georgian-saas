import { getTenants } from '@/app/actions/superAdmin'
import Link from 'next/link'
import TenantsClient from './TenantsClient'
import ResetDemoCard from './ResetDemoCard'
import { demoTenantExists } from '@/app/actions/demoReset'
import ClearStagingDataCard from './ClearStagingDataCard'
import { stagingTenantExists } from '@/app/actions/stagingWipe'

export default async function TenantsPage() {
  const [tenants, demo, staging] = await Promise.all([getTenants(), demoTenantExists(), stagingTenantExists()])

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

      {/* Only on the database that actually hosts the demo — Plan-DemoFlowFixes
          Chunk 8 task 8.2. */}
      {demo && <ResetDemoCard tenantName={demo.name} />}

      {/* Only on the database that actually hosts Staging Winery (dev DB). */}
      {staging && <ClearStagingDataCard tenantName={staging.name} />}
    </div>
  )
}
