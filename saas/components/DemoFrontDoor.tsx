'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { signInAsDemoAdmin } from '@/lib/demoAuth'

/**
 * The front door for demo.vineworks.ge — Plan-DemoRedesign Phase 1,
 * DemoDirections Direction 01. Renders nothing for every other tenant.
 *
 * The problem it solves: a cold visitor landed on what looks like a small
 * Kakheti winery's website, with nothing anywhere telling them it is a product
 * demo. This answers the three questions a stranger actually has — what is
 * this, is it real, what is in it for me — in one screen, then gets out of the
 * way.
 *
 * Deliberately an overlay on the real site rather than its own route: an
 * interstitial is a door in front of the thing, so the thing should already be
 * behind it. "Skip" is then just a dismissal, with no redirect to get wrong,
 * and the visitor sees the real site the instant they close it.
 *
 * Shown once per browser (localStorage) and only at the site root, so a
 * returning visitor, or anyone arriving on a deep link, is never interrupted.
 */

const STORAGE_KEY = 'vineworks-demo-frontdoor'

const C = {
  ink: '#1e1b4b',
  inkSoft: '#312e81',
  border: '#3730a3',
  text: '#e0e7ff',
  muted: '#a5b4fc',
  accent: '#4f46e5',
}

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'seen'
  } catch {
    // localStorage unavailable (private mode, blocked cookies). Better to show
    // the door every time than to crash on the first paint of the demo.
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, 'seen')
  } catch {
    // Non-persisting is fine — the visitor can still dismiss it this session.
  }
}

type Path = {
  key: string
  icon: string
  title: string
  body: string
  /** What the visitor is actually promised, in their terms. */
  cta: string
}

const PATHS: Path[] = [
  {
    key: 'winery',
    icon: '📋',
    title: 'I run a winery',
    body: 'Open the back office on a winery mid-season — 18 months of bookings, revenue by month, packing lists for tomorrow.',
    cta: 'Show me the back office',
  },
  {
    key: 'mirror',
    icon: '⧉',
    title: 'Show me both at once',
    body: 'The guest site and the back office side by side. Make a booking on the left and watch it appear on the right, in the same second.',
    cta: 'Open the live mirror',
  },
  {
    key: 'guest',
    icon: '🍷',
    title: 'Show me the guest view',
    body: 'Book a tasting or order a case of wine exactly the way your customers would, on the real booking engine.',
    cta: 'Start as a guest',
  },
  {
    key: 'setup',
    icon: '⚡',
    title: 'How fast is setup?',
    body: 'Run the setup wizard on a live account and see what standing up your own winery site actually takes.',
    cta: 'Run the setup wizard',
  },
]

export default function DemoFrontDoor({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // Resolved after mount, never during render: window does not exist on the
  // server, and branching on it during the first client render would produce a
  // hydration mismatch.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => { setEmbedded(isEmbeddedPane()) }, [])
  const [error, setError] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const isDemo = tenantId === DEMO_TENANT_ID
  // Root only. A visitor who followed a link to /wines came for the wines.
  const atRoot = pathname === '/'

  useEffect(() => {
    if (!isDemo || !atRoot) return
    if (alreadySeen()) return
    setOpen(true)
  }, [isDemo, atRoot])

  const dismiss = useCallback(() => {
    markSeen()
    setOpen(false)
  }, [])

  // Escape closes it. A modal a visitor cannot dismiss with the key everyone
  // reaches for is worse than no modal.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    // Stop the page behind from scrolling while the door is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, dismiss])

  if (!isDemo || !open || embedded) return null

  async function choose(key: string) {
    setError(false)
    if (key === 'guest') {
      dismiss()
      return
    }
    if (key === 'mirror') {
      markSeen()
      setOpen(false)
      router.push('/live')
      return
    }
    setBusy(key)
    const { ok } = await signInAsDemoAdmin()
    if (!ok) {
      setError(true)
      setBusy(null)
      return
    }
    markSeen()
    setOpen(false)
    router.push(key === 'setup' ? '/admin/onboarding' : '/admin/orders')
    router.refresh()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-frontdoor-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(15, 13, 40, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '820px',
          backgroundColor: C.ink,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: '18px',
          padding: 'clamp(24px, 5vw, 40px)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.5)',
          outline: 'none',
          margin: 'auto',
        }}
      >
        <p style={{ margin: 0, color: C.muted, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Vineworks
        </p>

        <h1
          id="demo-frontdoor-title"
          style={{ margin: '10px 0 0', fontSize: 'clamp(1.4rem, 3.6vw, 2rem)', lineHeight: 1.2, fontWeight: 700 }}
        >
          Everything a winery needs to take bookings and sell wine.
        </h1>

        <p style={{ margin: '12px 0 0', color: C.muted, fontSize: '0.95rem', lineHeight: 1.55, maxWidth: '60ch' }}>
          What you&apos;re looking at is a real, working winery — its public site and the
          back office behind it, running on live data. Nothing here is a mockup, and you
          can change anything. Where would you like to start?
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '12px',
            margin: '26px 0 0',
          }}
        >
          {PATHS.map(p => (
            <button
              key={p.key}
              onClick={() => choose(p.key)}
              disabled={busy !== null}
              style={{
                textAlign: 'left',
                backgroundColor: C.inkSoft,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: '14px',
                padding: '18px',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy && busy !== p.key ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                font: 'inherit',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.35rem', lineHeight: 1 }}>{p.icon}</span>
              <strong style={{ fontSize: '0.98rem' }}>{p.title}</strong>
              <span style={{ color: C.muted, fontSize: '0.82rem', lineHeight: 1.5, flex: 1 }}>{p.body}</span>
              <span style={{ color: '#c7d2fe', fontSize: '0.82rem', fontWeight: 600, marginTop: '4px' }}>
                {busy === p.key ? 'Opening…' : `${p.cta} →`}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p style={{ margin: '14px 0 0', color: '#fca5a5', fontSize: '0.85rem' }}>
            Couldn&apos;t open the winery account just now — try again, or skip below and use
            the &ldquo;Winery Admin View&rdquo; button in the top bar.
          </p>
        )}

        {/* Genuinely prominent, per DemoDirections: an interstitial that traps
            people is worse than no interstitial at all. */}
        <div style={{ marginTop: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={dismiss}
            style={{
              backgroundColor: 'transparent',
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: '999px',
              padding: '10px 20px',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip — let me just explore
          </button>
          <span style={{ color: C.muted, fontSize: '0.75rem' }}>
            You can switch between the guest site and the winery&apos;s back office at any
            time, from the bar at the top.
          </span>
        </div>
      </div>
    </div>
  )
}
