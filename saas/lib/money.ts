/**
 * Money, stored as an integer number of tetri.
 *
 * ## Why this exists
 *
 * Every money column in this schema was a `Float` until 2026-09-18. Floating
 * point cannot represent 0.10 exactly, so sums drift: add enough line items and
 * an invoice disagrees with the gateway by a tetri. Stripe, Flitt and every
 * other payment system store money as an integer of minor units for exactly
 * this reason, and Flitt already *receives* tetri today — `createCheckout` has
 * always multiplied by 100 on the way out (see `payments/flitt.ts`).
 *
 * So this module is not a new idea. It moves the conversion from the edge of
 * the payment call to the edge of the database, which is where it belongs.
 *
 * ## The shape
 *
 * `Tetri` is a **branded number**. At runtime it is an ordinary integer, so it
 * round-trips through Prisma, JSON and React props untouched. At compile time
 * it is not assignable from a bare `number`, which is the whole point: the
 * 100× error — passing major units where minor are expected, or the reverse —
 * becomes a type error instead of a plausible-looking wrong number on an
 * invoice.
 *
 * Values crossing a boundary the compiler cannot see (a Prisma read, a JSON
 * payload) come back as `number` and must be re-branded with {@link asTetri}.
 *
 * ## The rule
 *
 * **Never interpolate a raw money value into UI or email text.** Before this
 * module every display site did exactly that — `${order.totalPrice}₾` — which
 * is why the conversion is dangerous: `4500` renders as "4500₾" and looks
 * entirely plausible. Always go through {@link formatTetri}.
 *
 * See `vault/DataModel/Plan-DataModel.md` chunk 3.
 */

/** An integer number of tetri. 4500 = ₾45.00. Never a fractional value. */
export type Tetri = number & { readonly __tetri: unique symbol }

/** GEL has 100 tetri, like most currencies have 100 minor units. */
const MINOR_PER_MAJOR = 100

/**
 * Re-brand a plain number that is *already* in tetri.
 *
 * For values arriving from outside the type system — a Prisma read, a JSON
 * request body, a server-component prop. It does not convert; it asserts.
 * Passing major units here is the one mistake this module cannot catch.
 *
 * Throws on a non-integer, because a fractional tetri means a conversion was
 * missed somewhere upstream and silently rounding it would hide that.
 */
export function asTetri(value: number): Tetri {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Not a finite money value: ${value}`)
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `Tetri must be a whole number, got ${value}. A fractional tetri means ` +
        `a major-unit value reached asTetri() without going through fromMajor().`
    )
  }
  return value as Tetri
}

/** Same as {@link asTetri} but passes `null`/`undefined` straight through. */
export function asTetriOrNull(value: number | null | undefined): Tetri | null {
  return value == null ? null : asTetri(value)
}

/**
 * Convert major units (₾45.5) to tetri (4550).
 *
 * Rounds rather than truncates. `Math.round` is deliberate and matches the
 * behaviour `toMinorUnits` has always had in `payments/flitt.ts`: truncation
 * turns 49.985 into 4998 and undercharges by a tetri.
 */
export function fromMajor(major: number): Tetri {
  if (!Number.isFinite(major)) {
    throw new RangeError(`Not a finite money value: ${major}`)
  }
  return Math.round(major * MINOR_PER_MAJOR) as Tetri
}

/**
 * Convert tetri back to major units (4550 → 45.5).
 *
 * For the rare consumer that genuinely needs a decimal — a third-party API, a
 * CSV column someone will open in a spreadsheet. **Not for display:** use
 * {@link formatTetri}, which handles the symbol and separators.
 */
export function toMajor(t: Tetri): number {
  return t / MINOR_PER_MAJOR
}

export type FormatOptions = {
  /** Thousands separators — "24,301₾". Off by default, matching most call sites. */
  grouping?: boolean
  /** A space before the symbol — "45 ₾". Used by the Georgian invoice print. */
  space?: boolean
  /** Drop the ₾ entirely, for a column that carries the unit in its header. */
  symbol?: boolean
  /**
   * Force two decimals even on a whole amount.
   *
   * Off by default so ₾45.00 renders "45₾", which is what every screen shows
   * today. Turn it on for invoices and receipts, where a bare "45" beside a
   * "45.50" reads as sloppy.
   */
  decimals?: boolean
}

/**
 * Render tetri for a human.
 *
 * The default output is **byte-identical to what the app rendered before the
 * conversion** for whole-GEL amounts, which is what keeps this change invisible
 * on screens that were already correct.
 */
export function formatTetri(t: Tetri, options: FormatOptions = {}): string {
  const { grouping = false, space = false, symbol = true, decimals = false } = options

  const negative = t < 0
  const abs = Math.abs(t)
  const whole = Math.trunc(abs / MINOR_PER_MAJOR)
  const remainder = abs % MINOR_PER_MAJOR

  const wholeText = grouping ? whole.toLocaleString('en-US') : String(whole)
  const needsDecimals = decimals || remainder !== 0
  const body = needsDecimals
    ? `${wholeText}.${String(remainder).padStart(2, '0')}`
    : wholeText

  return `${negative ? '-' : ''}${body}${symbol ? `${space ? ' ' : ''}₾` : ''}`
}

/** Convenience for a nullable amount — renders an em dash when unset. */
export function formatTetriOrDash(t: Tetri | null | undefined, options?: FormatOptions): string {
  return t == null ? '—' : formatTetri(t, options)
}

/**
 * Parse human input ("45", "45.5", "1,234.56", "45 ₾") into tetri.
 *
 * Returns `null` on anything unparseable so a caller can show a validation
 * message rather than writing a NaN to the database.
 */
export function parseMajor(input: string): Tetri | null {
  const cleaned = input.replace(/[₾\s,]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return fromMajor(parsed)
}

/**
 * Sum tetri.
 *
 * Integer addition is exact, so this needs no rounding — which is the entire
 * reason for the change. It exists so call sites read as money rather than as
 * arithmetic, and so `reduce` callbacks keep their brand.
 */
export function sumTetri(values: readonly Tetri[]): Tetri {
  return values.reduce<number>((total, v) => total + v, 0) as Tetri
}

/**
 * Multiply an amount by a whole quantity — 4 masterclass pieces at ₾25.
 *
 * Quantity must be an integer; scaling money by a fraction is a discount, not a
 * multiplication, and belongs in {@link applyPercent} where the rounding rule
 * is explicit.
 */
export function multiplyTetri(t: Tetri, quantity: number): Tetri {
  if (!Number.isInteger(quantity)) {
    throw new RangeError(`Quantity must be a whole number, got ${quantity}`)
  }
  return (t * quantity) as Tetri
}

/**
 * Apply a percentage discount, rounding to the nearest tetri.
 *
 * Percentages stay `Float` in the schema — `Company.wineDiscountPercent` and
 * `WineOrder.discountPercent` are ratios, not money. This is the one place the
 * float meets the integer, so the rounding happens once, here, rather than
 * differently at each call site.
 */
export function applyPercent(t: Tetri, percent: number): Tetri {
  if (!Number.isFinite(percent)) {
    throw new RangeError(`Not a finite percentage: ${percent}`)
  }
  return Math.round(t * (1 - percent / 100)) as Tetri
}
