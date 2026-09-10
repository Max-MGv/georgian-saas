---
tags: [feature, demo, vineworks, marketing]
---

# Feature 160–166 — Demo Site Redesign (`demo.vineworks.ge`)

Built 2026-09-10 across two sessions. Task tracker and per-phase outcomes:
[[DemoSite/Plan-DemoRedesign|Plan-DemoRedesign]]. Design rationale:
[[DemoSite/DemoDirections|DemoDirections]]. This note is the engineering companion —
what was built, why it is shaped this way, and what will bite later.

---

## What it does

Turns `demo.vineworks.ge` from "an unexplained winery website with an empty admin panel"
into a self-serve sales demo a prospective winery can be pointed at unaccompanied.

| # | Piece | Entry point |
|---|---|---|
| 160 | Seeded trading data + setup-banner suppression | `scripts/seed-demo-data.ts`, `lib/demoSeed.ts` |
| 161 | Nightly regeneration | `app/api/cron/reseed-demo/route.ts`, `vercel.json` |
| 162 | Front door + `/admin` dead-end fix | `components/DemoFrontDoor.tsx`, `DemoLoginShortcut.tsx` |
| 163 | Spotlight tour (replaced the checklist) | `components/DemoTour.tsx` |
| 164 | Feature rail | `components/DemoFeatureRail.tsx` |
| 165 | Live mirror | `app/live/`, `lib/demoEmbed.ts` |
| 166 | Abuse guardrails | `lib/demoRateLimit.ts`, `lib/emails/sendEmail.ts` |

---

## Key design decisions (and why the obvious alternative was rejected)

**The front door is an overlay, not a route.** An interstitial is a door in front of the
thing, so the thing should already be behind it — "skip" becomes a dismissal with no
redirect to get wrong, and the visitor sees the real site the instant they close it. A
`/welcome` route would have needed redirect logic on every entry path.

**The `/admin` fix is a button, not an auto-sign-in.** Auto-signing-in whoever opens a
login page would be startling, and would strand the one person who came to type real
credentials (Max, checking the demo tenant as himself). The real form stays below it.

**The tour never dims a screen the visitor navigated to themselves.** Each step declares
its `route`; off that route the tour collapses to a "paused · resume" pill. A tour that
fights you is worse than no tour.

**The tour's scrim is four rectangles, not an SVG mask.** The highlighted element stays
genuinely clickable, so the visitor can use the thing being pointed at without dropping out.

**The feature rail is a slide-out, not a persistent rail.** The admin already carries a
full nav row; a second permanent rail would compete for the same glance and push the
bookings table — the thing that actually sells — sideways.

**The landing moment reaches into the frame rather than adding a query parameter.** The
orders page is real product surface shared with every winery; it should not grow a
`?highlight=` parameter that exists only for the demo. The panes are same-origin, so the
mirror finds the row by the guest's name (carried on the booked event) and styles it
directly. Trade-off accepted: matching on name degrades to "no highlight" if the table
markup changes, rather than misfiring.

**The live mirror syncs by postMessage + iframe reload.** Polling would burn queries
against a demo nobody is watching most of the time; SSE would need an endpoint, a
connection per viewer and a reconnect story, all to deliver one bit the page already knows
locally the instant it happens.

**Demo chrome hides itself by frame check, not query parameter.** A `?embed=1` parameter
would have to be threaded through every internal link inside both panes and would be lost
the first time a visitor clicked one.

**The seed is destructive by design.** It wipes and rebuilds rather than tracking its own
rows. That is what makes it idempotent *and* what the nightly reset needs — one behaviour,
not two. Guarded by a slug check so it cannot be aimed at a real winery.

**The seed is deterministic** (fixed-seed PRNG). Two runs produce identical data, so
screenshots stay valid and every nightly reset restores the same demo.

**Rate limiting is demo-only.** A real winery's booking form is their livelihood, and
throttling a shared office IP or a coach party booking together would cost them money.
[[KnownBugs]] #19 stays open for the app at large.

**Email suppression sits at the chokepoint**, not the five call sites, so a future template
cannot forget to opt in. See [[MaintenanceNotes]] §11 — passing `tenantId` is load-bearing.

---

## Edge cases handled

- Front door: shown once per browser, root only, Escape closes, body scroll locked and
  restored, `localStorage` failure (private mode) degrades to showing it each time rather
  than crashing.
- Tour: missing `data-tour` anchor degrades to a centred tooltip with no ring rather than
  the step vanishing; ring recomputes on scroll and resize; tall targets top-aligned.
- Feature rail: clicking a capability for the page you are already on surfaces the callout
  directly instead of relying on a navigation that will not happen.
- Live mirror: origin-checked `postMessage`; `prefers-reduced-motion` respected; panes
  stack below 900px and auto-scroll to the admin pane after a booking; 404s for non-demo
  tenants server-side, so a real winery's deployment never serves a page that signs the
  browser into a shared account.
- Seed: skips wine orders entirely if the tenant has no active vintages.

---

## Bugs found by verifying rather than assuming

Recorded because every one would have shipped silently and looked fine in a screenshot.

1. **Scrim clamping.** Clamping the ring's `top` to 0 without adjusting `height` pushed the
   bottom scrim panel off-screen, so a whole region never dimmed — on any target taller
   than the viewport, which is the common case here (sections run ~1000px).
2. **No spotlight at all.** A target taller than the viewport left nothing dimmed. Ring is
   now capped at 62% of viewport height with tall targets top-aligned.
3. **Callout handoff race.** The rail is mounted in *both* layouts, so a guest→admin deep
   link crosses a layout boundary. The outgoing instance re-rendered with the new pathname,
   consumed the handoff token, and unmounted with it. Consumption is now deferred a tick
   (cleanup cancels the doomed read) and guarded on the destination path.
4. **Single-shot measurement.** The callout's anchor was measured once, 120ms after
   arrival, racing the destination painting, the smooth scroll *and* Recharts sizing itself
   after mount. Now polled across the first second.
5. **Absolute-month seed plan.** The month table was hardcoded (`2025-2` … `2026-11`),
   which would have drifted out of the Statistics chart's rolling six-month window within
   months — a nightly job faithfully restoring an emptying chart. Now a seasonal profile
   projected relative to today.
6. **Sequential writes.** ~450 awaited creates: fine from a CLI, a timeout risk inside a
   function, and a reseed that dies halfway leaves the demo with its cast deleted and *no*
   bookings. Now batched 10 at a time, under the pooled `connection_limit=20`.
7. **Landing moment applied before the reload.** The live mirror highlighted the new row
   and *then* reloaded the pane, so the reload discarded the mark. Invisible on a first
   booking — the row cannot be there yet — so it only surfaced on a repeat.
8. **Landing moment applied before hydration.** The poll found the row in the pane's
   server-rendered HTML, styled it and stopped; the pane's own React then hydrated,
   reconciled the table and threw the styles away. Now re-applied for ~5s to outlive
   hydration. This is the third instance in this feature of *"measured once, raced the
   render, gave up"* — see also bugs 4 and the tour's ring.
9. **Revenue curve shape.** A flat 30% company/individual mix produced a curve where
   August — the busiest month by bookings — showed *less* revenue than July. Realistic
   counts do not automatically give a realistic revenue *shape*; the two are modelled
   separately (40% company Jun–Sep vs 22% otherwise).

---

## What to test

- The full loop on the demo tenant: front door → tour → book → see it land.
- `/live` on desktop and at 375px.
- **Regression on a real tenant** — this is the one that matters, since `master` also
  deploys Nikalas Marani's live site. No demo component should render at all, `/live`
  should 404, no rate limiting, and email should still send.
- After any refactor of the six screens carrying `data-tour` attributes, walk the tour —
  see [[MaintenanceNotes]] §12.

---

## Related

- [[DemoSite/Plan-DemoRedesign]] · [[DemoSite/DemoDirections]] · [[DemoSite/Plan-DemoSite]]
- [[MaintenanceNotes]] §11 (email `tenantId`), §12 (`data-tour` anchors), §13 (embed check), §14 (cron)
- [[KnownBugs]] #19 (rate limiting still open app-wide), #7 (portal clipping — why the tour portals)
