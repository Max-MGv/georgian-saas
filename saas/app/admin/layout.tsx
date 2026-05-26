import { createClient } from '@/lib/supabase/server'
import LogoutButton from './LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0ebe3' }}>
      {/* Top nav */}
      <nav
        className="border-b"
        style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}
      >
        {/* Top row: brand + logout */}
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '28px', width: 'auto' }} />
            <span className="text-xs font-medium" style={{ color: '#a89070' }}>Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs" style={{ color: '#a89070' }}>{user?.email}</span>
            <LogoutButton />
          </div>
        </div>
        {/* Nav links row — scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
          {[
            { href: '/admin/orders', label: 'Orders' },
            { href: '/admin/companies', label: 'Companies' },
            { href: '/admin/statistics', label: 'Statistics' },
            { href: '/admin/wines', label: 'Wines' },
            { href: '/admin/wine-orders', label: 'Wine Orders' },
            { href: '/admin/menu-items', label: 'Menu Items' },
            { href: '/admin/masterclass', label: 'Masterclass' },
            { href: '/admin/settings', label: 'Settings' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm whitespace-nowrap px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: '#6b5a47' }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        {children}
      </main>
    </div>
  )
}
