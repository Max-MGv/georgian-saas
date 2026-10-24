/**
 * A real calendar day in YYYY-MM-DD form.
 *
 * `new Date('2027-02-31')` does not fail — it rolls over to 3 March — so a format check alone lets an impossible
 * date quietly become a different booking day (QA T-215, 2026-10-24: typing 31/02 into a date box). Round-tripping
 * through UTC catches it. Shared by every admin write of an order date and by `components/DateInput.tsx`.
 */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(v + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
