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

export function dispatchDemoBooked() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DEMO_BOOKED_EVENT))
  // The live mirror (/live) runs the guest site in an iframe, so the event has
  // to cross the frame boundary for the admin pane beside it to know a booking
  // landed. Same-origin, and the listener checks the origin before acting.
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: DEMO_BOOKED_EVENT }, window.location.origin)
    } catch {
      // Cross-origin embed — the in-page listener still fires.
    }
  }
}
