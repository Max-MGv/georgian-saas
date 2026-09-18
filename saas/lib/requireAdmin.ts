import { createClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'

/**
 * Throws unless the caller is an admin for this tenant.
 *
 * Returns the Supabase user so callers that record history can say *who* acted
 * (chunk 5). Every pre-existing caller ignores the return value, so this is
 * additive.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Super admins (Max's management account) can access any tenant
  if (user.app_metadata?.role === 'super_admin') return user

  // Tenant admins must belong to the current domain's tenant
  const tenantId = await getTenantId()
  if (user.app_metadata?.tenantId !== tenantId) throw new Error('Unauthorized')
  return user
}
