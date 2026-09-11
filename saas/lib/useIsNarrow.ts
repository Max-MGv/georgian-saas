'use client'

import { useEffect, useState } from 'react'

/** The one breakpoint the demo chrome branches on. Matches Tailwind's `md`. */
export const NARROW_QUERY = '(max-width: 767px)'

/**
 * True on phone-width screens.
 *
 * Lifted out of `DemoTour`, which grew this three times over: the front door,
 * the mode banner and the live mirror all need the same answer, and three
 * hand-written `matchMedia` effects is how the anchor-measuring bug of Chunk 4
 * happened — two copies of one measurement that drifted apart.
 *
 * **Always false on the first render, on purpose.** The server has no
 * `matchMedia`, so a component that branched on the real value during its first
 * client render would produce markup the server never sent — a hydration
 * mismatch, the class of bug Chunk 2 spent a session chasing. The desktop
 * branch renders first and the narrow one swaps in immediately after mount.
 * That is the right way round: desktop is the demo's primary target, so the
 * flash, where it exists at all, is on the secondary case.
 */
export function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const update = () => setIsNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isNarrow
}
