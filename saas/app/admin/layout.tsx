import { createClient } from '@/lib/supabase/server'
import LogoutButton from './LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0ebe3' }}>
      {/* Top nav */}
      <nav
        className="border-b px-6 py-3 flex items-center gap-6"
        style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}
      >
        <span className="font-bold text-sm" style={{ color: '#1c1008' }}>Nikalas Marani — Admin</span>
        <div className="flex gap-4 ml-4">
          {[
            { href: '/admin', label: 'Orders' },
            { href: '/admin/companies', label: 'Companies' },
            { href: '/admin/prices', label: 'Prices' },
            { href: '/admin/statistics', label: 'Statistics' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm transition-colors"
              style={{ color: '#6b5a47' }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: '#a89070' }}>{user?.email}</span>
          <LogoutButton />
        </div>
      </nav>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        {children}
      </main>
    </div>
  )
}
