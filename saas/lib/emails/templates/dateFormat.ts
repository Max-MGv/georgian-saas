/**
 * Explicit locale date formatting for email templates — deliberately not
 * `toLocaleDateString('ka-GE', ...)`. That relies on the runtime's ICU data
 * having a full `ka-GE` locale table; Vercel's Node runtime doesn't (falls
 * back to an en-US-shaped numeric order while accepting the locale tag
 * without error), which is what produced an invalid `09.14.2026` in
 * production invoices. Local dev has full ICU and never showed it. Building
 * the string from `getDate()`/`getMonth()`/`getFullYear()` + a fixed name
 * table sidesteps the ICU dependency entirely, in both directions.
 */

const WEEKDAYS_KA = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი']
const MONTHS_KA = [
  'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
  'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი',
]

/** e.g. "Monday, 14 September 2026" / "ორშაბათი, 14 სექტემბერი, 2026" */
export function formatLongDate(date: Date, locale: 'en' | 'ka'): string {
  if (locale === 'ka') {
    return `${WEEKDAYS_KA[date.getDay()]}, ${date.getDate()} ${MONTHS_KA[date.getMonth()]}, ${date.getFullYear()}`
  }
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** e.g. "14/09/2026" (en) / "14.09.2026" (ka) — day-first in both, separator only differs. */
export function formatShortDate(date: Date, locale: 'en' | 'ka'): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const sep = locale === 'ka' ? '.' : '/'
  return `${day}${sep}${month}${sep}${date.getFullYear()}`
}
