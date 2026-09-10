import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { getSetting } from '@/app/actions/settings'
import { getTenantId } from '@/lib/tenant'
import { adminT } from '@/lib/adminT'
import { AdminHintsProvider } from '@/components/AdminHintsContext'
import BreadcrumbTracker from '@/components/BreadcrumbTracker'
import BugReportWidget from '@/components/BugReportWidget'
import DemoModeBanner from '@/components/DemoModeBanner'
import DemoChecklist from '@/components/DemoChecklist'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import LogoutButton from './LogoutButton'
import OnboardingBanner from './OnboardingBanner'
import FinishDetailsBanner from './FinishDetailsBanner'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [supabase, h, adminLanguage, showAdminHints, tenantId] = await Promise.all([
    createClient(), headers(), getSetting('admin_language'), getSetting('show_admin_hints'), getTenantId(),
  ])
  const { data: { user } } = await supabase.auth.getUser()
  const logoUrl = h.get('x-tenant-logo') ?? null
  const logoAlt = h.get('x-tenant-logo-alt') ?? ''
  const tenantName = h.get('x-tenant-name') ?? ''
  const bookingOn = h.get('x-tenant-modules-booking') !== 'false'
  const wineOrdersOn = h.get('x-tenant-modules-wine-orders') === 'true'
  const at = (key: string) => adminT(adminLanguage, key)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--site-bg)' }}>
      <DemoModeBanner tenantId={tenantId} />
      <DemoChecklist tenantId={tenantId} />
      <BreadcrumbTracker />
      {/* Submitter identity comes straight from the auth session already
          resolved above (server-side) — no extra round trip, no re-implementing
          auth client-side. */}
      <BugReportWidget surface="ADMIN" tenantId={tenantId} submitterEmail={user?.email ?? null} submitterUserId={user?.id ?? null} />
      {/* Top nav */}
      <nav
        className="border-b"
        style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}
      >
        {/* Top row: brand + logout */}
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={logoAlt} style={{ height: '28px', width: 'auto' }} />
            ) : (
              <span className="font-serif text-base font-semibold tracking-wide" style={{ color: 'var(--color-brand)' }}>
                {tenantName}
              </span>
            )}
            <span className="text-xs font-medium" style={{ color: 'var(--site-secondary)' }}>{at('nav.adminTag')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs" style={{ color: 'var(--site-secondary)' }}>{user?.email}</span>
            {user?.app_metadata?.role === 'super_admin' && (
              <a
                href="/super-admin"
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: '#1e1b4b', border: '1px solid #3730a3', color: '#a5b4fc' }}
              >
                ⬡ {at('nav.platform')}
              </a>
            )}
            <LogoutButton label={at('nav.signOut')} />
          </div>
        </div>
        {/* Nav links row — scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
          {[
            { href: '/admin/orders', label: at('nav.orders'), show: bookingOn },
            { href: '/admin/companies', label: at('nav.companies'), show: true },
            { href: '/admin/statistics', label: at('nav.statistics'), show: true },
            { href: '/admin/wines', label: at('nav.wines'), show: wineOrdersOn },
            { href: '/admin/wine-orders', label: at('nav.wineOrders'), show: wineOrdersOn },
            { href: '/admin/menu-items', label: at('nav.menuItems'), show: bookingOn },
            { href: '/admin/masterclass', label: at('nav.masterclass'), show: bookingOn },
            { href: '/admin/content', label: at('nav.content'), show: true },
            { href: '/admin/settings', label: at('nav.settings'), show: true },
            { href: '/admin/my-reports', label: at('nav.myReports'), show: true },
          ].filter(link => link.show).map(link => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm whitespace-nowrap px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: 'var(--site-muted)' }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="px-6 py-8 max-w-screen-2xl mx-auto">
        {/* Both setup nudges are suppressed on the sales demo tenant. A
            prospect sent to /admin to be shown a working back office was
            landing on "Finish setting up your account" instead — the product
            reading as half-built at exactly the moment it should look real.
            Gated rather than "completed" for the demo tenant: both banners
            recompute live on every page load, so a visitor toggling any
            setting in the sandbox could bring them straight back.
            No-op for every other tenant. Plan-DemoRedesign.md task 0.4. */}
        {tenantId !== DEMO_TENANT_ID && (
          <>
            <OnboardingBanner />
            <FinishDetailsBanner />
          </>
        )}
        <AdminHintsProvider show={showAdminHints === 'true'}>
          {children}
        </AdminHintsProvider>
      </main>
    </div>
  )
}
