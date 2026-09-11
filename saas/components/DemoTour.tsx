'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { DEMO_BOOKED_EVENT } from '@/lib/demoEvents'

/**
 * Guided spotlight tour for demo.vineworks.ge — Plan-DemoRedesign Phase 2,
 * DemoDirections Direction 03. Replaces the corner checklist (#159), which told
 * a visitor *what to click* but never *why they should care*.
 *
 * Dim → highlight → explain, with every step naming a commercial benefit in
 * money rather than describing a UI action. Renders nothing for other tenants.
 *
 * Three constraints from the design review, all load-bearing:
 *
 * 1. **It must never dim a screen the visitor navigated to themselves.** A tour
 *    that fights you is worse than no tour. Each step declares the route it
 *    belongs to; the spotlight only appears when the visitor is actually on that
 *    route. Anywhere else the tour shrinks to a pill that offers to continue.
 * 2. **Skip is always visible**, on every step.
 * 3. **The tooltip renders through a document.body portal** — see KnownBugs #7:
 *    popovers nested inside `overflow-hidden` ancestors get silently clipped,
 *    and this codebase has hit that twice.
 *
 * The scrim is four rectangles around the target rather than an SVG mask, so
 * the highlighted element stays genuinely clickable — the visitor can use the
 * thing being pointed at without leaving the tour.
 */

const STORAGE_KEY = 'vineworks-demo-tour'

/**
 * Set by DemoFrontDoor when the visitor picks "I run a winery", consumed here.
 * Deliberately a separate key from the tour's own state: the front door and the
 * tour live in different layouts (`(site)` vs `admin/(panel)`) and never share a
 * React tree, so localStorage is the only channel between them.
 *
 * Only that one path arms it. Someone who chose the guest view or the live
 * mirror asked for something specific and must not be taken over.
 */
export const TOUR_AUTOSTART_KEY = 'vineworks-demo-tour-autostart'

/** Where the "I run a winery" card lands. The auto-start waits for this route. */
const AUTO_START_ROUTE = '/admin/orders'

/**
 * Which step the auto-start opens on. 0 = the full seven-step tour, which means
 * navigating back to the guest site for steps 1–2 before returning to the back
 * office at step 3 — the narrative order (bookings arrive → here is where they
 * land). Set to `STEPS.findIndex(s => s.route === AUTO_START_ROUTE)` instead to
 * start where the visitor already is and skip the guest-site steps.
 */
const AUTO_START_INDEX = 0

/**
 * Let the screen the visitor asked for actually paint before the tour opens over
 * it. Taking over the instant the route resolves reads as a redirect loop.
 */
const AUTO_START_DELAY_MS = 900

/** Ceiling on the spotlight ring's height, as a fraction of the viewport. */
const MAX_RING_VIEWPORT_FRACTION = 0.62

/**
 * The demo's only conversion surface (task 3.3). Step 7 used to end on a bare
 * "Done" — seven reasons to care and then nothing asked of the visitor.
 *
 * Two CTAs, deliberately not mutually exclusive: the mail link does not end the
 * tour, so someone who writes can still take the /live invitation afterwards.
 * Max chose email over WhatsApp / a calendar link (2026-09-11); `max@vineworks.ge`
 * is the platform address bug reports already go to.
 */
const HANDOFF_EMAIL = 'max@vineworks.ge'
const HANDOFF_MAILTO =
  `mailto:${HANDOFF_EMAIL}` +
  '?subject=' + encodeURIComponent('Vineworks — I saw the demo') +
  '&body=' + encodeURIComponent('Hi Max,\n\nI just went through the Vineworks demo. My winery is:\n\n')

const C = {
  ink: '#1e1b4b',
  border: '#3730a3',
  text: '#e0e7ff',
  muted: '#a5b4fc',
  accent: '#4f46e5',
}

type Step = {
  /** Route this step lives on. The spotlight only shows here. */
  route: string
  /** `data-tour` value of the element to highlight. Missing target ⇒ the step
   *  still runs, centred, with no ring — a tour that vanishes because a selector
   *  drifted is worse than one that loses its ring. */
  target?: string
  title: string
  body: string
}

/**
 * Seven steps is the ceiling (DemoDirections). Every body names money or the
 * work it removes — "See it land in Orders" is an instruction, "a ₾600 booking
 * that arrived at 23:40 while you slept" is an argument.
 */
const STEPS: Step[] = [
  {
    route: '/',
    target: 'booking-form',
    title: 'Bookings arrive while you sleep',
    body: 'This form takes the booking, prices it against the right rate, and emails the guest — at 23:40 on a Saturday if that is when they decide. No phone call, no Facebook thread, nobody writing it in a notebook.',
  },
  {
    route: '/wines',
    target: 'wine-catalogue',
    title: 'Restaurants order cases without asking you',
    body: 'Wine bars and importers order straight from this list, each at the discount you agreed with them. This winery has four trade buyers on four different rates.',
  },
  {
    route: '/admin/orders',
    target: 'orders-table',
    title: 'Every booking in one place',
    body: 'Nearly 400 bookings, eighteen months of them, and nobody here typed a single one. Filter by date, company or status; send an invoice without leaving the row.',
  },
  {
    route: '/admin/orders',
    target: 'orders-filters',
    title: 'Six tour operators, six different prices',
    body: 'Each operator has its own rate ladder — per head, and different again for a group of 25 than for a group of 8. The system picks the right one. You stop quoting the wrong price.',
  },
  {
    route: '/admin/statistics',
    target: 'stats-cards',
    title: 'You know your season before it happens',
    body: 'Around ₾31,000 is already committed for the months ahead, from bookings that are on the books today. That is the number that tells you whether to hire for the summer.',
  },
  {
    route: '/admin/wine-orders',
    target: 'wine-orders-list',
    title: 'Tomorrow’s cases, already counted',
    body: 'The packing view turns open trade orders into a physical list — which wine, which vintage, how many bottles, for whom. Hand it to whoever is loading the van.',
  },
  {
    route: '/admin/content',
    target: 'content-editor',
    title: 'The website is yours to change',
    body: 'Text, photos, prices, opening hours — all edited here, in both Georgian and English. No developer, no ticket, no waiting a week for a paragraph.',
  },
]

type TourState = {
  started: boolean
  index: number
  finished: boolean
  /** Set once the auto-start has fired, so it never fires twice on this browser
   *  even if the arming flag is somehow re-set. */
  autoStarted: boolean
}
const EMPTY: TourState = { started: false, index: 0, finished: false, autoStarted: false }

function load(): TourState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
  } catch {
    return EMPTY
  }
}

function save(s: TourState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Private mode — the tour just won't persist across reloads.
  }
}

type Rect = { top: number; left: number; width: number; height: number }

export default function DemoTour({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<TourState | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [mounted, setMounted] = useState(false)
  // Resolved after mount, never during render: window does not exist on the
  // server, and branching on it during the first client render would produce a
  // hydration mismatch.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => { setEmbedded(isEmbeddedPane()) }, [])
  const [isNarrow, setIsNarrow] = useState(false)

  const isDemo = tenantId === DEMO_TENANT_ID

  useEffect(() => {
    setMounted(true)
    if (isDemo) setState(load())
  }, [isDemo])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const step = state && state.started && !state.finished ? STEPS[state.index] : null
  const onStepRoute = step ? pathname === step.route : false

  // Track the target's position. Recomputed on scroll and resize because the
  // ring is drawn in viewport coordinates — a spotlight that stays behind when
  // the page scrolls points at nothing.
  useEffect(() => {
    if (!step || !onStepRoute) { setRect(null); return }
    if (!step.target) { setRect(null); return }

    let frame = 0
    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step!.target}"]`)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) { setRect(null); return }
      const pad = 8
      // Clamp to the viewport as edges, not as an origin. Clamping `top` to 0
      // while leaving `height` alone pushes the bottom scrim panel off-screen
      // on any target taller than the viewport — a whole region that silently
      // never dims. Sections here run ~1000px, so that is the common case.
      const top = Math.max(0, r.top - pad)
      const left = Math.max(0, r.left - pad)
      const bottom = Math.min(window.innerHeight, r.bottom + pad)
      const right = Math.min(window.innerWidth, r.right + pad)
      // A target taller than the viewport leaves nothing to dim — the "spotlight"
      // becomes the whole screen and the effect is lost. Sections on these pages
      // run ~1000px, so cap the ring to the top portion of a tall target: it
      // still frames the right thing, and the dim stays visible.
      const maxHeight = window.innerHeight * MAX_RING_VIEWPORT_FRACTION
      setRect({
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.min(maxHeight, Math.max(0, bottom - top)),
      })
    }

    // The target may not be painted on the first tick after a route change.
    const t = window.setTimeout(measure, 60)
    function onMove() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(frame)
      window.clearTimeout(t)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [step, onStepRoute, pathname])

  // Scroll the target into view when a step opens, so the ring is never drawn
  // around something off-screen.
  useEffect(() => {
    if (!step || !onStepRoute || !step.target) return
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (!el) return
      // Centring a target taller than the viewport puts its top off-screen,
      // which is where the ring is drawn. Align tall ones to the top instead.
      const tall = el.getBoundingClientRect().height > window.innerHeight * MAX_RING_VIEWPORT_FRACTION
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [step, onStepRoute])

  const update = useCallback((next: TourState) => {
    save(next)
    setState(next)
  }, [])

  /**
   * Open the tour at `index`, going to that step's screen if we aren't on it.
   *
   * This is the fix for the "Tour paused · step 1 of 7" dead end. The rule that
   * the tour must never dim a screen the visitor navigated to themselves is
   * load-bearing and stays — but it was also firing on an *explicit* press of
   * the start button, which meant asking for the tour and being told the tour
   * was paused. A deliberate tour control (start, replay, back, next) now takes
   * the visitor to the step's screen; only wandering off mid-tour pauses.
   */
  const beginAt = useCallback((index: number, auto = false) => {
    setState(prev => {
      const next: TourState = {
        started: true,
        index,
        finished: false,
        autoStarted: auto || (prev?.autoStarted ?? false),
      }
      save(next)
      return next
    })
    const dest = STEPS[index].route
    if (dest !== pathname) router.push(dest)
  }, [pathname, router])

  // ---- Auto-start on the "I run a winery" path (approved in Plan-DemoFlowFixes'
  // "Decisions already made"). Armed by DemoFrontDoor, consumed exactly once. ----
  useEffect(() => {
    if (!isDemo || embedded || !state) return
    if (state.started || state.finished || state.autoStarted) return
    if (pathname !== AUTO_START_ROUTE) return

    let armed = false
    try { armed = localStorage.getItem(TOUR_AUTOSTART_KEY) === 'armed' } catch { /* private mode */ }
    if (!armed) return

    const t = window.setTimeout(() => {
      try { localStorage.removeItem(TOUR_AUTOSTART_KEY) } catch { /* private mode */ }
      beginAt(AUTO_START_INDEX, true)
    }, AUTO_START_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [isDemo, embedded, state, pathname, beginAt])

  // A booking submitted during the tour jumps to the step that shows it landing.
  useEffect(() => {
    if (!isDemo) return
    function onBooked() {
      setState(prev => {
        if (!prev?.started || prev.finished) return prev
        const target = STEPS.findIndex(s => s.route === '/admin/orders')
        if (target < 0 || prev.index >= target) return prev
        const next = { ...prev, index: target }
        save(next)
        return next
      })
    }
    window.addEventListener(DEMO_BOOKED_EVENT, onBooked)
    return () => window.removeEventListener(DEMO_BOOKED_EVENT, onBooked)
  }, [isDemo])

  if (!isDemo || !mounted || !state || embedded) return null

  const start = () => beginAt(0)
  const skip = () => update({ ...state, started: false, finished: true })
  // Back navigates too: stepping back from /admin/orders to the /wines step used
  // to leave the visitor on the admin page staring at "Tour paused", which is the
  // same misfire as the start button's, just reached from the other direction.
  const back = () => beginAt(Math.max(0, state.index - 1))
  const next = () => {
    if (state.index >= STEPS.length - 1) return update({ ...state, started: false, finished: true })
    beginAt(state.index + 1)
  }
  const isLast = state.index >= STEPS.length - 1
  /** Close the tour and hand the visitor to the live mirror, where the thing the
   *  tour has been describing actually happens in front of them. */
  const handOffToMirror = () => {
    update({ ...state, started: false, finished: true })
    router.push('/live')
  }

  // ---- Not touring: a small invitation pill, never a takeover. ----
  if (!step) {
    return createPortal(
      <button
        onClick={start}
        style={{
          position: 'fixed',
          bottom: 'calc(16px + var(--cart-bar-offset, 0px))',
          left: '16px',
          zIndex: 150,
          backgroundColor: C.ink,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: '999px',
          padding: '10px 18px',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
        }}
      >
        {state.finished ? '🍷 Replay the tour' : '🍷 Show me what this does'}
      </button>,
      document.body,
    )
  }

  // ---- Touring, but the visitor wandered off this step's screen. Do NOT dim
  // a page they chose to visit; offer to resume instead. ----
  if (!onStepRoute) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(16px + var(--cart-bar-offset, 0px))',
          left: '16px',
          zIndex: 150,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: C.ink,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: '999px',
          padding: '8px 10px 8px 16px',
          fontSize: '0.8rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
        }}
      >
        <span>Tour paused · step {state.index + 1} of {STEPS.length}</span>
        <button
          onClick={() => router.push(step.route)}
          style={{ backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: '999px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
        >
          Resume →
        </button>
        <button
          onClick={skip}
          aria-label="End the tour"
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '0.9rem', padding: '2px 6px' }}
        >
          ✕
        </button>
      </div>,
      document.body,
    )
  }

  // ---- Touring, on the right screen: dim, ring, explain. ----
  const scrim = 'rgba(15, 13, 40, 0.72)'
  const panels: React.CSSProperties[] = rect
    ? [
        { top: 0, left: 0, right: 0, height: rect.top },
        { top: rect.top, left: 0, width: rect.left, height: rect.height },
        { top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height },
        { top: rect.top + rect.height, left: 0, right: 0, bottom: 0 },
      ]
    : [{ inset: 0 }]

  // Tooltip: under the ring when there's room, above it otherwise. On a narrow
  // screen it docks to the bottom instead — a floating card beside a spotlight
  // does not fit at 375px.
  const TOOLTIP_W = 340
  // The last step carries the hand-off — two stacked CTAs instead of one button
  // row — so it needs more clearance than the others or it runs off the bottom.
  const TOOLTIP_H = isLast ? 300 : 190
  const tooltipStyle: React.CSSProperties = isNarrow || !rect
    ? { left: 12, right: 12, bottom: 12 }
    : (rect.top + rect.height + TOOLTIP_H < window.innerHeight
        ? { top: rect.top + rect.height + 12, left: Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - TOOLTIP_W - 12)), width: TOOLTIP_W }
        : { top: Math.max(12, rect.top - TOOLTIP_H), left: Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - TOOLTIP_W - 12)), width: TOOLTIP_W })

  return createPortal(
    <div aria-live="polite">
      {panels.map((s, i) => (
        <div key={i} style={{ position: 'fixed', backgroundColor: scrim, zIndex: 150, ...s }} onClick={skip} />
      ))}

      {rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            border: `2px solid ${C.accent}`,
            borderRadius: '12px',
            boxShadow: '0 0 0 3px rgba(79,70,229,0.35)',
            zIndex: 151,
            // The hole stays usable: the visitor can click the thing being
            // pointed at without dropping out of the tour.
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={`Tour step ${state.index + 1} of ${STEPS.length}`}
        style={{
          position: 'fixed',
          zIndex: 152,
          backgroundColor: C.ink,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          ...tooltipStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>
            {state.index + 1} / {STEPS.length}
          </span>
          <button
            onClick={skip}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' }}
          >
            {/* "Skip the tour" is the wrong word once there is nothing left to
                skip — but a dismissal must stay visible on every step. */}
            {isLast ? 'Close' : 'Skip the tour'}
          </button>
        </div>

        <strong style={{ display: 'block', margin: '8px 0 0', fontSize: '1rem', lineHeight: 1.3 }}>{step.title}</strong>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', lineHeight: 1.55, color: C.muted }}>{step.body}</p>

        {/* ---- The hand-off (task 3.3). The last step is the one moment the
             visitor has been given seven reasons to care, so it asks for
             something instead of ending on "Done". ---- */}
        {isLast ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
            <button
              onClick={handOffToMirror}
              style={{ backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: '999px', padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}
            >
              Now try it yourself → make a booking and watch it arrive
            </button>
            <a
              href={HANDOFF_MAILTO}
              style={{ display: 'block', backgroundColor: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}
            >
              Talk to us about your winery
            </a>
            {/* Both left-aligned on purpose: on the full-width dock this row's
                right-hand end sits underneath the floating bug-report button. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
              <button
                onClick={back}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' }}
              >
                Back
              </button>
              <span style={{ color: C.muted, fontSize: '0.72rem' }}>· {HANDOFF_EMAIL}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            {state.index > 0 && (
              <button
                onClick={back}
                style={{ backgroundColor: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              style={{ flex: 1, backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: '999px', padding: '9px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
