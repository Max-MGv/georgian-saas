/**
 * Generates the trading history for the Vineworks demo tenant: ~18 months of
 * bookings behind today, ~3 ahead, a named cast of tour operators and B2B wine
 * buyers, and wine orders across every status. See
 * vault/DemoSite/Plan-DemoRedesign.md Phase 0.
 *
 * Lives in lib/ rather than in the script because two callers need it: the CLI
 * (scripts/seed-demo-data.ts) and the scheduled regeneration route
 * (app/api/cron/reseed-demo/route.ts, task 0.6).
 *
 * SAFETY: resolves the tenant by slug ('vineworks-demo') and refuses anything
 * else, so it cannot be aimed at a real winery. Within that tenant it is
 * destructive by design — it deletes every Order, WineOrder and Company and
 * rebuilds them. That is what makes it idempotent, and it is exactly what the
 * scheduled reset needs: a visitor's tinkering is cleared on every run. No real
 * customer data lives on this tenant (verified against production 2026-09-10).
 *
 * Deterministic: a fixed-seed PRNG, so every run produces identical data.
 * Screenshots stay valid and a nightly reset restores the same demo.
 */
import type { PrismaClient, BookingStage, WineOrderStage, BookingType, VisitType, MasterclassUnit } from '@prisma/client'
import { priceBooking } from '@/lib/pricingUtils'
import { fromMajor } from '@/lib/money'

export const DEMO_SLUG = 'vineworks-demo'

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32). Math.random would make every run produce a
// different demo, which breaks screenshots and makes bugs unreproducible.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------
type TierSpec = {
  minGuests: number; maxGuests: number
  pricePerPerson: number; tastingLunchPricePerPerson: number; registrationPrice?: number
}

/**
 * A guide (the person who actually walks the group in) or a contact person
 * (who invoices go to — this used to be called a "representative" before
 * Plan-ContactRoles collapsed the two into one role). Both carry a `code` out
 * of the SAME per-tenant namespace as `Company.accessCode` — see
 * `codeExistsInTenant()` in `app/actions/companies.ts`. Codes here are
 * therefore hand-picked to be globally distinct within one seeded tenant, and
 * uppercase, because `findBookingCodeByCode()` upper-cases what the guest types
 * before matching.
 *
 * `role` names the `ContactRole.key` the person is seeded under ('guide' or
 * 'contact_person') — every tenant has exactly these two system roles
 * (Plan-ContactRoles Chunk 0), so the seed resolves each to a roleId once and
 * writes a `CompanyPerson` row per person rather than the old per-role tables.
 */
export type PersonSpec = { name: string; phone?: string; email?: string; code: string; role: 'guide' | 'contact_person' }

export type BookingCompanySpec = {
  name: string
  // These three used to write straight to Company.contactName/contactPhone/
  // contactEmail. Those columns are gone (Plan-ContactRoles Chunk 1) — the
  // seed now turns them into one more 'contact_person' CompanyPerson row,
  // exactly like each entry in `representatives` below.
  contactName: string; contactPhone: string; contactEmail: string
  identificationCode: string; address: string; tiers: TierSpec[]; share: number
  /**
   * Applied ONLY when seeding a non-demo tenant (see `accessCode` handling in
   * `seedDemoTenant`). The public demo deliberately leaves companies
   * code-less: `BookingForm.tsx` shows the "Enter your company code" popup for
   * any company that has one, and a prospect on the demo has nowhere to obtain
   * a code — the booking form is step one of the guided tour, so gating it
   * would dead-end the sales story.
   */
  accessCode: string
  /**
   * Used to be seeded on only ONE company (Silk Road Journeys): giving a
   * company guides used to retire its `accessCode` on the booking form
   * (`verifyBookingCode()` fell back to the company-level code only when the
   * company had zero guides), and seeding guides on all five once silently
   * broke four Playwright specs that relied on those codes still working
   * (2026-09-19). Feature 201 removed that fallback behaviour — the picker
   * now offers the company code alongside every guide/rep choice instead of
   * the code being retired — so that restriction no longer applies
   * (Plan-ContactRoles Chunk 12, MaintenanceNotes #26). Every company below
   * now has at least one guide.
   *
   * Each guide is still a person distinct from the company's own contact name
   * and its representatives (H13): reusing a name across roles makes "I am
   * not on this list" and "pick this person" fill the form identically,
   * which defeats the point of testing either path.
   */
  guides: PersonSpec[]
  /**
   * Representatives are safe to seed anywhere — `verifyBookingCode()` never
   * consults them. They are the person invoices go to, picked by an admin at
   * send time, never typed into the public form.
   */
  representatives: PersonSpec[]
}

/**
 * Tour operators, each on a DIFFERENT price ladder — that difference is the
 * only thing that makes the per-company pricing feature visible to a visitor
 * looking at the Companies screen. All fictional; the .example domains are
 * reserved by RFC 2606 so none of these addresses can reach a real inbox.
 *
 * Exported so `scripts/backfill-test-fixtures.ts` can apply the same codes,
 * guides and representatives to a tenant that was seeded before those existed,
 * without a destructive re-seed. Sharing the constant is the point: two copies
 * of these codes would drift, which is the exact failure this whole change is
 * fixing.
 */
export const BOOKING_COMPANIES: BookingCompanySpec[] = [
  {
    name: 'Kakheti Wine Routes', contactName: 'Nino Beridze', contactPhone: '+995 599 41 22 08',
    contactEmail: 'bookings@kakhetiwineroutes.example', identificationCode: '404512338', address: 'Telavi, Kakheti',
    tiers: [
      { minGuests: 1, maxGuests: 10, pricePerPerson: 55, tastingLunchPricePerPerson: 40 },
      { minGuests: 11, maxGuests: 20, pricePerPerson: 45, tastingLunchPricePerPerson: 40 },
      { minGuests: 21, maxGuests: 100, pricePerPerson: 38, tastingLunchPricePerPerson: 37 },
    ],
    accessCode: 'KAKHETI07',
    guides: [
      { name: 'Data Kiknadze', phone: '+995 599 41 22 10', code: 'KWRGUIDE1', role: 'guide' },
      { name: 'Irakli Sturua', phone: '+995 599 41 22 11', code: 'KWRGUIDE2', role: 'guide' },
    ],
    representatives: [
      { name: 'Eka Beridze', email: 'invoices@kakhetiwineroutes.example', phone: '+995 599 41 22 09', code: 'KWRREP1', role: 'contact_person' },
    ],
    share: 9,
  },
  {
    name: 'Tbilisi Tour Collective', contactName: 'Giorgi Kapanadze', contactPhone: '+995 577 30 14 76',
    contactEmail: 'groups@tbilisitourcollective.example', identificationCode: '405118902', address: 'Rustaveli Ave 14, Tbilisi',
    tiers: [
      { minGuests: 1, maxGuests: 10, pricePerPerson: 60, tastingLunchPricePerPerson: 40 },
      { minGuests: 11, maxGuests: 30, pricePerPerson: 48, tastingLunchPricePerPerson: 40 },
    ],
    accessCode: 'TBILISI14',
    guides: [
      { name: 'Nutsa Japaridze', phone: '+995 577 30 14 78', code: 'TTCGUIDE1', role: 'guide' },
    ],
    representatives: [
      { name: 'Sofia Abuladze', email: 'accounts@tbilisitourcollective.example', phone: '+995 577 30 14 77', code: 'TTCREP1', role: 'contact_person' },
    ],
    share: 7,
  },
  {
    name: 'Caucasus Vine Travel', contactName: 'Ana Tsereteli', contactPhone: '+995 595 88 60 31',
    contactEmail: 'ops@caucasusvinetravel.example', identificationCode: '406220145', address: 'Sighnaghi, Kakheti',
    tiers: [
      { minGuests: 1, maxGuests: 15, pricePerPerson: 50, tastingLunchPricePerPerson: 40 },
      { minGuests: 16, maxGuests: 100, pricePerPerson: 42, tastingLunchPricePerPerson: 38 },
    ],
    accessCode: 'CAUCASUS31',
    guides: [
      { name: 'Beka Lomidze', phone: '+995 595 88 60 33', code: 'CVTGUIDE1', role: 'guide' },
      { name: 'Salome Kikvadze', phone: '+995 595 88 60 34', code: 'CVTGUIDE2', role: 'guide' },
    ],
    representatives: [
      { name: 'Lasha Tsereteli', email: 'billing@caucasusvinetravel.example', phone: '+995 595 88 60 32', code: 'CVTREP1', role: 'contact_person' },
    ],
    share: 6,
  },
  {
    name: 'Alazani Valley Tours', contactName: 'Levan Chkheidze', contactPhone: '+995 558 12 47 90',
    contactEmail: 'hello@alazanivalleytours.example', identificationCode: '404907712', address: 'Gurjaani, Kakheti',
    tiers: [
      { minGuests: 1, maxGuests: 12, pricePerPerson: 58, tastingLunchPricePerPerson: 40 },
      { minGuests: 13, maxGuests: 100, pricePerPerson: 46, tastingLunchPricePerPerson: 40 },
    ],
    accessCode: 'ALAZANI90',
    guides: [
      { name: 'Zviad Menabde', phone: '+995 558 12 47 92', code: 'AVTGUIDE1', role: 'guide' },
    ],
    representatives: [
      { name: 'Tamuna Chkheidze', email: 'finance@alazanivalleytours.example', phone: '+995 558 12 47 91', code: 'AVTREP1', role: 'contact_person' },
    ],
    share: 5,
  },
  {
    name: 'Silk Road Journeys', contactName: 'Mariam Dolidze', contactPhone: '+995 591 76 20 55',
    contactEmail: 'reservations@silkroadjourneys.example', identificationCode: '405633208', address: 'Batumi, Adjara',
    tiers: [
      { minGuests: 1, maxGuests: 20, pricePerPerson: 52, tastingLunchPricePerPerson: 40 },
      { minGuests: 21, maxGuests: 100, pricePerPerson: 40, tastingLunchPricePerPerson: 38 },
    ],
    accessCode: 'SILKROAD55',
    guides: [
      // Deliberately NOT the company's own contact person (Mariam Dolidze, above).
      // When a company's contact and one of its guides are the same human, the
      // "I am not on this list" fallback becomes impossible to verify — both the
      // guide path and the company path fill the form with identical values. Found
      // 2026-09-19 while testing exactly that path.
      { name: 'Tinatin Beruashvili', phone: '+995 595 33 81 04', code: 'SRJGUIDE1', role: 'guide' },
      { name: 'Nika Kvaratskhelia', phone: '+995 577 62 90 18', code: 'SRJGUIDE2', role: 'guide' },
    ],
    representatives: [
      { name: 'Keti Dolidze', email: 'ap@silkroadjourneys.example', phone: '+995 591 76 20 56', code: 'SRJREP1', role: 'contact_person' },
    ],
    share: 4,
  },
]

/** Walk-ins and private visitors. Kept as its own company row, as the app expects. */
const INDIVIDUALS_TIERS: TierSpec[] = [
  { minGuests: 1, maxGuests: 2, pricePerPerson: 90, tastingLunchPricePerPerson: 60 },
  { minGuests: 3, maxGuests: 6, pricePerPerson: 70, tastingLunchPricePerPerson: 50 },
  { minGuests: 7, maxGuests: 100, pricePerPerson: 60, tastingLunchPricePerPerson: 45 },
]

type WineCompanySpec = {
  name: string; contactName: string; contactPhone: string; contactEmail: string
  identificationCode: string; address: string; discount: number; share: number
  /**
   * Same non-demo-only rule as the booking companies' `accessCode`, and for the
   * same reason (see BookingCompanySpec).
   *
   * No guide complication here: the wine-order flow resolves codes through
   * `findCompanyByCode(code, 'WINE_ORDER')` and never consults guides at all —
   * Plan-CompanyGuidesAndReps scoped guides/reps to the booking flow only. So a
   * wine company's code cannot be retired the way a booking company's can.
   */
  accessCode: string
}

export const WINE_COMPANIES: WineCompanySpec[] = [
  { name: 'Sighnaghi Wine Bar', contactName: 'Tamar Gogoladze', contactPhone: '+995 599 20 71 44', contactEmail: 'orders@sighnaghiwinebar.example', identificationCode: '412008551', address: 'Sighnaghi, Kakheti', discount: 10, share: 8, accessCode: 'SIGHNAGHI44' },
  { name: 'Restaurant Kakhuri', contactName: 'Zurab Maisuradze', contactPhone: '+995 577 45 19 03', contactEmail: 'zurab@kakhuri.example', identificationCode: '405771290', address: 'Chavchavadze Ave 37, Tbilisi', discount: 15, share: 7, accessCode: 'KAKHURI90' },
  { name: 'Vinoteka Batumi', contactName: 'Salome Jgerenaia', contactPhone: '+995 593 66 82 17', contactEmail: 'buy@vinotekabatumi.example', identificationCode: '445002318', address: 'Parnavaz Mepe St 22, Batumi', discount: 5, share: 5, accessCode: 'VINOTEKA17' },
  { name: 'Marani Import GmbH', contactName: 'Katrin Vogel', contactPhone: '+49 30 5544 8820', contactEmail: 'purchasing@maraniimport.example', identificationCode: 'DE331904772', address: 'Prenzlauer Allee 8, Berlin', discount: 20, share: 4, accessCode: 'MARANIIMP82' },
]

const MENU_ITEMS: { name: string; type: 'VEGETABLE' | 'MEAT' }[] = [
  { name: 'Pkhali platter', type: 'VEGETABLE' },
  { name: 'Badrijani nigvzit', type: 'VEGETABLE' },
  { name: 'Lobio in a clay pot', type: 'VEGETABLE' },
  { name: 'Mtsvadi (pork skewers)', type: 'MEAT' },
  { name: 'Chakapuli (lamb in tarragon)', type: 'MEAT' },
  { name: 'Shkmeruli (chicken in garlic)', type: 'MEAT' },
]

const MASTERCLASS_ITEMS: { name: string; unitType: MasterclassUnit; pricePerUnit: number }[] = [
  { name: 'Khinkali folding class', unitType: 'PER_PERSON', pricePerUnit: 35 },
  { name: 'Churchkhela making', unitType: 'PER_PERSON', pricePerUnit: 25 },
  { name: 'Wine blending session', unitType: 'PER_PERSON', pricePerUnit: 45 },
  { name: 'Qvevri cellar tour', unitType: 'FLAT', pricePerUnit: 60 },
]

const GUEST_FIRST = ['Nino', 'Giorgi', 'Ana', 'Levan', 'Mariam', 'Davit', 'Tamar', 'Irakli', 'Salome', 'Nika', 'Ketevan', 'Zurab', 'Elene', 'Sandro', 'Lika', 'Beka', 'Sophie', 'Marc', 'Elena', 'Thomas', 'Yuki', 'Anna', 'Lukas', 'Chiara']
const GUEST_LAST = ['Beridze', 'Kapanadze', 'Tsereteli', 'Chkheidze', 'Dolidze', 'Maisuradze', 'Gogoladze', 'Jgerenaia', 'Kvaratskhelia', 'Abashidze', 'Laurent', 'Weber', 'Rossi', 'Novak', 'Tanaka', 'Fischer', 'Moretti', 'Dubois']

/**
 * Bookings per calendar month for a boutique Kakheti winery, indexed 0=Jan.
 * August is the peak (harvest season); January is the trough.
 *
 * Deliberately a seasonal *profile* rather than a table of absolute months:
 * this is re-run on a schedule (task 0.6), and a hardcoded '2026-07' map would
 * quietly drift out of the Statistics chart's rolling six-month window within
 * months, putting the demo right back where it started.
 */
const SEASONAL_PROFILE = [5, 6, 10, 15, 21, 27, 33, 38, 30, 18, 9, 7]

/** How far back and forward the generated book runs, in whole months from now. */
const MONTHS_BACK = 18
const MONTHS_AHEAD = 3

/** Year-on-year growth, applied backwards — last year reads slightly quieter,
 *  so the chart tells the story of a business growing rather than a flat line. */
const ANNUAL_GROWTH = 0.12

const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'] as const

const WINE_ORDER_COUNT = 45

// ---------------------------------------------------------------------------
// Pricing — mirrors lib/pricing.ts recalcOrderTotal exactly, so a seeded total
// reconciles against the company's tier ladder if anyone checks the numbers.
// ---------------------------------------------------------------------------
function findTier(tiers: TierSpec[], guestCount: number): TierSpec | undefined {
  if (tiers.length === 0 || guestCount === 0) return undefined
  return tiers.find(t => guestCount >= t.minGuests && guestCount <= t.maxGuests)
    ?? tiers.reduce((best, t) => (t.pricePerPerson > best.pricePerPerson ? t : best))
}

/**
 * The order total, in TETRI.
 *
 * The tier literals at the top of this file are written in GEL, because that is
 * what a human reading them expects. `masterclassAmt` arrives in tetri, read
 * back from the database. **Mixing the two is a bug that shipped once already**
 * (2026-09-18): tier rates went in as GEL while masterclass amounts were tetri,
 * so a seeded booking came out as roughly 1/100 of its intended total with a
 * masterclass line added on at full size. Every tier value is converted here,
 * at the one place they are read for arithmetic.
 */
/**
 * Returns the total AND the three tier rates it was derived from.
 *
 * The rates are returned, not discarded, because every seeded order has to
 * carry `tastingRateSnapshot`/`lunchRateSnapshot`/`registrationFeeSnapshot`.
 * Until 2026-09-19 the seed wrote none of them, so all 393 demo orders were
 * snapshot-less — and those columns are nullable only to mean "created before
 * the columns existed". `recalcOrderTotal` therefore took its legacy branch for
 * every demo order, re-pricing the whole booking off live tiers the moment a
 * visitor added an extra. Same shape as bug #47, at 100% of the demo data.
 *
 * The rates match what `recalcOrderTotal`'s snapshot branch expects:
 * tasting = the per-person TASTING rate, lunch = the per-person COMBO rate.
 * Both branches below then reproduce exactly what recalc would compute.
 */
type SeedPrice = { total: number; tastingRate: number; lunchRate: number; registrationFee: number }

function computeTotal(opts: {
  tiers: TierSpec[]; visitType: VisitType; guestCount: number
  tastingGuests: number; lunchGuests: number; masterclassAmt: number
}): SeedPrice | null {
  const { tiers, visitType, guestCount, tastingGuests, lunchGuests, masterclassAmt } = opts
  // The party size picks the tier, same rule as the app (2026-09-19).
  const tier = findTier(tiers, guestCount)
  if (!tier) return null

  const rates = {
    tasting: fromMajor(tier.pricePerPerson),
    lunch: fromMajor(tier.pricePerPerson + tier.tastingLunchPricePerPerson),
    registration: fromMajor(tier.registrationPrice ?? 0),
  }
  const total = priceBooking(
    rates,
    { guestCount, tastingGuests, lunchGuests },
    visitType,
    { masterclass: masterclassAmt, extras: 0 },
  )
  return { total, tastingRate: rates.tasting, lunchRate: rates.lunch, registrationFee: rates.registration }
}

// ---------------------------------------------------------------------------

/**
 * Runs `tasks` with bounded concurrency.
 *
 * The seed used to await ~450 creates one at a time. Locally that is merely
 * slow; on a Vercel function it is a timeout risk, and a reseed that dies
 * halfway leaves the demo with its cast deleted and no bookings — worse than
 * the stale data it was replacing. Chunking turns it into ~45 waves.
 *
 * The limit stays under the pooled connection ceiling (DATABASE_URL carries
 * connection_limit=20), so this cannot starve the pool the rest of the request
 * is using.
 */
async function inBatches<T>(tasks: (() => Promise<T>)[], size = 10): Promise<void> {
  for (let i = 0; i < tasks.length; i += size) {
    await Promise.all(tasks.slice(i, i + size).map(fn => fn()))
  }
}

export type ExistingCompany = { name: string; contacts: { name: string; phone: string | null; email: string | null }[] }

export type SeedReport = {
  tenantId: string
  tenantName: string
  dryRun: boolean
  before: { orders: number; wineOrders: number; companies: number }
  /** The cast as it was before seeding — surfaced on a dry run so a tenant
   *  cloned from a real winery can be checked for real customer contact
   *  details before the seed overwrites them. */
  existingCompanies: ExistingCompany[]
  created: { bookings: number; wineOrders: number; companies: number; menuItems: number; masterclassItems: number }
  totals: { bookings: number; revenue: number; upcoming: number; futureRevenue: number }
  monthly: { label: string; bookings: number; revenue: number }[]
}

/**
 * Wipes and rebuilds the demo tenant's trading data. Pass `dryRun` to report
 * what would happen without writing anything.
 */

/**
 * The tier literals above are written in GEL because that is what a human
 * reading this file expects to see. Money is stored in tetri, so the conversion
 * happens once, here, at the write (chunk 3, 2026-09-18).
 */
function tierToTetri(t: {
  minGuests: number; maxGuests: number
  pricePerPerson: number; tastingLunchPricePerPerson: number; registrationPrice?: number
}) {
  return {
    minGuests: t.minGuests,
    maxGuests: t.maxGuests,
    pricePerPerson: fromMajor(t.pricePerPerson),
    tastingLunchPricePerPerson: fromMajor(t.tastingLunchPricePerPerson),
    registrationPrice: fromMajor(t.registrationPrice ?? 0),
  }
}

export async function seedDemoTenant(
  db: PrismaClient,
  /**
   * `slug` targets a tenant other than the demo one — used to refill a
   * throwaway tenant (Staging Winery) after the Feature 191 wipe. It has to be
   * passed explicitly: the guard below exists to stop an accidental seed of a
   * real winery, and defaulting it would be exactly that accident.
   */
  opts: { dryRun?: boolean; now?: Date; slug?: string } = {},
): Promise<SeedReport> {
  const dryRun = opts.dryRun ?? false
  const rng = makeRng(20260910)
  const rand = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]
  function weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = rng() * total
    for (const [v, w] of entries) { r -= w; if (r <= 0) return v }
    return entries[entries.length - 1][0]
  }

  const between = (a: Date, b: Date) => new Date(a.getTime() + rng() * (b.getTime() - a.getTime()))

  /**
   * The milestone dates for a seeded booking.
   *
   * Payment is rolled independently of stage, and the two pay-timings are
   * modelled separately because they are genuinely different customers:
   * individuals pay at checkout (so `paidAt` lands near `createdAt`, and the
   * flow-line draws Paid second), companies settle an invoice weeks after the
   * visit (so `paidAt` lands after `completedAt`, and Paid draws last). Both
   * come out of the same function, which is the property worth demonstrating.
   *
   * A small share are left abandoned — sent to the card gateway and never
   * returned — so `/admin/abandoned` has something on it. Those are never paid:
   * the database refuses that pairing outright.
   */
  function bookingDates(stage: BookingStage, createdAt: Date, visitDate: Date) {
    const confirmedAt = stage === 'CONFIRMED' || stage === 'COMPLETED'
      ? between(createdAt, visitDate) : null
    const completedAt = stage === 'COMPLETED' ? visitDate : null

    const prepaid = rng() < 0.3
    const invoiceSentAt = !prepaid && rng() < 0.45
      ? between(createdAt, completedAt ?? visitDate) : null
    const paidAt = prepaid
      ? between(createdAt, new Date(createdAt.getTime() + 3600000))
      // Invoice terms: settled some weeks after the visit, and often not yet —
      // which is the "delivered and still owed for" row the old column had
      // nowhere to put.
      : completedAt && rng() < 0.6
        ? new Date(completedAt.getTime() + rand(3, 40) * 86400000)
        : null
    // Never past the constraint: paid orders are not abandoned, and a future
    // payment date would be a lie.
    return {
      confirmedAt, completedAt, invoiceSentAt,
      paidAt: paidAt && paidAt > new Date() ? null : paidAt,
      abandonedAt: null,
    }
  }

  /** The wine equivalent. No invoice-send flow exists for wine orders. */
  function wineOrderDates(stage: WineOrderStage, createdAt: Date) {
    const confirmedAt = stage === 'CONFIRMED' || stage === 'DELIVERED'
      ? new Date(createdAt.getTime() + rand(1, 5) * 86400000) : null
    const deliveredAt = stage === 'DELIVERED'
      ? new Date((confirmedAt ?? createdAt).getTime() + rand(2, 14) * 86400000) : null

    const prepaid = rng() < 0.25
    const paidAt = prepaid
      ? new Date(createdAt.getTime() + rand(0, 2) * 3600000)
      : deliveredAt && rng() < 0.55
        ? new Date(deliveredAt.getTime() + rand(5, 60) * 86400000)
        : null
    return {
      confirmedAt, deliveredAt,
      paidAt: paidAt && paidAt > new Date() ? null : paidAt,
      abandonedAt: null,
    }
  }

  const slug = opts.slug ?? DEMO_SLUG
  const tenant = await db.tenant.findFirst({ where: { slug } })
  if (!tenant) throw new Error(`No tenant with slug '${slug}' in this database`)
  const tid = tenant.id

  const before = {
    orders: await db.order.count({ where: { tenantId: tid } }),
    wineOrders: await db.wineOrder.count({ where: { tenantId: tid } }),
    companies: await db.company.count({ where: { tenantId: tid } }),
  }

  const existingCompanies: ExistingCompany[] = await db.company.findMany({
    where: { tenantId: tid },
    select: { name: true, people: { select: { name: true, phone: true, email: true } } },
    orderBy: { name: 'asc' },
  }).then(rows => rows.map(r => ({ name: r.name, contacts: r.people })))

  const today = opts.now ? new Date(opts.now) : new Date()
  today.setHours(0, 0, 0, 0)

  // Month plan, relative to today rather than to fixed calendar dates.
  const plan: { year: number; month: number; count: number }[] = []
  for (let offset = -MONTHS_BACK; offset <= MONTHS_AHEAD; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    const yearsBack = (today.getFullYear() - d.getFullYear())
      + (today.getMonth() - d.getMonth()) / 12
    const growth = Math.pow(1 - ANNUAL_GROWTH, Math.max(0, yearsBack))
    plan.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      count: Math.max(1, Math.round(SEASONAL_PROFILE[d.getMonth()] * growth)),
    })
  }

  const emptyReport = (): SeedReport => ({
    tenantId: tid,
    tenantName: tenant.displayName ?? tenant.name,
    dryRun,
    before,
    existingCompanies,
    created: {
      bookings: plan.reduce((s, p) => s + p.count, 0),
      wineOrders: WINE_ORDER_COUNT,
      companies: BOOKING_COMPANIES.length + WINE_COMPANIES.length + 1,
      menuItems: MENU_ITEMS.length,
      masterclassItems: MASTERCLASS_ITEMS.length,
    },
    totals: { bookings: 0, revenue: 0, upcoming: 0, futureRevenue: 0 },
    monthly: [],
  })

  if (dryRun) return emptyReport()

  // --- Wipe. Order matters: payments reference orders; order lines and wine
  // items cascade; companies can only go once nothing references them. ---
  await db.payment.deleteMany({ where: { tenantId: tid } })
  await db.order.deleteMany({ where: { tenantId: tid } })
  await db.wineOrder.deleteMany({ where: { tenantId: tid } })
  await db.company.deleteMany({ where: { tenantId: tid } })
  await db.menuItem.deleteMany({ where: { tenantId: tid } })
  await db.masterclassItem.deleteMany({ where: { tenantId: tid } })

  // Every tenant has exactly these two system roles, seeded once
  // (Plan-ContactRoles Chunk 0/1) and never deleted by this reseed — the wipe
  // above only clears Company rows (and CompanyPerson cascades with them).
  const [contactPersonRole, guideRole] = await Promise.all([
    db.contactRole.findFirst({ where: { tenantId: tid, key: 'contact_person' } }),
    db.contactRole.findFirst({ where: { tenantId: tid, key: 'guide' } }),
  ])
  if (!contactPersonRole || !guideRole) {
    throw new Error(
      `Tenant '${slug}' is missing its 'contact_person'/'guide' ContactRole rows. These are ` +
      `seeded once per tenant and this reseed does not create them — see Plan-ContactRoles ` +
      `Chunk 0/1.`
    )
  }
  const roleIdFor = (role: 'contact_person' | 'guide') => role === 'guide' ? guideRole.id : contactPersonRole.id

  // --- Cast ---
  const individuals = await db.company.create({
    data: {
      name: 'Individuals', tenantId: tid, isIndividual: true, isBookingCompany: true,
      prices: { create: INDIVIDUALS_TIERS.map(t => tierToTetri(t)) },
    },
  })

  // Access codes are seeded for a throwaway/test tenant but NOT for the public
  // demo. `BookingForm.tsx` shows the "Enter your company code" popup for any
  // company that has one, and a demo visitor has nowhere to get a code — the
  // booking form is the first stop on the guided tour, so a code prompt there
  // is a dead end in the middle of the sales story. A non-demo slug is by
  // definition a throwaway tenant (that option exists to refill Staging
  // Winery), which is exactly where the Playwright suite needs a real code to
  // exercise the access-code path.
  //
  // Since Plan-ContactRoles Chunk 1, this same gate has to cover guide/rep
  // codes too, not just the company's own accessCode. `CompanyPerson.code` got
  // a GLOBAL unique index (not per-tenant — see the Chunk 1 migration), and
  // Staging Winery permanently holds this exact fixture's literal codes
  // (SRJGUIDE1 etc., carried over from the old CompanyGuide/CompanyRepresentative
  // tables). Before Chunk 1 that constraint didn't exist, so the demo tenant
  // could safely reuse the same literal codes on its own copy of these people;
  // now doing so collides with Staging Winery's rows on every reseed. A guide
  // code is optional and gates nothing on the demo anyway (same reasoning as
  // the company code above, just never actually needed there), so the fix is
  // to leave it null rather than invent a second set of demo-only codes that
  // would only drift from this one.
  const seedAccessCodes = slug !== DEMO_SLUG

  // Each seeded person's id is kept alongside the company so the order-writing loops below can
  // attribute a real OrderContact row to them, instead of just copying names onto the order's
  // own denormalised columns and leaving `OrderContact` empty (a real gap found by a 2026-09-23
  // blind audit — see [[Plan-ContactRoles]] Chunk 14 / [[KnownBugs]]).
  type SeededPerson = { id: string; name: string; phone: string | null; email: string | null }
  const bookingCompanies: (BookingCompanySpec & { id: string; contactPerson: SeededPerson; guidePeople: SeededPerson[] })[] = []
  for (const c of BOOKING_COMPANIES) {
    const row = await db.company.create({
      data: {
        name: c.name, tenantId: tid, identificationCode: c.identificationCode,
        address: c.address, isBookingCompany: true, isWineOrderCompany: false,
        accessCode: seedAccessCodes ? c.accessCode : null,
        prices: { create: c.tiers.map(t => tierToTetri(t)) },
      },
    })
    // CompanyPerson cascades on Company delete (schema.prisma), so the wipe
    // above already clears any from a previous run. The company's own scalar
    // contact and each representative are all 'contact_person' rows —
    // Plan-ContactRoles decision 2 folds "representative" into "contact
    // person". Guides are their own role, tagged on each PersonSpec.
    const contactPersonRow = await db.companyPerson.create({
      data: {
        companyId: row.id, roleId: roleIdFor('contact_person'),
        name: c.contactName, phone: c.contactPhone, email: c.contactEmail, code: null,
      },
    })
    const guidePeople: SeededPerson[] = []
    for (const p of [...c.representatives, ...c.guides]) {
      const personRow = await db.companyPerson.create({
        data: {
          companyId: row.id, roleId: roleIdFor(p.role), name: p.name,
          phone: p.phone ?? null, email: p.email ?? null,
          code: seedAccessCodes ? p.code : null,
        },
      })
      if (p.role === 'guide') {
        guidePeople.push({ id: personRow.id, name: p.name, phone: p.phone ?? null, email: p.email ?? null })
      }
    }
    bookingCompanies.push({
      ...c, id: row.id, guidePeople,
      contactPerson: { id: contactPersonRow.id, name: c.contactName, phone: c.contactPhone, email: c.contactEmail },
    })
  }

  const wineCompanies: (WineCompanySpec & { id: string; contactPerson: SeededPerson })[] = []
  for (const c of WINE_COMPANIES) {
    const row = await db.company.create({
      data: {
        name: c.name, tenantId: tid, identificationCode: c.identificationCode,
        address: c.address, isBookingCompany: false, isWineOrderCompany: true,
        accessCode: seedAccessCodes ? c.accessCode : null,
        wineDiscountPercent: c.discount,
      },
    })
    const contactPersonRow = await db.companyPerson.create({
      data: {
        companyId: row.id, roleId: roleIdFor('contact_person'),
        name: c.contactName, phone: c.contactPhone, email: c.contactEmail, code: null,
      },
    })
    wineCompanies.push({
      ...c, id: row.id,
      contactPerson: { id: contactPersonRow.id, name: c.contactName, phone: c.contactPhone, email: c.contactEmail },
    })
  }

  await db.menuItem.createMany({
    data: MENU_ITEMS.map((m, i) => ({ ...m, tenantId: tid, active: true, sortOrder: i })),
  })
  await db.masterclassItem.createMany({
    data: MASTERCLASS_ITEMS.map((m, i) => ({ ...m, pricePerUnit: fromMajor(m.pricePerUnit), tenantId: tid, active: true, sortOrder: i })),
  })
  const mcItems = await db.masterclassItem.findMany({ where: { tenantId: tid } })
  const vegItems = MENU_ITEMS.filter(m => m.type === 'VEGETABLE').map(m => m.name)
  const meatItems = MENU_ITEMS.filter(m => m.type === 'MEAT').map(m => m.name)

  // --- Bookings ---
  const companyWeights = bookingCompanies.map(c => [c, c.share] as const)
  // Payloads are built sequentially so the deterministic PRNG is consumed in a
  // fixed order; only the writes are parallelised. Same data, fewer round trips.
  const orderWrites: (() => Promise<unknown>)[] = []

  for (const { year: y, month: m, count } of plan) {
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    for (let i = 0; i < count; i++) {
      // Weekend-weighted: a winery's tasting room fills up Fri–Sun.
      let day = rand(1, daysInMonth)
      const dow = new Date(y, m, day).getDay()
      if (dow > 0 && dow < 5 && rng() < 0.45) day = Math.min(daysInMonth, day + (5 - dow))
      const date = new Date(Date.UTC(y, m, day, 12, 0, 0))
      const isFuture = date >= today

      // Group business concentrates in the season: tour operators run Kakheti
      // coach trips Jun–Sep and largely stop in winter. Without this the mix is
      // flat and the revenue curve comes out noisy enough that August — the
      // busiest month by bookings — can show LESS money than July, which is
      // exactly the wrong story for the chart. Averages to ~30% either way.
      const inSeason = m >= 5 && m <= 8
      const isCompany = rng() < (inSeason ? 0.4 : 0.22)
      const bookingType: BookingType = isCompany ? 'COMPANY' : 'INDIVIDUAL'
      const visitType: VisitType = rng() < 0.55 ? 'TASTING' : 'TASTING_LUNCH'
      const company = isCompany ? weighted(companyWeights) : null
      const tiers = company ? company.tiers : INDIVIDUALS_TIERS
      const guestCount = isCompany ? rand(8, 25) : rand(2, 6)

      // Company bookings use the enhanced per-guest split (the tenant has
      // enable_enhanced_company_booking on); individuals use the simple path.
      let tastingGuests = 0, lunchGuests = 0, freeGuests = 0
      if (isCompany) {
        freeGuests = rng() < 0.5 ? 1 : 0   // the guide eats free
        const paying = guestCount - freeGuests
        if (visitType === 'TASTING_LUNCH') {
          lunchGuests = paying - rand(0, Math.floor(paying / 3))
          tastingGuests = paying - lunchGuests
        } else {
          tastingGuests = paying
        }
      }

      // ~1 in 5 bookings adds a masterclass, so the order-detail expansion
      // isn't empty either.
      const mcLines: { masterclassItemId: string; quantity: number; pricePerUnit: number }[] = []
      let masterclassAmt = 0
      if (rng() < 0.2 && mcItems.length) {
        const item = pick(mcItems)
        const qty = item.unitType === 'FLAT' ? 1
          : item.unitType === 'PER_PERSON' ? guestCount
          : rand(10, 40)
        mcLines.push({ masterclassItemId: item.id, quantity: qty, pricePerUnit: item.pricePerUnit })
        masterclassAmt = qty * item.pricePerUnit
      }

      const priced = computeTotal({ tiers, visitType, guestCount, tastingGuests, lunchGuests, masterclassAmt })
      const totalPrice = priced?.total ?? null

      // Rolled BEFORE the stage, because an abandoned checkout is a slice of
      // every booking attempt, not a fraction of the ones that happened to stay
      // NEW. It forces the stage: an order that never completed payment never
      // progressed either, and the winery never saw it to act on.
      const isAbandoned = rng() < 0.07
      const stage: BookingStage = isAbandoned
        ? 'NEW'
        : isFuture
          ? weighted([['CONFIRMED', 55], ['NEW', 45]] as const)
          : weighted([['COMPLETED', 90], ['CANCELLED', 10]] as const)

      const first = pick(GUEST_FIRST), last = pick(GUEST_LAST)
      // Booked between a few days and six weeks before the visit — makes
      // "arrived at 23:40 on a Saturday" style copy true, not decorative.
      const createdAt = new Date(date.getTime() - rand(3, 42) * 86400000 - rand(0, 23) * 3600000)

      // Stage and payment are rolled INDEPENDENTLY, which is the whole point of
      // Feature 191 and the reason the demo data is worth looking at: it
      // produces the two shapes the old single column could not represent — a
      // completed visit still waiting to be paid for, and an individual who
      // paid weeks before anyone confirmed anything. Rolling one from the other
      // would quietly reproduce the old model in new columns.
      const dates = isAbandoned
        ? { confirmedAt: null, completedAt: null, invoiceSentAt: null, paidAt: null, abandonedAt: createdAt }
        : bookingDates(stage, createdAt, date)

      // OrderContact rows — company bookings only, mirroring what the real booking form/admin
      // screens write (decision 4: `Order.name/surname/phone/email` and the `contact_person`
      // OrderContact row must agree, so this uses the SAME person the columns above are copied
      // from, not a separately-rolled name). A guide row is added too when the company has one,
      // since that is exactly the attribution the picker exists to record.
      const contactRows: { tenantId: string; roleId: string; personId: string; nameSnapshot: string; phoneSnapshot: string | null; emailSnapshot: string | null }[] = []
      if (company) {
        contactRows.push({
          tenantId: tid, roleId: contactPersonRole.id, personId: company.contactPerson.id,
          nameSnapshot: company.contactPerson.name, phoneSnapshot: company.contactPerson.phone, emailSnapshot: company.contactPerson.email,
        })
        if (company.guidePeople.length > 0) {
          const guide = pick(company.guidePeople)
          contactRows.push({
            tenantId: tid, roleId: guideRole.id, personId: guide.id,
            nameSnapshot: guide.name, phoneSnapshot: guide.phone, emailSnapshot: guide.email,
          })
        }
      }

      const orderData = {
          tenantId: tid, stage, bookingType, visitType, date,
          timeSlot: pick(TIME_SLOTS), guestCount,
          tastingGuestCount: tastingGuests, lunchGuestCount: lunchGuests, freeGuestCount: freeGuests,
          hotDishVegetable: visitType === 'TASTING_LUNCH' ? pick(vegItems) : null,
          hotDishMeat: visitType === 'TASTING_LUNCH' ? pick(meatItems) : null,
          name: company ? company.contactName.split(' ')[0] : first,
          surname: company ? company.contactName.split(' ')[1] : last,
          email: company ? company.contactEmail : `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
          phone: company ? company.contactPhone : `+995 5${rand(50, 99)} ${rand(10, 99)} ${rand(10, 99)} ${rand(10, 99)}`,
          companyId: company ? company.id : individuals.id,
          totalPrice, createdAt,
          // Carry the rates this order was sold at, so recalc uses its snapshot
          // branch rather than repricing off live tiers (#49).
          tastingRateSnapshot: priced?.tastingRate ?? null,
          lunchRateSnapshot: priced?.lunchRate ?? null,
          registrationFeeSnapshot: priced?.registrationFee ?? null,
          ...dates,
          masterclassLines: mcLines.length ? { create: mcLines } : undefined,
          contacts: contactRows.length ? { create: contactRows } : undefined,
      }
      orderWrites.push(() => db.order.create({ data: orderData }))
    }
  }

  await inBatches(orderWrites)
  const created = orderWrites.length

  // --- Wine orders ---
  const vintages = await db.wineVintage.findMany({
    where: { tenantId: tid, active: true }, include: { wine: true },
  })
  let wineCreated = 0
  if (vintages.length > 0) {
    const wineWeights = wineCompanies.map(c => [c, c.share] as const)
    const wineWrites: (() => Promise<unknown>)[] = []
    for (let i = 0; i < WINE_ORDER_COUNT; i++) {
      const buyer = weighted(wineWeights)
      // Spread over the last 12 months, denser recently.
      const daysAgo = Math.floor(Math.pow(rng(), 1.6) * 365)
      const createdAt = new Date(today.getTime() - daysAgo * 86400000 - rand(0, 23) * 3600000)
      const lineCount = Math.min(rand(1, 4), vintages.length)
      const chosen: typeof vintages = []
      while (chosen.length < lineCount) {
        const v = pick(vintages)
        if (!chosen.some(c => c.id === v.id)) chosen.push(v)
      }
      const items = chosen.map(v => ({
        wineVintageId: v.id,
        wineNameSnapshot: v.wine.name,
        vintageYearSnapshot: v.year,
        priceSnapshot: v.price,
        quantity: pick([12, 24, 36, 48, 60, 72, 96, 120]),
      }))
      const gross = items.reduce((s, it) => s + it.quantity * it.priceSnapshot, 0)
      const totalAmount = Math.round(gross * (1 - buyer.discount / 100))
      const isAbandoned = rng() < 0.08
      const stage: WineOrderStage = isAbandoned
        ? 'NEW'
        : daysAgo > 60
          ? weighted([['DELIVERED', 88], ['CANCELLED', 12]] as const)
          : weighted([['DELIVERED', 25], ['CONFIRMED', 40], ['NEW', 35]] as const)
      const dates = isAbandoned
        ? { confirmedAt: null, deliveredAt: null, paidAt: null, abandonedAt: createdAt }
        : wineOrderDates(stage, createdAt)

      const wineData = {
          tenantId: tid, companyId: buyer.id, businessName: buyer.name,
          llcName: buyer.name, llcId: buyer.identificationCode, address: buyer.address,
          workingHours: pick(['10:00–20:00', '11:00–23:00', '09:00–18:00', 'Mon–Sat 10:00–19:00']),
          contactName: buyer.contactName, contactPhone: buyer.contactPhone, contactEmail: buyer.contactEmail,
          discountPercent: buyer.discount, totalAmount, stage, createdAt,
          ...dates,
          wineItems: { create: items },
          // Same reasoning as the booking loop above — the contact_person row must mirror the
          // `contactName/Phone/Email` columns written just above, not a separately-rolled name.
          contacts: {
            create: [{
              tenantId: tid, roleId: contactPersonRole.id, personId: buyer.contactPerson.id,
              nameSnapshot: buyer.contactPerson.name, phoneSnapshot: buyer.contactPerson.phone, emailSnapshot: buyer.contactPerson.email,
            }],
          },
      }
      wineWrites.push(() => db.wineOrder.create({ data: wineData }))
    }
    await inBatches(wineWrites)
    wineCreated = wineWrites.length
  }

  // --- Onboarding: put the setup wizard back to a fresh account ---------------
  //
  // The front door's fourth card promises "see what standing up your own winery
  // site actually takes", and a visitor arrived at a wizard someone else had
  // already filled in. These four Setting rows are the answers the wizard
  // stores; clearing them returns the qualifying questions to unanswered, so
  // the wizard opens on step 1 again. Plan-DemoFlowFixes Chunk 8, task 8.1 —
  // in the existing reseed rather than a second job, as the task asked.
  //
  // **What this can and cannot reset, measured rather than assumed.** Wizard
  // completeness is computed live from real data (getOnboardingStatus), never
  // from a stored "done" flag — that is by design, so toggling a setting later
  // cannot leave a stale tick. So Wines, Payment info, Contact and Photos stay
  // ticked *because the demo genuinely has wines, an IBAN, contact details and
  // a hero photo*, and the only way to untick them is to delete the content the
  // rest of the demo exists to show. Companies, Booking details and Review do
  // reset, and the wizard lands on Companies — a visitor is asked the first
  // question again instead of being dropped on a review screen.
  //
  // Checked, per the task's own warning: this does NOT bring the setup banners
  // back on the demo. Both are gated off for the demo tenant in
  // app/admin/(panel)/layout.tsx (Plan-DemoRedesign task 0.4), and
  // getFinishDetailsStatus reports nothing outstanding while readyToLaunch is
  // false, which is exactly what clearing these produces.
  const ONBOARDING_KEYS = [
    'onboarding_works_with_companies',
    'onboarding_offers_food_addons',
    'onboarding_offers_masterclasses',
    'onboarding_launched_at',
  ]
  await db.setting.deleteMany({ where: { tenantId: tid, key: { in: ONBOARDING_KEYS } } })

  // --- Report ---
  const all = await db.order.findMany({ where: { tenantId: tid }, select: { date: true, totalPrice: true } })
  const upcoming = all.filter(o => o.date >= today)
  const monthly: SeedReport['monthly'] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const bucket = all.filter(o => o.date >= d && o.date < next)
    // Built from local getFullYear/getMonth, not toISOString — a local midnight
    // renders as the previous day in UTC, printing every label a month early.
    monthly.push({
      label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      bookings: bucket.length,
      revenue: Math.round(bucket.reduce((s, o) => s + (o.totalPrice ?? 0), 0)),
    })
  }

  return {
    tenantId: tid,
    tenantName: tenant.displayName ?? tenant.name,
    dryRun: false,
    before,
    existingCompanies,
    created: {
      bookings: created, wineOrders: wineCreated,
      companies: 1 + bookingCompanies.length + wineCompanies.length,
      menuItems: MENU_ITEMS.length, masterclassItems: MASTERCLASS_ITEMS.length,
    },
    totals: {
      bookings: all.length,
      revenue: Math.round(all.reduce((s, o) => s + (o.totalPrice ?? 0), 0)),
      upcoming: upcoming.length,
      futureRevenue: Math.round(upcoming.reduce((s, o) => s + (o.totalPrice ?? 0), 0)),
    },
    monthly,
  }
}
