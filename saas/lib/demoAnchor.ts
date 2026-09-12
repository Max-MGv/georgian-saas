'use client'

import { useEffect, useState } from 'react'

/**
 * Shared anchor resolution for the demo spotlight tour and the feature rail —
 * Plan-DemoFlowFixes Chunk 4, tasks 4.1 and 4.2.
 *
 * ## The bug this exists to kill
 *
 * Both components locate what to highlight with
 * `document.querySelector('[data-tour="…"]')` and then measure it. `DemoTour`
 * measured **once**, on a single 60 ms `setTimeout` after the route changed —
 * a straight race against the destination painting. Measured on production
 * 2026-09-11 at 1440×900: on every step reached by a client-side navigation the
 * anchor was present in the DOM with a perfectly good rect, while the tour's
 * `rect` state was `null`. Dispatching one synthetic `resize` re-ran the
 * measurement and the ring appeared immediately.
 *
 * That is why exactly six of seven steps failed and step 4 worked: step 4 is
 * the only one reached **without** a navigation (steps 3 and 4 share
 * `/admin/orders`), so the page was already painted when it measured.
 *
 * It is also why the anchor resolved in local dev and not on production — the
 * RSC fetch for the destination route returns in well under 60 ms from
 * localhost and does not over the network.
 *
 * ## The fix
 *
 * Poll across the first ~1.6 s instead of taking one shot, and watch the DOM
 * with a MutationObserver that has no deadline at all. `DemoExplore`
 * already polled, and that is the reason its ring worked where the tour's did
 * not; the logic lives here now so the two cannot drift apart a third time.
 * A transient miss retries; a late anchor still resolves whenever it arrives.
 *
 * The observer is the part that matters. Any fixed budget is a guess about how
 * long a route takes to paint, and a wrong guess is the original bug — so the
 * budget now only decides when to *warn*, never whether to keep looking.
 *
 * ## Why failure has to be loud
 *
 * A missing anchor degrades silently to "no ring, whole screen dims" — by
 * design, since a tour that vanishes because a selector drifted would be worse.
 * That soft failure is precisely why this shipped broken. In development the
 * hook now says so on the console. See MaintenanceNotes §12: nothing in the
 * type system connects a `data-tour` attribute to the component that looks for
 * it, so this warning is the only thing standing between a refactor and a
 * silently dead spotlight.
 */

export type AnchorRect = { top: number; left: number; width: number; height: number }

/** How often to re-try while the destination route is still painting. */
const POLL_MS = 80
/**
 * Stop *polling* after this many attempts (~1.6 s) and warn. A MutationObserver
 * keeps watching past this point, so a late anchor still resolves — the
 * deadline exists to make a genuine miss visible, not to give up.
 */
const MAX_ATTEMPTS = 20
/**
 * Keep polling a few ticks past the first hit. Charts and tables size
 * themselves after mount, so the first rect is often not the final one.
 */
const SETTLE_ATTEMPTS = 6

/**
 * Warn once per (target, route) pair in development when an anchor cannot be
 * resolved. Deduped because the hook re-runs on every step change and a
 * repeated warning trains you to ignore it.
 */
const warned = new Set<string>()

function warnMissing(target: string, source: string) {
  if (process.env.NODE_ENV === 'production') return
  const key = `${source}:${target}:${typeof location === 'undefined' ? '' : location.pathname}`
  if (warned.has(key)) return
  warned.add(key)
  // eslint-disable-next-line no-console
  console.warn(
    `[demo] ${source}: no element matching [data-tour="${target}"] on ${location.pathname} ` +
      `after ${(MAX_ATTEMPTS * POLL_MS) / 1000}s. The step still runs, but with no ring — ` +
      `this is the silent failure from Plan-DemoFlowFixes Chunk 4. ` +
      `Check the anchor still exists on that page (MaintenanceNotes §12).`,
  )
}

type Options = {
  /**
   * Ceiling on the returned height, as a fraction of the viewport. A target
   * taller than the screen leaves nothing to dim — the "spotlight" becomes the
   * whole screen and the effect is lost. Sections on these pages run ~1000 px
   * and `/admin/wine-orders` measured 10 322 px, so this is the common case,
   * not the edge one.
   */
  maxHeightFraction?: number
  /** Padding added around the measured element, in px. */
  pad?: number
  /** Named in the dev warning so you know which component lost its anchor. */
  source: string
  /** Scroll the anchor into view once it resolves. */
  scrollIntoView?: boolean
}

/**
 * Resolve and track a `data-tour` anchor's position in viewport coordinates.
 *
 * Returns `null` while unresolved and after a sustained miss. Recomputes on
 * scroll and resize, because the ring is drawn in viewport coordinates and a
 * spotlight that stays behind when the page scrolls points at nothing.
 */
export function useAnchorRect(
  target: string | undefined,
  enabled: boolean,
  { maxHeightFraction = 0.62, pad = 0, source, scrollIntoView = false }: Options,
): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null)

  useEffect(() => {
    if (!enabled || !target) { setRect(null); return }

    let frame = 0
    let attempts = 0
    let poll = 0
    let scrolled = false

    function find() {
      return document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
    }

    function measure(): boolean {
      const el = find()
      if (!el) return false
      const r = el.getBoundingClientRect()
      // An element inside a `display:none` subtree reports 0×0. That is a real
      // case here, not a theoretical one: /admin/orders renders its bookings
      // twice (a `hidden md:block` table and a `md:hidden` card list) and
      // Tailwind picks on the pane's width, not the viewer's — Chunk 1's
      // lesson. Treat it as "not ready" and keep polling rather than latching
      // a dead rect.
      if (r.width === 0 && r.height === 0) return false

      // Clamp to the viewport as edges, not as an origin. Clamping `top` to 0
      // while leaving `height` alone pushes the bottom scrim panel off-screen
      // on any target taller than the viewport — a whole region that silently
      // never dims.
      const top = Math.max(0, r.top - pad)
      const left = Math.max(0, r.left - pad)
      const bottom = Math.min(window.innerHeight, r.bottom + pad)
      const right = Math.min(window.innerWidth, r.right + pad)
      const maxHeight = window.innerHeight * maxHeightFraction

      setRect({
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.min(maxHeight, Math.max(0, bottom - top)),
      })
      return true
    }

    /** Measure, and on the first hit scroll the anchor into view. */
    function tick(): boolean {
      const found = measure()
      if (found && scrollIntoView && !scrolled) {
        scrolled = true
        const el = find()
        // Centring a target taller than the viewport puts its top off-screen,
        // which is where the ring is drawn. Align tall ones to the top instead.
        const tall = !!el && el.getBoundingClientRect().height > window.innerHeight * maxHeightFraction
        el?.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' })
      }
      return found
    }

    // Watch the DOM as well as polling it. The poll handles the anchor being
    // present but still *settling* (tables and charts size themselves after
    // mount, so the first rect is rarely the final one); the observer handles
    // it arriving late, however late.
    //
    // This matters because any fixed budget is a guess about how long a route
    // takes to paint, and that guess is exactly what broke the tour in the
    // first place — 60 ms was fine on localhost and not over the network. A
    // cold serverless start, a slow database, or a dev-mode Turbopack compile
    // can all run past a second; the observer has no deadline, so none of them
    // can silently cost the ring.
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { if (tick()) maybeStop() })
    })
    observer.observe(document.body, { childList: true, subtree: true })

    function maybeStop() {
      // Stop watching once the anchor has been found and had time to settle.
      if (attempts >= SETTLE_ATTEMPTS) observer.disconnect()
    }

    poll = window.setInterval(() => {
      attempts++
      const found = tick()

      if (found && attempts >= SETTLE_ATTEMPTS) {
        window.clearInterval(poll)
        observer.disconnect()
        return
      }
      if (attempts >= MAX_ATTEMPTS) {
        // Stop *polling*, but keep observing — a late arrival still gets a
        // ring. The warning says the deadline passed, which is the signal a
        // developer needs; it is not the last word on whether it resolves.
        window.clearInterval(poll)
        if (!found) { setRect(null); warnMissing(target!, source) }
      }
    }, POLL_MS)

    function onMove() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { measure() })
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)

    return () => {
      window.clearInterval(poll)
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [target, enabled, maxHeightFraction, pad, source, scrollIntoView])

  return rect
}
