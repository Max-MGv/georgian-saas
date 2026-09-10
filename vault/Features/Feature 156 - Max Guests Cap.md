---
tags: [feature, booking]
---

# Feature 156 — Optional Per-Tenant Max Guests Cap

## What it does

Mirrors the existing "min guests" setting with a "max guests" counterpart, for wineries that need to cap how large a single visit can be.

- Two new optional `Setting` keys: `max_guests_tasting`, `max_guests_tasting_lunch`. Blank/unset = no cap (unlike min-guests, which always has a hardcoded default of 4 — a blank max is a real, intentional "no limit" state).
- Editable in Admin → Settings → Booking Rules, right next to the existing Min Guests fields, same inline edit/save interaction.
- **Never shown on the public booking form.** The guest-count field's only visible hint stays "(minimum X)" — no max hint, no UI change pre-submit.
- Enforced entirely server-side in `createBooking.ts`, and deliberately handled differently per booking type:
  - **Individual bookings** over the cap are silently **clamped down** to the max before the booking is saved (recomputing price off the clamped count) — the booking still succeeds. The success screen then shows a note telling the customer their count was adjusted.
  - **Company bookings** are **never altered** — Max's reasoning: companies don't pay in advance, so there's no need to hard-clamp their numbers. Instead, if their guest count exceeds the cap, they just see an informational heads-up that groups over that size will be confirmed with them directly.

## Key design decisions

- **Why clamp individuals but only notify companies:** confirmed directly with Max — individual (self-service, often paying) bookings need a hard backend limit since there's no human reviewing them before they're confirmed; company bookings already go through manual confirmation regardless, so a soft notice is enough and avoids silently changing a number a tour operator submitted on a client's behalf.
- **Why blank means "no limit" instead of some default number:** the min-guests setting always has a floor (nobody wants zero-guest bookings), so defaulting it to 4 makes sense. A max has no equivalent universal default — most wineries have no upper limit at all, so introducing one by default would silently start rejecting/adjusting bookings for tenants who never asked for a cap.
- **Why nothing shows pre-submit:** Max's explicit request — the cap is a backend safety valve, not a customer-facing constraint to negotiate around before they even try.
- **No schema/migration needed:** `Setting` is already a generic tenant key-value table (`getSetting`/`updateSetting`), so this is pure application logic — no `prisma migrate` step, no RLS changes.

## Files touched

- `saas/app/actions/createBooking.ts` — fetches the relevant max setting (TASTING vs TASTING_LUNCH split, same as min-guests), clamps for INDIVIDUAL / flags for COMPANY, extends `BookingResult`'s success shape with `guestCountAdjustedTo`, `guestCountOverMax`, `guestCountMax`.
- `saas/app/admin/(panel)/settings/SettingsClient.tsx` — new Max Guests rows in the Booking Rules table, `handleBookingRuleSave` generalized to handle both min and max keys (max allows a blank value, min still clamps to ≥1).
- `saas/app/admin/(panel)/settings/page.tsx` — fetches and passes the two new settings down.
- `saas/components/BookingForm.tsx` — shows the adjustment note (individual) or over-max notice (company) on the success screen, using the server response.
- `saas/lib/adminT.ts` — new admin-panel labels (EN+KA): `settings.bookingRules.tastingMax`, `tastingLunchMax`, `maxHint`.
- `saas/lib/t.ts` — new customer-facing strings (EN+KA): `form.guest_count_adjusted`, `form.guest_count_over_max_notice`.

No `FIELDS.form` entry or `seed-ka.ts` row was needed — per `MaintenanceNotes.md` §1, that pattern is for tenant-editable `SiteContent` labels; this feature's text is code-level `t.ts`/`adminT.ts`, the same treatment the existing min-guest error/warning text already gets.

## Edge cases handled

- Blank max on one visit type (e.g. Tasting+Lunch) while the other has a real cap — each is independent, confirmed via a real unclamped booking against the blank one.
- Clamping recomputes `totalPrice` off the clamped guest count, not the originally-submitted one — verified in the DB (7 guests submitted, capped at 3, `totalPrice` matches 3× the per-person rate, not 7×).
- Clamp applies before both the online-checkout-redirect branch and the reservation-only branch in `createBooking.ts` — verified both paths.
- Company bookings are checked against the same TASTING/TASTING_LUNCH-derived cap as individuals but their guest count (including the enhanced Tasting+Lunch split sum) is never mutated.

## What to test

- Set a low max for one visit type, submit an individual booking over it — confirm DB-stored guest count and price are both clamped, and the success screen shows the adjustment note in the active locale.
- Same, for a company booking — confirm the DB is unchanged and the notice appears without altering numbers.
- Leave a max blank — confirm no clamping/notice happens at all, in either booking type.
- Inspect the rendered public-form DOM (not just visually) in both locales to confirm no trace of the max leaks out before submission.
