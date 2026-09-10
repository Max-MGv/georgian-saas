'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { signInAsDemoAdmin } from '@/lib/demoAuth'

/**
 * Role-switcher + "you're in a demo" banner for the Vineworks Demo tenant.
 * Renders nothing for every other tenant. See [[Plan-DemoSite]].
 *
 * On the public site it offers one-click entry into the demo's admin panel
 * (signs in as the fixed demo-admin account — not a real secret, see
 * lib/demoTenant.ts). On the admin side it offers a link back to the
 * customer-facing site, so a visitor can flip between the two views that
 * make the product's value obvious: book as a customer, then watch it land
 * in the CRM as the admin.
 */
export default function DemoModeBanner({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  if (tenantId !== DEMO_TENANT_ID) return null

  const isAdminSide = pathname?.startsWith('/admin')

  async function handleAdminView() {
    setLoading(true)
    setError(false)
    const { ok } = await signInAsDemoAdmin()
    if (!ok) {
      setError(true)
      setLoading(false)
      return
    }
    router.push('/admin/orders')
    router.refresh()
  }

  return (
    <div
      style={{
        backgroundColor: '#1e1b4b',
        color: '#e0e7ff',
        borderBottom: '1px solid #3730a3',
        padding: '10px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontSize: '0.8rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <span>
        🍷 You&apos;re exploring a live <strong>Vineworks</strong> demo — click around freely.
      </span>

      {isAdminSide ? (
        <a
          href="/"
          style={{
            backgroundColor: '#3730a3',
            color: '#fff',
            padding: '5px 14px',
            borderRadius: '999px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          ← Customer View
        </a>
      ) : (
        <button
          onClick={handleAdminView}
          disabled={loading}
          style={{
            backgroundColor: '#3730a3',
            color: '#fff',
            padding: '5px 14px',
            borderRadius: '999px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: 'none',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Winery Admin View →'}
        </button>
      )}

      {error && <span style={{ color: '#fca5a5' }}>Couldn&apos;t open the admin view — try again.</span>}
    </div>
  )
}
