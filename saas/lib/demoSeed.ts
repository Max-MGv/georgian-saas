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
import type { PrismaClient, OrderStatus, BookingType, VisitType, MasterclassUnit } from '@prisma/client'

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

type BookingCompanySpec = {
  name: string; contactName: string; contactPhone: string; contactEmail: string
  identificationCode: string; address: string; tiers: TierSpec[]; share: number
}

/**
 * Tour operators, each on a DIFFERENT price ladder — that difference is the
 * only thing that makes the per-company pricing feature visible to a visitor
 * looking at the Companies screen. All fictional; the .example domains are
 * reserved by RFC 2606 so none of these addresses can reach a real inbox.
 */
const BOOKING_COMPANIES: BookingCompanySpec[] = [
  {
    name: 'Kakheti Wine Routes', contactName: 'Nino Beridze', contactPhone: '+995 599 41 22 08',
    contactEmail: 'bookings@kakhetiwineroutes.example', identificationCode: '404512338', address: 'Telavi, Kakheti',
    tiers: [
      { minGuests: 1, maxGuests: 10, pricePerPerson: 55, tastingLunchPricePerPerson: 95 },
      { minGuests: 11, maxGuests: 20, pricePerPerson: 45, tastingLunchPricePerPerson: 85 },
      { minGuests: 21, maxGuests: 100, pricePerPerson: 38, tastingLunchPricePerPerson: 75 },
    ],
    share: 9,
  },
  {
    name: 'Tbilisi Tour Collective', contactName: 'Giorgi Kapanadze', contactPhone: '+995 577 30 14 76',
    contactEmail: 'groups@tbilisitourcollective.example', identificationCode: '405118902', address: 'Rustaveli Ave 14, Tbilisi',
    tiers: [
      { minGuests: 1, maxGuests: 10, pricePerPerson: 60, tastingLunchPricePerPerson: 100 },
      { minGuests: 11, maxGuests: 30, pricePerPerson: 48, tastingLunchPricePerPerson: 88 },
    ],
    share: 7,
  },
  {
    name: 'Caucasus Vine Travel', contactName: 'Ana Tsereteli', contactPhone: '+995 595 88 60 31',
    contactEmail: 'ops@caucasusvinetravel.example', identificationCode: '406220145', address: 'Sighnaghi, Kakheti',
    tiers: [
      { minGuests: 1, maxGuests: 15, pricePerPerson: 50, tastingLunchPricePerPerson: 90 },
      { minGuests: 16, maxGuests: 100, pricePerPerson: 42, tastingLunchPricePerPerson: 80 },
    ],
    share: 6,
  },
  {
    name: 'Alazani Valley Tours', contactName: 'Levan Chkheidze', contactPhone: '+995 558 12 47 90',
    contactEmail: 'hello@alazanivalleytours.example', identificationCode: '404907712', address: 'Gurjaani, Kakheti',
    tiers: [
      { minGuests: 1, maxGuests: 12, pricePerPerson: 58, tastingLunchPricePerPerson: 98 },
      { minGuests: 13, maxGuests: 100, pricePerPerson: 46, tastingLunchPricePerPerson: 86 },
    ],
    share: 5,
  },
  {
    name: 'Silk Road Journeys', contactName: 'Mariam Dolidze', contactPhone: '+995 591 76 20 55',
    contactEmail: 'reservations@silkroadjourneys.example', identificationCode: '405633208', address: 'Batumi, Adjara',
    tiers: [
      { minGuests: 1, maxGuests: 20, pricePerPerson: 52, tastingLunchPricePerPerson: 92 },
      { minGuests: 21, maxGuests: 100, pricePerPerson: 40, tastingLunchPricePerPerson: 78 },
    ],
    share: 4,
  },
]

/** Walk-ins and private visitors. Kept as its own company row, as the app expects. */
const INDIVIDUALS_TIERS: TierSpec[] = [
  { minGuests: 1, maxGuests: 2, pricePerPerson: 90, tastingLunchPricePerPerson: 150 },
  { minGuests: 3, maxGuests: 6, pricePerPerson: 70, tastingLunchPricePerPerson: 120 },
  { minGuests: 7, maxGuests: 100, pricePerPerson: 60, tastingLunchPricePerPerson: 105 },
]

type WineCompanySpec = {
  name: string; contactName: string; contactPhone: string; contactEmail: string
  identificationCode: string; address: string; discount: number; share: number
}

const WINE_COMPANIES: WineCompanySpec[] = [
  { name: 'Sighnaghi Wine Bar', contactName: 'Tamar Gogoladze', contactPhone: '+995 599 20 71 44', contactEmail: 'orders@sighnaghiwinebar.example', identificationCode: '412008551', address: 'Sighnaghi, Kakheti', discount: 10, share: 8 },
  { name: 'Restaurant Kakhuri', contactName: 'Zurab Maisuradze', contactPhone: '+995 577 45 19 03', contactEmail: 'zurab@kakhuri.example', identificationCode: '405771290', address: 'Chavchavadze Ave 37, Tbilisi', discount: 15, share: 7 },
  { name: 'Vinoteka Batumi', contactName: 'Salome Jgerenaia', contactPhone: '+995 593 66 82 17', contactEmail: 'buy@vinotekabatumi.example', identificationCode: '445002318', address: 'Parnavaz Mepe St 22, Batumi', discount: 5, share: 5 },
  { name: 'Marani Import GmbH', contactName: 'Katrin Vogel', contactPhone: '+49 30 5544 8820', contactEmail: 'purchasing@maraniimport.example', identificationCode: 'DE331904772', address: 'Prenzlauer Allee 8, Berlin', discount: 20, share: 4 },
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

function computeTotal(opts: {
  tiers: TierSpec[]; visitType: VisitType; guestCount: number
  tastingGuests: number; lunchGuests: number; masterclassAmt: number
}): number | null {
  const { tiers, visitType, guestCount, tastingGuests, lunchGuests, masterclassAmt } = opts
  const paying = tastingGuests + lunchGuests
  if (paying > 0) {
    const tier = findTier(tiers, paying)
    if (!tier) return null
    return tastingGuests * tier.pricePerPerson
      + lunchGuests * tier.tastingLunchPricePerPerson
      + (tier.registrationPrice ?? 0) + masterclassAmt
  }
  const tier = findTier(tiers, guestCount)
  if (!tier) return null
  const rate = visitType === 'TASTING_LUNCH'
    ? (tier.tastingLunchPricePerPerson || tier.pricePerPerson)
    : tier.pricePerPerson
  return guestCount * rate + (tier.registrationPrice ?? 0) + masterclassAmt
}

// ---------------------------------------------------------------------------

export type ExistingCompany = { name: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null }

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
export async function seedDemoTenant(
  db: PrismaClient,
  opts: { dryRun?: boolean; now?: Date } = {},
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

  const tenant = await db.tenant.findFirst({ where: { slug: DEMO_SLUG } })
  if (!tenant) throw new Error(`No tenant with slug '${DEMO_SLUG}' in this database`)
  if (tenant.slug !== DEMO_SLUG) throw new Error('Refusing to seed a non-demo tenant')
  const tid = tenant.id

  const before = {
    orders: await db.order.count({ where: { tenantId: tid } }),
    wineOrders: await db.wineOrder.count({ where: { tenantId: tid } }),
    companies: await db.company.count({ where: { tenantId: tid } }),
  }

  const existingCompanies: ExistingCompany[] = await db.company.findMany({
    where: { tenantId: tid },
    select: { name: true, contactName: true, contactPhone: true, contactEmail: true },
    orderBy: { name: 'asc' },
  })

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

  // --- Cast ---
  const individuals = await db.company.create({
    data: {
      name: 'Individuals', tenantId: tid, isIndividual: true, isBookingCompany: true,
      prices: { create: INDIVIDUALS_TIERS.map(t => ({ ...t, registrationPrice: t.registrationPrice ?? 0 })) },
    },
  })

  const bookingCompanies: (BookingCompanySpec & { id: string })[] = []
  for (const c of BOOKING_COMPANIES) {
    const row = await db.company.create({
      data: {
        name: c.name, tenantId: tid, identificationCode: c.identificationCode,
        contactName: c.contactName, contactPhone: c.contactPhone, contactEmail: c.contactEmail,
        address: c.address, isBookingCompany: true, isWineOrderCompany: false,
        prices: { create: c.tiers.map(t => ({ ...t, registrationPrice: t.registrationPrice ?? 0 })) },
      },
    })
    bookingCompanies.push({ ...c, id: row.id })
  }

  const wineCompanies: (WineCompanySpec & { id: string })[] = []
  for (const c of WINE_COMPANIES) {
    const row = await db.company.create({
      data: {
        name: c.name, tenantId: tid, identificationCode: c.identificationCode,
        contactName: c.contactName, contactPhone: c.contactPhone, contactEmail: c.contactEmail,
        address: c.address, isBookingCompany: false, isWineOrderCompany: true,
        wineDiscountPercent: c.discount,
      },
    })
    wineCompanies.push({ ...c, id: row.id })
  }

  await db.menuItem.createMany({
    data: MENU_ITEMS.map((m, i) => ({ ...m, tenantId: tid, active: true, sortOrder: i })),
  })
  await db.masterclassItem.createMany({
    data: MASTERCLASS_ITEMS.map((m, i) => ({ ...m, tenantId: tid, active: true, sortOrder: i })),
  })
  const mcItems = await db.masterclassItem.findMany({ where: { tenantId: tid } })
  const vegItems = MENU_ITEMS.filter(m => m.type === 'VEGETABLE').map(m => m.name)
  const meatItems = MENU_ITEMS.filter(m => m.type === 'MEAT').map(m => m.name)

  // --- Bookings ---
  const companyWeights = bookingCompanies.map(c => [c, c.share] as const)
  let created = 0

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

      const totalPrice = computeTotal({ tiers, visitType, guestCount, tastingGuests, lunchGuests, masterclassAmt })

      const status: OrderStatus = isFuture
        ? weighted([['CONFIRMED', 40], ['NEW', 25], ['PAID', 20], ['INVOICE_SENT', 15]] as const)
        : weighted([['COMPLETED', 85], ['CANCELLED', 8], ['PAID', 7]] as const)

      const first = pick(GUEST_FIRST), last = pick(GUEST_LAST)
      // Booked between a few days and six weeks before the visit — makes
      // "arrived at 23:40 on a Saturday" style copy true, not decorative.
      const createdAt = new Date(date.getTime() - rand(3, 42) * 86400000 - rand(0, 23) * 3600000)

      await db.order.create({
        data: {
          tenantId: tid, status, bookingType, visitType, date,
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
          masterclassLines: mcLines.length ? { create: mcLines } : undefined,
        },
      })
      created++
    }
  }

  // --- Wine orders ---
  const vintages = await db.wineVintage.findMany({
    where: { tenantId: tid, active: true }, include: { wine: true },
  })
  let wineCreated = 0
  if (vintages.length > 0) {
    const wineWeights = wineCompanies.map(c => [c, c.share] as const)
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
      const status = daysAgo > 60
        ? weighted([['delivered', 80], ['cancelled', 10], ['paid', 10]] as const)
        : weighted([['delivered', 20], ['paid', 30], ['confirmed', 25], ['pending', 25]] as const)

      await db.wineOrder.create({
        data: {
          tenantId: tid, companyId: buyer.id, businessName: buyer.name,
          llcName: buyer.name, llcId: buyer.identificationCode, address: buyer.address,
          workingHours: pick(['10:00–20:00', '11:00–23:00', '09:00–18:00', 'Mon–Sat 10:00–19:00']),
          contactName: buyer.contactName, contactPhone: buyer.contactPhone, contactEmail: buyer.contactEmail,
          discountPercent: buyer.discount, totalAmount, status, createdAt,
          wineItems: { create: items },
        },
      })
      wineCreated++
    }
  }

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
