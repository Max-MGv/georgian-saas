'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ClipboardList, Columns2, Wine, Rocket, type LucideIcon } from 'lucide-react'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import { useIsNarrow } from '@/lib/useIsNarrow'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { signInAsDemoAdmin } from '@/lib/demoAuth'
import { TOUR_AUTOSTART_KEY } from '@/components/DemoTour'

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
 *
 * Palette and layout: Plan-DemoFlowFixes Chunk 5. Colours come from
 * lib/demoTheme ("cellar dark") — no literal hex lives in this file. The live
 * mirror is promoted out of the grid because it is the one thing no competitor
 * has, and in a row of four equals it looked like the fourth of four.
 */

const STORAGE_KEY = 'vineworks-demo-frontdoor'

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
  /** One line-icon set (lucide, already a dependency) rather than the flat OS
   *  emoji this used to render beside serif display type. Chunk 5 task 5.2. */
  Icon: LucideIcon
  title: string
  body: string
  /** What the visitor is actually promised, in their terms. */
  cta: string
}

/** The promoted path. Rendered above the grid, at full width. */
const HERO: Path = {
  key: 'mirror',
  Icon: Columns2,
  title: 'Show me both at once',
  body: 'The guest site and the back office side by side. Make a booking on the left and watch it appear on the right, in the same second.',
  cta: 'Open the live mirror',
}

/** The other three, in one even row — no orphaned fourth cell. Chunk 5 task 5.3. */
const PATHS: Path[] = [
  {
    key: 'winery',
    Icon: ClipboardList,
    title: 'I run a winery',
    body: 'Open the back office on a winery mid-season — 18 months of bookings, revenue by month, packing lists for tomorrow.',
    cta: 'Show me the back office',
  },
  {
    key: 'guest',
    Icon: Wine,
    title: 'Show me the guest view',
    body: 'Book a tasting or order a case of wine exactly the way your customers would, on the real booking engine.',
    cta: 'Start as a guest',
  },
  {
    key: 'setup',
    Icon: Rocket,
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
  // On a phone this dialog ran to roughly two and a half screens, so "Skip" and
  // three of the four paths were below the fold — a visitor could not see what
  // they were choosing between, which is the one job the front door has.
  // Measured in the 2026-09-12 mobile audit.
  const isNarrow = useIsNarrow()

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

  const choose = useCallback(async (key: string) => {
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
    // Arm the tour's auto-start — only on the "I run a winery" path. The visitor
    // who picked the setup wizard, the guest view or the live mirror asked for a
    // specific thing and must not have a tour opened on top of it. DemoTour
    // consumes this flag once, on /admin/orders. See TOUR_AUTOSTART_KEY.
    if (key === 'winery') {
      try { localStorage.setItem(TOUR_AUTOSTART_KEY, 'armed') } catch { /* private mode: no auto-start, pill still works */ }
    }
    router.push(key === 'setup' ? '/admin/onboarding' : '/admin/orders')
    router.refresh()
  }, [dismiss, router])

  if (!isDemo || !open || embedded) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-frontdoor-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: DEMO_FX.scrim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isNarrow ? '12px' : '20px',
        overflowY: 'auto',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '860px',
          backgroundColor: DEMO.ground,
          color: DEMO.text,
          border: `1px solid ${DEMO.border}`,
          borderRadius: '18px',
          padding: isNarrow ? '18px' : 'clamp(24px, 5vw, 40px)',
          boxShadow: DEMO_FX.shadowLg,
          outline: 'none',
          margin: 'auto',
        }}
      >
        <p style={{ margin: 0, color: DEMO.muted, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Vineworks
        </p>

        <h1
          id="demo-frontdoor-title"
          style={{ margin: '8px 0 0', fontSize: isNarrow ? '1.28rem' : 'clamp(1.4rem, 3.6vw, 2rem)', lineHeight: 1.2, fontWeight: 700 }}
        >
          Everything a winery needs to take bookings and sell wine.
        </h1>

        <p style={{ margin: '10px 0 0', color: DEMO.muted, fontSize: isNarrow ? '0.86rem' : '0.95rem', lineHeight: 1.5, maxWidth: '60ch' }}>
          {isNarrow
            /* Same promise, a third of the height. The long version earns its
               space on a desktop screen and costs a phone visitor the choice
               they came for. */
            ? 'A real, working winery — its public site and the back office behind it, on live data. Change anything you like.'
            : 'What you’re looking at is a real, working winery — its public site and the back office behind it, running on live data. Nothing here is a mockup, and you can change anything. Where would you like to start?'}
        </p>

        {/* ── The promoted path ──────────────────────────────────────────────
            The live mirror gets the full width, the accent border and the
            filled CTA. It is the only thing here no competitor can show, and it
            used to look identical to the other three — it was added as a fourth
            card to a layout built for three, which is also what left the grid
            lopsided. Chunk 5 task 5.3. */}
        <button
          onClick={() => choose(HERO.key)}
          disabled={busy !== null}
          style={{
            width: '100%',
            textAlign: 'left',
            backgroundColor: DEMO.surface,
            color: DEMO.text,
            border: `1px solid ${DEMO.accent}`,
            borderRadius: '16px',
            padding: isNarrow ? '14px' : 'clamp(18px, 3vw, 24px)',
            margin: isNarrow ? '16px 0 0' : '26px 0 0',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy && busy !== HERO.key ? 0.5 : 1,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            flexWrap: 'wrap',
            font: 'inherit',
          }}
        >
          <HERO.Icon aria-hidden="true" size={isNarrow ? 20 : 26} strokeWidth={1.6} style={{ color: DEMO.accent, flexShrink: 0, marginTop: '2px' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '210px' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: isNarrow ? '0.98rem' : '1.12rem' }}>{HERO.title}</strong>
              {!isNarrow && (
                <span style={{
                  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: DEMO.accent, border: `1px solid ${DEMO.border}`, borderRadius: '999px', padding: '3px 8px',
                }}>
                  Start here
                </span>
              )}
            </span>
            {!isNarrow && <span style={{ color: DEMO.muted, fontSize: '0.88rem', lineHeight: 1.55, maxWidth: '60ch' }}>{HERO.body}</span>}
          </span>
          <span
            style={{
              backgroundColor: DEMO.accentSolid,
              color: DEMO_FX.onAccent,
              borderRadius: '999px',
              padding: isNarrow ? '11px 16px' : '10px 18px',
              fontSize: '0.85rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              alignSelf: 'center',
            }}
          >
            {busy === HERO.key ? 'Opening…' : `${HERO.cta} →`}
          </span>
        </button>

        {/* The remaining three, evenly. Three cards in a three-up grid — the
            orphaned fourth cell is gone because the fourth card moved above. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '12px',
            margin: '12px 0 0',
          }}
        >
          {PATHS.map(p => (
            <button
              key={p.key}
              onClick={() => choose(p.key)}
              disabled={busy !== null}
              style={{
                textAlign: 'left',
                backgroundColor: DEMO.surface,
                color: DEMO.text,
                border: `1px solid ${DEMO.border}`,
                borderRadius: '14px',
                padding: isNarrow ? '13px' : '18px',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy && busy !== p.key ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: isNarrow ? '5px' : '8px',
                font: 'inherit',
              }}
            >
              {/* On a phone the icon shares the title's line: stacked, each
                  card ran to ~200px and the fourth path plus Skip fell off the
                  screen. Same elements, half the height. */}
              {isNarrow ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <p.Icon aria-hidden="true" size={19} strokeWidth={1.6} style={{ color: DEMO.accent, flexShrink: 0 }} />
                  <strong style={{ fontSize: '0.95rem' }}>{p.title}</strong>
                </span>
              ) : (
                <>
                  <p.Icon aria-hidden="true" size={22} strokeWidth={1.6} style={{ color: DEMO.accent }} />
                  <strong style={{ fontSize: '0.98rem' }}>{p.title}</strong>
                </>
              )}
              {!isNarrow && <span style={{ color: DEMO.muted, fontSize: '0.82rem', lineHeight: 1.5, flex: 1 }}>{p.body}</span>}
              <span style={{ color: DEMO.accent, fontSize: '0.82rem', fontWeight: 600, marginTop: '4px' }}>
                {busy === p.key ? 'Opening…' : `${p.cta} →`}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p style={{ margin: '14px 0 0', color: DEMO_FX.danger, fontSize: '0.85rem' }}>
            Couldn&apos;t open the winery account just now — try again, or skip below and use
            the &ldquo;Winery Admin View&rdquo; button in the top bar.
          </p>
        )}

        {/* Genuinely prominent, per DemoDirections: an interstitial that traps
            people is worse than no interstitial at all. */}
        <div style={{ marginTop: isNarrow ? '16px' : '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={dismiss}
            style={{
              backgroundColor: 'transparent',
              color: DEMO.text,
              border: `1px solid ${DEMO.border}`,
              borderRadius: '999px',
              padding: isNarrow ? '13px 22px' : '10px 20px',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip — let me just explore
          </button>
          {!isNarrow && (
            <span style={{ color: DEMO.muted, fontSize: '0.75rem' }}>
              You can switch between the guest site and the winery&apos;s back office at any
              time, from the bar at the top.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
