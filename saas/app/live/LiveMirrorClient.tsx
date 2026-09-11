'use client'

import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO_BOOKED_EVENT } from '@/lib/demoEvents'
import { signInAsDemoAdmin } from '@/lib/demoAuth'

/**
 * The live mirror — Plan-DemoRedesign Phase 4, DemoDirections Direction 02.
 * The guest site and the back office side by side, in one view: book on the
 * left, watch it land on the right.
 *
 * Why this is the flagship: the actual differentiator is that the guest-facing
 * site and the back office are *one system*. Everywhere else in the demo, a
 * visitor has to book, then remember to switch, then trust that what they are
 * seeing is connected. Both panes on screen at once removes the memory step and
 * the trust gap — the causal link is simply visible. None of the researched
 * competitors (Bookeo, BookingPress, Cloudbeds, Toast) does this.
 *
 * **Sync mechanism (task 4.1): same-origin iframes + the existing booked event,
 * posted up to this parent, which reloads the admin pane.** Cheapest thing that
 * works, per the plan. Polling would burn queries against a demo nobody is
 * watching most of the time, and server-sent events would need an endpoint,
 * a connection per viewer and a reconnect story — all to deliver one bit that
 * the page already knows locally the instant it happens.
 *
 * Both panes are the real pages, not mockups: an iframe of the actual guest site
 * and the actual admin panel. They render without their own demo chrome because
 * every demo component checks lib/demoEmbed.
 */

// Palette: lib/demoTheme ("cellar dark"). This route was missed by
// Plan-DemoFlowFixes Chunk 5 — task 5.1 named the four demo *components*, and
// /live is a route, not one of them. It kept the old indigo while everything
// around it changed, which on the demo's flagship screen read as two different
// products. Found by the mobile audit, 2026-09-12.
//
// `ok` stays green and is deliberately NOT a demo token: it marks the booking
// that just landed, and "this is the new row" has to be legible as *success*
// rather than as more chrome. It is the one colour here doing a job the
// platform palette cannot do.
const C = {
  ink: DEMO.surface,
  inkSoft: DEMO.raised,
  border: DEMO.border,
  text: DEMO.text,
  muted: DEMO.muted,
  accent: DEMO.accentSolid,
  ok: '#22c55e',
}

const GUEST_SRC = '/'
const ADMIN_SRC = '/admin/orders'

/**
 * Which of the admin pane's two order lists the visitor can actually see.
 *
 * `/admin/orders` renders the list twice — a table (`hidden md:block`) and a
 * card list (`md:hidden`) — and Tailwind picks between them on the **pane's**
 * width, not the viewer's. In the mirror the pane is an iframe about 691px
 * wide on a 1440×900 desktop, i.e. below the 768px `md` breakpoint, so the
 * table is `display:none` and the cards are the real, visible list.
 *
 * This is the whole of Chunk 1's task 1.3, measured on production 2026-09-11:
 * all 394 `tbody tr` rows were 0×0 inside a `display:none` ancestor. The
 * previous fix did find its row, outline it and call `scrollIntoView` on it —
 * but on an invisible element, where the outline is unobservable and
 * `scrollIntoView` is a no-op. It was never the hydration bug.
 *
 * Resolved per-tick rather than once, so a pane that crosses the breakpoint
 * (or an orders page that changes its markup) degrades to "no highlight"
 * instead of marking something nobody is looking at.
 */
type OrderList = { kind: 'cards' | 'rows'; container: HTMLElement; items: HTMLElement[] }

function visibleOrderList(doc: Document): OrderList | null {
  const shown = (el: Element | null | undefined) => !!el && el.getClientRects().length > 0

  const cardWrap = [...doc.querySelectorAll('div')].find(d => {
    const c = (d.className || '').toString()
    return c.includes('md:hidden') && c.includes('flex-col') && d.children.length > 0
  }) as HTMLElement | undefined
  if (shown(cardWrap)) {
    return { kind: 'cards', container: cardWrap!, items: [...cardWrap!.children] as HTMLElement[] }
  }

  const tbody = doc.querySelector('tbody')
  if (shown(tbody?.closest('table'))) {
    return { kind: 'rows', container: tbody!, items: [...tbody!.children] as HTMLElement[] }
  }
  return null
}

/** Stable-enough identity for one order in either representation. */
const signature = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

export default function LiveMirrorClient() {
  const adminRef = useRef<HTMLIFrameElement>(null)
  const adminWrapRef = useRef<HTMLDivElement>(null)
  // Signatures of the orders on screen immediately before the pane reloads, so
  // the one that appears afterwards can be identified without relying on the
  // guest's name (task 1.2).
  const seenRef = useRef<Set<string> | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [landed, setLanded] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const narrow = window.matchMedia('(max-width: 900px)')
    const sync = () => { setReducedMotion(motion.matches); setIsNarrow(narrow.matches) }
    sync()
    motion.addEventListener('change', sync)
    narrow.addEventListener('change', sync)
    return () => { motion.removeEventListener('change', sync); narrow.removeEventListener('change', sync) }
  }, [])

  // The admin pane needs a session before it will render anything but a login
  // form. Sign in first, then mount the frames.
  useEffect(() => {
    let cancelled = false
    signInAsDemoAdmin().then(({ ok }) => {
      if (cancelled) return
      if (ok) setReady(true)
      else setFailed(true)
    })
    return () => { cancelled = true }
  }, [])

  /**
   * Finds the row the visitor just created and marks it — DemoDirections
   * Direction 02 asks for the booking to land "highlighted, timestamped
   * 'just now'", and the pane is an iframe of the real orders table.
   *
   * Done by reaching into the same-origin frame rather than by threading a
   * highlight parameter through the orders page: that page is real product
   * surface shared with every winery, and it should not grow a query parameter
   * that exists solely for the demo. The cost is that this is matched on the
   * guest's name, so it degrades to "no highlight" rather than misfiring if the
   * table markup changes.
   */
  const highlightNewRow = useCallback((who: { name?: string; surname?: string }) => {
    const needle = who.name ? `${who.name} ${who.surname ?? ''}`.trim().toLowerCase() : ''
    const seen = seenRef.current
    // Nothing to match on at all — a wine order carries no name and has no row
    // in this table. (task 1.2: the pre-reload snapshot is the fallback, so a
    // missing name is no longer fatal on its own.)
    if (!needle && !seen) return
    let scrolled = false

    // Polled from the moment the booking is announced, straight through the
    // reload, rather than started on the iframe's `load` event. The pane is a
    // full Next.js app: `load` fires long before it has hydrated and painted
    // ~400 rows, so anchoring the window to it meant the poll could expire
    // before the row ever existed. Re-reading contentDocument each tick means
    // the reload is simply absorbed. There is no risk of matching early — the
    // booking cannot appear in the pre-reload document.
    // (Same mistake, same fix, as the feature rail's callout anchor.)
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts++
      if (attempts > 100) { window.clearInterval(timer); return }
      const doc = adminRef.current?.contentDocument
      const list = doc ? visibleOrderList(doc) : null
      if (!list) return

      // Identify the new order. The name match is the primary signal, but the
      // demo's seed data reuses names (measured: "Nino Beridze" appears more
      // than once), so among name matches prefer the one that was NOT in the
      // pane before the reload. If the name match yields nothing at all — no
      // name carried, or the markup moved — fall back to that pre-reload
      // snapshot on its own. That fallback is task 1.2's second mechanism and
      // it does not depend on the name match succeeding.
      const named = needle
        ? list.items.filter(el => (el.textContent ?? '').toLowerCase().includes(needle))
        : []
      const isNew = (el: HTMLElement) => !!seen && !seen.has(signature(el))
      const row = named.find(isNew) ?? named[0] ?? (seen ? list.items.find(isNew) : undefined)

      if (row) {
        // Land it where the eye already is. The card list is ~74,000px tall on
        // the demo tenant's 394 bookings and sorts by *visit* date, so a
        // booking for next month renders thousands of pixels down. Moving the
        // matched card to the head of its own container is a reorder within
        // one parent — the form of DOM meddling React tolerates, since it
        // never changes which parent owns the node.
        if (list.kind === 'cards' && list.container.firstElementChild !== row) {
          list.container.insertBefore(row, list.container.firstElementChild)
        }

        row.style.outline = `2px solid ${C.ok}`
        row.style.outlineOffset = '-2px'
        row.style.backgroundColor = 'rgba(34,197,94,0.12)'
        if (!reducedMotion) row.style.transition = 'background-color 600ms ease-out'

        // Scroll once, not every tick. Re-asserting the scroll for the whole
        // 20s window would yank the pane back each time the visitor tried to
        // look anywhere else.
        if (!scrolled) {
          scrolled = true
          row.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
        }

        // "just now", pinned to the order itself rather than to the pane —
        // DemoDirections Direction 02 asks for it to land "timestamped 'just
        // now'". The name element differs between the two representations.
        const host = list.kind === 'cards'
          ? row.querySelector('span.font-semibold')
          : row.querySelector('td')
        if (doc && host && !host.querySelector('[data-just-now]')) {
          const pill = doc.createElement('span')
          pill.setAttribute('data-just-now', '')
          pill.textContent = 'just now'
          pill.style.cssText = [
            'display:inline-block', 'margin-left:8px', 'padding:2px 8px',
            'border-radius:999px', `background:${C.ok}`, 'color:#052e16',
            'font-size:0.68rem', 'font-weight:700', 'vertical-align:middle',
          ].join(';')
          host.appendChild(pill)
        }
        // Deliberately does NOT stop on first success. The pane is its own
        // React root: the poll typically finds the order in server-rendered
        // HTML *before* that root hydrates, and hydration then reconciles the
        // list and discards the inline styles, the pill and the reorder. A
        // fixed "settle" window was tried and was simply a slower guess — it
        // held on dev and lost on production, where hydrating ~400 orders takes
        // longer than the window did.
        //
        // So: re-assert on every tick for the whole window. Every step above is
        // idempotent (the card is only moved when it isn't already first, the
        // pill only appended where one is absent, and the scroll is fired once
        // via `scrolled`), and 100 cheap DOM queries over 20s costs nothing on
        // a page showing two iframes.
        return
      }
      // ~20s window. Giving up quietly is right: the booking is in the table
      // either way, it just isn't ringed.
      if (attempts > 100) window.clearInterval(timer)
    }, 200)
  }, [reducedMotion])

  const refreshAdmin = useCallback((who: { name?: string; surname?: string }) => {
    const frame = adminRef.current
    if (!frame) return
    // Snapshot what is on screen *before* the reload — this is what makes the
    // new order identifiable afterwards even if the name match misses.
    try {
      const doc = frame.contentDocument
      const list = doc ? visibleOrderList(doc) : null
      seenRef.current = list ? new Set(list.items.map(signature)) : null
    } catch {
      seenRef.current = null
    }
    try {
      // Same-origin, so a direct reload works and preserves the pane's own URL
      // if the visitor has navigated inside it.
      frame.contentWindow?.location.reload()
    } catch {
      frame.src = `${ADMIN_SRC}?t=${Date.now()}`
    }
    // Then look for the row — reload first, highlight second. Highlighting
    // before the reload marks the outgoing document, and the reload throws the
    // mark away; that is invisible on a first booking (the row cannot be there
    // yet) and only shows up on a repeat, which is exactly how it slipped
    // through once. The short delay lets the navigation begin so the poll does
    // not match the row it is about to destroy.
    window.setTimeout(() => highlightNewRow(who), 500)
  }, [highlightNewRow])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only trust our own origin — this listener triggers a reload, and the
      // page embeds frames.
      if (e.origin !== window.location.origin) return
      if (!e.data || e.data.type !== DEMO_BOOKED_EVENT) return
      refreshAdmin(e.data.detail ?? {})
      setLanded(true)
      // On a stacked layout the admin pane is below the fold, so the landing
      // moment would happen off-screen. Bring it into view.
      if (isNarrow) {
        adminWrapRef.current?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refreshAdmin, isNarrow, reducedMotion])

  useEffect(() => {
    if (!landed) return
    const t = window.setTimeout(() => setLanded(false), 9000)
    return () => window.clearTimeout(t)
  }, [landed])

  const paneStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    minHeight: isNarrow ? '78vh' : 0,
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${C.border}`,
    borderRadius: '14px',
    overflow: 'hidden',
    // Not a demo token, on purpose: this sits *behind* an iframe of the
    // tenant's own site, so it belongs to the winery's world, not the
    // platform's. Painting it cellar-dark would flash dark behind a cream page.
    backgroundColor: '#fff',
    position: 'relative',
  }

  const paneHeader = (title: string, sub: string, accent?: boolean): React.ReactNode => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '9px 14px',
      backgroundColor: accent ? C.accent : C.inkSoft,
      color: DEMO_FX.onAccent,
      fontSize: '0.78rem',
      flexShrink: 0,
    }}>
      <strong>{title}</strong>
      <span style={{ opacity: 0.75 }}>{sub}</span>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: DEMO.ground,
      color: C.text,
      display: 'flex',
      flexDirection: 'column',
      padding: 'clamp(12px, 2vw, 20px)',
      gap: '14px',
    }}>
      <header style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, color: C.muted, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Vineworks — live mirror
          </p>
          {/* 101×19 before this — the only way out of the mirror, and on a
              phone it was barely tappable. Chunk 5's palette work and the
              2026-09-12 mobile audit. */}
          <a
            href="/"
            style={{
              color: C.muted, fontSize: '0.78rem',
              display: 'inline-block', padding: '9px 6px', marginLeft: '-6px',
            }}
          >
            ← back to the demo
          </a>
        </div>
        {/* Copy has to follow the layout: the panes sit side by side on a wide
            screen and stack below 900px, so "left"/"right" is simply wrong on a
            phone — and this is the first sentence anyone reads if the demo link
            is pasted into WhatsApp. Copy only; the stacked layout itself is out
            of scope (desktop-first, per the plan's Decisions section).
            `isNarrow` is false on the server and on the first client render, so
            this swaps after mount rather than mismatching hydration. */}
        <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(1.1rem, 2.6vw, 1.5rem)', fontWeight: 700 }}>
          {isNarrow
            ? 'Book here. Watch it arrive below.'
            : 'Book on the left. Watch it arrive on the right.'}
        </h1>
        <p style={{ margin: '6px 0 0', color: C.muted, fontSize: '0.85rem', maxWidth: '70ch', lineHeight: 1.5 }}>
          Both sides are the real thing — the guest&apos;s booking form, and the winery&apos;s
          own back office. Same system, same second.{' '}
          {isNarrow
            ? 'Fill in the form above and the bookings below will refresh on their own.'
            : 'Fill in the form on the left and the bookings table will refresh on its own.'}
        </p>
      </header>

      {failed && (
        <p style={{ color: DEMO_FX.danger, fontSize: '0.85rem' }}>
          Couldn&apos;t open the winery account, so the right-hand pane can&apos;t load.
          Try reloading the page.
        </p>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        gap: '14px',
        minHeight: 0,
      }}>
        <div style={paneStyle}>
          {paneHeader('Guest view', 'what your customer sees')}
          {ready
            ? <iframe src={GUEST_SRC} title="Guest view" style={{ flex: 1, width: '100%', border: 'none' }} />
            : <PaneLoading />}
        </div>

        <div ref={adminWrapRef} style={paneStyle}>
          {paneHeader('Winery admin', 'what you see', true)}
          {ready
            ? <iframe ref={adminRef} src={ADMIN_SRC} title="Winery admin" style={{ flex: 1, width: '100%', border: 'none' }} />
            : <PaneLoading />}

          {landed && (
            <div
              role="status"
              style={{
                position: 'absolute',
                top: '46px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 5,
                backgroundColor: C.ok,
                color: '#052e16',
                borderRadius: '999px',
                padding: '7px 16px',
                fontSize: '0.8rem',
                fontWeight: 700,
                boxShadow: DEMO_FX.shadowMd,
                // Respect prefers-reduced-motion: the pill still appears, it
                // just doesn't move.
                animation: reducedMotion ? undefined : 'vw-land 480ms ease-out',
              }}
            >
              ● Just landed — new booking, just now
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes vw-land {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
}

function PaneLoading() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      // Deliberately the tenant's cream rather than a demo token: this is the
      // placeholder for the winery's page, so it should look like the thing
      // that is about to appear, not like the frame around it.
      backgroundColor: '#f5efe6', color: '#6b5a47', fontSize: '0.85rem',
    }}>
      Opening the winery…
    </div>
  )
}
