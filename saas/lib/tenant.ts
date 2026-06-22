import { headers } from 'next/headers'

export async function getTenantId(): Promise<string> {
  const headerStore = await headers()
  const tenantId = headerStore.get('x-tenant-id')
  if (!tenantId) throw new Error('No tenant resolved — missing x-tenant-id header')
  return tenantId
}
