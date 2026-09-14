---
tags: [plan, messages, visual-preview]
---

# Plan — On-Site Messages: shared-component visual previews

> **Live task tracker.** Update checkboxes and each piece's Status as work happens. Pieces are
> ordered lowest-risk first — do not start piece B until piece A is verified, per
> [[ClaudeInstructions]] Rule 8 (confirm before editing non-trivial changes).

**Where this came from:** 2026-09-14, immediately after finishing [[Plan-OnSiteMessages]] (all 5
chunks). Max: "I like that we can edit stuff, but is there any way we can also have visual
indicators? [...] the site content editor... is visual and intuitive, the email editor is also
easy and intuitive — but the rest seems confusing."

## The diagnosis

Two existing editors feel intuitive for different reasons, and the new On-Site Messages fields
(plain label + textarea, no visual context) have neither:

- **Automatic Emails section** (`MessagesPanel.tsx`) is genuinely *live* — it calls the real
  `render*Email()` template functions from `lib/emails/templates/`, so the preview **cannot**
  drift from what actually sends. This is the Feature 181 pattern: markup lives in one pure,
  side-effect-free render function; both the real send path and the admin preview import it.
- **Site Content's "Visual" tab** (`BookingFormVisualPanel.tsx`) *looks* live but isn't — it's a
  hand-built replica of `BookingForm.tsx` that has to be manually kept in sync field-by-field.
  [[MaintenanceNotes]] §1 already documents this as an ongoing risk (`FIELDS.form`,
  `buildBookingPayload()`, the Simple/Detailed variant split all have to move together by hand).
  It reads as trustworthy but structurally isn't — the "one drifts, the other doesn't" difference
  is invisible to whoever's looking at it.

**Decision:** copy the email pattern (a shared, stateless view component both callers render),
not the Visual-tab pattern (a hand-maintained mockup) — for exactly the reason the Visual tab is
flagged as a risk in the first place.

## Sequencing — lowest risk first

| Piece | What | Risk | Status |
|---|---|---|---|
| **A** | Payment Result page → `PaymentResultView.tsx` | Low — small, already near-stateless server component | ✅ Done |
| **B** | New Company popup → `NewCompanyPopupView.tsx` | High — tightly coupled to `BookingForm.tsx`'s state (~15-20 props: `companyId`, `newCoStatus`, handlers, etc.); this exact file already caused 2 production crashes this cycle ([[KnownBugs]] #33/#34) from a careless split | ✅ Done |
| **C** | Access-code popup → `AccessCodePopupView.tsx` | High — same coupling risk as B | ⬜ Not started |
| — | 9 validation-error strings | Not pursued as full mockups — they're one-line inline messages under a form field, not whole screens. Low value for the effort of a per-field mockup. If wanted later: a single generic "preview chip" (styled like the real red inline error, live text, no attempt to place it under a specific field) rather than 9 bespoke mockups. | Not planned |

**Why B and C are gated on a separate go-ahead, not bundled with A:** the popups' JSX currently
closes directly over live component state and async handlers in `BookingForm.tsx` — the exact
file where a previous careless refactor (splitting `notifyNewCompany.ts`'s exports) took down
*both* the booking submission and the New Company flow in production. Extracting requires turning
every one of those closures into an explicit prop without missing one, and re-verifying all the
popup flows live afterward. Worth doing, but deliberately not bundled with the low-risk piece.

---

## Piece A — Payment Result page ✅

**Built:** `saas/components/PaymentResultView.tsx` — a pure component (no hooks, no `'use client'`,
safe to import from a server or client component) taking `kind`, `heading`, `body`,
`contactPhone?`, `backHomeLabel`, and a `preview?` flag. `preview` does two things: shrinks the
`min-h-[60vh]` wrapper to a sane size inside an admin card, and swaps the real `<Link href="/">`
for an inert `<span>` so clicking it in the admin panel doesn't navigate away.

- `app/(site)/payment/result/page.tsx` — now just resolves `kind`/content/`contactPhone` and
  renders `<PaymentResultView ... />`. No markup left in the page itself.
- `MessagesPanel.tsx`'s "Payment Result Page" section — reworked from a flat list of 6 fields
  (heading+body × 3 states shown all at once) to match the Booking Confirmation email's existing
  pattern: a 3-way pill switcher (Success/Failed/Still checking) showing one state's Heading +
  Message fields at a time, with a live `<PaymentResultView preview />` card underneath that
  updates on every keystroke — using the tenant's real winery phone for the failed/pending sample.
- Removed the now-unused per-variant adminT labels (`successHeading` etc.), replaced with generic
  `headingLabel`/`bodyLabel` (the pill switch changes which variant they refer to, same as the
  email section's single `messageLabel` already does).

**Verified live** on Staging Winery, local dev: the real `/payment/result?status=success` and
`?status=failed` pages render unchanged through the new shared component (byte-identical output,
just routed through `PaymentResultView` instead of inline JSX). Admin preview: pill switch
correctly swaps both the field values and the live preview; typing in the Heading field updates
the preview card instantly; edited a field to a test string, watched the preview reflect it,
reverted, and confirmed via a fresh reload that the default persisted correctly (not the test
string) and the real public page was never affected by the unsaved draft state.

**Files touched:** `components/PaymentResultView.tsx` (new), `app/(site)/payment/result/page.tsx`,
`app/admin/(panel)/content/MessagesPanel.tsx`, `lib/adminT.ts`.

---

## Piece B — New Company popup ✅

**Built:** `saas/components/NewCompanyPopupView.tsx` — a pure component (no hooks, no `'use client'`)
taking `includesBooking: boolean` and `status: 'idle' | 'submitting' | 'sent' | 'error'` **as two
separate props, not one `variant` enum** — a deliberate deviation from this plan's original rough
shape. In the real popup those two axes are independent (an error can occur in either the
with-booking or no-booking flow, and the body text + button label depend on `includesBooking` even
while an error is showing), so collapsing them into a single 4-value enum would have lost
information `BookingForm.tsx`'s real usage needs — exactly the fidelity loss this whole plan exists
to avoid. Also takes the 6 `mc()`-driven content strings (title, bodyWithBooking, bodyNoBooking,
successTitle, successBody, errorMessage), the 4 field values with optional `onXChange` handlers, an
optional `onSubmit`/`onClose`, a `labels` object for the locale-fixed strings (placeholders, button
text), and `preview?: boolean`. `preview` swaps the real `fixed inset-0` modal overlay for a plain
inline card and swaps the submit/cancel/close buttons for inert `<span>`s — same technique as
Payment Result's inert CTA link.

- `BookingForm.tsx` — the "New Company popup" JSX block (previously inline, lines ~598-654) is now
  a single `<NewCompanyPopupView ... />` call; every prop maps 1:1 to an existing state
  variable/handler (`newCompanyIncludesBooking`, `newCoStatus`, `newCoName`/`setNewCoName`, etc.) —
  no behavior changed, only where the markup lives.
- `MessagesPanel.tsx`'s "New Company Popup" section — added a 4-way pill switcher (With booking /
  No booking / Success / Error) above the existing field list, matching Payment Result's pattern.
  Each pill shows only the fields relevant to that state (body text for with/no-booking, success
  heading+message for Success, error text for Error) instead of all 6 fields at once, plus a live
  `<NewCompanyPopupView preview />` card underneath using `SAMPLE_GUEST` data. A `NEW_COMPANY_PREVIEW`
  lookup table maps each pill to its `{ includesBooking, status }` pair — e.g. the Error pill
  previews `includesBooking: false` (arbitrary; the error message shows either way).
- `adminT.ts` — added `messages.onsiteNewCompany.variant.{withBooking,noBooking,sent,error}` pill
  labels, EN + KA.

**Verified live** on Staging Winery, local dev server (hideCompanyDropdown is on for this tenant, so
the direct-entry variant was what's reachable — same caveat already on record for piece C's
dropdown case):
- **Admin preview:** all 4 pills switch both the field list and the live preview card correctly
  (checked With booking, No booking, Success, and Error screenshots); typing into the Error
  message field updated the preview instantly; reverted without blurring so nothing was saved.
- **No-booking popup** (standalone "New Company?" chip, EN): filled in company/contact/phone,
  submitted, got the real "Request received!" success screen with a working Close button.
- **Booking-attached popup** (Tour Company → filled a full valid booking, direct-entry code left
  empty → clicked "Request Booking"): popup opened pre-filled with contact name/phone from the
  form, correct with-booking body text and "Send Booking & Request" button label; filled in the
  company name and submitted — booking was created **and** the company request sent in one action,
  landing on the real "pending company" success screen (`pendingNewCompany` branch of
  `handleSubmit`). Confirms `buildBookingPayload()` still carries every field through this path.
- **Georgian locale:** switched the site to KA, repeated the standalone popup — title, body,
  placeholders, and the "მოთხოვნის გაგზავნა" button all rendered correctly through the same
  component.
- `npx tsc --noEmit` clean before and after.

**Files touched:** `components/NewCompanyPopupView.tsx` (new), `components/BookingForm.tsx`,
`app/admin/(panel)/content/MessagesPanel.tsx`, `lib/adminT.ts`.

## Piece C — Access-code popup ⬜

Not started. Same shape as B: `AccessCodePopupView.tsx`, `variant: 'entry' | 'error'`, the intro
line's `{company}` token resolved against a sample company name in preview mode.

---

## Not in scope

- The 9 validation-error strings as full mockups (see table above — low value for the effort).
- Touching `BookingFormVisualPanel.tsx` itself to make it genuinely live — that's the Visual tab's
  own pre-existing risk, out of scope for this plan, though worth a future look given the pattern
  proven here.
