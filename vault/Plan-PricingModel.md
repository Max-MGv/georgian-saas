---
tags: [plan, pricing, booking, active]
---

# Plan — Pricing model: Tasting only / Lunch only / Tasting & Lunch (T-152)

> **How to use this plan.** Chunks are **strictly sequential** — do not start chunk N+1 until chunk N's
> Status is ✅ and its "Verify" list is ticked. Every chunk ends with a **Resume point**: if a session
> stops mid-chunk, write where it stopped there (file, step, what is half-done) so the next session picks
> up from that line without re-deriving anything. Commit to **`staging` only**, one commit per chunk (or
> per step when a step is big), message `T-152 chunk N: …`.
> **Caution over speed** (Max, 2026-10-20). **Nothing to `master` or the production database without
> Max's explicit go for that step** (ClaudeInstructions Rule 0) — the production runbook at the end is a
> DRAFT. **Full Playwright end-to-end runs happen once, at the very end (Chunk 11)** — Max: they take a
> long time; along the way each chunk is checked with type-checks, small scripts, and screenshots of the
> real pages (phone 390px + desktop).

**Ticket:** T-152 (staging board). **Related:** P-11 (production T-11, "Create order" blocked —
fixed by this plan), KnownBugs #93 (folded in), T-151 (print-sheet column picker — builds on the
columns this plan adds), T-114 (home-page guest line — untouched, individuals only),
`vault/Plan-AddOnsAndWine.md` (parked; must be updated after this lands — §9).
**Must-read before coding:** `vault/MaintenanceNotes.md` §1 (form ↔ admin visual panel), §22 (one
pricing function), §31 (`InvoiceSent`), §32 (admin New Order mirrors the public form), §33 (phone and
desktop halves), §35 (forms mirror, server decides); `playwright/KNOWN-ISSUES.md`; ClaudeInstructions
Rule 10 (stop the dev server before `prisma migrate dev`).

---

## 1. Status

| Chunk | What | Status |
|---|---|---|
| 0 | Baseline: counts, edge rows, ticket links | ✅ 2026-10-20 |
| 1 | Pricing rules as pure code + test script (no DB) | ✅ 2026-10-20 |
| 2 | Migration A (expand): new columns + backfill, old columns kept | ✅ 2026-10-20 (dev DB) |
| 3 | Switch every reader/writer to the new columns — **behaviour identical** | ✅ 2026-10-20 |
| 4 | Migration B (contract): drop old columns, retire old scripts | ✅ 2026-10-20 (dev DB) |
| 5 | Company price setup: three prices per tier, company registration fee | ✅ 2026-10-20 |
| 6 | Rules: company per-product minimums, `LUNCH` visit type, rule helper | ⬜ |
| 7 | Public booking form + `createBooking` (incl. #93 checks) | ⬜ |
| 8 | Admin New Order + Order Detail (fixes P-11) | ⬜ |
| 9 | Everything that shows a booking: lists, sheet, invoices, emails, stats | ⬜ |
| 10 | Demo seed, test fixtures, scripts, docs | ⬜ |
| 11 | Full verification: E2E tiers 1–4, blind review, fixes, hand-over | ⬜ |
| 12 | Production runbook (DRAFT — Max's go per step) | ⬜ |

---

## 2. What we are building (Max's decisions, 2026-10-19/20)

| # | Decision |
|---|---|
| D-1 | **Three products for companies:** Tasting only · Lunch only · Tasting & Lunch. Each has **its own price on every tier row**. Tasting & Lunch is its own price (can be a bundle), not tasting + lunch added. |
| D-2 | **Each product finds its tier from its own guest count.** One booking can use different tier rows (e.g. 4 tasting-only on row 4–24, 30 tasting & lunch on row 25–48). The group total plays **no** part in pricing. Max accepted the consequence: a small sub-group pays small-group prices (§8 R-1). |
| D-3 | **Each guest is in exactly one box.** There is no overlap. **Total guests = Tasting only + Lunch only + Tasting & Lunch + Free** — derived, never typed, never affects price. Anyone not paying (guide, driver, someone tagging along) is a Free guest. |
| D-4 | **Kitchen count on the print sheet = that total** (the three boxes + Free). |
| D-5 | **Individuals unchanged:** two prices (Tasting, Tasting + Lunch), one guest count, one visit type for the whole group. |
| D-6 | **Registration fee = one flat fee per company**, charged once per booking (today it sits on each tier row). |
| D-7 | **Lunch only price empty = not offered** for that company/row (never ₾0 by accident). |
| D-8 | **One ladder** — the existing tier table gets a third price column; ranges are shared by the three products ("option A"). |
| D-9 | **Visit type stays.** Detailed company form: *Tasting* shows only the Tasting-only box (+ Free); *Tasting + Lunch* shows all three boxes (+ Free). Admins can change visit type and counts later, before payment. |
| D-10 | **Company simple form** (tenant has the detailed form off) gets a third visit type **Lunch only**. Individuals keep two. |
| D-11 | **Minimums, option C — nothing changes on day one.** Individuals: as today (per visit type, whole group). Companies: today's group check stays (all paying guests together ≥ the visit-type minimum) **plus** three optional per-product minimums (Tasting only / Lunch only / Tasting & Lunch), starting **blank**; each applies only to a product that has guests. Free guests never count toward a minimum. |
| D-12 | Add-ons plan (`Plan-AddOnsAndWine.md`) is **parked**; handled after this lands. |
| D-13 | Full E2E tests **last**; screenshots along the way. Caution over speed. |

### Defaults I chose — Max may change any of these on review

| # | Default | Why |
|---|---|---|
| A-1 | Existing tiers convert to the **same prices**: Tasting only = today's tasting price; Tasting & Lunch = today's tasting + add-on (Georgica 4–24 → ₾95); Lunch only = empty. | No one's price moves on release day. |
| A-2 | Existing orders convert to the **same money**: today's "tasting" guests → Tasting only; today's "lunch" guests (who also tasted) → Tasting & Lunch; Lunch only = 0. Frozen rates are copied, not recomputed. Nikalas's two orders stay ₾250 and ₾2,800. | Same. |
| A-3 | Company registration fee = the **highest** fee on its tiers today (Nikalas: all ₾0). | Never lowers what a winery charged. |
| A-4 | **Every order stores the three counts**, including individual and simple-form bookings (individual 4 × Tasting → Tasting only = 4). One pricing branch instead of two ("split" vs "unsplit"). | Removes the unsplit/split fork that caused #93's individual-booking hole. |
| A-5 | A **Lunch only** visit (company simple form) follows the **Tasting + Lunch** rules for lead time, visit length, max guests, group minimum, and shows the hot-dish question. | The kitchen rules are about lunch. |
| A-6 | Detailed form, visit type *Tasting + Lunch*: at least one guest must be in Lunch only or Tasting & Lunch (otherwise it is a tasting visit). Visit type *Tasting*: the two lunch boxes must be 0. Server refuses a contradiction. | D-9 without contradictions. |
| A-7 | No exact tier for a product's count → today's fallback per product (the highest-priced row **that offers that product**). No row offers it → "not offered" (D-7). | Keeps today's protection against an unpriced gap. |
| A-8 | Admin screens are **exempt from minimums** (as today); they still get every integer / not-offered check. | Admins book odd cases by phone. |
| A-9 | A company with no price table: the admin's typed-in rates become **three** (Tasting only / Lunch only / Tasting & Lunch), all-in per person. | Same as today, one more box. |
| A-10 | Individuals' **Lunch only** input is hidden on the Individuals price table. | D-5. |

### Still open — needs Max (does not block Chunks 0–4)

- **Q-1 (#93 part B):** should the admin New Order path stop trusting the browser's masterclass price and read it from the database? Default if no answer by Chunk 8: **yes** — Chunk 8 rewrites that action anyway.
- **Q-2:** the 2026-10-15 Georgica production order (40 lunch guests, ₾2,800 at ₾70 = tasting ₾30 + lunch ₾40). Right, or should it have been lunch-only? It converts unchanged (A-2); if it is wrong, an admin edits it after release.
- **Q-3:** Nikalas's 2026-10-07 order (§10 F-2) — visit *Tasting + Lunch* but everyone in *Tasting only*. Did they have lunch (then ₾250 undercharged it), and should A-6 refuse that combination in future? Default if no answer by Chunk 6: **refuse on the public form, warn (not block) on admin screens.**

---

## 3. Current state — what the code does today (verified 2026-10-19/20)

- **`Price`** (one row per tier): `minGuests`, `maxGuests`, `pricePerPerson` (tasting), `tastingLunchPricePerPerson` (**lunch add-on** since 2026-09-13, `cf5f594`), `registrationPrice` (flat, per row), `isDisplayPrice` (home-page star). Money = integer tetri.
- **`Order`**: `visitType` (`TASTING | TASTING_LUNCH`), `guestCount`, `tastingGuestCount` (= tasting only), `lunchGuestCount` (= tasting **and** lunch), `freeGuestCount`, `totalPrice`, frozen rates `tastingRateSnapshot`, `lunchRateSnapshot` (**all-in** tasting+lunch), `registrationFeeSnapshot`.
- **`InvoiceSent`** (append-only record of each invoice sent): `guestCount`, `tastingGuestCount`, `lunchGuestCount`, `freeGuestCount`, `visitType`.
- **One arithmetic function** `priceBooking()` (`saas/lib/pricingUtils.ts`): split party → `tasting × rate + lunch × combo`; unsplit → `guestCount × (visit-type rate)`; `+ registration + masterclass + extras`. Rates come from `ratesForParty` (tier picked by the **party size**, Max 2026-09-19 — this plan reverses that), `ratesFromSnapshot`, `ratesFromManual`. `comboRatePerPerson` = tasting + add-on.
- **Write paths:** `createBooking` (public), `createOrderAdmin`, `updateOrderEnhanced`, `assignOrderCompany` (all `app/actions/orders.ts`), `recalcOrderTotal` (`lib/pricing.ts`), `demoSeed`. **Previews:** `BookingForm`, `NewOrderForm`, `OrderDetail`.
- **Admin New Order / Order Detail have a typed "Total guests in the party"** and require split ≤ total → production report **P-11** (Nikalas typed 9 + 2 free → blocked).
- **Minimums/maximums/lead times/visit lengths** are tenant settings per visit type (`min_guests_tasting`, `min_guests_tasting_lunch`, `max_guests_*`, `booking_lead_hours_*`, `visit_duration_*` in `lib/settings.ts`).
- **Production data (read-only, 2026-10-19):** Nikalas Marani — Georgica Travel 5 tiers, Individuals 4 tiers, all registration fees ₾0; **2 real orders**, both split, both unpaid (₾250 completed, ₾2,800 new). Demo tenant on production: ~393 seeded orders (rebuilt by reseed).
- **Dev DB** is shared by localhost, the staging deploy and Playwright.

---

## 4. Design

### 4.1 Data model (expand → switch → contract)

New names on purpose: the old `tastingLunchPricePerPerson` and `lunchGuestCount` would **change
meaning** if reused, and a meaning change is invisible to the compiler (the lesson of the tetri
conversion, KnownBugs #42). New column names + dropping the old ones make **every forgotten reader a
compile error**.

| Table | New | Backfill from | Dropped in Chunk 4 |
|---|---|---|---|
| `Price` | `tastingOnlyPrice Int?` | `pricePerPerson` | `pricePerPerson` |
| `Price` | `lunchOnlyPrice Int?` (null = not offered) | null | — |
| `Price` | `tastingLunchPrice Int?` | `pricePerPerson + tastingLunchPricePerPerson` | `tastingLunchPricePerPerson` |
| `Company` | `registrationFee Int @default(0)` | max of its tiers' `registrationPrice` | `Price.registrationPrice` |
| `Order` | `tastingOnlyGuests Int?` | split: `tastingGuestCount`; unsplit TASTING: `guestCount`; unsplit TASTING_LUNCH: 0 | `tastingGuestCount` |
| `Order` | `lunchOnlyGuests Int?` | 0 | — |
| `Order` | `tastingLunchGuests Int?` | split: `lunchGuestCount`; unsplit TASTING_LUNCH: `guestCount`; unsplit TASTING: 0 | `lunchGuestCount` |
| `Order` | `freeGuestCount` (kept) | + any leftover `guestCount − (tasting+lunch+free)` on split rows (unpriced today) | — |
| `Order` | `guestCount` (kept, now always = 3 boxes + free) | recomputed | — |
| `Order` | `tastingOnlyRate Int?` | `tastingRateSnapshot` | `tastingRateSnapshot` |
| `Order` | `lunchOnlyRate Int?` | null | — |
| `Order` | `tastingLunchRate Int?` | `lunchRateSnapshot` (already all-in) | `lunchRateSnapshot` |
| `InvoiceSent` | `tastingOnlyGuests`, `lunchOnlyGuests`, `tastingLunchGuests` | same mapping (facts unchanged, clearer names — §31's append-only rule holds: no billed fact changes) | `tastingGuestCount`, `lunchGuestCount` |
| `VisitType` enum | add `LUNCH` — **in Chunk 6's own migration**, not Chunk 2 (the enum value changes Prisma's types, so it lands with the code that handles it) | — | — |
| Settings (no table change) | `min_guests_company_tasting_only`, `min_guests_company_lunch_only`, `min_guests_company_tasting_lunch` — blank default | — | — |

- Expand columns are **nullable** and the backfill is **idempotent** (`… WHERE new IS NULL`), so it can be
  re-run safely after old code wrote more rows (staging between chunks; production between runbook steps).
- Chunk 4 re-runs the backfill for any NULLs, then sets NOT NULL (`DEFAULT 0` for the counts) and drops the old columns.
- **Edge E-1 (unsplit order that has free guests):** today priced `guestCount × rate` *including* free
  guests. Chunk 0 counts such rows; if any exist, the backfill puts all `guestCount` in the product box
  (money identical) and logs them. Production has none (both orders split).
- **Edge E-2 (`unsplit` = tasting+lunch both 0 but `guestCount` > 0)** is exactly A-4's conversion.
- No new tables → no RLS change (`scripts/setup-rls.ts` untouched).

### 4.2 Pricing rules (one place: `saas/lib/pricingUtils.ts`)

```
Counts  = { tastingOnly, lunchOnly, tastingLunch, free }            // guestCount = sum of all four
RateSet = { tastingOnly: number|null, lunchOnly: number|null, tastingLunch: number|null, registration }
ratesForCounts(prices, counts)   → RateSet   // each product: findTier(prices offering it, its own count)
ratesFromSnapshot(order)         → RateSet   // frozen per product
ratesFromManual(t, l, tl)        → RateSet   // admin-typed, registration 0
priceBooking(rates, counts, lines) = Σ count × rate  + registration + masterclass + extras
```
- A product with count > 0 and a null rate is **"not offered"** → the caller refuses (public) or warns
  (admin), never prices it at 0.
- `visitType` no longer enters the arithmetic — the counts carry it (A-4).
- Individuals: `ratesForCounts` over the Individuals table; registration never charged (as today).
- `findTier` stays inside `pricingUtils.ts` only (MaintenanceNotes §22's "greppable" rule, now per product).

### 4.3 Validation (one helper, server-side; forms only mirror it — §35)

`checkBookingCounts(input, rules)` + `checkMasterclassLines(lines, catalogue)` in `saas/lib/bookingInput.ts` → error or normalised counts/lines:
- every count is a whole number 0…999; at least one paying guest;
- individuals and the company simple form send **one** guest count; the server builds the boxes from the
  visit type (A-4) — a split sent on those paths is ignored;
- visit-type consistency (A-6; `LUNCH` → only Lunch only);
- a product with guests must be offered (D-7);
- public only: group minimum (D-11, today's rule on the paying sum; `LUNCH` uses the Tasting + Lunch
  minimum, A-5) **and** per-product company minimums where set and count > 0; max-guest behaviour as today;
- masterclass lines (#93): item exists, belongs to the tenant, **active**; quantity whole 1…999; FLAT = 1;
  no duplicates; price always from the database;
- total never negative.

### 4.4 Screens

- **Companies → price table:** row = guests from–to · Tasting only ₾ · Lunch only ₾ (blank = not offered) ·
  Tasting & Lunch ₾. Company card: Registration fee ₾ per booking. Individuals: Lunch only hidden (A-10).
- **Public detailed company form:** visit type; boxes per D-9 + Free; "Total: N guests (M paying)" line;
  live preview lines per product ("4 × Tasting only ₾50 (4–24)"). Simple company form: Tasting / Lunch only /
  Tasting + Lunch + one guest count. Individuals: unchanged.
- **Admin New Order / Order Detail:** same three boxes + Free; **no typed total** (shown derived — fixes
  P-11); per-product tier box; three manual rates when there is no table; masterclass per-person prefill =
  paying guests (sum of the three).
- **Lists, sheet, documents:** three products wherever today shows "Tasting / Lunch"; kitchen total on the
  booking sheet (D-4).

---

## 5. Dependency inventory — every place that must change (and which chunk)

Found by grep + reading on 2026-10-20 (`tastingLunchPricePerPerson` 20 files, `lunchGuestCount`/
`tastingGuestCount` 16, `TASTING_LUNCH` 18, `visitType` 35 incl. scripts, `comboRatePerPerson` 7,
`lunchRateSnapshot` 7, `findTier` 8, `ratesForParty` 7). **Chunk 4's compile is the final proof** that
nothing reads the old columns.

| Area | Files | What changes | Chunk |
|---|---|---|---|
| Pricing core | `lib/pricingUtils.ts`, `lib/pricing.ts` (`recalcOrderTotal`) | new types/functions (§4.2); old ones removed | 1, 3 |
| Public write | `app/actions/createBooking.ts` | new counts, rules helper, #93 | 3, 7 |
| Admin writes | `app/actions/orders.ts` (`createOrderAdmin`, `updateOrderEnhanced`, `assignOrderCompany`, `sendOrderInvoice` → `InvoiceSent`) | new counts/rates; derived total | 3, 8 |
| Price setup | `app/actions/prices.ts`, `app/admin/(panel)/companies/CompaniesClient.tsx` + `page.tsx`, `app/admin/onboarding/steps/CompaniesStep.tsx`, `app/actions/onboarding.ts`, `app/admin/(panel)/PaymentSetupBanner.tsx` ("has prices" check) | three prices, company fee | 3, 5 |
| Company data to the form | `lib/contactResolution.ts` (`bookingPrices`) | new price fields | 3, 7 |
| Public form | `components/BookingForm.tsx`, `BookingConfirmPopupView.tsx` (review lines) | boxes, preview, visit types | 7 |
| Admin form editor | `app/admin/(panel)/content/BookingFormVisualPanel.tsx`, `ContentClient.tsx` (`FIELDS.form`), `scripts/seed-ka.ts` | mirror the new detailed/simple layout (MaintenanceNotes §1); new labels EN+KA | 7 |
| Home page | `app/(site)/page.tsx` (Individuals display tier, `comboRatePerPerson`) | read `tastingLunchPrice`; output unchanged | 3 |
| Rules/settings | `lib/settings.ts`, `lib/bookingHours.ts`, `app/admin/(panel)/settings/SettingsClient.tsx` + `page.tsx` | 3 company minimums; `LUNCH` → lunch rules | 6 |
| Admin order screens | `orders/new/NewOrderForm.tsx` + `page.tsx`, `orders/[id]/OrderDetail.tsx` + `page.tsx` | boxes, derived total, tier box, manual rates | 3, 8 |
| Orders list | `orders/OrdersTable.tsx` (desktop table **and** `MobileOrderCard` — §33), `columnDefs.ts` (add a Lunch-only column id; never rename saved ids `tasting`/`lunch` — they live in browsers' localStorage), `orders/page.tsx`, `CalendarView.tsx` (both halves), `OrdersFilters.tsx` + `lib/orderFilters.ts` (visit-type filter + `LUNCH`) | | 3, 9 |
| Booking sheet | `orders/BookingSheetPrint.tsx` | three products + Free + kitchen total (T-151's picker later builds on these columns) | 9 |
| Invoices | `orders/InvoicePrint.tsx`, `lib/emails/templates/invoiceEmailTemplate.ts`, `InvoiceSent` writer | lines per product with rate | 3, 9 |
| Emails | `bookingConfirmationTemplate.ts`, `newBookingNotificationTemplate.ts` (+ send wrappers, §23), `lib/payments/settle.ts` (passes visitType) | `LUNCH` label, per-product lines | 9 |
| Messages preview | `app/admin/(panel)/content/MessagesPanel.tsx` (sample orders) | sample shape | 3 |
| Statistics | `statistics/page.tsx` + `StatisticsClient.tsx` (revenue/guests by visit type) | third bucket; guests per product (exclude abandoned — §28) | 9 |
| Super-admin | `app/actions/superAdmin.ts`, `app/super-admin/orders/OrdersActivityClient.tsx` | labels/counts | 3, 9 |
| Payments | `createBooking` `orderDesc`, `startCheckout` callers, top-up paths | label only; amount is still `totalPrice` | 7 |
| Translations | `lib/t.ts` (public), `lib/adminT.ts` (admin) — EN + KA | new labels; "Tasting+Lunch guests" etc. retired | 5–9 |
| Demo | `lib/demoSeed.ts` (tiers, orders, `computeTotal`) | three prices; orders use the counts | 10 |
| Scripts | `test-pricing-agreement.ts` (rewritten in Chunk 1), `test-order-repricing.ts`, `test-price-rls.ts`, `test-payment-*`, `test-order-*`, `test-settle-double-payment.ts`, `test-topup-checkout.ts`, `audit-money.ts`, `clone-nm-to-demo.ts`, `clone-nm-to-staging.ts`, `backfill-test-fixtures.ts`; **delete** `migrate-lunch-price-to-addon.ts` + `restore-dev-lunch-addon.ts` (would corrupt the new columns' meaning) | | 3, 4, 10 |
| Playwright | `tier1/payment-amount-integrity`, `tier2/booking-enhanced`, `booking-simple`, `booking-company-code-check`, `company-nationality-tagging`, `tier3/companies-crud`, onboarding spec, `tier5/*` (staging only), helpers `bookingForm.ts`/`payments.ts`; notes `playwright/notes/05,09,13,17,18`; new spec for #93 crafted requests | updated in Chunk 10, **run in Chunk 11** | 10, 11 |
| Docs | `MaintenanceNotes.md` §22 (rewrite: per-product tiers), §1, §31, §32; `vault/Database Schema.md`; `DataModel/Dependencies.md`; `KnownBugs.md` #93; `FeatureLog.md`; `Roadmap.md`; `SessionLog.md`; Feature note (Rule 9) | | 10, 11 |
| Release notes | Super Admin → Releases (clients' What's new), before/after shots via `scripts/release-shots.ts` | draft only | 11 |

**Things that do NOT change:** online-payment gate (`shouldTakePayment` — still `totalPrice`),
company access-code checks (#78), contact roles, wine orders, masterclass catalogue model, RLS, the home
page's displayed prices (Individuals).

**Other plans and tickets that touch the same files — sequencing:**
- `Plan-AddOnsAndWine.md` collides in 4 places: D-4 (add-on groups per visit type → needs `LUNCH`),
  D-11/§4.1 (per-person = "paying guests" → now the three boxes), §4.5 (`priceBooking` signature),
  and the same screens. **This plan goes first**; that plan gets a short update afterwards.
- **T-151** (print-sheet column picker): after this plan (same file, needs the new columns).
- **KnownBugs #93**: folded into Chunks 7–8; the stand-alone repro is `saas/tests/_qa/repro-kb93.spec.ts` (untracked).

---

## 6. Chunks

Every chunk: read its files first; type-check (`npx tsc --noEmit` from `saas/`) must be 0 errors before
commit; screenshots go to `saas/tests/_qa/shots/pricing/` (untracked). Before any `prisma migrate dev`:
stop the dev server (Rule 10), confirm "✔ Generated Prisma Client", restart.

### Chunk 0 — Baseline
**Status:** ✅ 2026-10-20 — numbers + findings F-1/F-2 in §10; no E-1/E-2 rows on either database.
**Goal:** know exactly what data the migration will meet, before writing it.
- [x] Dev DB, read-only script `saas/scripts/_qa/pricing-baseline.ts`: count `Price` rows (per tenant;
      add-on > 0 / = 0; registration > 0), orders by shape (split / unsplit / unsplit-with-free (E-1) /
      split with leftover guests), `InvoiceSent` rows, orders per visit type. Save output in this plan (§10).
- [x] Same counts on **production, read-only** (Max approved read-only checks 2026-10-19; the script uses a
      `SET TRANSACTION READ ONLY` transaction like `scripts/_qa/prod-lunch-price-check.ts`).
- [x] Every order's inputs + total saved in `saas/scripts/_qa/pricing-baseline-{dev,prod}.json`
      (untracked) — Chunks 1 and 3 compare against them.
- [x] Link T-152 ↔ P-11 (staging #147), T-151, #93 on the board.
**Verify:** numbers recorded in §10; E-1 count known (0). ✔
**Resume point:** done.

### Chunk 1 — Pricing rules as pure code (no DB, no UI)
**Status:** ✅ 2026-10-20 — `scripts/test-pricing-model.ts` **54/54**; equivalence dev 428/428, prod 2/2 (393 demo
orders have no frozen rates — F-1); two deliberate mutations (lunch→lunch-only mapping, lunch-only priced at 0)
both caught; tsc 0; eslint clean.
**Goal:** the new rules exist and are proven by worked examples before anything depends on them.
- [x] §4.2's types and functions added to `lib/pricingUtils.ts` **alongside** the old ones (old callers untouched):
      `Product`, `PRODUCTS`, `BookingVisitType`, `ProductTier`, `Counts`, `ProductRates`, `productPrice`,
      `payingGuests`, `totalGuests`, `findProductTier`, `ratesForCounts`, `ratesFromProductSnapshot`,
      `ratesFromManualProducts`, `notOffered`, `priceCounts` (throws on a product with guests and no rate),
      `countsFromVisit` (A-4), `countsFromLegacy` (A-2/E-1/E-2 — **the Chunk 2 backfill SQL must mirror it**).
- [x] `lib/bookingInput.ts`: `checkBookingCounts` (layouts 'single'/'boxes', public/admin, A-6 refuse public /
      warn admin, D-11 minimums) and `checkMasterclassLines` (#93: tenant + active items, whole 1…999, FLAT = 1,
      no duplicates, catalogue price). Pure; callers pass settings and catalogue rows.
- [x] `scripts/test-pricing-model.ts` (the old `test-pricing-agreement.ts` stays until Chunk 3 removes the old
      functions): P-11 → ₾550 / kitchen 11; Nikalas's two orders ₾2,800 / ₾250; R-1 ₾2,380 vs old ₾1,710;
      mixed three-row booking; not offered; fallback; registration once; Individuals ladder 240 cases identical
      to the old model; every #93 input refused.
- [x] **Equivalence:** every baseline order with frozen rates re-prices to its stored total. 0 differences.
**Verify:** script green; equivalence 0 differences; tsc 0. ✔
**Resume point:** done.

### Chunk 2 — Migration A (expand)
**Status:** ✅ 2026-10-20 — `20261019210217_pricing_model_expand` applied to the **dev DB** (`prisma migrate deploy`
+ `generate`; no dev server running). Check: 30 price rows, 24 companies, 428 orders (all re-price from the new
columns to their stored totals), 3 invoices — **0 problems**. tsc 0. Baseline shots `chunk2` captured.
**Goal:** new columns exist and are filled; nothing reads them yet; the app behaves exactly as before.
- [x] Schema: `Price.tastingOnlyPrice/lunchOnlyPrice/tastingLunchPrice` (nullable), `Company.registrationFee`
      (default 0), `Order.tastingOnlyGuests/lunchOnlyGuests/tastingLunchGuests` + `tastingOnlyRate/lunchOnlyRate/
      tastingLunchRate` (nullable), `InvoiceSent.tastingOnlyGuests/lunchOnlyGuests/tastingLunchGuests` (nullable).
      Old required columns got `DEFAULT 0` (`Price.pricePerPerson`, `InvoiceSent.tastingGuestCount/lunchGuestCount`)
      so Chunk 3's code need not keep writing them. Old columns otherwise untouched → old code (staging deploy)
      keeps working.
- [x] Backfill hand-written at the end of the migration, mirroring `countsFromLegacy`; idempotent markers:
      Price = all three new prices NULL; Order/InvoiceSent = `tastingOnlyGuests IS NULL`. The company-fee
      backfill (A-3) runs **only here** (a re-run must not overwrite a fee an admin later sets).
      `LUNCH` enum value moved to Chunk 6.
- [x] Read-only row check: `saas/scripts/_qa/pricing-expand-check.ts [--prod]` (untracked) — counts vs
      `countsFromLegacy`, prices, fees, invoices, and re-pricing every order from the new columns.
- [x] Smoke + baseline: `saas/tests/_qa/pricing-shots.spec.ts` (untracked; `SHOT_LABEL=chunkN npx playwright test
      tests/_qa/pricing-shots.spec.ts --workers=1`) captures 7 pages × desktop/phone (home individual quote,
      detailed company form 4/6/2, Companies tiers, admin New Order 4/6/2, order detail, Orders list, booking
      sheet) as PNG + visible text; `node tests/_qa/pricing-shots-diff.mjs chunk2 chunk3` diffs the text.
      Baseline numbers: detailed company 4/6/2 on a 1–10 ₾60/₾100, 11–30 ₾48/₾88 ladder = **₾720** (old rule:
      party of 12 → 11–30 row). Chunk 3 must still show ₾720.
**Verify:** 0 mismatched rows ✔; screenshots normal ✔.
**Resume point:** done.

### Chunk 3 — Switch every reader and writer to the new columns (behaviour identical)
**Status:** ✅ 2026-10-20 — tsc 0 · `test-pricing-model` 54/54 · `test-order-repricing` 6/6 · `test-price-rls` 10/10 ·
`audit-money` clean · `_qa/pricing-expand-check` 0 problems (re-run backfill: 0 rows) · shots `chunk3` vs `chunk2`:
**every price identical**, only the allowed differences · two real bookings on localhost stored as before
(individual 10 × ₾60 = ₾600, boxes 10/0/0; company 4/6/2 + masterclass = ₾720 + ₾35) · no server errors · the
10 eslint errors in touched files are all pre-existing (checked line by line against HEAD).
**Goal:** the whole app runs on the new columns, **with today's rules, today's UI and today's numbers**
(the tier is still picked by party size here — the per-product rule arrives with the forms in Chunks 7–8).
**Method used:** the old Prisma fields were renamed `legacy…` with `@map` (no DB change), so `tsc` listed every
reader. ⚠️ **Lesson:** the compiler does NOT catch an object built first and passed to Prisma later (TypeScript's
excess-property check only applies to fresh literals) — `lib/demoSeed.ts` wrote `tastingGuestCount` that way and
tsc stayed silent. So every write was also found by **text search**, and the seed's order literal is now typed at
its declaration (`Prisma.OrderUncheckedCreateInput`). Chunk 4's final grep must repeat this.
**What changed:**
- `lib/pricingUtils.ts`: the party-size functions read the product columns (`PriceTier` = `ProductTier`,
  `comboRatePerPerson` = `tastingLunchPrice`, new `tastingRatePerPerson`, `headcountOf(order)`); registration is
  passed in (`ratesForParty(prices, n, registration)`, `ratesFromTier(tier, registration)`); `ratesFromSnapshot`
  reads `tastingOnlyRate`/`tastingLunchRate`; new `boxColumns(counts)`; `TierPrices` type (kept out of the
  `'use server'` file — MaintenanceNotes §24).
- Writers (`createBooking`, `createOrderAdmin`, `updateOrderEnhanced`, `assignOrderCompany`, `recalcOrderTotal`,
  `demoSeed`): boxes via `boxColumns(countsFromLegacy(…))` (A-4 — the same rule as the migration), rates in the new
  columns, registration = `company.registrationFee` (0 for individuals). `InvoiceSent` writes the new columns.
- Price setup: `createPrice`/`updatePrice`/`OnboardingTier` take `TierPrices` (validated: whole tetri ≥ 0, at least
  one offered). The Companies tier form and the onboarding wizard keep today's "Tasting" + "+Lunch add-on" boxes and
  save Tasting & Lunch = tasting + add-on (all-in). **The per-tier registration-fee input is removed**; the company-
  level fee input arrives in Chunk 5 (all fees are ₾0 on both databases, so nothing is lost in between).
- Readers: resolver (`bookingPrices` new shape + `bookingRegistrationFee`), home page, payment banner, Orders list,
  order detail, New Order, booking form preview, invoice email + `InvoiceSent`. The list/sheet/invoice/detail
  components keep their own local names (`tastingGuestCount` = Tasting only, `lunchGuestCount` = Tasting & Lunch) fed
  from the new columns, with a comment — Chunks 8/9 rename them.
- Scripts/tests: `test-order-repricing`, `test-price-rls`, `audit-money`, `booking-company-code-check.spec.ts` (its
  page-source check now looks for `tastingOnlyPrice` instead of `pricePerPerson`) updated; **deleted**
  `migrate-lunch-price-to-addon.ts`, `restore-dev-lunch-addon.ts` (would corrupt the new meaning) and
  `test-pricing-agreement.ts` (replaced by `test-pricing-model.ts`).
- New untracked QA helpers: `scripts/_qa/pricing-rerun-backfill.ts [--prod]`, `tests/_qa/pricing-bookings.spec.ts`.
**Allowed differences (seen in the shots diff, as expected):** individual/simple bookings now show their count in
the Tasting / Lunch columns of the Orders list and booking sheet (A-4); registration fee no longer editable per tier.
**Finding F-3 (pre-existing, fix in Chunk 5):** the onboarding wizard's tier summary prints the stored tetri as ₾
("1 tier — 5000₾/person" for ₾50), and its "add tier" path passes GEL instead — inconsistent units.
**Resume point:** done.

### Chunk 4 — Migration B (contract)
**Status:** ✅ 2026-10-20 (dev DB)
**Goal:** the old columns are gone, so nothing can read them by mistake.
**Order matters (learned while doing it):** Prisma selects every column it knows on every query, so a running
app whose client still knows a dropped column fails. Therefore: **(a)** remove the fields from the schema and
deploy that code (works fine against a DB that still has the columns), **(b)** only then apply the migration.
Same order in the production runbook (merge = step 3, contract = step 6).
- [x] `scripts/_qa/pricing-expand-check.ts` rewritten in raw SQL (works before AND after the drop; recognises rows
      the new code wrote). Dev: 0 problems.
- [x] **4a** `ecbc415`: old fields removed from `schema.prisma`; product counts required (`@default(0)`) on Order and
      InvoiceSent; tsc 0 (proof nothing reads them); `test-pricing-model` 54/54, `test-order-repricing` 6/6.
      Contract migration `20261020120000_pricing_model_contract` **written, not applied** — hand-assembled because
      `prisma migrate dev` refuses non-interactive shells: `prisma migrate diff --from-url <dev> --to-schema-datamodel`
      output, preceded by the idempotent backfill re-run (minus the once-only company fee).
- [x] **4b** staging deploy READY (first build of `ecbc415` failed downloading the Google font for `app/welcome` —
      unrelated, transient; `4b33ef7` rebuilt it READY). Then `prisma migrate deploy` on dev → applied.
      (Vercel project `prj_6r0Ge02yFdu3y6XfPPTB42LIOg8I`, team `team_YoGrXMcjXga0y919jXsSV82z`.)
- [x] Verify: expand-check — old columns absent, 428 orders re-priced to their stored totals, **0 problems**;
      `migrate status` up to date; `test-pricing-model` 54/54; repricing 6/6; price RLS 10/10; money audit clean;
      staging home 200 before and after; shots `chunk4` vs `chunk3` identical (only the test order id); two real
      localhost bookings stored as before; no server errors.
- [x] Old scripts already deleted in Chunk 3.
**Status line:** ✅ 2026-10-20 on the dev DB. Production still has neither migration (runbook).
**Resume point:** done.

### Chunk 5 — Company price setup
**Status:** ✅ 2026-10-20 — tsc 0 · price RLS 10/10 · eslint: only a pre-existing issue · UI checked on localhost
through the real screens with `saas/tests/_qa/pricing-companies.spec.ts` (untracked): three prices + "not offered"
shown, Lunch only saved (₾45 → 4500 in the DB), an empty Tasting & Lunch refused by the form, company fee saved
(₾25 → 2500), Individuals show no Lunch only and no fee line; screenshots desktop + 390px in
`saas/tests/_qa/shots/pricing/chunk5/`.
- [x] Companies → tier form: Tasting only · Lunch only (hint: empty = not offered) · Tasting & Lunch, all-in GEL
      inputs (`parseMajor`); Individuals: no Lunch only box. Tier list shows the three prices, *not offered* in
      italics. Individuals' "shown on site" line reads the two all-in prices.
- [x] Company registration fee: `RegistrationFeeRow` under each company's tiers (not Individuals) → new action
      `setRegistrationFee(companyId, tetri)` in `app/actions/prices.ts` (whole tetri 0…₾1,000,000, not the
      Individuals row). `Company` type + page mapping carry `registrationFee`.
- [x] `tierPricesProblem` (server): whole tetri 0…₾1,000,000; **Tasting only and Tasting & Lunch required for now**
      (decision C5-1: until Chunk 7 the party-size pricing would read an empty one as ₾0 — revisit in Chunk 7 when
      `notOffered` guards every path); Individuals may not have a Lunch only price.
- [x] Onboarding wizard: both boxes are all-in ("Tasting only", "Tasting & Lunch"); **an empty Tasting & Lunch box
      in the wizard = same as tasting** (decision C5-2: the wizard's first-run shortcut; the Companies page asks
      explicitly). **F-3 fixed:** the tier summary now shows GEL (was raw tetri as ₾), and the "add tier" path passes
      tetri like the others. Visual check of the wizard step is left to the onboarding E2E in Chunk 11 (its step
      labels are not clickable, so the quick screenshot script could not reach it).
- [x] Labels EN + KA (`lib/adminT.ts`: `companies.priceForm.tastingOnlyPP/lunchOnlyPP/tastingLunchAllInPP/
      lunchOnlyHint/required`, `companies.priceTiers.tastingOnly/lunchOnly/tastingLunch/notOffered`,
      `companies.registrationFee.label/hint/none`). Old keys left unused (harmless).
- [x] `PaymentSetupBanner` "has prices" = any of the three > 0 (done in Chunk 3).
**For Chunk 10 (specs):** `tests/tier3-admin-smoke/companies-crud.spec.ts:302` finds tier inputs by POSITION
(0 min, 1 max, 2 tasting, 3 "+Lunch add-on", 4 flat fee) — now 0 min, 1 max, 2 Tasting only, 3 Lunch only,
4 Tasting & Lunch (companies) and no fee box; it must be updated.
**Finding F-4 (pre-existing, small, not in scope):** the Individuals hint says "Falls back to 50₾ / 100₾ if none
selected" (`companies.priceTiers.showOnSiteHint` / `noCustomTiersIndividual`) — the site has not invented default
prices since the money work; the copy is stale.
**Resume point:** done.

### Chunk 6 — Rules: minimums, `LUNCH` visit type
**Status:** ⬜
- [ ] Settings: three company per-product minimums, blank default (D-11), EN + KA, with a one-line
      explanation ("applies only to a product with guests; blank = no minimum").
- [ ] `lib/bookingHours.ts` + settings readers: `LUNCH` uses the Tasting + Lunch lead time / visit length /
      max / group minimum (A-5).
- [ ] `checkBookingCounts` wired to read these settings (still pure; callers pass them).
**Verify:** `test-pricing-model.ts` minimum cases (group check unchanged on day one; per-product only when
set and count > 0); Settings screenshot.
**Resume point:** —

### Chunk 7 — Public booking form + `createBooking` (#93)
**Status:** ⬜
- [ ] `BookingForm.tsx`: detailed company form per D-9 (+ Free, total line, per-product preview, "not
      offered" products hidden); simple company form gets **Lunch only** (D-10); individuals unchanged.
      Review sheet lines per product.
- [ ] `BookingFormVisualPanel.tsx` mirrors both variants; `FIELDS.form` + `seed-ka.ts` for any new
      tenant-editable label (§1's test: fixed label vs other admin data).
- [ ] `createBooking.ts`: `checkBookingCounts` + masterclass checks (§4.3); counts/rates written; `orderDesc`
      label for `LUNCH`.
- [ ] Turn the #93 repro into a committed spec `tests/tier2-core-flows/booking-tampered-quantities.spec.ts`
      (written now, **run in Chunk 11**); meanwhile prove refusal with the `_qa` repro on localhost.
**Verify:** screenshots (phone + desktop) of each variant with a quote; three real bookings on localhost
(individual; detailed company mixing all three products with masterclass; simple company Lunch only) →
stored counts/rates/total checked in the DB against `test-pricing-model.ts`'s numbers; crafted requests refused.
**Resume point:** —

### Chunk 8 — Admin New Order + Order Detail (fixes P-11)
**Status:** ⬜
- [ ] `NewOrderForm.tsx` + `createOrderAdmin`: three boxes + Free, derived total (no typed total →
      P-11 cannot happen), per-product tier box, three manual rates (A-9), masterclass price from the DB
      (Q-1 default), per-person prefill = paying guests.
- [ ] `OrderDetail.tsx` + `updateOrderEnhanced`: same; re-pricing on edit as today (today's tiers, new rule).
- [ ] `assignOrderCompany`: new rates.
**Verify:** reproduce P-11's exact input (9 tasting + 2 free + wine extra ₾100) → saves, total ₾550,
kitchen total 11; screenshots phone + desktop; edit an order's counts and check the re-snapshot.
**Resume point:** —

### Chunk 9 — Everything that shows a booking
**Status:** ⬜
- [ ] Orders table + phone card (§33), column defs (new id for Lunch only), calendar (both halves),
      filters (`LUNCH`), booking sheet (three + Free + kitchen total), invoice print, invoice email +
      `InvoiceSent`, confirmation + winery notification emails, `settle.ts` path, statistics (third bucket;
      guests per product), super-admin activity, Messages preview samples.
**Verify:** screenshots of each (EN + KA for emails/invoice via the Messages preview); send a test invoice
on dev to a test address and read the `InvoiceSent` row.
**Resume point:** —

### Chunk 10 — Demo seed, fixtures, scripts, docs
**Status:** ⬜
- [ ] `demoSeed.ts`: three prices per tier (lunch-only on some companies), orders using all three products;
      reseed dev demo; `audit-money.ts` clean.
- [ ] Scripts in §5 updated and green; `backfill-test-fixtures.ts` gives the test companies lunch-only prices.
- [ ] Playwright specs + helpers + notes updated to the new labels/totals (**not run yet**).
- [ ] Docs: MaintenanceNotes §22 rewritten (per-product tiers; the 2026-09-19 party-size rule is retired by
      Max's 2026-10-20 decision), §1/§31/§32 touch-ups; `Database Schema.md`; `Dependencies.md`; Feature note.
**Verify:** demo admin + public screenshots; scripts green; tsc 0.
**Resume point:** —

### Chunk 11 — Full verification and hand-over
**Status:** ⬜
- [ ] Fresh dev server (`rm -rf saas/.next`), warm routes, then **Playwright tiers 1–4** (KNOWN-ISSUES first).
      Two clean runs of anything that fails before fixing; reproduce every failure live.
- [ ] Blind review of the whole diff by a context-free subagent (vault fenced off — memory
      `feedback_blind_reviews`); verify every finding against the code; fix.
- [ ] `tix review T-152` with test steps for Max (staging), commit list; draft the release note
      (Releases, client view) with before/after shots.
- [ ] Vault: KnownBugs #93 (fixed on staging), FeatureLog, Roadmap, SessionLog.
**Verify:** tiers 1–4 green; review findings closed or listed for Max.
**Resume point:** —

### Chunk 12 — Production runbook (DRAFT — each step needs Max's explicit go)
**Status:** ⬜
1. **Pre-flight, read-only:** re-run Chunk 0's production counts; confirm still 2 Nikalas orders (or list new
   ones); save a JSON export of Nikalas's `Price`, `Company` fee inputs, `Order` and `InvoiceSent` rows locally.
2. `prisma migrate deploy` → **expand** only (old production code keeps working — it ignores new columns).
3. Merge `staging` → `master` (the new code). Vercel deploy READY.
4. Immediately re-run the expand backfill (idempotent) for rows old code wrote between steps 2 and 3.
5. Verify: both Nikalas orders show ₾250 / ₾2,800 and the right boxes; the public form quotes the same
   prices as before for Tasting and Tasting & Lunch; demo quotes sane.
6. `prisma migrate deploy` → **contract**.
7. Demo tenant: Reset Demo (super-admin) — the nightly reseed would also do it.
8. Nikalas (or Max with her numbers): enter Lunch only prices; set company minimums only if wanted.
9. `tix live T-152 production`; P-11 → mark live (client sees "Resolved") on Max's go; publish the release note.
**Window note:** steps 2–4 should run back-to-back (minutes). Old code cannot break on the expand schema;
new code needs step 4 for any booking made in that gap.

---

## 7. Edge cases

| # | Case | Handling |
|---|---|---|
| E-1 | Old unsplit order with free guests | §4.1 — money identical; counted in Chunk 0 |
| E-2 | Old split order whose typed total > split (admin) | leftover → Free (unpriced today, unpriced after) |
| E-3 | A product with guests but no price on the matching row | refused publicly ("not offered"), admin warning + manual rate |
| E-4 | Company with only a Lunch only price | Tasting box hidden; simple form offers Lunch only only |
| E-5 | Visit type and boxes contradict (crafted or stale form) | server refuses (A-6) |
| E-6 | Admin edits counts after payment | today's behaviour (balance/credit shown); re-snapshot at today's tiers |
| E-7 | Order linked to a company later (`assignOrderCompany`) | priced per product at that company's tiers, snapshot written |
| E-8 | Invoices already sent | `InvoiceSent` keeps the facts under the new names; no billed number changes |
| E-9 | Saved Orders-table column choices in browsers | ids `tasting`/`lunch` kept; new id added, default visible for companies |
| E-10 | Home page cards | Individuals only → unchanged numbers (`tastingLunchPrice` = old combo) |
| E-11 | Demo nightly reseed between steps | demo data is regenerated from code; no conversion needed |

## 8. Risks

- **R-1 (accepted by Max):** per-product tiers can raise a price vs today when a group splits across rows —
  Georgica: 24 Tasting & Lunch + 1 Tasting only = ₾2,380 (today ₾1,710). Worth telling Nikalas before release.
- **R-2:** a reader missed in Chunk 3 silently uses the wrong meaning → mitigated by new names + Chunk 4's
  drop (compile proof) + Chunk 1's equivalence check over every existing order.
- **R-3:** the 2026-09-13 lesson — a data conversion done by a loose script that nobody can prove ran. Here
  every conversion is inside a migration (recorded in `_prisma_migrations`), idempotent, and checked by a
  read-only script on both databases.
- **R-4:** the dev DB is shared with the staging deploy; between Chunks 2–4 staging may write old-style rows
  → backfill is idempotent and re-run at Chunks 3 and 4.
- **R-5:** the form's visual replica in the admin editor drifts (MaintenanceNotes §1) → explicit Chunk 7 step.
- **R-6:** phone halves forgotten (§33) → Chunk 9 lists both halves; screenshots at 390px.

## 9. Not doing (here)

Add-ons + wine on bookings (parked; update `Plan-AddOnsAndWine.md` D-4, D-11/§4.1, §4.5 afterwards) ·
print-sheet column picker (T-151, after this) · home-page guest line (T-114) · per-company minimums (the
three minimums are tenant settings) · lunch-only for individuals (D-5).

## 10. Baseline numbers (filled in Chunk 0)

Taken 2026-10-19 ~20:52 UTC, read-only (`saas/scripts/_qa/pricing-baseline.ts [--prod]`, untracked). Every
order's pricing inputs + stored total saved in `saas/scripts/_qa/pricing-baseline-{dev,prod}.json`
(untracked) for Chunk 1/3's equivalence check.

| | Dev | Production |
|---|---|---|
| `Price` rows | 30 (Staging Winery 14, Test Onboarding Wizard 2, Vineworks Demo 14) | 23 (Nikalas Marani 9, Vineworks Demo 14) |
| rows with lunch add-on > 0 / = 0 | 28 / 2 (the two wizard rows) | 23 / 0 |
| rows with a registration fee > 0 | 0 | 0 |
| companies whose tiers have different fees (A-3) | 0 | 0 |
| orders | 428 | 395 (Nikalas 2, demo 393) |
| — split (company) | 149 | 126 (Nikalas 2 + demo 124) |
| — unsplit (individual + 3 company on dev) | 279 | 269 |
| — **E-1** unsplit with free guests | **0** | **0** |
| — **E-2** split with leftover guests | **0** | **0** |
| — split with guestCount < boxes / negative counts | 0 / 0 | 0 / 0 |
| — orders with no rate snapshot | 0 | **393 — every production demo order** (see finding F-1) |
| — individual orders carrying a split | 0 | 0 |
| — Tasting visit with lunch guests | 0 | 0 |
| — **Tasting + Lunch visit, split, but 0 lunch guests** | 0 | **1 — Nikalas's 2026-10-07 order** (finding F-2) |
| `InvoiceSent` rows | 3 (1 split, 2 unsplit) | 1 (split) |

**Findings**
- **F-1:** all 393 demo orders on **production** have no rate snapshot (dev's demo has them — KnownBugs #49's
  fix). The production demo data predates that fix or the nightly reseed is not running there (cf. KnownBugs
  #30). Harmless for this plan — the converted rows simply keep null rates and runbook step 7 reseeds the demo —
  but worth a separate look.
- **F-2:** Nikalas's 2026-10-07 Georgica order is visit type *Tasting + Lunch* with 5 guests in *Tasting only*,
  0 in the lunch box, 2 free, charged ₾250 (5 × ₾50). Either those guests really only tasted (visit type set
  loosely), or they had lunch and were undercharged. It converts unchanged (A-2). Under A-6 a **new** booking
  like it would be refused (a Tasting + Lunch visit needs a lunch guest) — **question for Max (Q-3).**

## 11. History

- 2026-05-26 `8500a21` — tiers got a second price "Tasting+Lunch ₾/pp"; lunch guests paid that number alone.
- 2026-09-13 `cf5f594` — second price reinterpreted as a lunch **add-on** (+ a backfill script with no
  record of having run on production; production values look converted). No record of Max's sign-off.
- 2026-09-19 `47c3128` (#53) — admin labels renamed "Tasting-only / Tasting+Lunch"; `4fb6d0f` — tier picked
  by party size.
- 2026-10-19/20 — Max's new model (this plan). Context: KnownBugs #93 reproduction, production report P-11,
  read-only production check of Nikalas's tiers and 2 orders.
