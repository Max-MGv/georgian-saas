---
tags: [feature, emails, admin]
---

# Feature 181 — Automatic Messages page

2026-09-13. Follow-on from `Research-DynamicContentEditing.md`, scoped down after discussion with Max: not full email-body editing (deferred), just a catalog page showing every automatic message with a live preview, and — where it makes sense — a small editable "your message" slot, following the exact pattern `invoice_email_message` already used.

## What it does

New page: **`/admin/messages`** ("Messages" in the admin nav, between Site Content and Settings). One collapsible row per automatic email:

| Row | Editable? | Setting key |
|---|---|---|
| Booking Confirmation | Yes | `booking_email_message` (new) |
| Wine Order Receipt | Yes | `wine_receipt_email_message` (new) |
| Invoice Email | Yes | `invoice_email_message` (pre-existing — same key Settings already used) |
| New Booking Alert | No — "Fixed content" | — |
| New Company Request | No — "Fixed content" | — |

Booking Confirmation additionally has a 3-way variant switch (Booking request / Paid booking / New company request) — the same shared message text is previewed against each of the template's three copy branches.

Bug-report notification was deliberately left off this page entirely — it goes to Max, not to or from any tenant, so it isn't part of a tenant's admin surface.

## Key design decision: pure render functions, client-side preview

Every email file (`lib/emails/*.ts`) used to build HTML and call `sendTenantEmail()` in one function — there was no way to get the HTML without sending real mail. Each was split in two:

- `lib/emails/templates/*Template.ts` — a new pure `render*Email(data): { subject, html }` function. No server-only imports (no `resend`, no DB, no `'use server'`) — safe to import directly into a `'use client'` component.
- The original file (`lib/emails/bookingConfirmation.ts` etc.) now just calls the template function, then `sendTenantEmail()` — same external signature, same behavior, for every existing caller (`createBooking.ts`, `settle.ts`, `notifyNewCompany.ts`).

Because the render functions are pure and importable client-side, `MessagesClient.tsx` calls them directly in the browser on every keystroke — the preview iframe updates with zero network round trip. Saving is separate: on blur, the existing `updateSetting()` server action persists the value, exactly like the Settings page's invoice message box already did.

**If you change an email's HTML**, edit the template file in `lib/emails/templates/`, not the wrapper — the wrapper no longer contains any markup.

## The two new message slots

`booking_email_message` and `wine_receipt_email_message` follow `invoice_email_message`'s exact shape: a single flat `Setting` value per tenant (no locale split, no schema change), inserted into the template as one optional paragraph right after the email's fixed intro line, rendered only if non-empty. Unlike `invoice_email_message` (admin-typed fresh per send, never HTML-escaped — unchanged, out of scope here), these two are **escaped** (`escapeHtml()` in each template) before interpolation — they're a *persisted* default reused on every future automatic email, so the blast radius of a stray `<` is every future email until noticed, not just one hand-typed send.

`createBooking.ts` fetches `booking_email_message` and passes it as `customMessage`. `settle.ts` fetches both `booking_email_message` (paid booking confirmation) and `wine_receipt_email_message` (wine receipt) via its existing `getAllSettings()` call — no new DB round trip there, just two more keys pulled from the map it already had.

## Why New Booking Alert / New Company Request stay fixed

Both go to the winery's own `contact_email` — they're internal ops alerts ("a booking came in", "someone wants a company account"), not something a customer ever sees. There's no brand-voice reason to make them editable, so they render preview-only with a "Fixed content" badge instead of a message box.

## Files touched

New:
- `lib/emails/templates/bookingConfirmationTemplate.ts`
- `lib/emails/templates/wineOrderReceiptTemplate.ts`
- `lib/emails/templates/invoiceEmailTemplate.ts`
- `lib/emails/templates/newBookingNotificationTemplate.ts`
- `lib/emails/templates/notifyNewCompanyTemplate.ts`
- `app/admin/(panel)/messages/page.tsx`
- `app/admin/(panel)/messages/MessagesClient.tsx`

Edited:
- `lib/emails/bookingConfirmation.ts`, `wineOrderReceipt.ts`, `invoiceEmail.ts`, `newBookingNotification.ts` — extracted to call their template
- `app/actions/notifyNewCompany.ts` — same
- `app/actions/createBooking.ts`, `lib/payments/settle.ts` — fetch + pass the two new message settings
- `lib/settings.ts` — `SETTING_DEFAULTS` entries for the two new keys
- `app/admin/(panel)/layout.tsx` — nav link
- `lib/adminT.ts` — `nav.messages` + `messages.*` strings, EN + KA

## What to test

- [x] Typecheck clean (`npx tsc --noEmit`)
- [x] All 5 rows render and expand/collapse on staging dev server
- [x] Typing in a message box updates the preview instantly (verified on Booking Confirmation)
- [x] Save-on-blur persists — confirmed by full page reload showing the typed message still there
- [x] Invoice row correctly shows the tenant's real, pre-existing `invoice_email_message` value
- [x] Booking Confirmation variant switch changes preview copy (unpaid/paid/pending-company)
- [ ] Max to test: actually place a booking / pay / order wine on staging and confirm the real sent email matches what the preview showed
- [ ] Max to test: edit a message here, then edit the *same* invoice message from the Settings page, confirm they share state (same key)

## Known follow-on (not built, out of scope for this pass)

Per `Research-DynamicContentEditing.md`, the bigger ask — full super-admin-default + tenant-override editing across all content, not just these two email slots — is still open and unplanned. This feature is deliberately narrow: preview everything, editable slot only where it was cheap and safe (customer-facing, single-paragraph, no conditional-HTML risk).
