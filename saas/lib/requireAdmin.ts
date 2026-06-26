import { createClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Super admins (Max's management account) can access any tenant
  if (user.app_metadata?.role === 'super_admin') return

  // Tenant admins must belong to the current domain's tenant
  const tenantId = await getTenantId()
  if (user.app_metadata?.tenantId !== tenantId) throw new Error('Unauthorized')
}
