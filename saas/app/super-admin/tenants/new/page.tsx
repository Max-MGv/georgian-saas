import Link from 'next/link'
import TenantFormClient from '../TenantFormClient'

export default function NewTenantPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/super-admin/tenants" style={{ color: '#475569', fontSize: 14 }}>
          ← Tenants
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>New Tenant</h1>
      </div>

      <TenantFormClient mode="new" />
    </div>
  )
}
