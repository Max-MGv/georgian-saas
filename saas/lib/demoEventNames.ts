/**
 * The demo's event vocabulary — names only, no imports, no directives.
 *
 * Split out from `lib/demoAnalytics.ts` (the browser-side sender) because
 * `app/actions/demoAnalytics.ts` validates against the same list, and a server
 * action importing the client helper that imports the server action is a cycle.
 * This module is the shared half, and it is deliberately data and nothing else.
 */

/**
 * The fixed vocabulary. A name not in this list is dropped server-side — the
 * table is meant to stay countable, and a typo that silently creates a new event
 * name is how an analytics table turns into a junk drawer.
 */
export const DEMO_EVENT_NAMES = [
  /** Every route the visitor lands on. The denominator for everything else. */
  'page_view',
  /** Which of the front door's paths was taken. props: { path } — one of
   *  mirror | winery | guest | setup | skip. */
  'front_door_path',
  /** The tour began. props: { step, auto } — `auto` distinguishes the winery
   *  path's automatic start from a deliberate press, which is the difference
   *  between "we started it" and "they wanted it". */
  'tour_started',
  /** A step was reached. props: { step } — 1-indexed, so the drop-off point is
   *  a number you can read without converting. */
  'tour_step',
  /** The visitor reached the end of the last step. */
  'tour_completed',
  /** The tour was dismissed before the end. props: { step } — the step it was
   *  abandoned on is the whole reason this event exists. */
  'tour_abandoned',
  /** The Explore panel was opened. */
  'explore_opened',
  /** A capability row was clicked. props: { label } — which features a prospect
   *  self-selects is the closest thing the demo has to a stated requirement. */
  'capability_clicked',
  /** Step 7's primary CTA: "make a booking and watch it arrive" → /live. */
  'cta_live_mirror',
  /** Step 7's secondary CTA: the mailto to max@vineworks.ge. The one event that
   *  is unambiguously a lead. */
  'cta_email',
  /** A booking was actually placed on the demo. Outlives the booking row, which
   *  the nightly reseed deletes. */
  'booking_placed',
] as const

export type DemoEventName = (typeof DEMO_EVENT_NAMES)[number]
