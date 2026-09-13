---
tags: [feature, booking, company]
---

# Feature 180 — New Company Booking Flow

## What it does (user-facing)

Before this, a tour-company rep booking on a `hide_company_dropdown` tenant (direct
company-code entry, no dropdown — e.g. production Nikalas Marani) who didn't have a
company code yet was stuck: hitting "Request Booking" without a code hard-blocked with
"Please enter and confirm your company code," and the only escape hatch — the "New
Company?" link — sent a bare registration inquiry with no booking details at all. They'd
have to wait for the winery to create their company and issue a code, then come back and
redo the entire form.

Now: if every other field on the form is valid and only the company code is missing,
"Request Booking" opens the "New Company?" popup instead of blocking, pre-filled with
whatever name/phone/email they'd already typed into the main form. Submitting it fires
**both** the existing company-registration email (`notifyNewCompany`) and the booking
itself (`createBooking`), in one action. The success screen and confirmation email both
say plainly that this isn't confirmed yet, since the company isn't set up in the system.

## The dropdown variant (non-`hide_company_dropdown` tenants)

Added same-day, on Max's request after he hit the browser's native "please select an
item" loop on a `<select required>` with no way to express "no company" — the original
fix above only covered the direct-code-entry variant.

`BookingForm.tsx`'s company `<select>` now has a `+ New Company` option with the sentinel
value `'__new__'`. It's a real, selectable option (satisfies `required`), but never a real
company id:
- `handleSubmit`'s gate that opens the popup was generalized from
  `hideCompanyDropdown && !companyId` to also match `companyId === '__new__'` — checked at
  submit time, not at selection time, since the rest of the form (date, guests, contact)
  may not be filled in yet the moment someone picks it from the dropdown.
- `buildBookingPayload()` strips the sentinel back to `undefined` before it would ever
  reach `createBooking()` — otherwise `data.companyId` being truthy (`'__new__'`) would
  make `isNewCompanyRequest` false server-side, silently losing the `requestedCompanyName`
  save and the 0-price guard.
- No other code needed touching: `companies.find(c => c.id === '__new__')` already
  resolves to `undefined` everywhere it's looked up (`selectedCompany`, the access-code
  `useEffect`), which is exactly the same "no company" state the rest of the form already
  handles for the placeholder option.

Verified locally the same way as the primary flow (temporarily flipped Staging Winery's
`hide_company_dropdown` to `false`, selected "+ New Company" from the real dropdown, filled
the rest of the form, submitted) — order landed with `companyId: null`,
`requestedCompanyName: 'Dropdown Test Co'`, `totalPrice: 0`. Cleaned up and restored the
setting to `true` afterward.

## Key design decisions

- **`companyId` stays `null`.** No fake/placeholder Company row is created. The order is
  stored as `bookingType: 'COMPANY'`, `companyId: null`, with a new `requestedCompanyName`
  string field (added this feature) holding just the typed-in name, for display only.
- **Pricing forced to 0, not silently wrong.** `createBooking.ts`'s pricing calc used to
  fall through to the *individuals* pricing table whenever `bookingType === 'COMPANY'` had
  no `companyId` — multiplying an individual per-person rate by the guest count and
  presenting it as if it were this company's price. Fixed: a `COMPANY` booking with no
  `companyId` is now always priced 0 ("confirmed after submission"), same as an existing
  company with no matching tier. This also means `shouldTakePayment()`'s `totalPrice <= 0`
  hard-block already keeps these bookings out of the online-payment gate — no changes
  needed in `settle.ts`.
- **Two popup modes, one component.** The "New Company?" popup is reused for both the
  standalone inquiry (link clicked directly, form may be incomplete — sends only the
  registration email, exactly as before) and the submit-time flow (all other fields
  already validated — sends the registration email *and* the booking). A boolean state,
  `newCompanyIncludesBooking` in `BookingForm.tsx`, tracks which mode is active; it's reset
  to `false` whenever the standalone link is clicked, and set to `true` only when
  `handleSubmit` opens the popup because the code check is the one thing missing.
  `buildBookingPayload()` is the single place both submit paths build the `createBooking`
  args from, so they can never drift apart.
- **The company-code check moved to last.** Previously the very first check in
  `handleSubmit`. Moved to run after every other validation (date, phone/email, blocked
  dates, lead time, min guests) — so the popup only opens once the rest of the booking is
  genuinely ready to submit, not on an empty form.
- **No *automatic* link when the company is later created — but a manual one exists.**
  The Order's `requestedCompanyName` is display-only and never retroactively gains a
  `companyId` by itself. Both the winery notification email and the admin Orders table say
  so explicitly. What closes the gap: `assignOrderCompany()` (`app/actions/orders.ts`) and
  a "Link Company" control on the order detail page, shown only when
  `!order.company && order.bookingType === 'COMPANY'` — pick a real company from a
  dropdown, and it sets `companyId`, re-prices the order against that company's tiers
  (same tier-lookup shape as `createBooking.ts`/`updateOrderEnhanced`, branching on
  whether the order has split tasting/lunch counts or just a flat `guestCount`), and
  `router.refresh()`s the page. `requestedCompanyName` is left in place afterward as a
  paper trail, even though the UI no longer shows it once `company` is populated.
  Refuses to touch an order that already has a `companyId` — one-time link-up, not a
  general reassignment tool.
- **"Not confirmed" messaging, three places:** the popup itself (before sending), the
  success screen (`confirmedPendingNewCompany` state), and the customer's own confirmation
  email (`pendingNewCompany` flag on `sendBookingConfirmation`) — all say this is a
  registration + booking *request*, not a confirmed booking, since a new company has no
  account or pricing yet.

## Linking a no-company order to a real company (added same day)

Max asked directly: "what happens to this specific request... if I register this company?"
— and the honest answer at the time was "nothing, by design, forever." He asked for the
gap to actually close, not just be documented. Built:

- `assignOrderCompany(orderId, companyId)` in `app/actions/orders.ts` — admin-only, looks
  up the order and the target company (both tenant-scoped), refuses if the order already
  has a `companyId`, recomputes `totalPrice` from the company's price tiers (handles both
  the enhanced split-guest-count shape and the flat `guestCount` shape), sets `companyId`
  + `bookingType: 'COMPANY'` + the new price.
- `OrderDetail.tsx` — a "Link Company" box in the Booking Info card, visible only for a
  `COMPANY` order with no `company`, showing `requestedCompanyName` and a dropdown of the
  tenant's real companies (`isIndividual: false`, fetched in `page.tsx` and passed down).
  Calls the action then `router.refresh()` so the server-fetched `order`/`company` props
  update in place — no local state patching, since the admin's own recompute logic already
  lives server-side.

Verified end-to-end on staging (dev DB): created a throwaway `COMPANY` order with
`companyId: null`, `requestedCompanyName: 'Pending Tours Ltd'`, `totalPrice: 0`; linked it
to "Test Company # 1" (5-guest tasting tier, 50₾/pp) through the actual admin UI; confirmed
the page re-rendered with "Company: Test Company # 1", the price-tiers warning gone, and
Order Total showing 250.00₾; confirmed in the DB that `companyId`, `bookingType`, and
`totalPrice` all updated while `requestedCompanyName` was left in place as history. Deleted
the test order afterward.

## Files touched

- `saas/prisma/schema.prisma` — `Order.requestedCompanyName String?` (migration
  `20260913160233_add_requested_company_name`, applied to dev DB; still needs
  `prisma migrate deploy` on prod after this ships to `master`)
- `saas/app/actions/createBooking.ts` — `requestedCompanyName` on `BookingFormData`; the
  `isNewCompanyRequest` pricing guard; stores the field on the created order; passes
  `pendingNewCompany`/`requestedCompanyName` through to both emails
- `saas/components/BookingForm.tsx` — `newCompanyIncludesBooking` state,
  `buildBookingPayload()`, reordered `handleSubmit` validation, `handleNewCompanySubmit`
  now does both sends, success-screen note, popup copy changes, `'__new__'` sentinel option
  on the dropdown variant
- `saas/lib/emails/bookingConfirmation.ts` — `pendingNewCompany` flag changes the intro
  paragraph and subject line
- `saas/lib/emails/newBookingNotification.ts` — `requestedCompanyName` shown to the winery,
  with the "won't auto-link" note
- `saas/app/admin/(panel)/orders/OrdersTable.tsx` + `page.tsx` — displays
  `requestedCompanyName` (styled amber, suffixed "(new)") wherever `company` would
  otherwise render, in the table row, mobile card, hover-preview card, and calendar view
- `saas/app/actions/orders.ts` — `assignOrderCompany()`
- `saas/app/admin/(panel)/orders/[id]/OrderDetail.tsx` + `[id]/page.tsx` — the "Link
  Company" control and the `companies` list it's fed from

## Edge cases handled

- Phone-only guests (no email): still get the flow; just no customer confirmation email,
  same as any other phone-only booking (existing behavior, unaffected).
- Enhanced/detailed company form (guest-count split, masterclass add-ons): carried through
  unchanged — `buildBookingPayload()` includes the same enhanced fields either submit path
  uses.
- A booking that would have gone to online checkout: can't happen here, since `totalPrice`
  is forced to 0 and `shouldTakePayment()` hard-blocks on `totalPrice <= 0`.

## What to test

- On a `hide_company_dropdown` tenant: fill the whole company-booking form, leave the code
  blank, hit "Request Booking" → popup opens pre-filled, not an error.
- Submit the popup → success screen shows the "not confirmed, new company" note; order in
  admin Orders shows "CompanyName (new)" in amber, total 0₾.
- Standalone "New Company?" link (not via submit) still behaves as a pure inquiry — no
  booking created.
- Winery notification + customer confirmation emails both carry the new copy (see
  `vault/MyToDo.md` for the live-send checklist).
