---
tags: [feature, booking-form, admin]
---

# Feature 184 — Booking Confirm Sheet

## What it does

Before a booking is actually sent, the guest now sees a "Review your visit" modal summarizing what they're about to submit: visit type, date, arrival time, an estimated finish time (`~{hours} hrs · plan to finish around {end}`), guest count, name, contact details, and — when the price is known — the total. Two buttons: **Edit details** (closes the sheet, returns to the form with every field intact) and **Confirm & Request Booking** / **Confirm & Book** (actually submits).

The finish-time estimate comes from a new admin-configurable Setting, not a hardcoded guess.

## Design process

Max asked for a confirmation step "so they don't make a mistake," specifically wanting to see options before code was written. Three interactive mockups were built as a single published Artifact (inline reveal / modal confirm sheet / full-screen review step, each with realistic sample data) and presented for review — no BookingForm.tsx changes were made until Max picked a direction. He chose the modal/sheet version, citing consistency with the existing popup pattern already on the site.

## Key design decisions

**Generic rows, not fixed props.** `BookingConfirmPopupView.tsx` takes `visitRows: ReviewRow[]` and `guestRows: ReviewRow[]` (`{label, value}` pairs) rather than named props per field. The simple and enhanced/company booking forms show a different set of details (enhanced has split tasting/lunch/free guest counts, hot dishes, masterclass add-ons) — a fixed prop shape would either lose fields for one variant or grow an optional prop per variant. `BookingForm.tsx` decides what rows to build (see `confirmVisitRows`/`confirmGuestRows` in `handleSubmit`'s scope); the view component only lays them out. Same reasoning `NewCompanyPopupView.tsx` used for keeping `includesBooking`/`status` as two separate props.

**Where the submit logic moved.** `handleSubmit` keeps every existing validation check, in the same order, including the "New Company?" popup check (still runs *last*, before this sheet — a guest who needs both would see the New Company popup first, then this sheet once a real company exists). Once everything validates, `handleSubmit` now calls `setShowConfirm(true)` instead of calling `createBooking()`. The actual submit — building the payload, handling `checkoutUrl` redirects, success/error state — moved into a new `handleConfirmedSubmit()`, fired by the sheet's Confirm button.

**Copy lives under the Messages tab, not the Booking Form tab.** The original plan (presented to and approved by Max before implementation) named `FIELDS.form` in `ContentClient.tsx` — the pattern used by static form field labels. Partway into implementation, a closer architectural precedent was found: this sheet is visually and functionally a sibling of `AccessCodePopupView.tsx` and `NewCompanyPopupView.tsx`, both of whose copy already lives under `SiteContent` section `'messages'` (`onsite_*` keys), edited via `MessagesPanel.tsx`, with a `mc()` helper in `BookingForm.tsx`. That pattern was followed instead: `onsite_confirm_heading`, `onsite_confirm_subheading`, `onsite_confirm_duration_note`, `onsite_confirm_edit`, `onsite_confirm_button`, `onsite_confirm_button_pay`. This also sidesteps a real gap in the `fc()`/`FIELDS.form` pattern: per `MaintenanceNotes.md` §1, `fc()` keys need an explicit `seed-ka.ts` row or the admin's KA toggle silently no-ops, whereas `mc()`'s fallback chain (`messagesContent[key] || t(locale, tKey)`) and `MessagesPanel.tsx`'s own `drafts` initialization (`c.onsite_confirm_heading ?? t(locale, 'form.confirm_heading')`) already resolve Georgian correctly with zero DB rows, because `t.ts` carries both locales directly. No `seed-ka.ts` changes were needed for this feature.

Field labels reused inside the sheet's rows (Visit Type, Date, Guests, First/Last Name, Phone, Email) are **not** duplicated — they read the same `fc()`/`FIELDS.form` keys the live form already uses, so editing "First Name" once updates it everywhere it appears, including this sheet.

**`BookingFormVisualPanel.tsx` gets a note, not a fake field.** Per `MaintenanceNotes.md` §1, an admin-panel control that doesn't actually save anywhere is exactly the "orphaned control" trap the note warns about. Since this sheet's real copy lives in Messages, the Booking Form tab's visual replica got a static explanatory block ("edited on the Messages tab, under 'Booking Confirm Sheet'") instead of an `<EditableText>` wired to a key nothing reads.

**Visit duration is a Setting, not hardcoded.** `visit_duration_tasting` / `visit_duration_tasting_lunch` (minutes, defaults 90/180) follow the exact shape of the existing `booking_lead_hours`/`booking_lead_hours_tasting`/`booking_lead_hours_tasting_lunch` split — same blur-to-save UI pattern in `SettingsClient.tsx`, same `SETTING_DEFAULTS` treatment in `lib/settings.ts`. Two small pure helpers added to `lib/bookingHours.ts` (already the shared home for visit-type-driven booking config): `getVisitDurationMinutes(visitType, tastingMinutes, tastingLunchMinutes)` and `addMinutesToSlot(timeSlot, minutes)`.

**No new database fields.** The duration and finish-time are display-only, computed at render time from the Setting values — the confirmation card doesn't need to persist anything about itself, and neither does the eventual `Order` row.

## Files touched

- `saas/components/BookingConfirmPopupView.tsx` — new, the pure view component
- `saas/components/BookingForm.tsx` — `handleSubmit`/`handleConfirmedSubmit` split, `showConfirm` state, row-building logic, new props for the two duration settings
- `saas/lib/bookingHours.ts` — `getVisitDurationMinutes()`, `addMinutesToSlot()`
- `saas/lib/settings.ts` — `visit_duration_tasting`/`visit_duration_tasting_lunch` defaults
- `saas/lib/t.ts` — EN + KA fallback strings for the sheet's fixed copy (`form.confirm_*`)
- `saas/app/(site)/page.tsx` — reads the two settings, passes to `BookingForm`
- `saas/app/admin/(panel)/settings/page.tsx` + `SettingsClient.tsx` — new "Visit Duration" section
- `saas/app/admin/(panel)/content/MessagesPanel.tsx` — new "Booking Confirm Sheet" section (6 `EditField`s + live preview)
- `saas/app/admin/(panel)/content/BookingFormVisualPanel.tsx` — static pointer block, no fake editable field
- `saas/lib/adminT.ts` — admin-panel-chrome strings (section headers, field labels, hints) for both the Settings section and the Messages section, EN + KA

## What to test

- Full booking flow through to the confirm sheet on both the simple and enhanced/company forms
- "Edit details" returns to the form with every field's value intact (not reset)
- Changing either Visit Duration setting in `/admin/settings` and confirming the public sheet's "finish around" time updates after reload
- The sheet's total row is hidden (not shown as 0 or blank) exactly when the live form's own price preview would also show "price after submission" — never invents a number
- Georgian toggle on the Messages tab's "Booking Confirm Sheet" section, and on the live public form
- Online-payment tenants see "Confirm & Book" (the pay-variant button text); non-payment tenants see "Confirm & Request Booking"
