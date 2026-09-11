'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { useAnchorRect } from '@/lib/demoAnchor'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'

/**
 * The feature rail for demo.vineworks.ge — Plan-DemoRedesign Phase 3,
 * DemoDirections Direction 04. Renders nothing for every other tenant.
 *
 * The problem: a deep product has been built and almost none of it is
 * discoverable. A visitor would have to *guess* that packing sheets, per-company
 * price ladders, masterclass add-ons, theme presets, card payments and a full
 * Georgian translation layer exist. This turns that invisible surface area into
 * a menu, and lets a prospect self-qualify on the feature they personally care
 * about instead of sitting through a fixed order.
 *
 * **Placement decision (task 3.1):** a right-edge slide-out, not a persistent
 * rail. The admin panel already carries a full nav row and a second permanent
 * rail would compete with it for the same glance — worse, it would push the
 * bookings table (the thing that actually sells) sideways. A drawer is invisible
 * until asked for and costs no layout.
 *
 * Each row deep-links to the screen that proves the claim and pins a short
 * callout to the relevant element once it arrives (task 3.3). The callout is
 * handed over in sessionStorage because the destination is a fresh route render.
 *
 * This same list is the feature list for the vineworks.ge marketing site when
 * that gets built — each row deep-linking into live proof. Built with that reuse
 * in mind: the data is a plain exported array.
 */

const CALLOUT_KEY = 'vineworks-demo-rail-callout'

// Palette: lib/demoTheme ("cellar dark"), Plan-DemoFlowFixes Chunk 5 task 5.1.
// Local key names kept so the swap is one place, not thirty call sites.
// `accent` is the ring colour here — the rail has no filled CTA.
const C = {
  ink: DEMO.surface,
  inkSoft: DEMO.raised,
  border: DEMO.border,
  text: DEMO.text,
  muted: DEMO.muted,
  accent: DEMO.accent,
}

export type Capability = {
  label: string
  /** Where the proof lives. */
  href: string
  /** `data-tour` anchor on the destination to pin the callout to, if any. */
  target?: string
  /** The callout: what to look at, and why it matters commercially. */
  note: string
}

export const CAPABILITY_GROUPS: { group: string; items: Capability[] }[] = [
  {
    group: 'What your guests see',
    items: [
      { label: 'Online booking, priced automatically', href: '/', target: 'booking-form', note: 'Guests pick a date, a time and a group size. The right rate is applied without you touching it.' },
      { label: 'Tasting vs. tasting with lunch', href: '/', target: 'booking-form', note: 'Two visit types, priced separately, with hot-dish choices captured at booking time so the kitchen knows.' },
      { label: 'Masterclasses and add-ons', href: '/', target: 'booking-form', note: 'Khinkali classes, churchkhela making, cellar tours — priced per person, per piece or flat, and added straight to the booking.' },
      { label: 'Wine shop with trade pricing', href: '/wines', target: 'wine-catalogue', note: 'Restaurants and importers order cases directly, each at the discount you agreed with them.' },
      { label: 'Georgian and English throughout', href: '/wines', target: 'wine-catalogue', note: 'Every guest-facing page, and the admin panel too. Switch language in the top bar.' },
    ],
  },
  {
    group: 'What you get behind it',
    items: [
      { label: 'Every booking in one table', href: '/admin/orders', target: 'orders-table', note: 'Filter by date, company or status. Expand any row for guest counts, food choices and add-ons.' },
      // `?expand=first` opens the top company's ladder on arrival (task 4.6) —
      // without it this landed on six collapsed rows and the proof the label
      // promises was one click away and invisible.
      { label: 'Per-company price ladders', href: '/admin/companies?expand=first', target: 'company-rates', note: 'Six tour operators here, each on its own rates — and different again by group size. The top one is open so you can see a ladder. You stop quoting the wrong price.' },
      { label: 'Revenue and season forecasting', href: '/admin/statistics', target: 'stats-cards', note: 'What is already committed for the months ahead — the number that tells you whether to hire for summer.' },
      { label: 'Trade orders and packing sheets', href: '/admin/wine-orders', target: 'wine-orders-list', note: 'Open trade orders become a physical picking list: which wine, which vintage, how many bottles, for whom.' },
      { label: 'Invoices sent from the booking', href: '/admin/orders', target: 'orders-table', note: 'Generate and email an invoice without leaving the row, from your own address.' },
      { label: 'Calendar view of the season', href: '/admin/orders?view=calendar', note: 'The same bookings as a month grid — how full each day is, at a glance.' },
    ],
  },
  {
    group: 'What you control',
    items: [
      { label: 'Edit your own site content', href: '/admin/content', target: 'content-editor', note: 'Text, photos, opening hours — in both languages. No developer, no ticket, no waiting a week for a paragraph.' },
      { label: 'Branding and theme presets', href: '/admin/settings', note: 'Your logo, your colours. Presets to start from, and everything overridable.' },
      { label: 'Card payments', href: '/admin/settings', note: 'Take card payment at booking time, or keep it reservation-only — per section, and per company.' },
      { label: 'Set the whole thing up yourself', href: '/admin/onboarding', note: 'The guided wizard that takes a winery from nothing to a live site. Run it here on live data.' },
      { label: 'See both sides at once', href: '/live', note: 'The guest site and the back office side by side. Book on the left, watch it land on the right.' },
    ],
  },
]

/**
 * Where to put the callout card (task 4.5).
 *
 * It used to be hard-pinned to the bottom centre of the viewport regardless of
 * what it was annotating — which is the "callout floating in dead space, pinned
 * to nothing" in the 2026-09-11 teardown. The ring was over here and the
 * sentence explaining it was down there, and on a destination that scrolled,
 * the two were not even on screen together.
 *
 * Now it tucks under its ring when there is room, sits above it otherwise, and
 * only falls back to the bottom dock when there is no anchor at all.
 */
const CALLOUT_W = 460
const CALLOUT_H = 130

function calloutPosition(rect: { top: number; left: number; width: number; height: number } | null): React.CSSProperties {
  const dock: React.CSSProperties = {
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: '20px',
    width: `min(${CALLOUT_W}px, calc(100vw - 24px))`,
  }
  if (!rect || typeof window === 'undefined') return dock
  // Narrow screens keep the dock: a floating card beside a ring does not fit.
  if (window.innerWidth < 768) return dock

  const width = Math.min(CALLOUT_W, window.innerWidth - 24)
  const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))

  if (rect.top + rect.height + CALLOUT_H + 12 < window.innerHeight) {
    return { top: rect.top + rect.height + 12, left, width }
  }
  if (rect.top - CALLOUT_H - 12 > 0) {
    return { top: rect.top - CALLOUT_H - 12, left, width }
  }
  return dock
}

type PendingCallout = { note: string; target?: string; label: string }

export default function DemoFeatureRail({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  // Resolved after mount, never during render: window does not exist on the
  // server, and branching on it during the first client render would produce a
  // hydration mismatch.
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => { setEmbedded(isEmbeddedPane()) }, [])
  const [callout, setCallout] = useState<PendingCallout | null>(null)

  const isDemo = tenantId === DEMO_TENANT_ID

  useEffect(() => { setMounted(true) }, [])

  // Pick up a callout handed over by the previous route.
  //
  // Deliberately deferred by a tick rather than read synchronously. The rail is
  // mounted in BOTH layouts, and a guest→admin deep link crosses that boundary:
  // the outgoing instance re-renders once with the new pathname before React
  // unmounts it, so a synchronous read let it consume the token and then
  // disappear with it — the callout was destroyed before the destination could
  // ever show it. The timer's cleanup cancels that doomed read on unmount, so
  // only the instance that survives the navigation consumes the handoff.
  useEffect(() => {
    if (!isDemo) return
    const t = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(CALLOUT_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as PendingCallout & { dest?: string }
        // Second guard: only the intended destination claims it.
        if (parsed.dest && parsed.dest !== pathname) return
        sessionStorage.removeItem(CALLOUT_KEY)
        setCallout(parsed)
      } catch {
        // sessionStorage unavailable — the deep link still works, just without
        // the annotation.
      }
    }, 150)
    return () => window.clearTimeout(t)
  }, [isDemo, pathname])

  // Position the callout against its anchor, if it has one.
  //
  // The polling this used to do inline now lives in lib/demoAnchor.ts, shared
  // with DemoTour — the tour had the single-shot version of the same
  // measurement and it was the reason six of its seven steps drew no ring
  // (Plan-DemoFlowFixes Chunk 4). One implementation so they cannot drift
  // apart a third time; it also brings the dev warning when an anchor is
  // missing entirely.
  const rect = useAnchorRect(callout?.target, !!callout, {
    maxHeightFraction: 0.6,
    pad: 6,
    source: 'DemoFeatureRail',
    scrollIntoView: true,
  })

  // Auto-retire the callout so it never becomes furniture.
  useEffect(() => {
    if (!callout) return
    const t = window.setTimeout(() => setCallout(null), 22000)
    return () => window.clearTimeout(t)
  }, [callout])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = useCallback((c: Capability) => {
    try {
      const [dest] = c.href.split('?')
      sessionStorage.setItem(CALLOUT_KEY, JSON.stringify({ note: c.note, target: c.target, label: c.label, dest }))
    } catch { /* annotation is optional */ }
    setOpen(false)
    const [path] = c.href.split('?')
    if (path === pathname && !c.href.includes('?')) {
      // Already here — no navigation will fire, so surface the callout directly.
      try { sessionStorage.removeItem(CALLOUT_KEY) } catch { /* ignore */ }
      setCallout({ note: c.note, target: c.target, label: c.label })
      return
    }
    router.push(c.href)
  }, [pathname, router])

  if (!isDemo || !mounted || embedded) return null

  return createPortal(
    <>
      {/* Edge tab. Right side, vertically centred — the tour's pill sits bottom
          left and the bug-report widget bottom right, so this collides with
          neither. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 140,
            backgroundColor: C.ink,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRight: 'none',
            borderRadius: '12px 0 0 12px',
            padding: '14px 10px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            writingMode: 'vertical-rl',
            boxShadow: DEMO_FX.shadowSm,
          }}
        >
          ✦ What can it do?
        </button>
      )}

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 140, backgroundColor: DEMO_FX.scrimSoft }}
          />
          <aside
            role="dialog"
            aria-label="What Vineworks can do"
            style={{
              position: 'fixed',
              top: 0, right: 0, bottom: 0,
              zIndex: 141,
              width: 'min(400px, 92vw)',
              backgroundColor: C.ink,
              color: C.text,
              borderLeft: `1px solid ${C.border}`,
              padding: '20px',
              overflowY: 'auto',
              boxShadow: DEMO_FX.shadowMd,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <p style={{ margin: 0, color: C.muted, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  Vineworks
                </p>
                <strong style={{ display: 'block', marginTop: '4px', fontSize: '1.05rem' }}>Everything it does</strong>
                <p style={{ margin: '6px 0 0', color: C.muted, fontSize: '0.8rem', lineHeight: 1.5 }}>
                  Pick anything. It opens the screen that proves it, on real data.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {CAPABILITY_GROUPS.map(g => (
              <section key={g.group} style={{ marginTop: '22px' }}>
                <h3 style={{ margin: 0, color: C.muted, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {g.group}
                </h3>
                <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {g.items.map(item => (
                    <li key={`${g.group}-${item.label}`}>
                      <button
                        onClick={() => go(item)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          backgroundColor: C.inkSoft,
                          color: C.text,
                          border: `1px solid ${C.border}`,
                          borderRadius: '10px',
                          padding: '11px 13px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                          font: 'inherit',
                        }}
                      >
                        <span>{item.label}</span>
                        <span aria-hidden="true" style={{ color: C.muted, flexShrink: 0 }}>→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </aside>
        </>
      )}

      {/* The pinned callout on the destination screen. */}
      {callout && (
        <>
          {/* The padding is applied by useAnchorRect (`pad: 6`), so the rect is
              already the outset box — do not add it again here. */}
          {rect && (
            <div
              style={{
                position: 'fixed',
                top: rect.top, left: rect.left,
                width: rect.width, height: rect.height,
                border: `2px solid ${C.accent}`,
                borderRadius: '12px',
                zIndex: 138,
                pointerEvents: 'none',
              }}
            />
          )}
          <div
            role="status"
            style={{
              position: 'fixed',
              zIndex: 142,
              ...calloutPosition(rect),
              backgroundColor: C.ink,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: '14px',
              padding: '14px 16px',
              boxShadow: DEMO_FX.shadowMd,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <strong style={{ fontSize: '0.88rem' }}>{callout.label}</strong>
              <button
                onClick={() => setCallout(null)}
                aria-label="Dismiss"
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, padding: '0 2px' }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '0.82rem', lineHeight: 1.55, color: C.muted }}>{callout.note}</p>
          </div>
        </>
      )}
    </>,
    document.body,
  )
}
