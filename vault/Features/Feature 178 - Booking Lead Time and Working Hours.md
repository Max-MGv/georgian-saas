---
tags: [feature, booking, settings]
---

# Feature 178 - Booking Lead Time and Working Hours

## What it does

Two new admin-configurable booking rules, both under Settings:

1. **Booking lead time** — minimum hours ahead a guest must book. Default: single
   value (3h) applies to every visit type. A toggle splits it into two separate
   values: Wine Tasting (default 3h) and Tasting + Lunch (default 6h).
2. **Working hours/days** — when the winery accepts bookings. Default: one
   open/close time (12:00–18:00) applies to every day. A toggle switches to
   custom per-day hours, where each of the 7 weekdays can have its own
   open/close time or be marked fully closed.

Both apply to the public booking form's date/time picker (available time slots
shrink accordingly, and fully-closed days show the same "winery is closed"
treatment as a manually blocked date) and are enforced again server-side in
`createBooking.ts` — the client-side filtering is UX only, not the real gate.

## Key design decisions

- **No schema migration.** Both features are stored as `Setting` rows (the
  existing generic key/value table, see `vault/MaintenanceNotes.md` §9), not new
  Prisma models — same pattern as `min_guests_tasting` etc.
- **Shared helper, not duplicated logic.** `saas/lib/bookingHours.ts` is the one
  place that knows how to resolve a day's hours, generate hourly slots, and
  check lead time. `BookingForm.tsx` (client) and `createBooking.ts` (server)
  both import it. This was deliberate after `vault/MaintenanceNotes.md`'s
  repeated lesson about two hand-written copies of the same logic drifting —
  see §1 (BookingForm/admin panel) and §15 (demo theme colors).
- **Weekly hours stored as one JSON blob**, not 7×3 separate Setting keys
  (`working_hours_days_json`, a `WeeklyHours` array indexed `Date#getDay()`
  Sun=0…Sat=6). Kept it to one key to avoid 21 near-identical Setting rows;
  `parseWeeklyHours()` falls back to the uniform hours on any parse failure or
  missing/malformed entry, so a corrupt value degrades to "same hours every
  day" rather than breaking the booking form.
- **Slot generation is hourly, on the hour**, matching the pre-existing
  hardcoded `TIME_SLOTS` (`11:00`…`18:00`). `generateHourlySlots()` rounds the
  configured open time up and the close time down to the nearest hour — a
  winery that sets `12:30`–`18:00` gets slots `13:00`…`18:00`. There is no
  half-hour slot support; adding it would mean changing the slot generator and
  the `<select>` in `BookingForm.tsx`, not just the settings.
- **Seeding per-day hours on first toggle-on.** When an admin turns on custom
  per-day hours for the first time (`working_hours_days_json` still empty),
  `SettingsClient.tsx` seeds all 7 rows from the current uniform open/close
  rather than showing blank/default rows — see `handleHoursCustomToggle`.

## Files touched

- `saas/lib/bookingHours.ts` — new, the shared resolution logic
- `saas/lib/settings.ts` — new `SETTING_DEFAULTS` entries (see below)
- `saas/components/BookingForm.tsx` — replaced hardcoded `TIME_SLOTS` +
  "past hour today" check with `slotsForDate()`, driven by the new props;
  added closed-day messaging alongside the existing blocked-date messaging
- `saas/app/actions/createBooking.ts` — server-side enforcement: closed day,
  outside working hours, and lead-time guards, added right after the existing
  blocked-date guard
- `saas/app/(site)/page.tsx` — reads the new settings (already inside the
  existing `getAllSettings()` call, no new query) and passes them to
  `BookingForm`
- `saas/app/admin/(panel)/settings/SettingsClient.tsx` + `page.tsx` — two new
  panels ("Booking Lead Time", "Working Hours"), mirroring the existing
  Booking Rules section's layout/style
- `saas/lib/adminT.ts`, `saas/lib/t.ts` — new admin labels and public error
  strings, EN + KA (per `ClaudeInstructions.md` rule 6/`MaintenanceNotes.md`
  §1's seed-both-locales lesson — these are `adminT`/`t`, not `SiteContent`,
  so there's no separate seed script to run)

## Setting keys (defaults)

| Key | Default | Meaning |
|---|---|---|
| `booking_lead_split` | `false` | on = separate lead times per visit type |
| `booking_lead_hours` | `3` | single mode |
| `booking_lead_hours_tasting` | `3` | split mode, Tasting |
| `booking_lead_hours_tasting_lunch` | `6` | split mode, Tasting + Lunch |
| `working_hours_custom` | `false` | on = per-day hours |
| `working_hours_open` / `working_hours_close` | `12:00` / `18:00` | uniform mode, every day |
| `working_hours_days_json` | `''` | `WeeklyHours` JSON, custom mode only |

## Edge cases handled

- Lead time spanning midnight (e.g. it's 23:00 and lead time is 6h): the check
  is a real instant comparison (`minBookableInstant` + `slotMeetsLeadTime`),
  not a same-day hour filter, so it correctly blocks early tomorrow slots too
  — the old hardcoded logic only ever compared against "today's current hour".
- A day fully closed (custom mode) shows the same closed-day message whether
  it was already selected when hours changed, or selected fresh — checked in
  both the `<DateInput>` render and `handleSubmit`.
- Server-side re-validates independent of the client: working hours, closed
  day, and lead time are all re-checked in `createBooking.ts` against the
  tenant's live settings, not trusted from the client payload.

## What to test

- Toggle split lead time on/off on staging; confirm the single vs. two-field
  UI swaps and each value round-trips (reload the settings page after saving).
- Toggle custom working hours on; confirm all 7 days seed from the prior
  uniform hours, then mark one day closed and confirm that weekday is
  unbookable on the public form.
- On the public form, pick a date/time inside the lead-time window and confirm
  submission is rejected both client-side (slot not offered) and if forced via
  a direct `createBooking` call with a too-soon time.
- Confirm Georgian locale shows translated section titles/labels for both new
  panels and error messages.
