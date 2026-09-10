'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { signInAsDemoAdmin } from '@/lib/demoAuth'

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
          backgroundColor: '#1e1b4b',
          color: '#e0e7ff',
          border: '1px solid #3730a3',
          borderRadius: '14px',
          padding: '18px',
        }}
      >
        <strong style={{ display: 'block', fontSize: '0.92rem' }}>
          🍷 This is a live Vineworks demo
        </strong>
        <p style={{ margin: '6px 0 14px', fontSize: '0.82rem', lineHeight: 1.5, color: '#a5b4fc' }}>
          No account needed — go straight into the winery&apos;s back office and look
          around.
        </p>
        <button
          onClick={enter}
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: '#4f46e5',
            color: '#fff',
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
          <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#fca5a5' }}>
            Couldn&apos;t open the demo just now — please try again.
          </p>
        )}
        <a
          href="/"
          style={{ display: 'inline-block', marginTop: '12px', fontSize: '0.78rem', color: '#a5b4fc' }}
        >
          ← Back to the winery&apos;s site
        </a>
      </div>

      <p style={{ margin: '18px 0 0', fontSize: '0.75rem', color: '#6b5a47', textAlign: 'center' }}>
        or sign in with your own account
      </p>
    </div>
  )
}
