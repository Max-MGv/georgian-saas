/**
 * What a booking request may contain — guest counts and masterclass lines — checked
 * the same way by every write path (Plan-PricingModel §4.3, KnownBugs #93).
 *
 * Pure: settings and catalogue rows are passed in, so the public action, the admin
 * actions and the forms' own warnings all run this one function. The forms only
 * mirror it; the server decides (MaintenanceNotes §35).
 *
 * Why it exists: before T-152 the public action took counts and masterclass
 * quantities as sent — a negative tasting count or a −20 masterclass line lowered
 * the total that online payment then charged (#93, reproduced 2026-10-19).
 */
import { countsFromVisit, payingGuests, PRODUCTS, type BookingVisitType, type Counts, type Product } from '@/lib/pricingUtils'
import { rulesVisitType } from '@/lib/bookingHours'

/** Upper bound for any single count or quantity. Generous — the forms cap guests at 200. */
export const MAX_COUNT = 999

/** A whole number from 0 to MAX_COUNT, sent as a number (a string is refused, not coerced). */
export function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT
}

export type CountRules = {
  /** Today's group minimum for this visit type (all paying guests together). Null = none. */
  groupMin: number | null
  /** Company per-product minimums (D-11) — each applies only when that product has guests. Null = none. */
  productMins: Record<Product, number | null>
}

export type CountsInput = {
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  /** 'single' = one guest count (individuals, company simple form); 'boxes' = the three boxes + Free. */
  layout: 'single' | 'boxes'
  /** Public bookings get the minimums; admin screens are exempt (A-8). */
  form: 'public' | 'admin'
  visitType: unknown
  guestCount?: unknown
  tastingOnly?: unknown
  lunchOnly?: unknown
  tastingLunch?: unknown
  free?: unknown
}

export type CountsError =
  | { code: 'bad_visit_type' }
  | { code: 'not_whole_number'; field: string }
  | { code: 'no_paying_guests' }
  | { code: 'visit_mismatch' }
  | { code: 'below_group_min'; min: number }
  | { code: 'below_product_min'; product: Product; min: number }
  | { code: 'too_many_free'; max: number }

export type CountsResult =
  | { ok: true; counts: Counts; visitType: BookingVisitType; warnings: CountsError[] }
  | { ok: false; error: CountsError }

const VISIT_TYPES: readonly BookingVisitType[] = ['TASTING', 'TASTING_LUNCH', 'LUNCH']

/**
 * Normalised counts for a booking, or the first reason to refuse it.
 *
 * - 'single' layout: one guest count; the server builds the boxes from the visit
 *   type (A-4) and ignores any boxes sent — an individual booking can no longer
 *   be priced off a forged split (#93).
 * - 'boxes' layout: every box is a whole number 0…999 (missing = 0).
 * - Visit type and boxes must agree (A-6): Tasting → no lunch guests; Lunch only →
 *   only Lunch only guests; Tasting + Lunch → at least one lunch guest. Refused on the
 *   public form AND on admin screens (Max, 2026-10-21, Q-3: "it should prevent a booking —
 *   enter lunch guests or switch to Tasting only"; the 2026-10-07 production order was this mistake).
 * - Individuals never book Lunch only (D-5).
 * - Public only: the group minimum (as today) and any per-product company minimum.
 * - No more Free guests than paying guests, on every form (Max, 2026-10-22 public form; 2026-10-23 admin screens too —
 *   the Free box had no limit, so a company could book 1 paying + 200 free; the max-guest cap only counts paying guests).
 */
export function checkBookingCounts(input: CountsInput, rules: CountRules): CountsResult {
  const visitType = input.visitType as BookingVisitType
  if (!VISIT_TYPES.includes(visitType)) return { ok: false, error: { code: 'bad_visit_type' } }
  if (input.bookingType === 'INDIVIDUAL' && visitType === 'LUNCH') return { ok: false, error: { code: 'bad_visit_type' } }

  let counts: Counts
  if (input.layout === 'single') {
    if (!isCount(input.guestCount)) return { ok: false, error: { code: 'not_whole_number', field: 'guestCount' } }
    counts = countsFromVisit(visitType, input.guestCount)
  } else {
    const read = (field: 'tastingOnly' | 'lunchOnly' | 'tastingLunch' | 'free') => {
      const v = input[field]
      return v === undefined || v === null ? 0 : v
    }
    const raw = { tastingOnly: read('tastingOnly'), lunchOnly: read('lunchOnly'), tastingLunch: read('tastingLunch'), free: read('free') }
    for (const [field, v] of Object.entries(raw)) {
      if (!isCount(v)) return { ok: false, error: { code: 'not_whole_number', field } }
    }
    counts = raw as Counts
  }

  if (payingGuests(counts) < 1) return { ok: false, error: { code: 'no_paying_guests' } }

  const lunchGuests = counts.lunchOnly + counts.tastingLunch
  const mismatch =
    (visitType === 'TASTING' && lunchGuests > 0) ||
    (visitType === 'LUNCH' && (counts.tastingOnly > 0 || counts.tastingLunch > 0)) ||
    (visitType === 'TASTING_LUNCH' && lunchGuests === 0)
  // `warnings` stays in the result shape for checks that only advise (none today).
  const warnings: CountsError[] = []
  if (mismatch) return { ok: false, error: { code: 'visit_mismatch' } }

  if (input.form === 'public') {
    if (rules.groupMin != null && payingGuests(counts) < rules.groupMin) {
      return { ok: false, error: { code: 'below_group_min', min: rules.groupMin } }
    }
    if (input.bookingType === 'COMPANY') {
      for (const p of PRODUCTS) {
        const min = rules.productMins[p]
        if (min != null && counts[p] > 0 && counts[p] < min) {
          return { ok: false, error: { code: 'below_product_min', product: p, min } }
        }
      }
    }
  }
  // Never more Free guests than paying guests — the public form and the admin screens alike (Max, 2026-10-23:
  // "why allow admin to enter more free guests than paying guests? block that too"). Last, so a group that is
  // simply too small hears about the minimum first.
  if (counts.free > payingGuests(counts)) {
    return { ok: false, error: { code: 'too_many_free', max: payingGuests(counts) } }
  }

  return { ok: true, counts, visitType, warnings }
}

// ─── Count rules from the winery's settings ─────────────────────────────────

/** Every setting a booking's guest-count rules read (Settings → Booking rules). */
export const COUNT_RULE_KEYS = [
  'min_guests_tasting', 'min_guests_tasting_lunch', 'max_guests_tasting', 'max_guests_tasting_lunch',
  'min_guests_company_tasting_only', 'min_guests_company_lunch_only', 'min_guests_company_tasting_lunch',
] as const
export type CountRuleKey = (typeof COUNT_RULE_KEYS)[number]

/** A positive whole number from a setting, or null for blank / 0 / garbage ("no limit"). */
function limit(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return n > 0 ? n : null
}

/**
 * The one reader of the count-rule settings (Plan-PricingModel Chunk 6) — pure: the caller passes a getter
 * (`settingValue(settings, key)` or a map), so the public action, the admin actions and the form's own
 * warnings all get identical rules.
 *
 * - Group minimum: the visit type's `min_guests_*` (Lunch only uses Tasting + Lunch's, A-5). A blank or
 *   unreadable value falls back to **4**, exactly as createBooking always has.
 * - Group maximum: the visit type's `max_guests_*`; blank = no cap (as today).
 * - Company per-product minimums (D-11): blank = none; **never** for individuals.
 */
export function countRulesFromSettings(
  get: (key: CountRuleKey) => string | null | undefined,
  visitType: BookingVisitType,
  bookingType: 'INDIVIDUAL' | 'COMPANY',
): CountRules & { groupMax: number | null } {
  const lunchRules = rulesVisitType(visitType) === 'TASTING_LUNCH'
  const company = bookingType === 'COMPANY'
  return {
    groupMin: limit(get(lunchRules ? 'min_guests_tasting_lunch' : 'min_guests_tasting')) ?? 4,
    groupMax: limit(get(lunchRules ? 'max_guests_tasting_lunch' : 'max_guests_tasting')),
    productMins: {
      tastingOnly: company ? limit(get('min_guests_company_tasting_only')) : null,
      lunchOnly: company ? limit(get('min_guests_company_lunch_only')) : null,
      tastingLunch: company ? limit(get('min_guests_company_tasting_lunch')) : null,
    },
  }
}

// ─── Hot dish ────────────────────────────────────────────────────────────────

/**
 * A hot dish is lunch food: one may be chosen only when at least one guest has lunch (Lunch only or Tasting &
 * Lunch) — Max, 2026-10-21 (A-11). Every write path refuses a dish on a booking with no lunch guest rather than
 * silently dropping it; the forms only send a dish while there is a lunch guest, so a guest never meets this.
 * Food notes (allergies) are not food choices and stay allowed on any booking.
 */
export function hotDishWithoutLunch(counts: Counts, vegetable: unknown, meat: unknown): boolean {
  const chosen = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  return (chosen(vegetable) || chosen(meat)) && counts.lunchOnly + counts.tastingLunch === 0
}

// ─── Admin screens (New Order, the order page) ──────────────────────────────

/** A reason an admin screen cannot save, as an adminT key (+ vars) — the forms show it, the server returns it. */
export type AdminOrderProblem = { key: string; vars?: Record<string, string | number> }

/**
 * Plan-PricingModel Chunk 8: what admin New Order and the order page may save, checked by the forms (inline)
 * and by `createOrderAdmin` / `updateOrderEnhanced` (authoritative) with this one function.
 * - Individuals: visit type Tasting / Tasting + Lunch and ONE guest count (D-5, A-4).
 * - Companies: the four boxes; the total is their sum, never typed (D-3 — what made P-11 possible).
 * - Visit type and boxes agree (A-6), a hot dish needs a lunch guest (A-11). No minimums (A-8).
 */
export function checkAdminOrder(input: {
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  visitType: unknown
  guestCount?: unknown
  boxes?: { tastingOnly?: unknown; lunchOnly?: unknown; tastingLunch?: unknown; free?: unknown } | null
  hotDishVegetable?: unknown
  hotDishMeat?: unknown
}): { ok: true; counts: Counts; visitType: BookingVisitType } | { ok: false; problem: AdminOrderProblem } {
  const company = input.bookingType === 'COMPANY'
  const r = checkBookingCounts({
    bookingType: input.bookingType, layout: company ? 'boxes' : 'single', form: 'admin', visitType: input.visitType,
    guestCount: input.guestCount,
    ...(company ? { tastingOnly: input.boxes?.tastingOnly, lunchOnly: input.boxes?.lunchOnly, tastingLunch: input.boxes?.tastingLunch, free: input.boxes?.free } : {}),
  }, { groupMin: null, productMins: { tastingOnly: null, lunchOnly: null, tastingLunch: null } })
  if (!r.ok) {
    const e = r.error
    if (e.code === 'not_whole_number') return { ok: false, problem: { key: 'orderForm.err.wholeNumbers' } }
    if (e.code === 'too_many_free') return { ok: false, problem: { key: 'orderForm.err.tooManyFree', vars: { max: e.max } } }
    if (e.code === 'no_paying_guests') return { ok: false, problem: { key: 'orderForm.err.noPaying' } }
    if (e.code === 'visit_mismatch') {
      const v = input.visitType
      return { ok: false, problem: { key: v === 'TASTING' ? 'orderForm.err.mismatchTasting' : v === 'LUNCH' ? 'orderForm.err.mismatchLunch' : 'orderForm.err.mismatchTastingLunch' } }
    }
    return { ok: false, problem: { key: 'orderForm.err.visitType' } }
  }
  if (hotDishWithoutLunch(r.counts, input.hotDishVegetable, input.hotDishMeat)) return { ok: false, problem: { key: 'orderForm.err.hotDish' } }
  return { ok: true, counts: r.counts, visitType: r.visitType }
}

// ─── Masterclass lines ───────────────────────────────────────────────────────

/** One catalogue row. `name` / `nameKa` / `group` are only needed by callers that STORE the line (they become its snapshot). */
export type MasterclassCatalogueRow = {
  id: string
  unitType: 'PER_PERSON' | 'PER_PIECE' | 'FLAT'
  active: boolean
  pricePerUnit: number
  name?: string
  nameKa?: string | null
  group?: { id: string; nameEn: string; nameKa: string | null } | null
}
/** The Prisma `select` every caller that stores add-on lines uses, so the snapshot can never be half-filled. */
export const MASTERCLASS_CATALOGUE_SELECT = {
  id: true, name: true, nameKa: true, unitType: true, active: true, pricePerUnit: true,
  group: { select: { id: true, nameEn: true, nameKa: true } },
} as const
export type MasterclassLineIn = { masterclassItemId?: unknown; quantity?: unknown }
/** What is copied onto a stored line so renaming / deleting the item or group later never changes an invoice (E5, #94). */
export type MasterclassLineSnapshot = {
  nameSnapshot: string | null
  nameKaSnapshot: string | null
  unitSnapshot: 'PER_PERSON' | 'PER_PIECE' | 'FLAT'
  groupId: string | null
  groupNameSnapshot: string | null
  groupNameKaSnapshot: string | null
}
export type MasterclassLineOut = { masterclassItemId: string; quantity: number; pricePerUnit: number } & MasterclassLineSnapshot

export type MasterclassError =
  | { code: 'not_a_list' }
  | { code: 'unknown_item' }
  | { code: 'inactive_item' }
  | { code: 'duplicate_item' }
  | { code: 'bad_quantity' }

/**
 * Masterclass lines as they will be stored: every item must be this tenant's
 * (the caller passes only its own catalogue rows) and active; quantities whole
 * 1…999; FLAT items are always quantity 1; the price always comes from the
 * catalogue, never from the request. Any bad line refuses the whole booking —
 * silently dropping a line the guest saw priced would be its own surprise.
 */
export function checkMasterclassLines(
  lines: unknown,
  catalogue: MasterclassCatalogueRow[],
): { ok: true; lines: MasterclassLineOut[] } | { ok: false; error: MasterclassError } {
  if (lines === undefined || lines === null) return { ok: true, lines: [] }
  if (!Array.isArray(lines)) return { ok: false, error: { code: 'not_a_list' } }
  const byId = new Map(catalogue.map(r => [r.id, r]))
  const seen = new Set<string>()
  const out: MasterclassLineOut[] = []
  for (const raw of lines as MasterclassLineIn[]) {
    const id = typeof raw?.masterclassItemId === 'string' ? raw.masterclassItemId : ''
    const item = byId.get(id)
    if (!item) return { ok: false, error: { code: 'unknown_item' } }
    if (!item.active) return { ok: false, error: { code: 'inactive_item' } }
    if (seen.has(id)) return { ok: false, error: { code: 'duplicate_item' } }
    seen.add(id)
    if (!isCount(raw.quantity) || raw.quantity < 1) return { ok: false, error: { code: 'bad_quantity' } }
    out.push({
      masterclassItemId: id,
      quantity: item.unitType === 'FLAT' ? 1 : raw.quantity,
      pricePerUnit: item.pricePerUnit,
      nameSnapshot: item.name ?? null,
      nameKaSnapshot: item.nameKa ?? null,
      unitSnapshot: item.unitType,
      groupId: item.group?.id ?? null,
      groupNameSnapshot: item.group?.nameEn ?? null,
      groupNameKaSnapshot: item.group?.nameKa ?? null,
    })
  }
  return { ok: true, lines: out }
}
