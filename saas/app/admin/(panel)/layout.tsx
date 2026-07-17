import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import LogoutButton from './LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [supabase, h] = await Promise.all([createClient(), headers()])
  const { data: { user } } = await supabase.auth.getUser()
  const logoUrl = h.get('x-tenant-logo') ?? '/icons/logo-dark.svg'
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'

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
            <img src={logoUrl} alt={logoAlt} style={{ height: '28px', width: 'auto' }} />
            <span className="text-xs font-medium" style={{ color: '#a89070' }}>Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs" style={{ color: '#a89070' }}>{user?.email}</span>
            {user?.app_metadata?.role === 'super_admin' && (
              <a
                href="/super-admin"
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: '#1e1b4b', border: '1px solid #3730a3', color: '#a5b4fc' }}
              >
                ⬡ Platform
              </a>
            )}
            <LogoutButton />
          </div>
        </div>
        {/* Nav links row — scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
          {[
            { href: '/admin/orders', label: 'Orders', show: bookingOn },
            { href: '/admin/companies', label: 'Companies', show: true },
            { href: '/admin/statistics', label: 'Statistics', show: true },
            { href: '/admin/wines', label: 'Wines', show: wineOrdersOn },
            { href: '/admin/wine-orders', label: 'Wine Orders', show: wineOrdersOn },
            { href: '/admin/menu-items', label: 'Menu Items', show: bookingOn },
            { href: '/admin/masterclass', label: 'Masterclass', show: bookingOn },
            { href: '/admin/content', label: 'Site Content', show: true },
            { href: '/admin/settings', label: 'Settings', show: true },
          ].filter(link => link.show).map(link => (
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
