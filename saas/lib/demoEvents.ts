/**
 * The "a booking just landed" signal for the demo tour.
 *
 * Lives in lib/ rather than inside the tour component so the booking form and
 * the wine catalogue don't have to import a UI component just to fire an event
 * — and so the tour that listens for it can be replaced without touching either
 * of them. (It has been replaced once already: DemoChecklist → DemoTour.)
 *
 * Dispatching is a no-op outside the demo tenant in practice, because nothing
 * else listens.
 */
export const DEMO_BOOKED_EVENT = 'vineworks-demo:booked'

/**
 * Who just booked. Carried so the live mirror can find the new row in the admin
 * pane and highlight it — DemoDirections Direction 02 asks for the booking to
 * land "highlighted, timestamped 'just now'", and the pane is an iframe of the
 * real orders table, so the only way to identify the row is to say who it is.
 * Optional: a wine order has no equivalent row in that table.
 */
export type DemoBookedDetail = { name?: string; surname?: string }

export function dispatchDemoBooked(detail?: DemoBookedDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DEMO_BOOKED_EVENT, { detail }))
  // The live mirror (/live) runs the guest site in an iframe, so the event has
  // to cross the frame boundary for the admin pane beside it to know a booking
  // landed. Same-origin, and the listener checks the origin before acting.
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: DEMO_BOOKED_EVENT, detail }, window.location.origin)
    } catch {
      // Cross-origin embed — the in-page listener still fires.
    }
  }
}
