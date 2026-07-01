import { useRef, useState, useLayoutEffect } from 'react'

/**
 * Returns a [ref, width] pair.
 * Attach `ref` to the div wrapping a chart — `width` tracks its pixel width
 * so label renderers can compute a fixed right-edge position in SVG coordinates.
 */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width] as const
}
