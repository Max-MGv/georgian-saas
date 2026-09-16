---
tags: [plan, companies, booking-form, super-admin]
---

# Plan — Company Booking Nationality Tagging

> **This is the live task tracker.** Update checkboxes and each chunk's Status line as work
> happens. **Chunks are sequential — do not start chunk N+1 until chunk N's Status is ✅**,
> unless a chunk's own notes say otherwise. If a session ends mid-chunk, note the resume point
> at the top of that chunk.

**Where this came from:** a conversation on 2026-09-16. Max wants to tag which nationalities are
present on a **company** booking (a booking group is sometimes mixed — "at most a mix," not a
precise headcount per country), gated by a **super-admin-only** tenant toggle (his phrase: "if
user has this breakdown"), so that company bookings can later be **filtered by nationality** in
the admin Orders view.

Confirmed in that conversation (see full session for the reasoning, this is the condensed
result):

- **Not** a per-country guest-count breakdown (e.g. "3 French, 2 German") — Max: *"its gonna be
  probably just one - at most mix but not detailing how many of which."* So: a small set of
  nationality tags per booking, no counts.
- **Independent of "enhanced company booking" mode** (the existing `isEnhanced` branch in
  `BookingForm.tsx` that adds split guest counts / hot dish / masterclass) — Max picked this
  explicitly over bundling it into that mode. Shows for any COMPANY booking once the tenant flag
  is on, enhanced mode or not.
- **Super-admin only**, like `Tenant.wineDetailLevel` — not a tenant-admin-editable `Setting` like
  `enable_enhanced_company_booking`. A winery cannot turn this on for itself; only Max can, per
  tenant, from `/super-admin/tenants`.
- **Picker UX:** Max wants a full country list, pickable either by browsing or by typing to
  filter ("as they start typing countries that match start coming up"). Translated below into: a
  static, hardcoded country list (no new DB table — see Chunk 1) behind a type-ahead multi-select
  combobox, since typing-to-filter and picking-from-a-list are the same UI (a filtered dropdown),
  not two separate features.

Prior art this build should follow, not reinvent:

- **`Tenant.wineDetailLevel`** (`saas/prisma/schema.prisma`) — the existing precedent for a
  super-admin-only per-tenant flag, exposed only in
  `saas/app/super-admin/tenants/TenantFormClient.tsx`, never in the tenant's own
  `SettingsClient.tsx`.
- **`BookingForm.tsx`'s `isEnhanced` branch, and `Order.guideId` (Feature 185) specifically** — the
  existing precedent for a COMPANY-only conditional block in the booking form that lives
  **independent** of `isEnhanced`, and for `buildBookingPayload()` being the single place a new
  field must flow through (see [[MaintenanceNotes]] #1 / Feature 180 — anything added to the form
  that skips this function silently drops out of bookings submitted via the "New Company?"
  popup). `guideId` is placed at the top level of `buildBookingPayload()`'s return, not inside the
  `isEnhanced` spread — `nationalities` should copy that exact placement (see Chunk 5).
- **`OrdersFilters.tsx` + the orders admin's filtering.** ⚠️ Corrected by the 2026-09-16 critical
  review below — there is **no** shared `getOrders()` function. The table's query is inline in
  `app/admin/(panel)/orders/page.tsx`, and `exportOrdersCsv` (`app/actions/orders.ts`) builds its
  **own separate** `where` clause from its own filter type. A new filter has to be added to both
  by hand, in sync — see Chunk 8.

---

## Critical review (2026-09-16)

Before writing any code, a sub-agent did a critical pre-implementation audit of this plan against
the real codebase and the closely-related [[Plan-CompanyGuidesAndReps]]. It found one factual
error and several missing surfaces, folded into the plan below (Chunk 5, new Chunk 7, rewritten
Chunk 8, Chunk 10's test list, and the open question under Chunk 1). Kept for the record here so
the reasoning isn't lost:

- **Chunk 7 (now 8)'s original premise was wrong** — it assumed a shared `getOrders()` used by
  both the table and CSV export. That function doesn't exist; see the corrected "Prior art" bullet
  above and the rewritten Chunk 8.
- **`BookingSheetPrint.tsx`** (the sheet printed for kitchen/host use *during* the actual visit)
  was entirely missing from the original plan, despite being arguably the most useful place to
  show mixed nationalities — an admin filter nobody checks mid-service is a weaker payoff than the
  print sheet the winery staff actually holds. Added as Chunk 7.
- **Toggle-off behavior was undefined** — if the super-admin flag is turned off after orders
  already have `nationalities` data, the original Chunk 7 filter/column had no gate on the flag at
  all, so it would keep showing regardless, silently. Now an explicit decision (see Chunk 8).
- **Booking confirmation email, internal new-booking notification email, and the pre-submit
  review popup** (`BookingConfirmPopupView.tsx`) were never addressed. The review-popup row is
  folded into Chunk 5 (near-zero cost, same shape as the existing guest-count rows); the two
  emails are an explicit include/skip decision in Chunk 7.
- **The "static list, not a DB table" call** (Chunk 1) trades away a per-tenant-curated shortlist
  as an option — the RLS argument against a table only holds for a *shared* table, not a
  *tenant-scoped* one. Flagged as an open question below rather than silently locked, so Max gets
  to confirm it rather than have it decided for him.
- **RLS claim and the `buildBookingPayload()`/`guideId` mechanism were both verified correct** —
  no change needed there, just confirmed rather than assumed.
- Test coverage (now Chunk 10) gained an explicit two-tenant cross-visibility check, and a note
  that the filter's "distinct nationalities present" query (Chunk 8) has no existing precedent in
  this codebase — Prisma's `distinct` doesn't unnest array columns, so it likely needs a raw query.

---

## Context & dependencies (read before Chunk 2)

### ⚠️ Open question for Max — country list shape

Chunk 1 originally locked "static hardcoded list, not a DB table" without flagging that this
forecloses a real alternative: a **per-tenant-editable shortlist** (e.g. only the countries a
given winery's guests actually come from) would be a normal tenant-scoped table, fitting the RLS
model fine — the "awkward RLS fit" reasoning only applies to a table *shared* across tenants, not
a per-tenant one. **Confirm before Chunk 3:** is a flat, non-editable ~195-country list actually
fine, or would a curatable-per-tenant list be worth the extra table? Defaulting to the flat list
below unless told otherwise.

### Data model decision — no new table

A full per-country breakdown table (`OrderNationality { orderId, country, guestCount }`) was the
original idea but is **overkill** for "at most a mix, no counts." Instead:

```prisma
model Order {
  // ...existing fields...
  nationalities String[] @default([])
}
```

A plain Postgres array column on `Order`. This is the whole schema change — no new table, which
means **none** of the new-table RLS checklist in [[RLS-Architecture]] applies (no `setup-rls.ts`
entry, no JOIN policy, no new two-tenant RLS test script). Verified against the real
`setup-rls.ts`/RLS model: `Order` already has a table-level GRANT plus a row-level
`tenant_isolation` policy; RLS is row-scoped and GRANT is table-scoped, neither is per-column, so
adding `nationalities` needs zero new policy or grant work.

### Country list — static, not a DB table (see open question above)

Despite Max's phrasing ("create a table with all countries"), the default plan is **not** a real
database table: a fixed, ~195-row reference list that never changes per-tenant and never needs
editing from any admin UI. Plan: a plain hardcoded array in `saas/lib/countries.ts` —
`{ code: 'FR', name: 'France' }[]`, ISO 3166-1 alpha-2 codes — imported directly wherever the
picker or filter needs it. Store the **ISO code** (not the display name) on `Order.nationalities`,
so future filtering/renaming/display stays consistent even if display copy changes.

**Assumption locked here (flag if wrong):** country display names are **English only** — no
Georgian translation of ~195 country names. `adminT.ts` gets new keys for the picker's own UI
chrome (placeholder, label, filter label) in EN + KA per the usual pattern, but the country names
themselves are not part of that i18n system, the same way `MenuItem`/`MasterclassItem` names
aren't translated per-locale today.

### Picker UX — one new component, no new dependency

No combobox/autocomplete library is installed (`package.json` has none, and no existing component
in `saas/components/` does this — checked). Every dropdown-like control in this codebase today
(`OrdersFilters.tsx`'s selects, `DateInput.tsx`) is hand-rolled with inline styles, no UI kit. This
follows the same pattern: a new `saas/components/NationalityPicker.tsx` — a text input that
filters the static list as you type, shows matches in a dropdown, clicking or pressing Enter adds
a removable tag, multiple tags allowed. No new package.

### Full dependency list

| File | What changes |
|---|---|
| `saas/prisma/schema.prisma` | `Tenant.enableCompanyNationalityBreakdown Boolean @default(false)`; `Order.nationalities String[] @default([])` |
| `saas/lib/countries.ts` (new) | Static ISO 3166-1 country list, `{ code, name }[]` |
| `saas/components/NationalityPicker.tsx` (new) | Type-ahead multi-select tag input, built on the static list |
| `saas/components/BookingForm.tsx` | New block shown when `bookingType === 'COMPANY'` **and** the tenant flag is on (independent of `isEnhanced`); feeds `nationalities` into `buildBookingPayload()` at the same top-level placement as `guideId`; also feeds the confirm-review rows shown by `BookingConfirmPopupView.tsx` |
| `saas/app/actions/createBooking.ts` | Accept `nationalities?: string[]` in the booking payload type, store on `Order.create` |
| `saas/app/super-admin/tenants/TenantFormClient.tsx` | New toggle, mirroring the `wineDetailLevel` button-pair UI |
| `saas/app/actions/superAdmin.ts` | `createTenant`/`updateTenant` payloads gain `enableCompanyNationalityBreakdown` |
| `saas/app/admin/(panel)/orders/BookingSheetPrint.tsx` | Print the nationality tags on the sheet kitchen/host staff use during the visit — added per the critical review, was missing from the original plan |
| `saas/lib/emails/bookingConfirmation.ts` / `newBookingNotification.ts` + templates | Decide include/skip for the guest confirmation email and the winery's internal new-booking alert — see Chunk 7 |
| `saas/components/BookingConfirmPopupView.tsx` | Show nationality in the pre-submit review, same shape as the existing guest-count rows (`confirmGuestRows` in `BookingForm.tsx`) |
| `saas/app/admin/(panel)/orders/page.tsx` | `SearchParams` type + inline `baseWhere` gain the nationality filter (⚠️ not a shared `getOrders()` — corrected by the critical review) |
| `saas/app/actions/orders.ts` (`exportOrdersCsv`) | Its own separate filter type + `where` clause need the same filter added independently |
| `saas/app/admin/(panel)/orders/OrdersFilters.tsx` | New filter dropdown; `buildQuery`'s `merged` object, the `navKey` string, and `handleExport`'s param list all need the new key added by hand |
| `saas/app/admin/(panel)/orders/columnDefs.ts` + `OrdersTable.tsx` | Optional new column showing nationality tags per row |
| `saas/lib/adminT.ts` | New EN + KA keys: filter label, column header, picker placeholder/labels (KA drafted, flagged not-native-reviewed per usual) |
| Tests | Extend `tests/tier2-core-flows/booking-enhanced.spec.ts` (or a new sibling spec) + `tests/tier3-admin-smoke/admin-orders.spec.ts`, plus a two-tenant cross-visibility check |

### Key considerations already resolved

1. **Per-order, not per-company.** Nationalities are entered fresh on each booking, not stored as
   a fixed property of the `Company` record — a company's guest mix varies visit to visit, same
   reasoning as guest counts being per-order.
2. **Filter is single-select for v1** (pick one country, see bookings that include it —
   `has: value`), matching every other filter in `OrdersFilters.tsx` today (status, company are
   both single-select). A "match any of several selected countries" (`hasSome`) filter is an easy
   later upgrade if wanted, not built now.
3. **Scope stays COMPANY-only**, per the original ask — individual bookings never show this field,
   flag, or filter option.
4. **Toggle-off does not hide existing data.** Once an order has `nationalities` set, the admin
   filter/column/print-sheet/CSV export show it regardless of the tenant's current
   `enableCompanyNationalityBreakdown` value — the flag only controls whether the **booking form**
   offers the picker going forward. This matches how other tenant flags in this codebase (e.g.
   `wineDetailLevel`) don't retroactively hide already-entered data. Decided in the critical review
   in response to the original plan leaving this undefined.

---

## Current status

| Chunk | What | Status |
|---|---|---|
| **1** | Data model + UX decisions — locked above (one open question: country-list shape) | ✅ Done |
| **2** | Schema + migration (dev DB) | ✅ Done |
| **3** | Static country list + `NationalityPicker` component | ✅ Done |
| **4** | Super-admin: tenant toggle | ✅ Done |
| **5** | Booking form wiring (incl. confirm-review popup) | ✅ Done |
| **6** | `createBooking.ts` — persist `nationalities` | ✅ Done |
| **7** | Operational surfaces — print sheet (done) + emails (explicitly skipped, see below) | ✅ Done |
| **8** | Admin: Orders filter + optional column (corrected mechanism) | ✅ Done |
| **9** | i18n (landed incrementally with Chunks 5/7/8) | ✅ Done |
| **10** | Tests | ✅ Done |
| **11** | Vault close-out | 🚧 In progress (this update) |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** Chunks 1–10 done and verified live in dev on 2026-09-16 (Max said to
start building, then keep going; proceeded with the flat static country list as the default since
he hadn't objected). The full feature works end-to-end, with automated regression coverage now in
place: super-admin toggle → booking form picker → confirm-review sheet → persisted on the order
(server-validated) → shown on the printed booking sheet and in the admin Orders filter/column/CSV
export, and turning the flag off afterward never hides already-entered data. One genuine app bug
found and fixed along the way — see [[MaintenanceNotes]] #27 (`Tenant` RLS trap). One deliberate
scope decision — booking confirmation and internal notification emails skip nationality, staying
consistent with those templates' existing minimalism (see Chunk 7). The country-list-vs-editable-
table open question from Chunk 1 is still technically unanswered by Max but no longer blocking.
Committed and pushed to `staging` (`fb816f4`) on Max's explicit go-ahead. **Not yet done:**
verifying the live `staging.vineworks.ge` deploy, and getting Max's approval for the
`staging` → `master` merge (production) — see Chunk 11.

---

## Ground rules for every chunk

1. **[[ClaudeInstructions]] Rule 0** — schema change via `prisma migrate dev` against the **dev**
   DB first (stop the dev server first per Rule 10), verified on `staging`, only then
   `prisma migrate deploy` to production as its own deliberate step later.
2. **[[ClaudeInstructions]] Rule 8** — state the plan for a chunk and get a go-ahead before
   editing.
3. **[[MaintenanceNotes]] #1 / Feature 180** — any new booking-form field must flow through
   `buildBookingPayload()`, or it silently drops out of bookings submitted via the "New Company?"
   popup path.
4. Update `FeatureLog.md` as this moves from 🚧 to ✅ (per Rule 4), and file
   `vault/features/Feature 188 - Company Booking Nationality Tagging.md` per Rule 9 once built —
   this touches 10+ files across the booking form, admin panel, print sheet, emails, and
   super-admin, so it clearly qualifies.

---

## Chunk 2 — Schema + migration

**Status:** ✅ Done (2026-09-16)

- [x] Added `Tenant.enableCompanyNationalityBreakdown Boolean @default(false)`
- [x] Added `Order.nationalities String[] @default([])`
- [x] No dev server was running, so no stop/restart needed — ran
  `prisma migrate dev --name add_company_nationality` directly, confirmed
  `✔ Generated Prisma Client`
- [x] `npx tsc --noEmit` clean

**Resume point:** —

---

## Chunk 3 — Static country list + picker component

**Status:** ✅ Done (2026-09-16) — built with the flat static-list default; the open question
above is still unanswered by Max, flagged for him rather than blocking further work.

- [x] `saas/lib/countries.ts` — ISO 3166-1 alpha-2 list (~195 countries), `{ code, name }[]`,
  English names, plus a `countryName()` lookup helper
- [x] `saas/components/NationalityPicker.tsx` — type-ahead filter on `name` (typing OR just
  opening the empty dropdown browses the full list, satisfying both halves of Max's ask), click,
  Enter, or arrow-key navigation to add a tag (stores `code`), removable tags (click × or
  Backspace on an empty input), styled with the same `var(--site-*)` tokens as `DateInput.tsx` /
  `BookingForm.tsx` — no new dependency
- [x] `npx tsc --noEmit` clean

**Resume point:** —

---

## Chunk 4 — Super-admin tenant toggle

**Status:** ✅ Done (2026-09-16)

- [x] `TenantFormClient.tsx` — new "Company booking nationality tagging" section (a single
  checkbox, not a button-pair — this flag is boolean, unlike the enum `wineDetailLevel`, so the
  section mirrors that block's placement/copy style rather than its exact button UI), state, and
  payload wiring
- [x] `app/actions/superAdmin.ts` — `getTenant`/`createTenant`/`updateTenant` all read/write
  `enableCompanyNationalityBreakdown` as a required boolean (not optional-undefined-preserving
  like `modulesOnlinePayment` — there's no legacy client to protect since this field is brand new)
- [x] `npx tsc --noEmit` clean
- [ ] Verify live: flip the toggle for a test tenant, confirm it persists — **pending**, do this
  once the booking form actually reads the flag (Chunk 5), so there's something observable
- [ ] One-line decision, no code: should the **demo tenant** get this flag turned on to showcase
  the feature in sales demos? Purely a manual toggle either way — just don't let it get forgotten.

**Resume point:** —

---

## Chunk 5 — Booking form wiring

**Status:** ✅ Done (2026-09-16)

- [x] New block in `BookingForm.tsx`, shown when `bookingType === 'COMPANY'` and the tenant's
  `enableCompanyNationalityBreakdown` flag is true (`nationalityBreakdownEnabled` prop, threaded
  down same as `enhancedEnabled`) — independent of `isEnhanced`, confirmed live: renders and
  updates for either visit-type/enhanced state, and disappears (with tags cleared) when switching
  to Individual
- [x] `app/(site)/page.tsx` fetches the flag and passes it down. ⚠️ **Real bug found and fixed via
  live verification**: the first attempt fetched it through `withTenantDb` (matching every other
  query in that file's `Promise.all`) and it silently rendered `false` even though the DB had
  `true` — `Tenant` has RLS *enabled* at the DB level (Supabase's default) with **zero policies**,
  so a read under `withTenantDb`'s `app_user` role always returns `null`, no error. Fixed to a
  plain `db.tenant.findUnique()`, matching `isPaymentConfigured()`'s existing (previously
  unexplained) precedent. Full writeup: [[MaintenanceNotes]] #27.
- [x] Wired the picker's selected codes into `buildBookingPayload()` at the same top-level
  placement as `guideId` (not inside the `isEnhanced` spread), exactly per the critical review's
  template
- [x] Added the selected nationalities to the pre-submit review shown by
  `BookingConfirmPopupView.tsx`, in both the `isEnhanced` and simple `confirmGuestRows` branches
- [x] `npx tsc --noEmit` clean
- [x] Verified live end-to-end in dev (Staging Winery tenant, dev DB): flipped the flag on via
  `/super-admin/tenants`, booked as "Test Company # 1" with France + Germany tagged, removed
  Germany, confirmed the review popup showed "Nationality (optional): France", submitted, and
  confirmed switching to Individual Booking hides the field and clears any tags already picked

**Resume point:** —

---

## Chunk 6 — Persist on the order

**Status:** ✅ Done (2026-09-16)

- [x] `createBooking.ts` — accepts `nationalities?: string[]` in `BookingFormData`, stored on
  `Order.create` only for `bookingType === 'COMPANY'` (`[]` for INDIVIDUAL, matching `guideId`'s
  own guard)
- [x] Server-side defense-in-depth, same discipline as `verifiedGuideId`: never trusts the
  client-sent array outright — filters to codes that actually exist in `lib/countries.ts`'s list
  and dedupes before writing
- [x] `npx tsc --noEmit` clean
- [x] Verified live: submitted a real booking through the form (Test Company # 1, France
  tagged), confirmed the DB row has `nationalities: ['FR']`, `bookingType: 'COMPANY'`; test order
  deleted afterward, no leftover data

**Resume point:** —

---

## Chunk 7 — Operational surfaces: print sheet + emails

**Status:** ✅ Done (2026-09-16)

Added by the 2026-09-16 critical review — the original plan only ever surfaced this data in an
admin filter, never anywhere staff actually look during the visit.

- [x] `BookingSheetPrint.tsx` — new "Nationality" column (`orders.sheet.nationality`, EN + KA),
  showing `nationalities.map(countryName).join(', ')` or `—` when empty. Not gated on the
  tenant's `enableCompanyNationalityBreakdown` flag — it just renders whatever data the order
  already has, per Chunk 1's toggle-off decision. `OrdersTable.tsx`'s `Order` type and
  `orders/page.tsx`'s explicit field-by-field remapping (⚠️ found live — that remap, not the
  Prisma query itself, was the thing missing the field; the query itself uses `include`, which
  already returns every scalar column) both updated to carry it through.
- [x] **Decided, explicitly, to skip both emails** — this is a real product-scope call, not an
  oversight: `bookingConfirmationTemplate.ts`'s "Booking Summary" box and
  `newBookingNotificationTemplate.ts` are both already deliberately minimal (neither shows the
  company name, the tasting/lunch guest split, hot dish selections, or masterclass add-ons —
  data that already exists on every order). Adding nationality to either would be inconsistent
  with that established minimalism and out of proportion to what those templates otherwise do.
  The print sheet is the one surface actually built for this data's stated purpose (advance
  service/kitchen prep) and is a comfortably sufficient home for it. Revisit only if Max
  specifically wants it in one of the emails too.
- [x] `npx tsc --noEmit` clean
- [x] Verified live: inserted a temporary test order with `nationalities: ['FR', 'DE']` directly
  in the dev DB, opened the real Print Sheet preview in `/admin/orders`, confirmed the column
  header and "France, Germany" cell both render correctly; test order deleted afterward

**Resume point:** —

---

## Chunk 8 — Admin filter + optional column

**Status:** ✅ Done (2026-09-16)

⚠️ Corrected by the critical review — the original version of this chunk assumed a shared
`getOrders()` function that doesn't exist. The real mechanism touches the table's page component
and the CSV export's own filter logic **separately**:

- [x] `app/admin/(panel)/orders/page.tsx` — added `nationality?: string` to `SearchParams`; added
  `nationalities: { has: value }` to the inline `baseWhere`
- [x] `app/actions/orders.ts`'s `exportOrdersCsv` — has its own separate filter type/`where`
  clause (confirmed not shared with the table) — added the same filter there independently, plus
  a new "Nationality" CSV column (small proportionate addition beyond the plan's literal ask,
  since the print sheet already got one and leaving the CSV export without it would've been the
  odd one out)
- [x] `OrdersFilters.tsx` — new dropdown (hidden entirely when `nationalityOptions` is empty, so
  tenants with no nationality data yet don't see a useless filter); `buildQuery`'s `merged`
  object, `navKey`, and `handleExport`'s param list all updated
- [x] Filter options = distinct nationalities actually present, via a new
  `getDistinctOrderNationalities()` in `orders.ts` — confirmed there really was no existing
  precedent; used a raw `SELECT DISTINCT unnest("nationalities") ...` query under `withTenantDb`
  (safe here, unlike the Chunk 5 `Tenant` trap — `Order` has a real RLS policy, verified live)
- [x] Confirmed live: this filter/column is **not** gated by `enableCompanyNationalityBreakdown`
  — per Chunk 1's toggle-off decision, it shows real data on any order that has it
- [x] `columnDefs.ts` + `OrdersTable.tsx` — new optional "Nationality" column (default hidden,
  same as `guests`/`additional`), rendering `nationalities.map(countryName).join(', ')` or `—`
- [x] `npx tsc --noEmit` clean
- [x] Verified live end-to-end: inserted a temp order with `nationalities: ['FR', 'ES']`,
  confirmed the "Nationality" filter dropdown appeared (only once real data existed) and narrowed
  the table to exactly that order, confirmed the optional column showed "France, Spain" once
  toggled on, confirmed `exportOrdersCsv({ nationality: 'FR' })` ran successfully server-side
  (checked the dev server log directly, since the browser sandbox blocks inspecting a
  script-triggered file download); test order deleted afterward

**Resume point:** —

---

## Chunk 9 — i18n

**Status:** ✅ Done — landed incrementally alongside Chunks 5, 7 and 8 rather than as its own
pass, since each new label was needed at the moment its surface was built:

- [x] `lib/t.ts` (booking form, Chunk 5): `form.nationality` / `form.nationality_placeholder` /
  `form.nationality_empty`
- [x] `lib/adminT.ts` (print sheet, Chunk 7): `orders.sheet.nationality`
- [x] `lib/adminT.ts` (filter + column, Chunk 8): `orders.filters.nationality`,
  `orders.filters.allNationalities`, `orders.col.nationality`
- [x] All of the above have EN + KA — every KA string flagged `// Drafted, not native-reviewed`
  per the project's usual caveat for machine-drafted Georgian

**Resume point:** —

---

## Chunk 10 — Tests

**Status:** ✅ Done (2026-09-16)

- [x] New sibling spec `tests/tier2-core-flows/company-nationality-tagging.spec.ts` (one
  `.serial` test — it mutates the tenant-wide flag, same reason the payment tests run serially)
  covering, in one real end-to-end pass on Staging Winery: reading/toggling the super-admin flag
  and restoring it afterward; the picker appearing only when the flag is on; typing to filter and
  clicking a suggestion; removing a tag; the confirm-review sheet listing "France, Germany"; the
  order persisting and showing up in the admin filter dropdown, the optional table column, and
  the printed booking sheet; **then** turning the flag off and confirming the picker disappears
  for new bookings while the already-submitted order's data still shows everywhere in admin — the
  toggle-off decision from Chunk 1, actually exercised, not just asserted in a comment
- [x] **Two-tenant cross-visibility check** — re-ran the existing `scripts/test-rls.ts` (not a new
  script — `nationalities` is a plain column on the already-RLS-covered `Order` row, so its
  existing "T1 orders NOT visible when queried under T2 context" check already exercises the
  exact same policy). 21/21 passed after the schema change.
- [x] **Confirmed actually passing, twice in a row** (not just written) —
  `npx playwright test tests/tier2-core-flows/company-nationality-tagging.spec.ts`, 1 passed
  both times (~1.2–1.3 min each); confirmed no leftover test orders and the tenant flag restored
  to its pre-test value (`true`) after each run
- [x] `npx tsc --noEmit` and `npx eslint` clean on every file this feature touched. Two real bugs
  fixed while writing the test (both in the test/component, not the app):
  - `NationalityPicker.tsx` had a `useEffect` calling `setState` synchronously on every render of
    `[text, open]` (an eslint `react-hooks/set-state-in-effect` error, not just a style nit) —
    moved the `setHighlighted(0)` reset into the actual event handlers that change `text`/`open`
    instead of an effect watching them.
  - The super-admin section header ("Company booking nationality tagging") is a plain `<label>`
    with no `htmlFor`, not a heading — `getByRole('heading', ...)` in the first draft of the test
    silently could never find it; same for the Orders filter's `<label>`, which `getByLabel()`
    can't associate with its `<select>` for the same reason. Both fixed to text/sibling-based
    locators instead of relying on implicit label semantics that don't actually exist here.
  - Also found (test-authoring bug, not app bug): the "Nationality" filter/column text collided
    across the filter bar and the Columns picker in `getByText` strict-mode matching, and
    `BookingSheetPrint` renders twice per page (on-screen + a print-only portal copy) — both
    needed narrower locators. Also switched the test phone number to be run-unique after leftover
    orders from earlier failed drafts of this same test collided on the hardcoded one.

**Resume point:** —

---

## Chunk 11 — Vault close-out

**Status:** 🚧 In progress — pushed to `staging`, awaiting the `master` merge decision

- [x] `SessionLog.md`, `FeatureLog.md` updated per Rules 1/4 (`Roadmap.md` skipped — same as
  Features 185/186/187, ad-hoc same-day features aren't added there, only pre-planned versioned
  milestones are)
- [x] `vault/Features/Feature 188 - Company Booking Nationality Tagging.md` written per Rule 9
- [x] Committed and pushed to `staging` (`fb816f4`) on Max's go-ahead
- [ ] Verify on the live `staging.vineworks.ge` preview (auto-deploys from this push) before
  asking for the `master` merge
- [ ] Confirm with Max, get the `staging` → `master` merge approval

**Resume point:** Pushed to staging. Next: verify live on staging.vineworks.ge, then get Max's
go-ahead to merge to `master` (production).
