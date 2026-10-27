/**
 * The columns of the printed booking sheet (T-151) and the per-winery choice of which ones to print.
 *
 * The choice is stored as the HIDDEN columns (tenant setting `booking_sheet_hidden_columns`, comma-separated keys):
 * the default — nothing hidden — keeps every winery's sheet exactly as it was, and a column added later shows up
 * for everyone until they untick it. The date/time column is the row's identity, so it is always printed and
 * is not offered in the picker. This is separate from the on-screen table's "Columns" control, which is stored
 * per browser.
 */

export const BOOKING_SHEET_HIDDEN_SETTING = 'booking_sheet_hidden_columns'

/** Printed left to right. `label` is an adminT key. */
export const BOOKING_SHEET_COLUMNS = [
  { key: 'tasting', label: 'orders.sheet.tastingGuests' },
  { key: 'lunchOnly', label: 'orders.sheet.lunchOnlyGuests' },
  { key: 'tastingLunch', label: 'orders.sheet.lunchGuests' },
  { key: 'free', label: 'orders.sheet.extraGuests' },
  { key: 'kitchenTotal', label: 'orders.sheet.kitchenTotal' },
  { key: 'hotDishVeg', label: 'orders.sheet.hotDishVeg' },
  { key: 'hotDishMeat', label: 'orders.sheet.hotDishMeat' },
  { key: 'foodNotes', label: 'orders.sheet.foodNotes' },
  { key: 'addOns', label: 'orders.sheet.addOns' },
  { key: 'tableWine', label: 'orders.sheet.tableWine' },
  { key: 'notes', label: 'orders.sheet.notes' },
  { key: 'company', label: 'orders.col.company' },
  { key: 'nationality', label: 'orders.sheet.nationality' },
  { key: 'contactName', label: 'orders.sheet.contactName' },
  { key: 'contactPhone', label: 'orders.sheet.contactPhone' },
  { key: 'guideName', label: 'orders.sheet.guideName' },
  { key: 'guidePhone', label: 'orders.sheet.guidePhone' },
] as const

export type BookingSheetColumnKey = (typeof BOOKING_SHEET_COLUMNS)[number]['key']

const KNOWN = new Set<string>(BOOKING_SHEET_COLUMNS.map(c => c.key))

/** The stored setting → the list of hidden keys. Unknown keys (a column removed in a later release) are dropped. */
export function parseHiddenColumns(raw: string | null | undefined): BookingSheetColumnKey[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter((s): s is BookingSheetColumnKey => KNOWN.has(s))
}

export function serializeHiddenColumns(hidden: readonly string[]): string {
  return BOOKING_SHEET_COLUMNS.filter(c => hidden.includes(c.key)).map(c => c.key).join(',')
}
