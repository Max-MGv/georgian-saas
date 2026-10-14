/**
 * The winery's clock — Georgian time — for date and lead-time rules (KnownBugs #79).
 *
 * The server runs in UTC on Vercel, four hours behind Georgia, so "today" and "13:00" read off the
 * runtime's own clock were the wrong day / the wrong instant there: the lead-time check was 4 h too
 * lenient, and 00:00–04:00 Georgian time "today" was still yesterday. These helpers name the zone
 * explicitly, so the server and the guest's browser (wherever its clock is set) agree.
 *
 * Pure and client-safe. Uses Intl rather than a hard-coded +4: Georgia has no daylight saving
 * today, but that is a law, not a constant.
 */
export const WINERY_TIME_ZONE = 'Asia/Tbilisi'

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: WINERY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function partsOf(instant: Date): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of dateParts.formatToParts(instant)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out
}

/** The Georgian calendar date of an instant, `YYYY-MM-DD`. */
export function tbilisiDateIso(instant: Date): string {
  const p = partsOf(instant)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** The instant at which a Georgian wall clock reads `y-m-d h:00` (`m` is 1–12). */
export function tbilisiInstant(y: number, m: number, d: number, h = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h)
  const p = partsOf(new Date(guess))
  // How far the Georgian clock is ahead of UTC at that moment.
  const offset = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - guess
  return new Date(guess - offset)
}
