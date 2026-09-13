/**
 * Booking lead time + working hours/days — shared between the public booking
 * form (client) and createBooking.ts (server), so the two can't drift apart.
 * See vault/features/Feature 177 - Booking Lead Time and Working Hours.md.
 */

export type VisitType = 'TASTING' | 'TASTING_LUNCH'

export type DayHours = { open: string; close: string; closed: boolean }

/** Sunday = 0 … Saturday = 6, matching `Date#getDay()`. */
export type WeeklyHours = [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours]

export function defaultWeeklyHours(open: string, close: string): WeeklyHours {
  return [0, 1, 2, 3, 4, 5, 6].map(() => ({ open, close, closed: false })) as WeeklyHours
}

/** Parses `working_hours_days_json`; falls back to uniform hours for every day on any error. */
export function parseWeeklyHours(json: string, uniformOpen: string, uniformClose: string): WeeklyHours {
  if (!json) return defaultWeeklyHours(uniformOpen, uniformClose)
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed) && parsed.length === 7) {
      return parsed.map(d => ({
        open: typeof d?.open === 'string' ? d.open : uniformOpen,
        close: typeof d?.close === 'string' ? d.close : uniformClose,
        closed: !!d?.closed,
      })) as WeeklyHours
    }
  } catch {
    // fall through to default
  }
  return defaultWeeklyHours(uniformOpen, uniformClose)
}

/** Resolves the open/close/closed state for one calendar date (`YYYY-MM-DD`). */
export function getDayHours(
  dateStr: string,
  useCustomDays: boolean,
  weeklyHours: WeeklyHours,
  uniformOpen: string,
  uniformClose: string
): DayHours {
  if (!useCustomDays) return { open: uniformOpen, close: uniformClose, closed: false }
  // Parse as a local date (not UTC) so the weekday matches what the visitor sees on the calendar.
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, (m || 1) - 1, d || 1).getDay()
  return weeklyHours[day]
}

/** Hourly slot labels ("HH:00") from open to close inclusive, e.g. "12:00".."18:00". */
export function generateHourlySlots(open: string, close: string): string[] {
  const openHour = Math.ceil(parseInt(open.split(':')[0]) || 0)
  const closeHour = Math.floor(parseInt(close.split(':')[0]) || 0)
  if (closeHour < openHour) return []
  const slots: string[] = []
  for (let h = openHour; h <= closeHour; h++) slots.push(`${String(h).padStart(2, '0')}:00`)
  return slots
}

export function getLeadHours(
  visitType: VisitType,
  split: boolean,
  singleHours: number,
  tastingHours: number,
  tastingLunchHours: number
): number {
  if (!split) return singleHours
  return visitType === 'TASTING' ? tastingHours : tastingLunchHours
}

/** The earliest instant (as a Date) a booking may start, given the lead time in hours. */
export function minBookableInstant(now: Date, leadHours: number): Date {
  return new Date(now.getTime() + leadHours * 60 * 60 * 1000)
}

/** True if `dateStr` + `timeSlot` ("HH:00") falls at or after the minimum bookable instant. */
export function slotMeetsLeadTime(dateStr: string, timeSlot: string, minInstant: Date): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h] = timeSlot.split(':').map(Number)
  const slotInstant = new Date(y, (m || 1) - 1, d || 1, h || 0, 0, 0, 0)
  return slotInstant.getTime() >= minInstant.getTime()
}
