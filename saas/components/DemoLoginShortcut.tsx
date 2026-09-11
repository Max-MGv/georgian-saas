'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { signInAsDemoAdmin } from '@/lib/demoAuth'
import { Wine } from 'lucide-react'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'

/**
 * Closes the /admin dead end on demo.vineworks.ge — Plan-DemoRedesign task 1.4.
 * Renders nothing for every other tenant, so a real winery's login page is
 * untouched.
 *
 * The problem: opening /admin directly on the demo — a shared link, a reload, an
 * expired session — landed on a bare email + password form with no credentials
 * anywhere and no way back to the demo. That visitor was simply gone.
 *
 * A one-click button rather than an automatic sign-in: auto-signing-in whoever
 * opens a login page would be startling, and it would also strand the one person
 * who genuinely came here to type real credentials — Max, checking the demo
 * tenant as himself. The real form stays right below it.
 */
export default function DemoLoginShortcut({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  if (tenantId !== DEMO_TENANT_ID) return null

  async function enter() {
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
    <div style={{ marginBottom: '22px' }}>
      <div
        style={{
          // Palette: lib/demoTheme ("cellar dark"), Chunk 5 task 5.1.
          backgroundColor: DEMO.surface,
          color: DEMO.text,
          border: `1px solid ${DEMO.border}`,
          borderRadius: '14px',
          padding: '18px',
        }}
      >
        <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem' }}>
          <Wine aria-hidden="true" size={16} strokeWidth={1.7} style={{ color: DEMO.accent, flexShrink: 0 }} />
          This is a live Vineworks demo
        </strong>
        <p style={{ margin: '6px 0 14px', fontSize: '0.82rem', lineHeight: 1.5, color: DEMO.muted }}>
          No account needed — go straight into the winery&apos;s back office and look
          around.
        </p>
        <button
          onClick={enter}
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: DEMO.accentSolid,
            color: DEMO_FX.onAccent,
            border: 'none',
            borderRadius: '9px',
            padding: '11px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Opening…' : 'Enter the demo →'}
        </button>
        {error && (
          <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: DEMO_FX.danger }}>
            Couldn&apos;t open the demo just now — please try again.
          </p>
        )}
        <a
          href="/"
          style={{ display: 'inline-block', marginTop: '12px', fontSize: '0.78rem', color: DEMO.accent }}
        >
          ← Back to the winery&apos;s site
        </a>
      </div>

      {/* The one colour here that is deliberately NOT a --demo-* token: this
          line sits outside the demo card, on the login page's own cream
          background, and belongs to that page rather than to the demo chrome.
          Chunk 5 task 5.1. */}
      <p style={{ margin: '18px 0 0', fontSize: '0.75rem', color: '#6b5a47', textAlign: 'center' }}>
        or sign in with your own account
      </p>
    </div>
  )
}
