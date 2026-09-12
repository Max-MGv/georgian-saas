'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { DEMO_BOOKED_EVENT } from '@/lib/demoEvents'
import { useAnchorRect } from '@/lib/demoAnchor'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import { useIsNarrow } from '@/lib/useIsNarrow'
import { trackDemo } from '@/lib/demoAnalytics'
import {
  TOUR_AUTOSTART_KEY,
  TOUR_COMMAND_EVENT,
  TOUR_STEPS,
  type TourCommand,
  type TourState,
  EMPTY_TOUR_STATE,
  loadTourState,
  saveTourState,
} from '@/lib/demoTour'

/**
 * Guided spotlight tour for demo.vineworks.ge — Plan-DemoRedesign Phase 2,
 * DemoDirections Direction 03. Replaces the corner checklist (#159), which told
 * a visitor *what to click* but never *why they should care*.
 *
 * Dim → highlight → explain, with every step naming a commercial benefit in
 * money rather than describing a UI action. Renders nothing for other tenants.
 *
 * **This file is the tour's screen, not its front door.** Entry — start,
 * replay, resume, and the "Tour paused · step N of 7" pill — moved to
 * `DemoExplore` on 2026-09-12, when the tour's pill and the feature rail's edge
 * tab were merged into one control. The steps and the state moved with it, into
 * `lib/demoTour.ts`. What is left here is: decide whether a step is showing,
 * and if so dim the screen, ring the anchor, and explain it. Everything that
 * changes the state still happens here — `DemoExplore` asks by dispatching
 * `TOUR_COMMAND_EVENT` and this decides what that means.
 *
 * Three constraints from the design review, all load-bearing:
 *
 * 1. **It must never dim a screen the visitor navigated to themselves.** A tour
 *    that fights you is worse than no tour. Each step declares the route it
 *    belongs to; the spotlight only appears when the visitor is actually on that
 *    route. Anywhere else the tour shrinks to the Explore pill's paused state,
 *    which offers to continue.
 * 2. **Skip is always visible**, on every step.
 * 3. **The tooltip renders through a document.body portal** — see KnownBugs #7:
 *    popovers nested inside `overflow-hidden` ancestors get silently clipped,
 *    and this codebase has hit that twice.
 *
 * The scrim is four rectangles around the target rather than an SVG mask, so
 * the highlighted element stays genuinely clickable — the visitor can use the
 * thing being pointed at without leaving the tour.
 */

/** Where the "I run a winery" card lands. The auto-start waits for this route. */
const AUTO_START_ROUTE = '/admin/orders'

/**
 * Which step the auto-start opens on. 0 = the full seven-step tour, which means
 * navigating back to the guest site for steps 1–2 before returning to the back
 * office at step 3 — the narrative order (bookings arrive → here is where they
 * land). Set to `TOUR_STEPS.findIndex(s => s.route === AUTO_START_ROUTE)`
 * instead to start where the visitor already is and skip the guest-site steps.
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

// Palette: lib/demoTheme ("cellar dark"), Plan-DemoFlowFixes Chunk 5 task 5.1.
// The local key names this file already used are kept, so the swap happens in
// one place rather than at sixty call sites. No literal hex below this line.
//
// `accent` and `ring` are deliberately different tokens: the filled CTA needs a
// background dark enough for ivory text to sit on, the spotlight ring needs to
// be the brightest thing on a dimmed screen. One token could not be both.
const C = {
  ink: DEMO.surface,
  border: DEMO.border,
  text: DEMO.text,
  muted: DEMO.muted,
  accent: DEMO.accentSolid,
  ring: DEMO.accent,
}

export default function DemoTour({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<TourState | null>(null)
  const [mounted, setMounted] = useState(false)
  // Resolved after mount, never during render: window does not exist on the
  // server, and branching on it during the first client render would produce a
  // hydration mismatch.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => { setEmbedded(isEmbeddedPane()) }, [])
  // Was three lines of matchMedia here; the front door, the banner and the live
  // mirror all needed the same answer, so it moved to a shared hook.
  const isNarrow = useIsNarrow()

  const isDemo = tenantId === DEMO_TENANT_ID

  useEffect(() => {
    setMounted(true)
    if (isDemo) setState(loadTourState())
  }, [isDemo])

  const step = state && state.started && !state.finished ? TOUR_STEPS[state.index] : null
  const onStepRoute = step ? pathname === step.route : false

  // Resolve and track the target. Polled, not measured once — see
  // lib/demoAnchor.ts for the measurement that proved a single 60ms shot loses
  // the race against the destination route painting on every step reached by a
  // navigation. That was six of the seven steps.
  const rect = useAnchorRect(step?.target, !!step && onStepRoute, {
    maxHeightFraction: MAX_RING_VIEWPORT_FRACTION,
    pad: 8,
    source: 'DemoTour',
    scrollIntoView: true,
  })

  /**
   * A mirror of `state` for the analytics decisions below.
   *
   * They have to happen *outside* the `setState` updaters: an updater must be a
   * pure function of its previous value, and React deliberately calls it twice
   * in development StrictMode — an event fired in there would be counted twice
   * in dev and once in production, which is the worst of both worlds for
   * something whose entire job is to be a number you can trust.
   */
  const stateRef = useRef<TourState | null>(null)
  useEffect(() => { stateRef.current = state }, [state])

  const update = useCallback((next: TourState) => {
    saveTourState(next)
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
    // Only a genuine start counts, not a step change: resuming or stepping
    // through an already-running tour is not a second visitor starting one.
    const before = stateRef.current
    if (!before?.started || before.finished) {
      trackDemo('tour_started', { step: index + 1, auto })
    }
    setState(prev => {
      const next: TourState = {
        started: true,
        index,
        finished: false,
        autoStarted: auto || (prev?.autoStarted ?? false),
      }
      saveTourState(next)
      return next
    })
    const dest = TOUR_STEPS[index].route
    if (dest !== pathname) router.push(dest)
  }, [pathname, router])

  /** End the tour where the visitor stands. Used by Skip, by the last step's
   *  Close, and by the Explore pill's ✕. */
  const endTour = useCallback(() => {
    // The step it ended on is the measurement. Ending on the last step is the
    // visitor reaching the end; ending anywhere else is the tour losing them,
    // and *which* step lost them is the whole reason the event carries one.
    const before = stateRef.current
    if (before?.started && !before.finished) {
      const atEnd = before.index >= TOUR_STEPS.length - 1
      if (atEnd) trackDemo('tour_completed')
      else trackDemo('tour_abandoned', { step: before.index + 1 })
    }
    setState(prev => {
      const next: TourState = { ...(prev ?? EMPTY_TOUR_STATE), started: false, finished: true }
      saveTourState(next)
      return next
    })
  }, [])

  // ---- Commands from DemoExplore, which owns the entry control since the
  // 2026-09-12 merge. It asks; the decision about what "begin" means (including
  // the navigation in beginAt) stays here, so there is still exactly one writer
  // of the tour's state. ----
  useEffect(() => {
    if (!isDemo || embedded) return
    function onCommand(e: Event) {
      const command = (e as CustomEvent<TourCommand>).detail
      if (!command) return
      if (command.action === 'begin') beginAt(command.index)
      else if (command.action === 'end') endTour()
    }
    window.addEventListener(TOUR_COMMAND_EVENT, onCommand)
    return () => window.removeEventListener(TOUR_COMMAND_EVENT, onCommand)
  }, [isDemo, embedded, beginAt, endTour])

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

  // Count a step when its spotlight is actually on screen, not when the index
  // changes: a step the visitor never saw (because they navigated away before it
  // painted) is not a step they reached. The ref keeps React's re-renders from
  // counting the same one twice.
  const countedStep = useRef<number | null>(null)
  useEffect(() => {
    if (!isDemo || embedded || !state?.started || state.finished) return
    if (!onStepRoute) return
    if (countedStep.current === state.index) return
    countedStep.current = state.index
    trackDemo('tour_step', { step: state.index + 1 })
  }, [isDemo, embedded, state, onStepRoute])

  // A booking submitted during the tour jumps to the step that shows it landing.
  useEffect(() => {
    if (!isDemo) return
    function onBooked() {
      setState(prev => {
        if (!prev?.started || prev.finished) return prev
        const target = TOUR_STEPS.findIndex(s => s.route === '/admin/orders')
        if (target < 0 || prev.index >= target) return prev
        const next = { ...prev, index: target }
        saveTourState(next)
        return next
      })
    }
    window.addEventListener(DEMO_BOOKED_EVENT, onBooked)
    return () => window.removeEventListener(DEMO_BOOKED_EVENT, onBooked)
  }, [isDemo])

  if (!isDemo || !mounted || !state || embedded) return null

  const skip = endTour
  // Back navigates too: stepping back from /admin/orders to the /wines step used
  // to leave the visitor on the admin page staring at "Tour paused", which is the
  // same misfire as the start button's, just reached from the other direction.
  const back = () => beginAt(Math.max(0, state.index - 1))
  const next = () => {
    if (state.index >= TOUR_STEPS.length - 1) return endTour()
    beginAt(state.index + 1)
  }
  const isLast = state.index >= TOUR_STEPS.length - 1
  /** Close the tour and hand the visitor to the live mirror, where the thing the
   *  tour has been describing actually happens in front of them. */
  const handOffToMirror = () => {
    // Two events, deliberately: the visitor both finished the tour and took its
    // primary CTA, and the funnel needs to be able to ask those separately.
    trackDemo('cta_live_mirror')
    trackDemo('tour_completed')
    update({ ...state, started: false, finished: true })
    router.push('/live')
  }

  // ---- Not touring, or touring but off this step's screen. Both used to draw a
  // pill here; both are now the Explore control's job (bottom right), so that a
  // visitor is never offered two floating invitations at once. Do NOT reinstate
  // a pill here without removing the corresponding state from DemoExplore. ----
  if (!step || !onStepRoute) return null

  // ---- Touring, on the right screen: dim, ring, explain. ----
  const scrim = DEMO_FX.scrimTour
  const panels: React.CSSProperties[] = rect
    ? [
        { top: 0, left: 0, right: 0, height: rect.top },
        { top: rect.top, left: 0, width: rect.left, height: rect.height },
        { top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height },
        { top: rect.top + rect.height, left: 0, right: 0, bottom: 0 },
      ]
    : [{ inset: 0 }]

  // ---- Tooltip placement (task 4.4) ----
  //
  // The full-bleed bar docked across the bottom is the *mobile* treatment. It
  // was showing up at 1440px because it doubled as the `!rect` fallback, and
  // `rect` was null on six steps out of seven. With the anchor race fixed that
  // branch is rare — but "rare" is not "never" (an anchor really can go missing
  // after a refactor), so the desktop fallback is now a compact centred card
  // rather than the dock. The dock is reached only on a genuinely narrow screen.
  const TOOLTIP_W = 340
  // The last step carries the hand-off — two stacked CTAs instead of one button
  // row — so it needs more clearance than the others or it runs off the bottom.
  const TOOLTIP_H = isLast ? 300 : 190
  const clampLeft = (x: number) =>
    Math.min(Math.max(12, x), Math.max(12, window.innerWidth - TOOLTIP_W - 12))

  let tooltipStyle: React.CSSProperties
  if (isNarrow) {
    tooltipStyle = { left: 12, right: 12, bottom: 12 }
  } else if (!rect) {
    // Desktop, no anchor: centre it. Never the full-width dock.
    tooltipStyle = {
      top: Math.max(12, (window.innerHeight - TOOLTIP_H) / 2),
      left: clampLeft((window.innerWidth - TOOLTIP_W) / 2),
      width: TOOLTIP_W,
    }
  } else if (rect.top + rect.height + TOOLTIP_H + 12 < window.innerHeight) {
    // Below the ring.
    tooltipStyle = { top: rect.top + rect.height + 12, left: clampLeft(rect.left), width: TOOLTIP_W }
  } else if (rect.top - TOOLTIP_H - 12 > 0) {
    // Above it.
    tooltipStyle = { top: rect.top - TOOLTIP_H - 12, left: clampLeft(rect.left), width: TOOLTIP_W }
  } else if (window.innerWidth - rect.left - rect.width > TOOLTIP_W + 24) {
    // Beside it, to the right — a tall ring that fills the vertical space still
    // gets a compact card instead of falling back to the dock.
    tooltipStyle = { top: Math.max(12, rect.top), left: rect.left + rect.width + 12, width: TOOLTIP_W }
  } else if (rect.left > TOOLTIP_W + 24) {
    // Beside it, to the left.
    tooltipStyle = { top: Math.max(12, rect.top), left: rect.left - TOOLTIP_W - 12, width: TOOLTIP_W }
  } else {
    // The ring fills the screen in both axes. Overlay it, bottom-right, still
    // at a fixed width — the visitor can see what is ringed around the card.
    tooltipStyle = {
      top: Math.max(12, window.innerHeight - TOOLTIP_H - 16),
      left: clampLeft(window.innerWidth - TOOLTIP_W - 16),
      width: TOOLTIP_W,
    }
  }

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
            border: `2px solid ${C.ring}`,
            borderRadius: '12px',
            boxShadow: DEMO_FX.ring,
            zIndex: 151,
            // The hole stays usable: the visitor can click the thing being
            // pointed at without dropping out of the tour.
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={`Tour step ${state.index + 1} of ${TOUR_STEPS.length}`}
        style={{
          position: 'fixed',
          zIndex: 152,
          backgroundColor: C.ink,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: DEMO_FX.shadowMd,
          ...tooltipStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ color: C.muted, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>
            {state.index + 1} / {TOUR_STEPS.length}
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
              style={{ backgroundColor: C.accent, color: DEMO_FX.onAccent, border: 'none', borderRadius: '999px', padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}
            >
              Now try it yourself → make a booking and watch it arrive
            </button>
            <a
              href={HANDOFF_MAILTO}
              // The one event that is unambiguously a lead. It does not end the
              // tour — see the note on HANDOFF_MAILTO — so no completion here.
              onClick={() => trackDemo('cta_email')}
              style={{ display: 'block', backgroundColor: 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}
            >
              Talk to us about your winery
            </a>
            {/* Both left-aligned on purpose: on the full-width dock this row's
                right-hand end sits underneath the Explore pill. */}
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
              style={{ flex: 1, backgroundColor: C.accent, color: DEMO_FX.onAccent, border: 'none', borderRadius: '999px', padding: '9px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
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
