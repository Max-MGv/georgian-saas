import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'super_admin') {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0b1120' }}>
      <nav style={{ backgroundColor: '#111827', borderBottom: '1px solid #1e293b' }}>
        <div className="px-6 py-0 flex items-center justify-between" style={{ height: 56 }}>
          {/* Left: brand + nav */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>⬡</div>
              <span className="font-semibold text-sm" style={{ color: '#f1f5f9' }}>Super Admin</span>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                padding: '2px 7px', borderRadius: 20,
                backgroundColor: '#1e1b4b', color: '#a5b4fc',
                border: '1px solid #3730a3',
              }}>PLATFORM</span>
            </div>

            <div className="flex gap-0.5">
              {[
                { href: '/super-admin/tenants', label: 'Tenants' },
                { href: '/super-admin/users', label: 'Users' },
              ].map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#94a3b8' }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: email + back link */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs" style={{ color: '#475569' }}>
              {user.email}
            </span>
            <Link
              href="/admin"
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#64748b' }}
            >
              ← Tenant Admin
            </Link>
          </div>
        </div>
      </nav>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        {children}
      </main>
    </div>
  )
}
