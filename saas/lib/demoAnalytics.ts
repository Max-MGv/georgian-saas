'use client'

import { isEmbeddedPane } from '@/lib/demoEmbed'
import type { DemoEventName } from '@/lib/demoEventNames'

/**
 * The one function that sends a demo event. The vocabulary it sends from
 * lives in `lib/demoEventNames.ts`, shared with the server action that
 * validates against it.
 *
 * Built 2026-09-12 ([[DemoSite/Plan-DemoFlowFixes]]' second deferred item). The
 * questions this exists to answer, in the order they matter:
 *
 * 1. Does anyone get past the front door, and which of the four paths do they take?
 * 2. Do they finish the tour, and if not, which step loses them?
 * 3. Does anyone reach `/live` — the one thing no competitor has?
 * 4. Does anyone act at the end: the mirror hand-off, or the email?
 *
 * A funnel needs a denominator, so every event carries a `sessionId`: a random
 * per-tab string kept in `sessionStorage`, which dies with the tab. It is not a
 * cookie, it does not survive a browser restart, it is never sent anywhere but
 * our own database, and it identifies nobody — it exists so that "14 people
 * started the tour and 3 finished" is countable rather than "17 events happened".
 *
 * That is also why there is no consent banner on the demo: nothing here is a
 * cookie, no third party is involved, and no personal data is collected. Adding
 * a banner to a sales demo would cost more conversions than the analytics could
 * ever explain.
 */

const SESSION_KEY = 'vineworks-demo-session'

/**
 * A random id for this tab. `sessionStorage`, not `localStorage` and not a
 * cookie: one visit, one id, gone when the tab closes.
 *
 * Returns null when storage is unavailable (private mode, blocked site data).
 * The event is then dropped rather than written with a made-up id — an event
 * with no session would inflate the denominator of every funnel it appears in.
 */
function sessionId(): string | null {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const fresh = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    return null
  }
}

/**
 * Send one event. Fire and forget — never awaited, never throws, never blocks
 * the interaction that triggered it.
 *
 * **A `fetch`, not a server action.** It was a server action first, and Next
 * runs those strictly in sequence per client: the front door's sign-in ended up
 * queued behind a page-view write to a database in another region, and stalled.
 * Analytics that can delay the thing they measure are worse than no analytics.
 * `keepalive` is the other half — an event fired on a click that navigates (the
 * front door's paths, the tour's hand-off to /live) would otherwise be cancelled
 * with the page it was sent from, which is precisely the event worth having.
 *
 * **Not gated on the tenant here.** The route handler resolves the tenant from
 * the request's own headers and drops anything that is not the demo; doing it
 * again in the browser would only add a second place to get it wrong, and the
 * browser's copy is the one that could be lied to. What *is* checked here is
 * `isEmbeddedPane()`: inside `/live`'s two iframes the same components are
 * mounted again (MaintenanceNotes §13), and without this every action taken in
 * the mirror would be counted twice.
 */
export function trackDemo(
  name: DemoEventName,
  props?: Record<string, string | number | boolean>,
  route?: string,
): void {
  if (typeof window === 'undefined') return
  if (isEmbeddedPane()) return

  const id = sessionId()
  if (!id) return

  try {
    void fetch('/api/demo-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        props,
        route: route ?? window.location.pathname,
        sessionId: id,
      }),
      // Survives the navigation that this event often describes.
      keepalive: true,
    }).catch(() => {
      // Offline, blocked by an extension, navigated mid-flight. The handler
      // already swallows its own failures; this keeps a transport error out of
      // a prospect's console.
    })
  } catch {
    // fetch itself unavailable. Nothing to do, and nothing worth saying.
  }
}
