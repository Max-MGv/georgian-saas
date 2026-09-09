'use client'

/**
 * Mounts the breadcrumb capture mechanism (`lib/breadcrumbs.ts`) — no visible
 * UI. Attaches the document-level click listener once on mount and pushes a
 * `navigation` breadcrumb whenever the client-side pathname changes.
 *
 * Phase 2 only: this component does not render a widget and nothing consumes
 * the captured buffer yet. Phase 3/4 will read `getBreadcrumbs()` when the
 * report widget is built.
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { initBreadcrumbTracking, recordNavigation } from '@/lib/breadcrumbs'

export default function BreadcrumbTracker() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  // Attach the click listener once.
  useEffect(() => {
    initBreadcrumbTracking()
  }, [])

  // Record a navigation breadcrumb on every pathname change, skipping the
  // very first render (that's the initial page load, not a navigation).
  useEffect(() => {
    if (lastPath.current === null) {
      lastPath.current = pathname
      return
    }
    if (pathname !== lastPath.current) {
      lastPath.current = pathname
      recordNavigation(pathname)
    }
  }, [pathname])

  return null
}
