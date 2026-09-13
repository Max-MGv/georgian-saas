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
  SURFACE_LABEL,
  SURFACE_CHANGE_NOTE,
  isSurfaceChange,
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

/**
 * "The last step change came from the keyboard, so move focus with it."
 *
 * Module scope, not a ref, and that is the whole point. Stepping between the
 * guest site and the back office unmounts this component and mounts a fresh one
 * in the other layout's React tree — see the note at the top of lib/demoTour.ts
 * — so any ref holding this intent dies exactly at the crossing. Measured: the
 * first arrow press moved focus, the one that crossed from /wines to
 * /admin/orders did not, and a keyboard user was then stranded on <body> with
 * the tour dialog last in tab order behind a whole admin page.
 *
 * A module-level `let` survives it, because both trees are the same document
 * and the same module instance. Both instances may briefly be mounted at once;
 * whichever one has actually rendered the rail consumes the flag, and the other
 * returns early because its ref is still null.
 */
let railFocusPending = false

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

  useEffect(() => {
    if (!railFocusPending) return
    // Do NOT clear the flag until the rail actually exists. An arrow press moves
    // the step, which usually changes route; the tour then renders `null` for
    // the frames between the command and the destination being on-screen, and
    // `railCurrentRef` is null throughout. Clearing the flag on one of those
    // renders — which is what the first version did — dropped the focus move on
    // the floor, so the second arrow press went nowhere and the roving tabindex
    // this pairs with became a keyboard trap. Verified by walking the rail with
    // Home / arrows / End: every press moved the step, none moved focus.
    // Found in the DOM rather than held in a ref. A conditional object ref
    // (`ref={i === state.index ? r : undefined}`) has to be detached from the
    // old segment and attached to the new one in the same commit, and the two
    // are order-dependent: measured, moving *forward* along the rail focused
    // correctly and moving *back* on the same route left the ref null, so the
    // keyboard user's focus stayed on the segment they had just left. The
    // attribute is rendered by this component one line below, so the query
    // cannot disagree with the state the way a stale ref can.
    const el = document.querySelector<HTMLButtonElement>('button[aria-current="step"][aria-label^="Go to step"]')
    if (!el) return
    railFocusPending = false
    el.focus()
  })

  /**
   * The one way this component writes tour state: persist, announce, then set.
   *
   * **Every write goes through here, and none of it belongs inside a `setState`
   * updater.** `beginAt`, `endTour` and the booking listener each used to call
   * `saveTourState` from within their updater, which produced a real React
   * error on every step change — "Cannot update a component (DemoExplore) while
   * rendering a different component (DemoTour)". `saveTourState` dispatches
   * `TOUR_STATE_EVENT` synchronously; `DemoExplore` listens for it and calls its
   * own setState; and an updater runs during DemoTour's render phase, so that
   * setState landed mid-render. In StrictMode the updater also runs twice, so
   * the write and the announcement both happened twice in development.
   *
   * The comment on `stateRef` below already stated the rule — an updater must be
   * a pure function of its previous value — for the analytics calls. It applies
   * just as much to the persistence, which is why `before` (the ref) is what
   * these callers read instead of `prev`. Found 2026-09-13; predates the
   * orientation work, surfaced by it.
   */
  const update = useCallback((next: TourState) => {
    // Keep the mirror in step here as well as in the effect above. The effect
    // only runs after the commit, so "the ref is current" holds today purely
    // because nothing writes twice in one tick — a property any future caller
    // can break silently. Setting it here makes the invariant true by
    // construction instead of by convention.
    stateRef.current = next
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
    update({
      started: true,
      index,
      finished: false,
      autoStarted: auto || (before?.autoStarted ?? false),
    })
    const dest = TOUR_STEPS[index].route
    if (dest !== pathname) router.push(dest)
  }, [pathname, router, update])

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
    update({ ...(before ?? EMPTY_TOUR_STATE), started: false, finished: true })
  }, [update])

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
      const prev = stateRef.current
      if (!prev?.started || prev.finished) return
      const target = TOUR_STEPS.findIndex(s => s.route === '/admin/orders')
      if (target < 0 || prev.index >= target) return
      update({ ...prev, index: target })
    }
    window.addEventListener(DEMO_BOOKED_EVENT, onBooked)
    return () => window.removeEventListener(DEMO_BOOKED_EVENT, onBooked)
  }, [isDemo, update])

  /**
   * Arrow-key movement inside the progress rail, the other half of the roving
   * tabindex. Left/Right (and Home/End) move between steps; because moving to a
   * step *is* going to it, this reuses `beginAt` rather than inventing a
   * separate "focused but not active" concept — with seven steps the simpler
   * model is the honest one.
   */
  const railKeyDown = (e: React.KeyboardEvent) => {
    if (!state) return
    const last = TOUR_STEPS.length - 1
    let to: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(last, state.index + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, state.index - 1)
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = last
    if (to === null || to === state.index) return
    e.preventDefault()
    // Focus has to follow the roving stop, or the next arrow press goes nowhere.
    // Set only here, so a mouse click on a segment never steals focus.
    railFocusPending = true
    beginAt(to)
  }

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
  //
  // All three numbers grew on 2026-09-13 when the tooltip gained a progress
  // rail, a breadcrumb and a "next up" line. This is only a *placement* budget —
  // the card is auto-height, and under-estimating it just puts the card
  // somewhere slightly worse, never clips it.
  const surfaceChanged = isSurfaceChange(state.index)
  const TOOLTIP_H = isLast ? 350 : surfaceChanged ? 310 : 265
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
    // Above it — anchored by its BOTTOM edge, not by a computed top.
    //
    // `TOOLTIP_H` is an estimate and the card is auto-height, so it is
    // routinely wrong; the orientation work made it wronger by adding a rail, a
    // breadcrumb and a "Next ·" block. With `top: rect.top - H - 12` the excess
    // grows *downward*, straight over the ring — the card ends up covering the
    // one thing the step is pointing at. Pinning `bottom` instead makes the card
    // grow upward, away from the ring, so an underestimate can never obscure the
    // spotlight. The `> 0` test above stays an estimate; being wrong about it
    // now costs a card that runs off the top edge at worst, which `maxHeight`
    // on the dialog then handles.
    tooltipStyle = { bottom: window.innerHeight - rect.top + 12, left: clampLeft(rect.left), width: TOOLTIP_W }
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
          // The card is auto-height and every placement branch pins only one
          // edge, so on a short viewport it grows past the opposite one with
          // nothing to scroll — the mobile dock (`bottom: 12`, no `top`) grows
          // upward off the top of the screen, taking the rail, the breadcrumb
          // and Skip with it. A phone in landscape is ~375px tall and step 3
          // carries both the crossing note and the two-line "Next ·" block, so
          // this is reachable, not theoretical. Cap it and let the card scroll.
          maxHeight: 'calc(100vh - 24px)',
          overflowY: 'auto',
          ...tooltipStyle,
        }}
      >
        {/* ---- Where am I, and what is coming (2026-09-13) ------------------
             What "3 / 7" could not tell a visitor: which of five screens they
             had been teleported to, that they had crossed from a winery's
             public site into its admin panel, or what pressing Next would do.
             Max: "users should have a sense of what theyre looking at or whats
             next in the flow".

             Deliberately NOT a click-to-advance tour, which is what "let you
             click yourself" would mean literally: on a cold sales visitor that
             trades a known drop-off (people who stop pressing Next) for a worse
             one (people who cannot find the thing to click and leave). Next
             still drives; the rail makes the route visible and jumpable, and
             the spotlight hole stays live so the visitor can poke at the real
             screen underneath without losing their place. ---- */}
        <div
          role="group"
          // The dialog's own aria-label already announces "Tour step N of 7", so
          // this one names the control, not the position, rather than saying the
          // count twice to a screen reader.
          aria-label="Tour progress"
          onKeyDown={railKeyDown}
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {TOUR_STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => beginAt(i)}
              // ---- Roving tabindex ----
              // Only the current segment is a tab stop. Seven of them ahead of
              // Skip / Back / Next meant a keyboard user tabbed through seven
              // slivers to reach the primary action of the step. This is the
              // standard pattern for a composite widget: one stop to enter it,
              // arrow keys to move within it.
              tabIndex={i === state.index ? 0 : -1}
              // The native tooltip is the cheapest way to name a segment before
              // it is pressed, and it needs no popover of its own inside a
              // popover. aria-label carries the same for screen readers.
              title={`${i + 1}. ${s.title} — ${SURFACE_LABEL[s.surface]}, ${s.screen}`}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-current={i === state.index ? 'step' : undefined}
              style={{
                // ---- Hit area vs. visible bar ----
                // The bar reads best at 4–6px and that is far too small to hit:
                // WCAG 2.5.8 asks for 24px, and at 4px the `title` tooltip that
                // names the step is hard to trigger with a mouse and impossible
                // on touch. So the *button* is 22px of transparent padding and
                // the coloured bar is a child of it. Same look, a target a
                // thumb can find.
                flex: 1,
                minWidth: 0,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                padding: 0,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                marginLeft: isSurfaceChange(i) ? 9 : 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'block',
                  width: '100%',
                  height: i === state.index ? 6 : 4,
                  borderRadius: 999,
                  transition: 'height 120ms',
                  backgroundColor: i === state.index ? C.ring : i < state.index ? C.accent : C.border,
                }}
              />
            </button>
          ))}
          <span style={{ color: C.muted, fontSize: '0.68rem', fontWeight: 700, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
            {state.index + 1}/{TOUR_STEPS.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '9px' }}>
          <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>
            <span style={{ color: C.ring }}>{SURFACE_LABEL[step.surface]}</span> · {step.screen}
          </span>
          <button
            onClick={skip}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline', whiteSpace: 'nowrap' }}
          >
            {/* "Skip the tour" is the wrong word once there is nothing left to
                skip — but a dismissal must stay visible on every step. */}
            {isLast ? 'Close' : 'Skip the tour'}
          </button>
        </div>

        {/* Shown only on the step where the surface changes — see
            isSurfaceChange. A banner on every step becomes furniture. */}
        {surfaceChanged && (
          <p
            style={{
              margin: '10px 0 0',
              padding: '7px 10px',
              borderRadius: 8,
              borderLeft: `2px solid ${C.ring}`,
              backgroundColor: DEMO.raised,
              fontSize: '0.76rem',
              lineHeight: 1.45,
              color: C.text,
            }}
          >
            {SURFACE_CHANGE_NOTE[step.surface]}
          </p>
        )}

        <strong style={{ display: 'block', margin: '8px 0 0', fontSize: '1rem', lineHeight: 1.3 }}>{step.title}</strong>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', lineHeight: 1.55, color: C.muted }}>{step.body}</p>

        {/* What Next actually does, before it is pressed. The destination
            screen is named whenever the step changes route, which is five of the
            six transitions — that navigation was the disorienting part. */}
        {!isLast && (() => {
          const nextStep = TOUR_STEPS[state.index + 1]
          const moves = nextStep.route !== step.route
          return (
            <p style={{ margin: '12px 0 0', fontSize: '0.72rem', lineHeight: 1.45, color: C.muted }}>
              <span style={{ color: C.ring, fontWeight: 700 }}>Next</span> · {nextStep.title}
              {moves && (
                <span style={{ display: 'block', marginTop: 2 }}>
                  Takes you to {SURFACE_LABEL[nextStep.surface].toLowerCase()} → {nextStep.screen}
                </span>
              )}
            </p>
          )
        })()}

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
