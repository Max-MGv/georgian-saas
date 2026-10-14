---
tags: [feature, wine-orders, companies, delivery, pricing]
---

# Feature 225 — Wine order features (T-13, T-8, T-14, T-12, T-9)

Built 2026-10-12 on `staging` + the dev database. **Not on production.** Plan and per-chunk
results: [[Plan-WineOrderFeatures]]. FeatureLog #225.

## What it does (for a winery)

| Ticket | What the winery / customer sees |
|---|---|
| **T-13** Company addresses | A company can hold several named delivery addresses ("Vake branch"). On the wine form: one saved address fills in by itself; several → the customer must choose; "Other address" always available. |
| **T-8** Delivery, pickup, minimum | Settings → *Wine Orders — Delivery & Minimum*: minimum order (bottles or ₾), "offer pickup", delivery zones with a fee per order, and what to do when the customer's area is not listed (pay for the wine now and add the fee later, or take it as a reservation). The form shows Delivery / Pickup, the area, the fee and the total. Admin cards show it; the admin can set the fee later and collect it (cash, bank transfer, or a card link / QR). |
| **T-14** Preferred date | The customer must give a *preferred* delivery or pickup day ("we will confirm the exact day"), held to the booking lead time and Closed Days. Admin cards show and change it; Wine Orders gets a **Calendar** tab by preferred date, plus a "No preferred date" list. |
| **T-12** Negotiated prices + exporter | Companies → Edit → *Wine prices*: type a price per vintage for that company (exceptions only). It replaces the standard price, and the company % is not taken off it. An *Exporter* checkbox labels the company and its orders, with a filter on Wine Orders. |
| **T-9** Individual orders | The wine form has *Company / Individual*. Individual hides every business field; the order is stored as a private person's. |

Nothing changes for a winery until it configures something: no zones, pickup off, no minimum,
no negotiated prices → the form behaves as before (plus the required preferred date and the
Company/Individual switch, which defaults to Company).

## Key design decisions

- **Money (Max, 2026-10-12):** `WineOrder.totalAmount` stays the **wines** total; the delivery fee
  is its own column; what the customer owes is `wineOrderAmountDue()` (`lib/wineOrderMoney.ts`) —
  the only place the two are added. Statistics stay wines-only.
- **One function per concern, used by every path:** `resolveOrderAddress` (address),
  `resolveOrderDelivery` + `minimumOrderError` (delivery/minimum), `checkPreferredDate` (date),
  `priceWineOrder` (prices). Each is called by both `submitWineOrder` and `createWineOrderAdmin`;
  the pure ones are also what the forms display with. The browser only ever says *which* (address
  id, zone id, vintage id) — never *what* (text, fee, price).
- **Snapshots, as everywhere else:** an order keeps its address text, address name, zone name,
  fee and per-line price; links (`companyAddressId`, `deliveryZoneId`) are SetNull.
- **Negotiated prices are only shown to a proven company** (its access code, a person's code, or
  an admin). ~~A code-less company is still charged its negotiated price, but never online~~ —
  replaced 2026-10-14 by Max's rule: **no code = unknown company**, on bookings and wine orders
  alike. A company without a code is not listed on either public form, nothing about it is filled
  in, and a request naming it is refused (plan Chunk 15, MaintenanceNotes §35).
- **`deliveryFeePending`** is a separate flag from "fee is null", so every pre-T-8 order is not
  suddenly "waiting for a fee".
- **Security:** four new tables (`CompanyAddress`, `DeliveryZone`, `CompanyWinePrice`; plus columns)
  each get RLS + an `app_user` grant + an anon/authenticated revoke **inside their migration**, and
  are in `scripts/setup-rls.ts`. Anon REST key → 401 on each. Two-tenant isolation tests for each.
- **Calendar reuse:** the month grid moved to `components/MonthCalendar.tsx`; the Orders calendar is
  a thin wrapper with unchanged behaviour.

## Files

Schema + 6 migrations (`20261012121359_company_addresses`, `…141158_delivery_zones`,
`…144005_order_event_delivery_fee_set`, `…155548_wine_order_preferred_date`,
`…162751_company_wine_prices`, `…165501_wine_order_customer_type`). New libs:
`lib/orderAddress.ts`, `lib/wineOrderRules.ts`, `lib/wineOrderDelivery.ts`, `lib/orderDelivery.ts`,
`lib/wineOrderMoney.ts`, `lib/wineOrderDate.ts`, `lib/winePricing.ts`,
`components/MonthCalendar.tsx`. New actions: `companyAddresses.ts`, `deliveryZones.ts`,
`companyWinePrices.ts`; extended `submitWineOrder.ts`, `wineOrders.ts`, `companies.ts`,
`lib/payments/manualPayment.ts` (wine balance + additional payment), `lib/payments/topUpCheckout.ts`
(shared with bookings), `lib/payments/settle.ts` (receipt). UI: `WineCatalogueClient.tsx`,
`NewWineOrderForm.tsx`, `WineOrdersClient.tsx`, `CompaniesClient.tsx`, `WineOrderSettingsPanel.tsx`,
`orders/CalendarView.tsx`. Receipt email template.

## Tests

Scripts: `test-company-addresses-rls` 13, `test-order-address` 8, `test-delivery-zones` 20,
`test-order-delivery` 13, `test-wine-fee-payment` 7, `test-settle-wine-fee-topup` 9,
`test-topup-checkout` 3, `test-wine-order-date` 13, `test-wine-pricing` 13,
`test-company-wine-prices` 12. Specs (new): `wine-order-company-address`, `wine-order-delivery` (6),
`wine-order-delivery-fee` (6), `wine-order-calendar`, `wine-order-negotiated-prices` (4),
`wine-order-individual`. Every older spec that submits the wine form now fills the date
(`tests/helpers/wineForm.ts`).

## Edge cases handled

Company switched mid-form (address, prices, contacts cleared); a late resolver answer for a
company already left; saved address deleted while the form was open; zone deleted after ordering;
pickup with a fee (refused by the DB); minimum checked on wines after company pricing, not the fee;
"Other" area in both payment modes; a fee set after the wine was paid (balance + collection);
over-collection refused; a fee top-up settling must not move the first `paidAt`; Closed Day and
too-soon dates; 30 Feb; negotiated price of 0; % applied to nothing when every line is negotiated;
an individual order sent with a company id (dropped).

## What to test (Max)

See [[MyToDo]] (2026-10-12 entry).
