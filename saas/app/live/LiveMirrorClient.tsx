'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO_BOOKED_EVENT } from '@/lib/demoEvents'
import { signInAsDemoAdmin } from '@/lib/demoAuth'

/**
 * The live mirror — Plan-DemoRedesign Phase 4, DemoDirections Direction 02.
 * The guest site and the back office side by side, in one view: book on the
 * left, watch it land on the right.
 *
 * Why this is the flagship: the actual differentiator is that the guest-facing
 * site and the back office are *one system*. Everywhere else in the demo, a
 * visitor has to book, then remember to switch, then trust that what they are
 * seeing is connected. Both panes on screen at once removes the memory step and
 * the trust gap — the causal link is simply visible. None of the researched
 * competitors (Bookeo, BookingPress, Cloudbeds, Toast) does this.
 *
 * **Sync mechanism (task 4.1): same-origin iframes + the existing booked event,
 * posted up to this parent, which reloads the admin pane.** Cheapest thing that
 * works, per the plan. Polling would burn queries against a demo nobody is
 * watching most of the time, and server-sent events would need an endpoint,
 * a connection per viewer and a reconnect story — all to deliver one bit that
 * the page already knows locally the instant it happens.
 *
 * Both panes are the real pages, not mockups: an iframe of the actual guest site
 * and the actual admin panel. They render without their own demo chrome because
 * every demo component checks lib/demoEmbed.
 */

const C = {
  ink: '#1e1b4b',
  inkSoft: '#312e81',
  border: '#3730a3',
  text: '#e0e7ff',
  muted: '#a5b4fc',
  accent: '#4f46e5',
  ok: '#22c55e',
}

const GUEST_SRC = '/'
const ADMIN_SRC = '/admin/orders'

export default function LiveMirrorClient() {
  const adminRef = useRef<HTMLIFrameElement>(null)
  const adminWrapRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [landed, setLanded] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const narrow = window.matchMedia('(max-width: 900px)')
    const sync = () => { setReducedMotion(motion.matches); setIsNarrow(narrow.matches) }
    sync()
    motion.addEventListener('change', sync)
    narrow.addEventListener('change', sync)
    return () => { motion.removeEventListener('change', sync); narrow.removeEventListener('change', sync) }
  }, [])

  // The admin pane needs a session before it will render anything but a login
  // form. Sign in first, then mount the frames.
  useEffect(() => {
    let cancelled = false
    signInAsDemoAdmin().then(({ ok }) => {
      if (cancelled) return
      if (ok) setReady(true)
      else setFailed(true)
    })
    return () => { cancelled = true }
  }, [])

  /**
   * Finds the row the visitor just created and marks it — DemoDirections
   * Direction 02 asks for the booking to land "highlighted, timestamped
   * 'just now'", and the pane is an iframe of the real orders table.
   *
   * Done by reaching into the same-origin frame rather than by threading a
   * highlight parameter through the orders page: that page is real product
   * surface shared with every winery, and it should not grow a query parameter
   * that exists solely for the demo. The cost is that this is matched on the
   * guest's name, so it degrades to "no highlight" rather than misfiring if the
   * table markup changes.
   */
  const highlightNewRow = useCallback((who: { name?: string; surname?: string }) => {
    if (!who.name) return
    const needle = `${who.name} ${who.surname ?? ''}`.trim().toLowerCase()

    // Polled from the moment the booking is announced, straight through the
    // reload, rather than started on the iframe's `load` event. The pane is a
    // full Next.js app: `load` fires long before it has hydrated and painted
    // ~400 rows, so anchoring the window to it meant the poll could expire
    // before the row ever existed. Re-reading contentDocument each tick means
    // the reload is simply absorbed. There is no risk of matching early — the
    // booking cannot appear in the pre-reload document.
    // (Same mistake, same fix, as the feature rail's callout anchor.)
    let attempts = 0
    let applied = false
    /** Keep re-applying for ~5s after the first hit, to outlive hydration. */
    let settleTicks = Number.POSITIVE_INFINITY
    const timer = window.setInterval(() => {
      if (applied && settleTicks === Number.POSITIVE_INFINITY) settleTicks = attempts + 25
      attempts++
      const doc = adminRef.current?.contentDocument
      const row = doc
        ? ([...doc.querySelectorAll('tbody tr')].find(tr =>
            (tr.textContent ?? '').toLowerCase().includes(needle),
          ) as HTMLElement | undefined)
        : undefined

      if (row) {
        applied = true
        row.style.outline = `2px solid ${C.ok}`
        row.style.outlineOffset = '-2px'
        row.style.backgroundColor = 'rgba(34,197,94,0.12)'
        if (!reducedMotion) row.style.transition = 'background-color 600ms ease-out'
        row.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })

        // "just now", pinned to the row itself rather than to the pane.
        const firstCell = row.querySelector('td')
        if (doc && firstCell && !firstCell.querySelector('[data-just-now]')) {
          const pill = doc.createElement('span')
          pill.setAttribute('data-just-now', '')
          pill.textContent = 'just now'
          pill.style.cssText = [
            'display:inline-block', 'margin-left:8px', 'padding:2px 8px',
            'border-radius:999px', `background:${C.ok}`, 'color:#052e16',
            'font-size:0.68rem', 'font-weight:700', 'vertical-align:middle',
          ].join(';')
          firstCell.appendChild(pill)
        }
        // Deliberately NOT stopping on first success. The pane is its own
        // React root: the poll usually finds the row in server-rendered HTML
        // *before* that root hydrates, and hydration then reconciles the table
        // and throws away the inline styles and the pill. Re-applying for a
        // few seconds outlives that. Every step is idempotent — the pill is
        // only appended when the cell does not already have one, and a
        // hydration-replaced cell correctly does not.
        if (attempts > settleTicks) window.clearInterval(timer)
        return
      }
      // ~20s ceiling, generous because a cold pane on a slow connection can
      // take a while. Giving up quietly is right: the booking is in the table
      // either way, it just isn't ringed.
      if (attempts > 100) window.clearInterval(timer)
    }, 200)
  }, [reducedMotion])

  const refreshAdmin = useCallback((who: { name?: string; surname?: string }) => {
    const frame = adminRef.current
    if (!frame) return
    try {
      // Same-origin, so a direct reload works and preserves the pane's own URL
      // if the visitor has navigated inside it.
      frame.contentWindow?.location.reload()
    } catch {
      frame.src = `${ADMIN_SRC}?t=${Date.now()}`
    }
    // Then look for the row — reload first, highlight second. Highlighting
    // before the reload marks the outgoing document, and the reload throws the
    // mark away; that is invisible on a first booking (the row cannot be there
    // yet) and only shows up on a repeat, which is exactly how it slipped
    // through once. The short delay lets the navigation begin so the poll does
    // not match the row it is about to destroy.
    window.setTimeout(() => highlightNewRow(who), 500)
  }, [highlightNewRow])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only trust our own origin — this listener triggers a reload, and the
      // page embeds frames.
      if (e.origin !== window.location.origin) return
      if (!e.data || e.data.type !== DEMO_BOOKED_EVENT) return
      refreshAdmin(e.data.detail ?? {})
      setLanded(true)
      // On a stacked layout the admin pane is below the fold, so the landing
      // moment would happen off-screen. Bring it into view.
      if (isNarrow) {
        adminWrapRef.current?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refreshAdmin, isNarrow, reducedMotion])

  useEffect(() => {
    if (!landed) return
    const t = window.setTimeout(() => setLanded(false), 9000)
    return () => window.clearTimeout(t)
  }, [landed])

  const paneStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    minHeight: isNarrow ? '78vh' : 0,
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${C.border}`,
    borderRadius: '14px',
    overflow: 'hidden',
    backgroundColor: '#fff',
    position: 'relative',
  }

  const paneHeader = (title: string, sub: string, accent?: boolean): React.ReactNode => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '9px 14px',
      backgroundColor: accent ? C.accent : C.inkSoft,
      color: '#fff',
      fontSize: '0.78rem',
      flexShrink: 0,
    }}>
      <strong>{title}</strong>
      <span style={{ opacity: 0.75 }}>{sub}</span>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0d28',
      color: C.text,
      display: 'flex',
      flexDirection: 'column',
      padding: 'clamp(12px, 2vw, 20px)',
      gap: '14px',
    }}>
      <header style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, color: C.muted, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Vineworks — live mirror
          </p>
          <a href="/" style={{ color: C.muted, fontSize: '0.78rem' }}>← back to the demo</a>
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(1.1rem, 2.6vw, 1.5rem)', fontWeight: 700 }}>
          Book on the left. Watch it arrive on the right.
        </h1>
        <p style={{ margin: '6px 0 0', color: C.muted, fontSize: '0.85rem', maxWidth: '70ch', lineHeight: 1.5 }}>
          Both sides are the real thing — the guest&apos;s booking form, and the winery&apos;s
          own back office. Same system, same second. Fill in the form on the left and the
          bookings table will refresh on its own.
        </p>
      </header>

      {failed && (
        <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
          Couldn&apos;t open the winery account, so the right-hand pane can&apos;t load.
          Try reloading the page.
        </p>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        gap: '14px',
        minHeight: 0,
      }}>
        <div style={paneStyle}>
          {paneHeader('Guest view', 'what your customer sees')}
          {ready
            ? <iframe src={GUEST_SRC} title="Guest view" style={{ flex: 1, width: '100%', border: 'none' }} />
            : <PaneLoading />}
        </div>

        <div ref={adminWrapRef} style={paneStyle}>
          {paneHeader('Winery admin', 'what you see', true)}
          {ready
            ? <iframe ref={adminRef} src={ADMIN_SRC} title="Winery admin" style={{ flex: 1, width: '100%', border: 'none' }} />
            : <PaneLoading />}

          {landed && (
            <div
              role="status"
              style={{
                position: 'absolute',
                top: '46px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 5,
                backgroundColor: C.ok,
                color: '#052e16',
                borderRadius: '999px',
                padding: '7px 16px',
                fontSize: '0.8rem',
                fontWeight: 700,
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                // Respect prefers-reduced-motion: the pill still appears, it
                // just doesn't move.
                animation: reducedMotion ? undefined : 'vw-land 480ms ease-out',
              }}
            >
              ● Just landed — new booking, just now
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes vw-land {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
}

function PaneLoading() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#f5efe6', color: '#6b5a47', fontSize: '0.85rem',
    }}>
      Opening the winery…
    </div>
  )
}
