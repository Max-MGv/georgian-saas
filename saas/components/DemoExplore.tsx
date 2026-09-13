'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { Compass, Wine } from 'lucide-react'
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
import { isEmbeddedPane } from '@/lib/demoEmbed'
import { useAnchorRect } from '@/lib/demoAnchor'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import { useIsNarrow } from '@/lib/useIsNarrow'
import { trackDemo } from '@/lib/demoAnalytics'
import {
  TOUR_STATE_EVENT,
  TOUR_STEPS,
  SURFACE_LABEL,
  type TourState,
  loadTourState,
  sendTourCommand,
  tourOffer,
} from '@/lib/demoTour'
import DemoThemeCatalogue, { THEME_CATALOGUE_EVENT } from '@/components/DemoThemeCatalogue'

/**
 * The demo's single entry control — "Explore this demo" — and the panel behind
 * it. Renders nothing for every other tenant.
 *
 * **Was `DemoFeatureRail`** (Plan-DemoRedesign Phase 3, DemoDirections
 * Direction 04) until 2026-09-12, when the tour's bottom-left pill and this
 * file's right-edge tab were merged into one control. The 2026-09-11 teardown's
 * finding was that a visitor met two floating invitations at once, offering two
 * guided experiences with no stated relationship to each other, and had to
 * guess which one they wanted before knowing what either was.
 *
 * **The merge is not "keep one, delete the other."** The tour is a linear
 * narrative — seven steps, each naming a figure, in an order that argues a case.
 * The capability list is a menu for someone who already knows what they came to
 * check. Those are different shapes of help, and a prospect who wants to look up
 * one feature should not have to enter a narrative to reach it. So both survive
 * intact; what changed is that there is now one door, and the tour is the first
 * thing behind it (Max's call, 2026-09-12, option B of three).
 *
 * Why this file owns the control rather than `DemoTour`: the control opens a
 * panel, and the panel is here. The tour's *state* is what had to be shared, so
 * it moved to `lib/demoTour.ts` — this file reads it and asks
 * (`sendTourCommand`), `DemoTour` still decides and is still the only writer.
 *
 * **Placement decision, revised.** The panel is still a right-edge slide-out,
 * not a persistent rail, for the original reason: the admin panel already
 * carries a full nav row, and a second permanent rail would push the bookings
 * table — the thing that actually sells — sideways. The trigger moved from a
 * vertical edge tab to a bottom-right pill, because a vertical tab cannot carry
 * a state label like "Tour paused · step 4 of 7", and because bottom-right came
 * free when Chunk 6 took the bug-report widget off the demo tenant.
 *
 * Each row deep-links to the screen that proves the claim and pins a short
 * callout to the relevant element once it arrives (task 3.3). The callout is
 * handed over in sessionStorage because the destination is a fresh route render.
 *
 * **On reuse for vineworks.ge:** an earlier note here expected this array to
 * become the marketing site's feature list. When that site was built
 * (2026-09-13, `components/WelcomeLanding.tsx`) it deliberately did not: these
 * are sixteen *capabilities* for someone already inside the product deciding
 * what to go and look at, and the marketing page needs six *benefits* for
 * someone deciding whether to look at all. Different granularity, different
 * reader, and in Georgian first. The array stays a plain export, but nothing
 * imports it from there and the two are allowed to diverge.
 */

const CALLOUT_KEY = 'vineworks-demo-rail-callout'

/**
 * The mobile minimum from the 2026-09-12 passes (MaintenanceNotes §17). Applied
 * as a `minHeight`/`minWidth` here rather than the invisible-hit-area trick,
 * because unlike the three controls in §17 these float in their own space —
 * growing them steals nothing from a neighbour, so the honest fix is available.
 */
const TAP = 40

// Palette: lib/demoTheme ("cellar dark"), Plan-DemoFlowFixes Chunk 5 task 5.1.
// Local key names kept so the swap is one place, not thirty call sites.
// `accent` is the ring/callout colour; `accentSolid` backs the two filled CTAs
// the merge added (the panel's tour button and the paused pill's Resume), which
// carry ivory text and cannot sit on the lighter ring colour — §15's two tokens.
const C = {
  ink: DEMO.surface,
  inkSoft: DEMO.raised,
  border: DEMO.border,
  text: DEMO.text,
  muted: DEMO.muted,
  accent: DEMO.accent,
  accentSolid: DEMO.accentSolid,
}

/**
 * How the seven steps split between the guest site and the back office, counted
 * from TOUR_STEPS rather than written down: the panel promises "two on the
 * guest site, then five in the back office" before the visitor commits three
 * minutes to it, and a hard-coded pair of numbers is a promise that goes stale
 * the first time a step is added.
 */
const GUEST_STEPS = TOUR_STEPS.filter(s => s.surface === 'guest').length
const ADMIN_STEPS = TOUR_STEPS.filter(s => s.surface === 'admin').length

export type Capability = {
  label: string
  /** Where the proof lives. */
  href: string
  /**
   * A row whose proof is a demo panel rather than a screen. Only the theme
   * catalogue uses this: "how can it look?" cannot be answered by navigating
   * somewhere, because the answer is *this* site repainted. `href` is still
   * required and is still where the row would have gone — it is the fallback
   * if the panel ever cannot open.
   */
  opens?: 'theme-catalogue'
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
      { label: 'Branding and theme presets', href: '/admin/settings', opens: 'theme-catalogue', note: 'Sixteen presets, and this site repaints as you click them. Your logo and your exact colours on top.' },
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

export default function DemoExplore({ tenantId }: { tenantId: string }) {
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
  const [tour, setTour] = useState<TourState | null>(null)
  const isNarrow = useIsNarrow()

  const isDemo = tenantId === DEMO_TENANT_ID

  useEffect(() => { setMounted(true) }, [])

  // ---- The tour's state, read but never written here (lib/demoTour.ts).
  // Re-read on the event rather than polled: the tour writes on every
  // transition and announces each one, so there is nothing to poll for. ----
  useEffect(() => {
    if (!isDemo) return
    setTour(loadTourState())
    function onState(e: Event) {
      const next = (e as CustomEvent<TourState>).detail
      setTour(next ?? loadTourState())
    }
    window.addEventListener(TOUR_STATE_EVENT, onState)
    return () => window.removeEventListener(TOUR_STATE_EVENT, onState)
  }, [isDemo])

  // Pick up a callout handed over by the previous route.
  //
  // Deliberately deferred by a tick rather than read synchronously. This is
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
    source: 'DemoExplore',
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
    // Which capabilities a prospect picks is the closest thing this demo has to
    // a stated requirement — the label, not the href, because the label is what
    // they read before deciding. Fired before the branch so the theme-catalogue
    // row, which answers in place rather than navigating, still counts.
    trackDemo('capability_clicked', { label: c.label })
    // A panel row answers in place. Navigating to /admin/settings to explain
    // "your colours are configurable" shows a form; repainting the site the
    // visitor is standing on shows the thing itself.
    if (c.opens === 'theme-catalogue') {
      setOpen(false)
      window.dispatchEvent(new CustomEvent(THEME_CATALOGUE_EVENT))
      return
    }
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

  const offer = tourOffer(tour, pathname)
  /** Mid-tour on the step's own screen: the spotlight is up and this control
   *  must not draw over it. That branch used to live in DemoTour as "return the
   *  pill or nothing"; it is the same rule, just enforced from the other side. */
  const spotlighting = offer.kind === 'spotlight'
  const paused = offer.kind === 'paused'

  /** The tour card's button, which is the whole point of the merge: one door,
   *  and the guided path is the first thing behind it. */
  const tourAction =
    offer.kind === 'replay' ? { label: 'Replay the tour', index: 0 }
      : paused ? { label: `Resume at step ${offer.index + 1}`, index: offer.index }
        : { label: 'Start the tour', index: 0 }

  const beginTour = (index: number) => {
    setOpen(false)
    sendTourCommand({ action: 'begin', index })
  }

  /** The one way the panel opens, so all three openers — the idle pill, the
   *  paused pill's compass, and anything added later — are counted once each. */
  const openPanel = () => {
    trackDemo('explore_opened')
    setOpen(true)
  }

  const pillBase: React.CSSProperties = {
    position: 'fixed',
    // Lifts over the wine catalogue's sticky cart bar, which publishes this var
    // (WineCatalogueClient.tsx). Defaults to 0px everywhere else.
    bottom: 'calc(16px + var(--cart-bar-offset, 0px))',
    right: '16px',
    zIndex: 150,
    backgroundColor: C.ink,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: '999px',
    boxShadow: DEMO_FX.shadowSm,
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: TAP,
  }

  return createPortal(
    <>
      {/* ---- The single entry control (bottom right). Replaces the tour's
          bottom-left pill AND this component's old right-edge tab: a visitor
          should meet one invitation, not two. ---- */}
      {!open && !spotlighting && !paused && (
        <button
          onClick={openPanel}
          aria-haspopup="dialog"
          style={{
            ...pillBase,
            padding: '10px 18px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            gap: '7px',
          }}
        >
          <Compass aria-hidden="true" size={15} strokeWidth={1.7} style={{ flexShrink: 0 }} />
          Explore this demo
        </button>
      )}

      {/* Mid-tour, off the step's screen. Resume stays one press — the panel is
          still reachable from the ✦ on the left of the pill, so pausing the
          tour never costs access to the capability list. */}
      {!open && paused && (
        <div
          style={{
            ...pillBase,
            // Each control is a full 40x40 (MaintenanceNotes §17) rather than a
            // 28px visual with an outset hit area: the three sit 6px apart, so
            // two expanded hit areas would both claim the same gap and a tap
            // there could end the tour instead of resuming it.
            padding: '6px',
            gap: '6px',
            fontSize: '0.8rem',
          }}
        >
          <button
            onClick={openPanel}
            aria-label="Explore this demo"
            aria-haspopup="dialog"
            style={{
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: TAP, height: TAP, borderRadius: '999px', padding: 0,
            }}
          >
            <Compass aria-hidden="true" size={16} strokeWidth={1.7} />
          </button>
          <span style={{ color: C.text }}>
            {isNarrow ? `Step ${offer.index + 1}/${TOUR_STEPS.length}` : `Tour paused · step ${offer.index + 1} of ${TOUR_STEPS.length}`}
          </span>
          <button
            onClick={() => beginTour(offer.index)}
            style={{
              // accentSolid, not accent: this is a filled CTA with ivory text on
              // it, and §15's two-token rule exists precisely because the lighter
              // ring colour cannot carry that text. The tour's old paused pill
              // aliased `accent` to accentSolid; this file aliases it to the ring,
              // so the merge had to name the token explicitly.
              backgroundColor: C.accentSolid, color: DEMO_FX.onAccent, border: 'none', borderRadius: '999px',
              padding: '0 14px', height: TAP, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Resume →
          </button>
          <button
            onClick={() => sendTourCommand({ action: 'end' })}
            aria-label="End the tour"
            style={{
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '0.9rem',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: TAP, height: TAP, padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 140, backgroundColor: DEMO_FX.scrimSoft }}
          />
          <aside
            role="dialog"
            aria-label="Explore this demo"
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
                <strong style={{ display: 'block', marginTop: '4px', fontSize: '1.05rem' }}>Explore this demo</strong>
                <p style={{ margin: '6px 0 0', color: C.muted, fontSize: '0.8rem', lineHeight: 1.5 }}>
                  Take the guided tour, or pick anything below. Either way it opens the real screen, on real data.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  background: 'none', border: 'none', color: C.muted, fontSize: '1.1rem', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: TAP, height: TAP, padding: 0, lineHeight: 1, flexShrink: 0, margin: '-8px -8px 0 0',
                }}
              >
                ✕
              </button>
            </div>

            {/* ---- The guided path, first and visibly different from the rows
                below it. The two experiences are not siblings: one argues a case
                in a fixed order, the others answer a question you already have.
                Making them look alike was what produced two competing entry
                points in the first place. ---- */}
            <div
              style={{
                marginTop: '18px',
                backgroundColor: C.inkSoft,
                border: `1px solid ${C.border}`,
                borderRadius: '12px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wine aria-hidden="true" size={15} strokeWidth={1.7} style={{ flexShrink: 0, color: C.accent }} />
                <strong style={{ fontSize: '0.92rem' }}>
                  {paused ? 'Your tour is paused' : 'The guided tour'}
                </strong>
              </div>
              {/* Both lines say where the tour goes, not just how long it is
                  (2026-09-13). "You are 4 of 7 steps in" tells a visitor
                  nothing they can decide on; the name of the step they would
                  land on does. Same reasoning as the tooltip's "Next ·" line —
                  see the note in DemoTour. */}
              <p style={{ margin: '6px 0 0', color: C.muted, fontSize: '0.8rem', lineHeight: 1.5 }}>
                {paused
                  ? `Picks up at step ${offer.index + 1} of ${TOUR_STEPS.length} — “${TOUR_STEPS[offer.index].title}”, on ${SURFACE_LABEL[TOUR_STEPS[offer.index].surface].toLowerCase()} → ${TOUR_STEPS[offer.index].screen}.`
                  : `${TOUR_STEPS.length} steps, about three minutes. ${GUEST_STEPS} on the guest site, then ${ADMIN_STEPS} in the back office — each one names what it is worth, not what to click.`}
              </p>
              <button
                onClick={() => beginTour(tourAction.index)}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  minHeight: TAP,
                  backgroundColor: C.accentSolid,
                  color: DEMO_FX.onAccent,
                  border: 'none',
                  borderRadius: '999px',
                  padding: '10px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {tourAction.label} →
              </button>
              {paused && (
                <button
                  onClick={() => { setOpen(false); sendTourCommand({ action: 'end' }) }}
                  style={{
                    width: '100%', marginTop: '6px', minHeight: TAP - 8, background: 'none', border: 'none',
                    color: C.muted, fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  End the tour
                </button>
              )}
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
                          minHeight: TAP,
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
                style={{
                  background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '0.95rem',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: TAP, height: TAP, padding: 0, lineHeight: 1, flexShrink: 0, margin: '-10px -10px 0 0',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '0.82rem', lineHeight: 1.55, color: C.muted }}>{callout.note}</p>
          </div>
        </>
      )}

      {/* Mounted here rather than in the three layouts: it is this panel's
          "Branding and theme presets" row opening in place, not an independent
          surface, and one fewer mount point is one fewer thing for
          MaintenanceNotes §16 to fall out of step on. It renders whether or not
          the panel is open, because it also re-applies a preview the visitor
          chose before a reload. */}
      <DemoThemeCatalogue />
    </>,
    document.body,
  )
}
