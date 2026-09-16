---
tags: [feature, booking, super-admin]
---

# Feature 188 — Company Booking Nationality Tagging

## What it does

Lets a **company** booking be tagged with the nationalities of the guests present — a small set
of country tags per booking, not a per-country headcount ("at most a mix," per Max — not
"3 French, 2 German"). Gated by a new **super-admin-only** tenant flag, so an individual winery
cannot turn this on for itself; only Max can, per tenant, from `/super-admin/tenants`.

- `Tenant.enableCompanyNationalityBreakdown` — mirrors `wineDetailLevel`'s existing pattern for a
  platform-only setting, never exposed in the tenant's own admin panel.
- When on, `BookingForm.tsx` shows a type-ahead multi-select country picker for any COMPANY
  booking — **independent** of "enhanced company booking" mode, shows either way.
- Selected countries appear on the pre-submit confirm-review sheet, get stored on
  `Order.nationalities` (a plain ISO-code array, COMPANY-only — always `[]` for INDIVIDUAL), and
  from there show up on the printed booking sheet and in the admin Orders filter/optional
  column/CSV export.
- Turning the flag off later **never hides data already saved** on existing orders — it only
  stops offering the picker on new bookings going forward.

## Key design decisions

- **No per-country counts, no new child table.** The original idea (an `OrderNationality` line-
  item table, mirroring `OrderMasterclass`) was replaced with a single `Order.nationalities
  String[]` column once Max confirmed this is "at most a mix," not a headcount. That's the whole
  schema change — no new table means none of the new-table RLS checklist applies.
- **Static country list, not a database table.** Despite Max's initial phrasing suggesting a real
  "table of countries," a fixed ~195-row reference list (`lib/countries.ts`) that never changes
  per-tenant and is never edited from any admin UI has no benefit from being a DB round trip. Flagged
  to Max as an explicit tradeoff (a per-tenant-curatable list would have been a legitimate
  alternative) rather than decided silently.
- **Independent of "enhanced company booking" mode**, on Max's explicit call — shows for any
  COMPANY booking once the tenant flag is on, whether or not that separate mode is also on.
- **Booking confirmation and internal notification emails deliberately skip this field.** Both
  templates are already intentionally minimal (neither shows company name, the tasting/lunch
  guest split, hot dish selections, or masterclass add-ons — all of which exist on every order
  already) — adding nationality to either would have been inconsistent with that established
  minimalism, not a gap.
- **Toggle-off never hides existing data.** The admin-side filter/column/print-sheet/CSV export
  read whatever an order actually has, regardless of the tenant's current flag value — the flag
  only gates whether the booking form *offers* the picker going forward.

## Real bug found and fixed via live testing (not just typechecking)

The tenant flag rendered as `false` on the public site even though the DB had it set to `true`.
Root cause: `Tenant` has row-level security **enabled** at the database level (Supabase's own
default when the table was created) but **zero policies** defined for it. Postgres RLS with no
matching policy defaults to denying every row to a non-owner role — so reading `Tenant` through
`withTenantDb`'s `app_user` role silently returned `null`, no error, even though the `GRANT
SELECT` succeeded. `isPaymentConfigured()` (`lib/payments/shouldTakePayment.ts`) and `proxy.ts`
already avoided this by reading `Tenant` via the plain unrestricted `db` client — undocumented
until now. Fixed the same way in `app/(site)/page.tsx`; the trap itself is written up in
`MaintenanceNotes.md` #27 so the next feature that reads a `Tenant` field doesn't rediscover it.

## Files touched

- `saas/prisma/schema.prisma` — `Tenant.enableCompanyNationalityBreakdown`,
  `Order.nationalities`, one migration (`add_company_nationality`)
- `saas/lib/countries.ts` (new) — static ISO 3166-1 list + `countryName()` lookup
- `saas/components/NationalityPicker.tsx` (new) — type-ahead multi-select tag input, no new
  dependency (none exists anywhere else in this codebase; hand-rolled to match the existing
  inline-style convention)
- `saas/components/BookingForm.tsx` — the picker block, `buildBookingPayload()` wiring (same
  top-level placement as `guideId`), confirm-review rows
- `saas/app/actions/createBooking.ts` — persists `nationalities`, filtered against the real
  country list server-side before writing (never trusts the client-sent array outright)
- `saas/app/(site)/page.tsx` — fetches the flag via the plain `db` client (see the RLS note above)
- `saas/app/super-admin/tenants/TenantFormClient.tsx` + `app/actions/superAdmin.ts` — the toggle
- `saas/app/admin/(panel)/orders/BookingSheetPrint.tsx` — new "Nationality" print column
- `saas/app/admin/(panel)/orders/page.tsx`, `OrdersFilters.tsx`, `columnDefs.ts`, `OrdersTable.tsx`
  — the admin filter (backed by a new `getDistinctOrderNationalities()` raw query in `orders.ts`,
  since Prisma's `distinct` doesn't unnest array columns) and optional table column
- `saas/app/actions/orders.ts`'s `exportOrdersCsv` — filter + a new CSV column
- `saas/lib/t.ts` + `saas/lib/adminT.ts` — new EN + KA labels throughout (KA drafted, flagged
  not-native-reviewed per usual)
- `saas/tests/tier2-core-flows/company-nationality-tagging.spec.ts` (new) — full end-to-end
  coverage, see below

## Edge cases handled

- Switching a booking from Company to Individual clears any picked tags and hides the field —
  confirmed live, tags don't silently survive the switch.
- A client-sent `nationalities` array is filtered down to real ISO codes and deduped server-side
  before ever being written — the same defense-in-depth `verifiedGuideId` already gets.
- `BookingSheetPrint.tsx` renders twice per admin page load (on-screen preview + a print-only
  portal copy) — found while writing the test, not an app bug, just something the test needed to
  scope around.
- The "distinct nationalities present" filter-dropdown query has no Prisma one-liner (`distinct`
  doesn't unnest arrays) — solved with a raw `SELECT DISTINCT unnest(...)` query, run under
  `withTenantDb` (safe for `Order`, which has a real RLS policy — unlike `Tenant`, see above).

## What to test

- Flip the flag on for a tenant from `/super-admin/tenants`, confirm a Company booking on that
  tenant's public site shows the picker; confirm an Individual booking never does, on any tenant.
- Tag a booking with 2+ countries, confirm they appear on the confirm-review sheet, submit, and
  confirm the order's `nationalities` in the DB matches.
- Confirm the tagged data shows up on the printed booking sheet and, once toggled on in the
  Columns picker, in the admin Orders table; filter by one of the tagged countries and confirm
  only matching orders remain.
- Turn the flag back off and confirm the already-submitted order's nationality still shows
  everywhere in admin — only the booking-form picker itself should disappear.
- `npx playwright test tests/tier2-core-flows/company-nationality-tagging.spec.ts` — should pass
  cleanly and leave no test data or tenant-setting changes behind.
