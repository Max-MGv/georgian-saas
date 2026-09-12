'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { DEMO_BOOKED_EVENT } from '@/lib/demoEvents'
import { trackDemo } from '@/lib/demoAnalytics'

/**
 * The two events nobody has to remember to fire: page views, and "a booking
 * actually happened".
 *
 * Built 2026-09-12 ([[DemoSite/Plan-DemoFlowFixes]]' second deferred item).
 * Every other event in the vocabulary is sent from the component that owns the
 * interaction — the front door sends its path choice, the tour sends its steps.
 * These two are different: a page view belongs to no component, and a booking is
 * placed in `BookingForm`, which is **shared with every real winery** and must
 * not gain demo tracking code.
 *
 * It does not have to. `lib/demoEvents.ts` already broadcasts
 * `DEMO_BOOKED_EVENT` on every booking, precisely so the demo chrome can react
 * without the form knowing anything about it (the tour listens for the same
 * signal). Listening here means the shared booking path stays byte-identical for
 * a real tenant — the prompt's hard rule, satisfied structurally rather than by
 * a conditional inside shared code.
 *
 * Renders nothing, ever. It is a listener with a React wrapper.
 *
 * **Mount points — four, and it is "all four, or none"** (MaintenanceNotes §16,
 * which this extends): `app/(site)/layout.tsx`, `app/admin/(panel)/layout.tsx`,
 * `app/admin/onboarding/layout.tsx`, and `app/live/page.tsx`. `/live` is the
 * odd one: it is its own route group with no demo chrome, and it is also the
 * single most important page view on the site — "does anyone reach the mirror"
 * is question 3 of the four this table exists to answer. Leaving it out would
 * have quietly made that question unanswerable.
 */
export default function DemoAnalytics({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const isDemo = tenantId === DEMO_TENANT_ID
  /** The last route counted, so React's re-renders do not inflate the count. */
  const lastCounted = useRef<string | null>(null)

  useEffect(() => {
    if (!isDemo || isEmbeddedPane()) return
    if (lastCounted.current === pathname) return
    lastCounted.current = pathname
    trackDemo('page_view', undefined, pathname)
  }, [isDemo, pathname])

  useEffect(() => {
    if (!isDemo) return
    // No detail carried through: the event's payload is the guest's name, and
    // this table holds no personal data. That it happened is the measurement.
    function onBooked() { trackDemo('booking_placed') }
    window.addEventListener(DEMO_BOOKED_EVENT, onBooked)
    return () => window.removeEventListener(DEMO_BOOKED_EVENT, onBooked)
  }, [isDemo])

  return null
}
