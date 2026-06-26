import { createClient } from '@/lib/supabase/server'

export async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  if (user.app_metadata?.role !== 'super_admin') throw new Error('Forbidden')
}
