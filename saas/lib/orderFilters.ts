/**
 * Query fragments shared by every order surface (Feature 191).
 *
 * These live in one module because the alternative — the same `where` clause
 * written out at the list, the board, the counts, the calendar and the CSV
 * export — is how those five drift apart. That is not hypothetical: the export
 * and the screen it exports from already disagreed about whether abandoned
 * orders count, and nothing caught it because both queries were individually
 * valid.
 *
 * Deliberately NOT in an `app/actions/*` file. A `'use server'` module may
 * export async functions and nothing else; a plain helper or a type exported
 * from one crashes every action in its bundle at module load
 * (MaintenanceNotes §24 / KnownBugs #33).
 */

/**
 * An abandoned order is not an order.
 *
 * It exists only so a late payment callback has somewhere to land — a guest who
 * was sent to the card gateway and never came back, or whose card was refused.
 * The winery is not meant to see these anywhere in its order screens; they live
 * on `/admin/abandoned` and nowhere else.
 *
 * **Spread this into every order query.** Forgetting it does not error — it
 * quietly puts abandoned rows back in the list, the counts, the board or the
 * export, looking exactly like fresh orders that need attention. That is the
 * single most likely silent regression in this feature.
 */
export const NOT_ABANDONED = { abandonedAt: null } as const

/** Only the abandoned ones — the inverse, for `/admin/abandoned`. */
export const ONLY_ABANDONED = { abandonedAt: { not: null } } as const

/**
 * A cancelled order is not revenue.
 *
 * Distinct from `NOT_ABANDONED`, and the two are not interchangeable. An
 * abandoned order never reached the winery at all; a cancelled one did, was
 * real, and then fell through. So cancelled rows stay visible in the order
 * screens — a winery needs to see what it cancelled — but they must not be
 * counted in any money or volume total.
 *
 * Spread this into **statistics** queries, never into the list/board/calendar.
 *
 * Added 2026-09-18 after the Orders page and Statistics were found to disagree:
 * `orders/page.tsx` already excluded cancelled from its revenue strip, while
 * Statistics excluded only abandoned. On the dev tenant that put 15,017 GEL of
 * cancelled bookings inside a reported 208,202 GEL, and 6,498 GEL of cancelled
 * wine orders inside 116,797 GEL. Both enums spell the value `CANCELLED`, so
 * this fragment is valid against `Order` and `WineOrder` alike.
 */
export const NOT_CANCELLED = { stage: { not: 'CANCELLED' } } as const

/**
 * The values the payment filter accepts.
 *
 * Four since T-318 (Q-12): `nothing` is a booking whose total is set and is exactly 0 ₾ — all guests
 * free, a partner visit. It cannot be Paid (the server refuses it) and calling it Unpaid would leave
 * it in the Unpaid count forever, so it is its own quiet state. A booking with NO price yet (total
 * not set) is different: it stays Unpaid, and marking it paid says "Set the price first".
 */
export const PAYMENT_FILTERS = ['paid', 'invoiced', 'unpaid', 'nothing'] as const
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]

/** A total that is not exactly 0 ₾ — NULL (price not set yet) included, which SQL's `<> 0` would drop. */
// (A top-level `OR` — spread into a where that already has its own `OR` it would overwrite it; none of the
// current callers has one. Keep it that way or fold both into an `AND`.)
const NOT_FREE = { OR: [{ totalPrice: null }, { totalPrice: { not: 0 } }] }

/**
 * The payment filter, expressed over dates rather than a status column.
 *
 * `invoiced` deliberately means **invoiced and still unpaid** — the outstanding
 * list, which is what anyone reaching for that filter actually wants. An order
 * that was invoiced and then paid answers the `paid` filter instead. Under the
 * old payment ladder it could only ever be one or the other, because marking it
 * paid overwrote the invoice; two independent dates can say both.
 *
 * The four **partition** the orders exactly — nothing is in two buckets and
 * nothing is in none. That is not cosmetic: these drive a picker that shows a
 * count beside each option, and the last release reported `All statuses (31)`
 * against 21 bookings because two of its entries overlapped. So `unpaid` means
 * "we have not even asked yet", not merely "not paid" — an invoiced order that
 * has not settled answers `invoiced`, which is the chasing list. A 0 ₾ booking
 * that is not paid answers `nothing` whatever else is set on it (an old invoice
 * on a free booking must not sit in the chasing list); a 0 ₾ booking that was
 * marked Paid in the past stays `paid` — history is not rewritten.
 *
 * A cancelled, unpaid booking answers `nothing` too (T-318, Max 2026-10-30): it cannot be marked Paid any more,
 * so leaving it in `unpaid` / `invoiced` would keep it in the chasing list, the counts and the CSV for good.
 * It stays visible under the Cancelled status and in the unfiltered list. A cancelled booking that WAS paid
 * stays `paid` — history is not rewritten. (Wine orders have no payment filter and never reach `nothing`.)
 *
 * An unrecognised value matches everything rather than nothing, so a stale
 * bookmark shows the unfiltered list instead of an empty one that reads as "you
 * have no orders".
 */
export function paymentFilterWhere(payment: string | undefined | null) {
  switch (payment) {
    case 'paid':
      return { paidAt: { not: null } }
    case 'invoiced':
      return { paidAt: null, invoiceSentAt: { not: null }, ...NOT_CANCELLED, ...NOT_FREE }
    case 'unpaid':
      return { paidAt: null, invoiceSentAt: null, ...NOT_CANCELLED, ...NOT_FREE }
    case 'nothing':
      return { paidAt: null, OR: [{ totalPrice: 0 }, { stage: 'CANCELLED' as const }] }
    default:
      return {}
  }
}

/** What the payment pill/marker should show for one order. */
export function paymentStateOf(o: {
  paidAt: Date | string | null
  invoiceSentAt?: Date | string | null
  /** Bookings only. Left out (wine orders, callers without it) → never `nothing`. */
  totalPrice?: number | null
  /** Bookings only, with `totalPrice`: a cancelled, unpaid booking owes nothing. */
  stage?: string
}): PaymentFilter {
  if (o.paidAt != null) return 'paid'
  if (o.totalPrice === 0) return 'nothing'
  if (o.totalPrice !== undefined && o.stage === 'CANCELLED') return 'nothing'
  if (o.invoiceSentAt != null) return 'invoiced'
  return 'unpaid'
}
