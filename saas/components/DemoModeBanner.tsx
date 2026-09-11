'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { signInAsDemoAdmin } from '@/lib/demoAuth'
import { Wine, Columns2 } from 'lucide-react'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import { useIsNarrow } from '@/lib/useIsNarrow'

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
  const isNarrow = useIsNarrow()
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // Resolved after mount, never during render: window does not exist on the
  // server, and branching on it during the first client render would produce a
  // hydration mismatch.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => { setEmbedded(isEmbeddedPane()) }, [])
  const [error, setError] = useState(false)

  if (tenantId !== DEMO_TENANT_ID) return null
  // Inside a /live pane the mirror provides its own framing — see lib/demoEmbed.
  if (embedded) return null

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
        // Palette: lib/demoTheme ("cellar dark"), Chunk 5 task 5.1.
        backgroundColor: DEMO.ground,
        color: DEMO.text,
        borderBottom: `1px solid ${DEMO.border}`,
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
        <Wine aria-hidden="true" size={15} strokeWidth={1.7} style={{ color: DEMO.accent, flexShrink: 0 }} />
        You&apos;re exploring a live <strong>Vineworks</strong> demo — click around freely.
      </span>

      {isAdminSide ? (
        <a
          href="/"
          style={{
            backgroundColor: DEMO.accentSolid,
            color: DEMO_FX.onAccent,
            padding: isNarrow ? '10px 16px' : '5px 14px',
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
            backgroundColor: DEMO.accentSolid,
            color: DEMO_FX.onAccent,
            padding: isNarrow ? '10px 16px' : '5px 14px',
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

      <a
        href="/live"
        style={{
          color: DEMO.accent,
          textDecoration: 'underline',
          whiteSpace: 'nowrap',
          fontSize: '0.78rem',
          // 130×19 on a phone before this — under any reasonable tap target.
          padding: isNarrow ? '9px 4px' : '0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Columns2 aria-hidden="true" size={14} strokeWidth={1.7} style={{ flexShrink: 0 }} />
        See both sides at once
      </a>

      {error && <span style={{ color: DEMO_FX.danger }}>Couldn&apos;t open the admin view — try again.</span>}
    </div>
  )
}
