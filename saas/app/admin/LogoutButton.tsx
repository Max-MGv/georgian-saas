'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs px-3 py-1.5 rounded border transition-colors"
      style={{ color: '#6b5a47', borderColor: '#e0d4c0' }}
    >
      Sign out
    </button>
  )
}
