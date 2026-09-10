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
}
