/**
 * The demo chrome's palette — "cellar dark".
 *
 * Plan-DemoFlowFixes Chunk 5, task 5.1. Every demo-only surface (front door,
 * tour, feature rail, mode banner, login shortcut) reads its colour from here
 * and **no demo component carries its own literal hex**. Two copies of a
 * palette is how KnownBugs #20/#21 happened and had to be cleaned up once
 * already; a third divergence should be a merge conflict, not a drift.
 *
 * ── Why a FIXED platform palette, not the tenant's `var(--site-*)` tokens ──
 * The 2026-09-10 teardown recommended inheriting the tenant's tokens. On
 * reflection that is wrong and this deliberately does not do it: the demo
 * chrome is the *platform* speaking **about** the tenant, and it has to stay
 * legible over all 16 theme presets — inheriting would give dark-on-dark on any
 * of the 5 dark ones. So it is fixed, and derived from the brand wine #7C1D23:
 * warm and dark, so it reads as a distinct layer over the cream product while
 * still belonging to the same world. A cellar, not a dashboard.
 *
 * What it replaces: a saturated indigo-violet (#4A3FD1 / #1E1B4B) that appeared
 * nowhere else in VineWorks. Four surfaces in a palette borrowed from another
 * product is what read as "template bolted on" — the main source of Max's
 * "looks a bit out of date in use".
 */

/** The eight tokens. Decided in Plan-DemoFlowFixes "Decisions already made". */
export const DEMO = {
  /** Overlay scrim base, front-door ground. */
  ground: '#1E0E11',
  /** Cards, tooltip body, rail body. */
  surface: '#2E171C',
  /** Hover / selected rows. */
  raised: '#3D2026',
  /** Hairlines. */
  border: '#52302F',
  /** Primary text — warm ivory, same family as the site cream. */
  text: '#F7EDE4',
  /** Secondary text. */
  muted: '#C9AAA2',
  /** Links, arrows, progress. */
  accent: '#C9565C',
  /** Filled CTA background, with `onAccent` on top. */
  accentSolid: '#8F2229',
} as const

/**
 * Derived values — not new colours, just the eight above applied. Kept here so
 * "one place" stays true for shadows and scrims as well as for flat fills.
 */
export const DEMO_FX = {
  /** Text on `accentSolid`. */
  onAccent: '#FFF6F2',
  /** Full-screen scrim (front door, tour). `ground` at 0.93. */
  scrim: 'rgba(30, 14, 17, 0.93)',
  /** The tour's dim. Lighter than `scrim` on purpose — the point of the tour is
   *  that you can still see the product underneath being talked about. */
  scrimTour: 'rgba(30, 14, 17, 0.72)',
  /** Lighter scrim behind the rail drawer. */
  scrimSoft: 'rgba(30, 14, 17, 0.58)',
  /** The tour's spotlight ring glow. `accent` at 0.38. */
  ring: '0 0 0 3px rgba(201, 86, 92, 0.38)',
  /** Panel shadows, in rising order of lift. */
  shadowSm: '0 4px 16px rgba(12, 5, 7, 0.34)',
  shadowMd: '0 12px 40px rgba(12, 5, 7, 0.5)',
  shadowLg: '0 24px 70px rgba(12, 5, 7, 0.55)',
  /** Error text — the one hue outside the eight, because a warning that reads
   *  as body copy is not a warning. Warm enough to sit in the same family. */
  danger: '#F0A9A0',
} as const

/**
 * The same eight as CSS custom properties, for anywhere a stylesheet or a
 * Tailwind arbitrary value needs them. Spread onto a wrapper's `style`.
 * Deliberately not written to `:root` in globals.css — that is a shared file
 * every tenant loads, and this chunk ships demo-only.
 */
export const demoCssVars: Record<string, string> = {
  '--demo-ground': DEMO.ground,
  '--demo-surface': DEMO.surface,
  '--demo-raised': DEMO.raised,
  '--demo-border': DEMO.border,
  '--demo-text': DEMO.text,
  '--demo-muted': DEMO.muted,
  '--demo-accent': DEMO.accent,
  '--demo-accent-solid': DEMO.accentSolid,
}
