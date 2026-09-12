'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { useAdminHintsVisible } from './AdminHintsContext'

const POPOVER_WIDTH = 256

/**
 * Small "?" hint next to a field/section label. Click-to-reveal, not
 * hover-only — a bare `title` attribute has no touch/keyboard affordance
 * (see the admin panel's own StatusIcon for the pattern this deliberately
 * avoids repeating). Renders nothing when the tenant's `show_admin_hints`
 * setting is off (AdminHintsContext), so call sites never need to check it.
 *
 * Popover renders via a `document.body` portal, `position: fixed`, computed
 * from the trigger's own bounding rect — the same escape hatch already used
 * for OrdersTable's status dropdown (#140), since a plain absolutely-positioned
 * popover gets silently clipped by any ancestor with `overflow-hidden`
 * (several rounded-card sections in this admin panel have exactly that).
 */
export default function HelpHint({ text }: { text: string }) {
  const visible = useAdminHintsVisible()
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; bottom: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect()
      setRect({ top: r.top, bottom: r.bottom, left: r.left })
    }
    setOpen(o => !o)
  }

  if (!visible) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const estimatedHeight = 90
  const left = rect ? Math.min(Math.max(rect.left, 8), vw - POPOVER_WIDTH - 8) : 0
  const top = rect
    ? (rect.bottom + 6 + estimatedHeight > vh ? Math.max(rect.top - estimatedHeight - 6, 8) : rect.bottom + 6)
    : 0

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggle}
        className="relative inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold flex-shrink-0 transition-colors"
        style={{
          backgroundColor: open ? 'var(--color-brand)' : 'var(--site-surface)',
          color: open ? '#fff' : 'var(--site-muted)',
          border: '1px solid var(--site-border)',
          lineHeight: 1,
        }}
      >
        {/* Hit area, not icon size. The circle stays 16px so admin labels read
            the same, but the tappable box is 40px tall and 32px wide — a 16x16
            target is unhittable with a thumb. Deliberately wider vertically
            than horizontally: HelpHint sits inline beside a label and, on
            /admin/companies, beside another button (see KnownBugs #15), so a
            symmetric expansion would start stealing that button's taps. */}
        <span aria-hidden="true" className="absolute -inset-y-3 -inset-x-2" />
        ?
      </button>
      {open && rect && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="tooltip"
          className="rounded-lg border p-3 text-xs leading-relaxed shadow-lg"
          style={{ position: 'fixed', top, left, width: POPOVER_WIDTH, zIndex: 100, backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)', color: 'var(--site-muted)' }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}
