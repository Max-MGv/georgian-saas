/**
 * "5 Nov 2026, 14:30" in Georgia's time (Asia/Tbilisi, UTC+4, no DST) — when a card link stops working.
 * The admin and the guests are in Georgia; a browser in another zone must not shift the deadline shown.
 *
 * The month name is NOT taken from the browser's Georgian locale data: some browsers (and the embedded one
 * this was checked in) ship without it and silently print English. The parts are read from a numeric
 * en-GB format and the month is named from the tables below.
 */
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const KA_MONTHS = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']

function partsOf(iso: string | Date) {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))) out[p.type] = p.value
  // Some engines print midnight as "24".
  if (out.hour === '24') out.hour = '00'
  return out
}

function monthName(month: string, locale: string): string {
  return (locale === 'ka' ? KA_MONTHS : EN_MONTHS)[Number(month) - 1] ?? month
}

export function formatLinkMoment(iso: string | Date, locale: string): string {
  const p = partsOf(iso)
  return `${Number(p.day)} ${monthName(p.month, locale)} ${p.year}, ${p.hour}:${p.minute}`
}

/** Just the day: "5 Nov" — for the short "link open until …" mark. */
export function formatLinkDay(iso: string | Date, locale: string): string {
  const p = partsOf(iso)
  return `${Number(p.day)} ${monthName(p.month, locale)}`
}
