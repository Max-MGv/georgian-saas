import { getTenant } from '@/app/actions/superAdmin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TenantFormClient from '../TenantFormClient'

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenant = await getTenant(id)
  if (!tenant) notFound()

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/super-admin/tenants" style={{ color: '#475569', fontSize: 14 }}>
          ← Tenants
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>{tenant.name}</h1>
      </div>

      <TenantFormClient mode="edit" tenant={tenant} />
    </div>
  )
}
