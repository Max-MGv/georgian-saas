import { t } from '@/lib/t'

type Row = { minGuests: number; maxGuests: number }

/**
 * The guest range of a price row, as guests read it (T-272, Max 2026-10-23): "3–6 guests"; the ladder's last row
 * "7+ guests" (its max is only a cap, e.g. 100); a one-number row "1 guest" / "5 guests". `ladder` = the rows that
 * offer the product, so "last" is the highest max among them. Used by the home page's package cards (the starred
 * row) and the booking form's individual visit tiles (the row for the entered guest count) — keep them one function.
 */
export function tierRangeLabel(locale: string, row: Row, ladder: Row[]): string {
  if (row.minGuests === row.maxGuests) {
    return row.minGuests === 1 ? t(locale, 'form.tier_one') : t(locale, 'form.tier_n', { n: row.minGuests })
  }
  const top = Math.max(...ladder.map(r => r.maxGuests))
  return row.maxGuests >= top
    ? t(locale, 'form.tier_from', { min: row.minGuests })
    : t(locale, 'form.tier_range', { min: row.minGuests, max: row.maxGuests })
}
