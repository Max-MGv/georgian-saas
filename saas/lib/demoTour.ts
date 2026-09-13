/**
 * Everything about the demo tour except its rendering.
 *
 * Extracted from `components/DemoTour.tsx` when the tour's pill and the feature
 * rail's edge tab were merged into one "Explore this demo" control
 * ([[DemoSite/Plan-DemoFlowFixes]] deferred item 1, 2026-09-12). Before the
 * merge the tour was self-contained: it owned its steps, its localStorage and
 * its own entry pill, and nothing else needed to know any of it.
 *
 * Now `DemoExplore` renders the entry point and has to answer "has this visitor
 * started the tour, and where did they get to?" to label its own button. Two
 * components reading and writing one localStorage key is how state diverges, so
 * the split is deliberate and one-directional:
 *
 * - **`DemoTour` is the only writer.** It owns navigation, the spotlight, and
 *   every transition. Everyone else reads.
 * - **`DemoExplore` asks, it does not act.** It dispatches `TOUR_COMMAND_EVENT`
 *   and the tour decides what that means (which includes routing to the step's
 *   screen — see `beginAt`).
 * - **Every write publishes `TOUR_STATE_EVENT`**, so a reader re-reads rather
 *   than polling localStorage or holding a stale copy.
 *
 * `window.dispatchEvent` rather than React context on purpose: the two
 * components are mounted as siblings in three different layouts and, on a
 * guest→admin navigation, in two different React trees at once. A context
 * provider would have to be added to all three layouts and would still not
 * span that boundary. The same reasoning already put `TOUR_AUTOSTART_KEY` in
 * localStorage rather than in props.
 */

/** Where the tour's progress lives. */
export const TOUR_STORAGE_KEY = 'vineworks-demo-tour'

/**
 * Set by `DemoFrontDoor` when the visitor picks "I run a winery", consumed once
 * by `DemoTour` on `/admin/orders`. Deliberately a separate key from the tour's
 * own state: the front door and the tour live in different layouts (`(site)` vs
 * `admin/(panel)`) and never share a React tree, so localStorage is the only
 * channel between them.
 *
 * Only that one path arms it. Someone who chose the guest view or the live
 * mirror asked for something specific and must not be taken over.
 */
export const TOUR_AUTOSTART_KEY = 'vineworks-demo-tour-autostart'

/** Fired after any write to the tour's state. Readers re-read on it. */
export const TOUR_STATE_EVENT = 'vineworks-demo-tour-state'

/** Fired by `DemoExplore` to ask the tour to do something. */
export const TOUR_COMMAND_EVENT = 'vineworks-demo-tour-command'

export type TourCommand =
  /** Open the tour at this step, navigating to its screen if needed. */
  | { action: 'begin'; index: number }
  /** End the tour and leave the visitor where they are. */
  | { action: 'end' }

/**
 * Which half of the product a step is standing in.
 *
 * The tour crosses from one to the other between steps 2 and 3, and until
 * 2026-09-13 it did so silently: the visitor was teleported from a winery's
 * public website into its admin panel with nothing saying so. That crossing is
 * the *entire* product story — "the booking your guest makes lands here" — and
 * it was the one thing the tour never said out loud. Max, reviewing the flow:
 * "users should have a sense of what theyre looking at or whats next".
 */
export type TourSurface = 'guest' | 'admin'

export type TourStep = {
  /** Route this step lives on. The spotlight only shows here. */
  route: string
  /** `data-tour` value of the element to highlight. Missing target ⇒ the step
   *  still runs, centred, with no ring — a tour that vanishes because a selector
   *  drifted is worse than one that loses its ring. */
  target?: string
  /** Guest site or back office. Drives the breadcrumb, the rail's two groups,
   *  and the one-line note shown on the step where the two change over. */
  surface: TourSurface
  /** The screen's own name, in the visitor's words rather than the route's —
   *  "Wine list", not `/wines`. Second half of the breadcrumb. */
  screen: string
  title: string
  body: string
}

/** First half of the breadcrumb. Named for what the *visitor* is looking at,
 *  not for the codebase's `(site)` / `admin` split. */
export const SURFACE_LABEL: Record<TourSurface, string> = {
  guest: 'Guest site',
  admin: 'Back office',
}

/**
 * Shown once, on the first step of each surface, instead of on every step —
 * a banner that never goes away is furniture, and stops being read.
 *
 * Derived rather than stored: "is this the step where the surface changed?" is
 * a question about the steps array, and storing the answer beside it is how two
 * copies of one fact drift apart.
 */
export function isSurfaceChange(index: number): boolean {
  if (index <= 0) return false
  return TOUR_STEPS[index]?.surface !== TOUR_STEPS[index - 1]?.surface
}

/** The line shown when `isSurfaceChange` is true. Says what just happened to
 *  the visitor, and why it is the point rather than a detour. */
export const SURFACE_CHANGE_NOTE: Record<TourSurface, string> = {
  guest: 'Back on the public website — this is what your guests see.',
  admin: 'You have crossed into the winery’s back office. Same booking, other side of the counter.',
}

/**
 * Seven steps is the ceiling (DemoDirections). Every body names money or the
 * work it removes — "See it land in Orders" is an instruction, "a ₾600 booking
 * that arrived at 23:40 while you slept" is an argument.
 *
 * The `target` values are `data-tour` attributes living on seven unrelated
 * screens — see MaintenanceNotes §12 before renaming one.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    route: '/',
    target: 'booking-form',
    surface: 'guest',
    screen: 'Booking form',
    title: 'Bookings arrive while you sleep',
    body: 'This form takes the booking, prices it against the right rate, and emails the guest — at 23:40 on a Saturday if that is when they decide. No phone call, no Facebook thread, nobody writing it in a notebook.',
  },
  {
    route: '/wines',
    target: 'wine-catalogue',
    surface: 'guest',
    screen: 'Wine list',
    title: 'Restaurants order cases without asking you',
    body: 'Wine bars and importers order straight from this list, each at the discount you agreed with them. This winery has four trade buyers on four different rates.',
  },
  {
    route: '/admin/orders',
    target: 'orders-table',
    surface: 'admin',
    screen: 'Orders',
    title: 'Every booking in one place',
    body: 'Nearly 400 bookings, eighteen months of them, and nobody here typed a single one. Filter by date, company or status; send an invoice without leaving the row.',
  },
  {
    route: '/admin/orders',
    target: 'orders-filters',
    surface: 'admin',
    screen: 'Orders',
    title: 'Pull up one operator in a second',
    body: 'Six tour operators are in that company filter, each on its own rate ladder — per head, and different again for a group of 25 than for a group of 8. Every booking here was priced on the right one automatically. Filter to one operator and the whole season with them is in front of you.',
  },
  {
    route: '/admin/statistics',
    target: 'stats-future-revenue',
    surface: 'admin',
    screen: 'Statistics',
    title: 'You know your season before it happens',
    body: 'Around ₾31,000 is already committed for the months ahead, from bookings that are on the books today. That is the number that tells you whether to hire for the summer.',
  },
  {
    route: '/admin/wine-orders',
    target: 'wine-orders-list',
    surface: 'admin',
    screen: 'Wine orders',
    title: 'Tomorrow’s cases, already counted',
    body: 'The packing view turns open trade orders into a physical list — which wine, which vintage, how many bottles, for whom. Hand it to whoever is loading the van.',
  },
  {
    route: '/admin/content',
    target: 'content-editor',
    surface: 'admin',
    screen: 'Website editor',
    title: 'The website is yours to change',
    body: 'Text, photos, prices, opening hours — all edited here, in both Georgian and English. No developer, no ticket, no waiting a week for a paragraph.',
  },
]

export type TourState = {
  started: boolean
  index: number
  finished: boolean
  /** Set once the auto-start has fired, so it never fires twice on this browser
   *  even if the arming flag is somehow re-set. */
  autoStarted: boolean
}

export const EMPTY_TOUR_STATE: TourState = { started: false, index: 0, finished: false, autoStarted: false }

export function loadTourState(): TourState {
  try {
    const raw = localStorage.getItem(TOUR_STORAGE_KEY)
    return raw ? { ...EMPTY_TOUR_STATE, ...JSON.parse(raw) } : EMPTY_TOUR_STATE
  } catch {
    return EMPTY_TOUR_STATE
  }
}

/**
 * Persist and announce. The announcement is the half that matters now: without
 * it the Explore pill would keep saying "Take the guided tour" after the tour
 * had finished, because nothing would have told it to look again.
 */
export function saveTourState(s: TourState) {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Private mode — the tour just won't persist across reloads.
  }
  try {
    window.dispatchEvent(new CustomEvent<TourState>(TOUR_STATE_EVENT, { detail: s }))
  } catch {
    // Pre-mount / SSR. Callers are all in effects or handlers, so this is belt
    // and braces rather than a real path.
  }
}

/** Ask the tour to act. No-op when `DemoTour` is not mounted. */
export function sendTourCommand(command: TourCommand) {
  window.dispatchEvent(new CustomEvent<TourCommand>(TOUR_COMMAND_EVENT, { detail: command }))
}

/**
 * What the entry control should offer, given the tour's state and where the
 * visitor currently is.
 *
 * Lives here rather than inside `DemoExplore` because it is a statement about
 * the tour, not about the button — and because it is the one piece of logic the
 * merge introduced that is worth being able to reason about on its own.
 */
export type TourOffer =
  /** Never started, or ended and dismissed. */
  | { kind: 'start' }
  /** Ran to the end. */
  | { kind: 'replay' }
  /** Mid-tour and on the step's own screen: the spotlight is showing, so the
   *  entry control must stay out of the way entirely. */
  | { kind: 'spotlight'; index: number }
  /** Mid-tour but the visitor navigated off-script. Resume is one press. */
  | { kind: 'paused'; index: number }

export function tourOffer(state: TourState | null, pathname: string): TourOffer {
  if (!state || !state.started || state.finished) {
    return state?.finished ? { kind: 'replay' } : { kind: 'start' }
  }
  const step = TOUR_STEPS[state.index]
  if (step && pathname === step.route) return { kind: 'spotlight', index: state.index }
  return { kind: 'paused', index: state.index }
}
