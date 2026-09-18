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
| **C** | Access-code popup → `AccessCodePopupView.tsx` | High — same coupling risk as B | ✅ Done |
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

**Post-piece-B fix (same day, before starting C):** Max asked for a candid review of the piece B
work against single-source-of-truth/best-practice — the one real gap found was the `labels` object
(9 lines of `t(locale, 'form.new_company_*')` calls) being hand-copied verbatim in both
`BookingForm.tsx` and `MessagesPanel.tsx`. Extracted into `lib/newCompanyPopupLabels.ts`
(`buildNewCompanyLabels(locale)`), both call sites now call it instead of restating the object.
`locale` typed as plain `string` there (not `'en' | 'ka'`) to match `t()`'s own signature and
`BookingForm.tsx`'s `locale?: string` prop — a narrower type broke the real caller.

Also surfaced in that review: Playwright test coverage exists in this repo
(`saas/tests/tier2-core-flows/`, etc.) but has **no spec covering the New Company or access-code
popups** — noted as a real gap, not acted on unprompted (see `Not in scope` below).

## Piece C — Access-code popup ✅

**Built:** `saas/components/AccessCodePopupView.tsx` — same pattern as A/B, taking
`status: 'idle' | 'checking' | 'error'` (this popup only has one real axis, unlike B, so the
plan's original `variant: 'entry' | 'error'` shape survived — `'checking'` added as a third status
to cover the loading-label state without losing fidelity), `title`/`intro`/`errorMessage` (the
`mc()`-driven content strings, `intro` pre-resolved with its `{company}` token already substituted
by the caller), `companyName` (raw, for the hidden autofill field only), `code` + optional
`onCodeChange`/`onSubmit`/`onEnterManually`, a `labels` object (placeholder + button text, built by
the new `lib/accessCodePopupLabels.ts` — same dedup pattern as B's fix), and `preview?: boolean`.

**One deliberate difference from A/B:** this component keeps a small piece of **local state** (the
password-visibility eye-icon toggle, `useState` inside the component, `'use client'` at the top) —
the first of the three view components to have any. Payment Result and New Company stayed hookless
specifically so Payment Result could be imported by a server component (`payment/result/page.tsx`);
this component is only ever rendered by two callers that are *already* client components
(`BookingForm.tsx`, `MessagesPanel.tsx`), so that constraint doesn't apply, and the toggle is purely
ephemeral display state with nothing to say to either caller. Flagged as a real change from the
established pattern, not silently introduced.

- `BookingForm.tsx` — the access-code popup JSX (previously inline, a `<form>` with the hidden
  username field, password/eye-toggle input, error paragraph, Confirm/Enter-Manually buttons) is
  now one `<AccessCodePopupView ... />` call. Removed `showCodeText` state entirely (now owned by
  the view component) and the dead `setShowCodeText(false)` reset in the company-selection
  `useEffect` — no longer needed since the popup unmounts/remounts on every `showCodePopup` toggle,
  which resets the view's internal state for free.
- `MessagesPanel.tsx`'s "Company Access-Code Popup" section — added a 2-way pill switcher
  (Entry / Error) above the existing field list. Title + intro fields stay visible for both pills
  (real popup always shows them); the Error-message field only appears under the Error pill. Live
  preview card underneath resolves the intro's `{company}` token against `SAMPLE_COMPANY`
  (`"Beridze LLC"`, already used elsewhere in this file) via `.replaceAll()` — the same substitution
  `mc()` does in `BookingForm.tsx`, done by hand here since `MessagesPanel.tsx`'s drafts are raw
  strings, not run through a `vars`-aware helper. The `"Code not recognised"` field
  (`onsite_access_code_direct_not_recognised`) stays as its own plain `EditField`, unchanged — it
  belongs to the *direct-entry* inline UI (`hideCompanyDropdown` tenants), a completely separate
  code path from this popup that never touches `showCodePopup`.
- `adminT.ts` — added `messages.onsiteAccessCode.variant.{entry,error}` pill labels, EN + KA.

**Verified live** on Staging Winery, local dev server. Staging Winery has `hideCompanyDropdown` on
by default (blocking the dropdown variant), so temporarily toggled it off in Settings for this
verification, tested both variants, then toggled it back on afterward — confirmed via screenshot
before and after that it returned to its original state:
- **Admin preview:** both pills switch the field list and preview card correctly; the eye-icon
  toggle inside the preview card works (reveals `MARANI42` sample code); `{company}` token resolves
  to `Beridze LLC`.
- **Dropdown-popup variant** (temporarily enabled): selected "Test Company # 1" from the dropdown →
  popup opened with `{company}` resolved to the real company name in Georgian; entered a wrong code
  → real `verifyCompanyCode()` round trip, "Incorrect code" error rendered; "Enter Manually" closed
  the popup and reset to Individual Booking type; re-opened, entered the company's real access code
  → "Checking…" state shown, then popup closed and the company was confirmed selected.
- **Direct-entry variant:** already covered by piece B's verification (this tenant's default state);
  not re-tested here since this popup component has no involvement in that code path at all.
- Georgian locale confirmed throughout (all of the above was run with the site in KA).
- `npx tsc --noEmit` clean before and after.

**Files touched:** `components/AccessCodePopupView.tsx` (new), `lib/accessCodePopupLabels.ts` (new),
`components/BookingForm.tsx`, `app/admin/(panel)/content/MessagesPanel.tsx`, `lib/adminT.ts`.

---

## Plan complete — all 3 pieces done (2026-09-14)

## Not in scope

- The 9 validation-error strings as full mockups (see table above — low value for the effort).
- Touching `BookingFormVisualPanel.tsx` itself to make it genuinely live — that's the Visual tab's
  own pre-existing risk, out of scope for this plan, though worth a future look given the pattern
  proven here.
- **Playwright coverage for these 3 popups.** The repo has a real Playwright suite
  (`saas/tests/tier2-core-flows/` etc.), but no spec exercises the New Company or access-code
  popups — found during the post-piece-B review, flagged to Max, not acted on since it wasn't
  asked for and adding test coverage for 3 specific components is a different-shaped task than
  "extract a shared view component." Worth a dedicated pass if wanted: `tier2-core-flows` is the
  right tier for it (real user flows, not admin CRUD smoke-tests).
