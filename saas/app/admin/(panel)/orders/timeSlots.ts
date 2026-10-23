// The time slots offered on the admin order screens (New Order, the Orders side panel, the order page — T-215).
export const ADMIN_TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

/**
 * The admin slots plus the order's own time when it is not one of them. A public booking's slot comes from the
 * tenant's opening hours (lib/bookingHours.ts — e.g. 09:00 or 19:00); without it in the list a <select> shows the
 * first option instead, and saving anything else would silently move the booking to 11:00.
 */
export function slotOptions(current?: string | null): string[] {
  if (!current || ADMIN_TIME_SLOTS.includes(current)) return ADMIN_TIME_SLOTS
  return [...ADMIN_TIME_SLOTS, current].sort()
}
