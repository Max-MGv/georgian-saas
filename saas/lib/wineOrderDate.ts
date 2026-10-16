/**
 * Preferred delivery / pickup date rules for wine orders (T-14, vault/Plan-WineOrderFeatures.md
 * Chunk 7). Max (2026-10-12): the same rules as bookings — the lead time and the winery's Closed
 * Days — and it is a PREFERENCE, not a promise.
 *
 * Pure and client-safe: the public form uses it to grey out days, `submitWineOrder` uses it to
 * refuse them. Dates are `YYYY-MM-DD` strings on the winery's calendar — Georgian time
 * (lib/tbilisiTime.ts), like lib/bookingHours.ts — so a wine order and a booking agree on "today".
 */

export type PreferredDateRules = {
  /** Hours of notice — the booking lead time (see `wineLeadHours`). */
  leadHours: number
  /** The winery's Closed Days, `YYYY-MM-DD`. */
  blockedDates: string[]
}

import { tbilisiDateIso } from '@/lib/tbilisiTime'

/**
 * The first day that can be asked for: the calendar day of "now + lead time". A day counts once
 * any part of it is far enough ahead — there is no time slot to compare, only a day.
 */
export function earliestPreferredDate(now: Date, leadHours: number): string {
  // The Georgian calendar day — the server runs in UTC (KnownBugs #79).
  return tbilisiDateIso(new Date(now.getTime() + Math.max(0, leadHours) * 60 * 60 * 1000))
}

/** How far ahead a customer may ask for (QA 2026-10-14 F3: the server took 9999-12-31). */
export const PREFERRED_DATE_MAX_DAYS = 365

/** The last day that can be asked for: a year from today, Georgian calendar. */
export function latestPreferredDate(now: Date): string {
  return tbilisiDateIso(new Date(now.getTime() + PREFERRED_DATE_MAX_DAYS * 24 * 60 * 60 * 1000))
}

export type PreferredDateProblem = 'missing' | 'invalid' | 'too_soon' | 'too_far' | 'closed'

/** Null when the date is fine; otherwise why not. */
export function checkPreferredDate(
  dateStr: string | null | undefined,
  rules: PreferredDateRules,
  now: Date = new Date()
): PreferredDateProblem | null {
  if (!dateStr) return 'missing'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'invalid'
  const [y, m, d] = dateStr.split('-').map(Number)
  const probe = new Date(y!, m! - 1, d!)
  if (probe.getFullYear() !== y || probe.getMonth() !== m! - 1 || probe.getDate() !== d) return 'invalid'
  if (dateStr < earliestPreferredDate(now, rules.leadHours)) return 'too_soon'
  if (dateStr > latestPreferredDate(now)) return 'too_far'
  if (rules.blockedDates.includes(dateStr)) return 'closed'
  return null
}

/**
 * The booking lead time, as one number for a date-only choice: the single value, or — when the
 * winery splits it by visit type — the shorter of the two (a delivery is not a lunch).
 */
export function wineLeadHours(settings: { split: boolean; single: number; tasting: number; lunch: number }): number {
  return settings.split ? Math.min(settings.tasting, settings.lunch) : settings.single
}

// Fixed month names, deliberately not toLocaleDateString('ka-GE'): Vercel's Node has no Georgian
// ICU data and falls back to an English shape, while the guest's browser has it — so the server
// and the browser printed different text (a React hydration error on Wine Orders) and Georgian
// receipt emails got an English date. Same lesson as lib/emails/templates/dateFormat.ts (QA
// 2026-10-14, vault/QA-WineOrderFeatures-2026-10-14.md F1).
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_SHORT_KA = ['იან.', 'თებ.', 'მარ.', 'აპრ.', 'მაი.', 'ივნ.', 'ივლ.', 'აგვ.', 'სექ.', 'ოქტ.', 'ნოე.', 'დეკ.']

/** "28 Oct 2026" / "28 ოქტ. 2026" from a `YYYY-MM-DD` day; `withYear: false` → "28 Oct". */
export function formatIsoDay(iso: string, locale: string, opts: { withYear?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number)
  const month = (locale === 'ka' ? MONTHS_SHORT_KA : MONTHS_SHORT_EN)[m! - 1]
  return opts.withYear === false ? `${d} ${month}` : `${d} ${month} ${y}`
}

/** "14 Oct 2026" / "14 ოქტ. 2026" label for a stored date (UTC midnight from @db.Date). */
export function formatPreferredDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  return formatIsoDay(d.toISOString().slice(0, 10), locale)
}
