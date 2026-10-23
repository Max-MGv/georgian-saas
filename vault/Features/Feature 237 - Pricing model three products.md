---
tags: [feature, pricing, bookings, companies, admin]
---

# Feature 237 — Pricing model: three products (T-152, fixes #93 + production P-11)

Built 2026-10-19 → 2026-10-22 on `staging` + the dev database. **Not on production** — the production runbook is
[[Plan-PricingModel]] Chunk 12 (each step on Max's explicit go). Plan, decisions (D-1…D-17, A-1…A-11, Q-1…Q-3) and
per-chunk QA logs: [[Plan-PricingModel]]. FeatureLog #237.

## What it does (for a winery)

- **Companies buy three products:** Tasting only, Lunch only, Tasting & Lunch — each with its own price on every
  row of the company's price table (Companies page). Lunch only is opt-in per company: a blank price = not
  offered, never ₾0. Tasting & Lunch is an all-in price. The registration fee is one flat fee per company.
- **Each product is priced by its own guest count**, so a group of 24 Tasting & Lunch + 1 Tasting only is priced
  on two different rows (Max accepted the consequence, R-1). Free guests (guide, driver) are never charged.
- **Public booking form:** the detailed company form has one box per product (+ Free) and a per-product price
  preview; a box for a product the company does not sell is hidden. The simple company form offers a third visit
  type, Lunch only. Individuals are unchanged (Tasting / Tasting + Lunch, one guest count).
- **Refusals with a clear message:** Tasting + Lunch with nobody at lunch (Q-3), a product the company does not
  offer, per-product company minimums (Settings, blank by default), a hot dish with no lunch guest (A-11), and any
  altered request (negative or fractional counts, forged masterclass quantities — KnownBugs #93).
- **Admin New Order + order page:** the four boxes, total derived (no typed party size → production report P-11
  cannot happen), visit type editable on the order page, typed rates only where a company's table has no price, one
  price line per product showing the table row used. Saving a food note no longer re-prices an order.
- **Individual orders on the admin screens (D-14, 2026-10-22):** priced from the Individuals price table by the
  guest count, like a company — no typed rates, no "price later" (refused with a message until the table exists).
  To charge more, add an extra. Changing the guests or the visit re-prices at today's table; paid orders stay locked.
- **Free guests capped** at the paying guests — public form (2026-10-22) and admin screens (2026-10-23, D-17).
- **Names (D-15, 2026-10-23):** the products are shown as **Tasting / Lunch / Tasting & Lunch** (KA დეგუსტაცია / სადილი /
  დეგუსტაცია და სადილი) — no "only". Earlier notes and screenshots say "Tasting only" / "Lunch only"; same products.
- **No row covers the count** → the highest-priced row that offers the product (A-7, kept 2026-10-23: overcharge
  rather than undercharge); the admin price line says so.
- **Everywhere a booking is shown:** orders table (Tasting only / Lunch only / Tasting & Lunch / Free columns),
  kitchen sheet with a kitchen total, invoices (print + email: a line per product), booking emails (Lunch only
  label, per-product guest line), statistics (three visit types, guests by product).

## Key decisions (why)

| # | Decision | Why |
|---|---|---|
| D-2 | Each product finds its tier by its own count | Max's model — a product's price depends on how many buy that product |
| D-3 | Guests in exactly one box; total = sum, never typed | The typed total was the root of P-11 and of drift between total and split |
| D-7 | Blank price = not offered | A ₾0 Lunch only by accident would give lunches away |
| A-7 | No exact row → highest-priced row that offers it | Keeps today's "never under-quote a gap" protection, per product |
| A-11 | No hot dish without a lunch guest | Max, 2026-10-21 — the kitchen gets no orphan dish orders |
| D-14 | Individual admin orders priced from the Individuals table, no typed rates | Max, 2026-10-22 — same as companies; extras are the way to add money; removes a class of preview/server mismatches |
| — | Order page re-prices only on a real change | A food-note save used to silently move a price to today's table |
| — | Invoice prints per-product lines only when the frozen rates explain the total | Never print a split that does not add up to what is billed |

## Files (by area)

- **Rules:** `lib/pricingUtils.ts` (product model; old party-size functions removed in Chunk 10),
  `lib/bookingInput.ts` (all input checks), `lib/adminOrderView.ts` (admin previews), `lib/invoiceLines.ts`.
- **Writes:** `app/actions/createBooking.ts`, `app/actions/orders.ts` (`createOrderAdmin`, `updateOrderEnhanced`,
  `assignOrderCompany`, `sendOrderInvoice`, quick-edit `updateOrder`), `app/actions/orderMasterclass.ts`,
  `lib/pricing.ts` (`recalcOrderTotal`), `lib/payments/settle.ts` (email data).
- **Screens:** `components/BookingForm.tsx`, admin `orders/` (`NewOrderForm`, `OrderDetail`, `OrderGuestFields`,
  `OrdersTable`, `columnDefs`, `CalendarView`, `BookingSheetPrint`, `InvoicePrint`), `companies/`, `settings/`,
  `statistics/`, `content/` (`BookingFormVisualPanel`, `MessagesPanel`, `ContentClient`).
- **Emails:** `invoiceEmailTemplate.ts`, `bookingConfirmationTemplate.ts`, `newBookingNotificationTemplate.ts`.
- **Data:** migrations `…_pricing_model_expand`, `…_pricing_model_contract`, `20261020150000_visit_type_lunch`;
  `lib/demoSeed.ts`; `scripts/backfill-test-fixtures.ts`.
- **Maintenance:** [[MaintenanceNotes]] §22 (rewritten), §1, §31, §32.

## Edge cases handled

Old orders keep their money (every dev order re-prices to its stored total; production checked against a
baseline before the migration); old orders without frozen rates keep their stored total and print one booking
line; browsers with saved column choices still get the new Lunch only column once; a stale Lunch only choice on
the public form falls back to Tasting when the proven company does not sell it; a dish picked before switching to
Wine Tasting is not sent.

## What to test

The per-chunk QA logs in [[Plan-PricingModel]] (Chunks 6–10) list every localhost + staging check. Automated:
`saas/scripts/test-pricing-model.ts` (101), `tests/tier2-core-flows/booking-tampered-quantities.spec.ts` (9/9 on
localhost), Playwright tiers 1–4 in Chunk 11.
