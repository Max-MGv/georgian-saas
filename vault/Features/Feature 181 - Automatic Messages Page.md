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

## Follow-up (same day, 2026-09-13): the intro itself became the editable text

After seeing the page live, Max asked why the editable slot was a bolt-on
extra note instead of the actual greeting/intro paragraph being editable —
"Dear Ana," + the thank-you line, with the guest's name substituted. Agreed
and rebuilt:

- **`customMessage` → `introText`** on `bookingConfirmationTemplate.ts` and
  `wineOrderReceiptTemplate.ts`. The old fixed `<p>Dear ${name},</p>` line is
  gone — the greeting now lives *inside* the editable default text itself,
  e.g. `'Dear {name},\n\nThank you for your booking request...'`.
- **`{name}` token substitution** — `lib/emails/templates/tokens.ts`,
  `renderTokenizedText(template, vars)`, reusing the same `{varName}`
  convention `lib/t.ts` already uses elsewhere, rather than inventing new
  syntax. Escapes both the template and every substituted value.
- **Booking Confirmation kept its three separate defaults** rather than
  merging into one — `booking_email_intro_unpaid` / `_paid` /
  `_pending_company` — because the three variants are factually different,
  not just differently worded (confirmed vs. not). The Messages page textarea
  now swaps which setting it's bound to when the variant tab changes.
  `booking_email_message` / `wine_receipt_email_message` (this morning's
  first pass) were replaced outright by `booking_email_intro_unpaid` /
  `_paid` / `_pending_company` / `wine_receipt_email_intro` — no migration
  needed, nothing had been saved against the old keys beyond test data on
  staging.
- Defaults are pre-filled with **today's actual copy**, exported as
  `DEFAULT_BOOKING_INTRO_UNPAID` etc. from the template files and imported
  into `lib/settings.ts`'s `SETTING_DEFAULTS` — so the box is never empty on
  first visit, matching what Max asked for ("whats already typed in the
  editor... is what goes in the editor").
- The pending-company variant's original default relied on an inline
  `<strong>` tag for emphasis ("**this request is not yet confirmed**").
  Since the box is now a plain, escaped `<textarea>` (not rich text), that
  emphasis was dropped from the default wording rather than silently
  breaking if a tenant edits the paragraph — consistent with how
  `EditableText` treats every other admin-editable string as plain text.

## Follow-up 2 (2026-09-14): folded into Content, invoice went bilingual

Max asked why locale support wasn't there for the new message boxes, then
proposed moving the whole "Messages" feature under `/admin/content` so it
could share the page's existing EN/KA toggle — and, so the Invoice box would
actually mean something under that toggle, asked to make the invoice email
itself bilingual (it had been Georgian-only, always, since it was first
built). Both done:

**Messages is now a Content tab, not a standalone page.**
`/admin/messages` is deleted. `app/admin/(panel)/content/MessagesPanel.tsx`
is the new home — same 5 rows, same live preview, same variant tabs, now
rendered as one more section inside `ContentClient.tsx` (`SectionKey` gained
`'messages'`) and driven by the page's own locale toggle instead of its own.
Persistence moved from `Setting` (flat, no locale) to `SiteContent` (section
`'messages'`, real `locale` column) — `saveContent()`/`getContent()`/
`getAllContent()` instead of `updateSetting()`/`getSetting()`/
`getAllSettings()`. This is *why* the move was worth doing: `SiteContent`'s
schema already had the locale split every other Content tab uses; `Setting`
never did.

**New keys** (replacing `booking_email_intro_unpaid`/`_paid`/
`_pending_company`/`wine_receipt_email_intro`/`invoice_email_message`
outright — those were only ever test data from the same day, no migration
needed for them): `email_booking_intro_unpaid`, `email_booking_intro_paid`,
`email_booking_intro_pending_company`, `email_wine_receipt_intro`,
`email_invoice_message` — each now has both an EN and a KA default,
exported from its template file (`DEFAULT_..._KA` alongside the existing
English ones).

**⚠️ The Georgian defaults are drafted, not native-reviewed.** Flagged
inline in both template files. Same treatment `legalContent.ts` got before
its Georgian went live — worth a real pass before this reaches production
tenants who'll actually read it.

**⚠️ Migration gap, check before merging to master:** the *old*
`invoice_email_message` Setting value (whatever a tenant had typed via the
Settings page box, now removed) is not copied anywhere — nothing reads that
Setting key anymore. On this dev tenant it happened to coincidentally match
the new coded default ("მადლობთ სტუმრობისთვის!"/"Thank you for visiting!"),
so the switch was invisible here. **Check whether Nikalas Marani (prod) has
a real custom value in `Setting.invoice_email_message` before merging** — if
so, either hand-copy it into the new Content → Messages → Invoice box once,
or write a 5-line one-time script that reads the old Setting row and
`saveContent()`s it into `email_invoice_message`/`ka` for every tenant that
has one.

**Invoice email is now genuinely bilingual**, not just Georgian with an
English label sitting oddly under a toggle. `invoiceEmailTemplate.ts` gained
a `LABELS: Record<'en'|'ka', {...}>` dict covering every static string
(section headers, field labels, "Total amount", the person-count unit) and
a `locale` field on `InvoiceEmailData` (default `'ka'`, preserving prior
behavior for any caller that doesn't pass one). Date format also branches:
`ka` keeps the existing dot format (`12.09.2026`) via `'ka-GE'`; `en` uses
`'en-GB'` slash format (`12/09/2026`) — same numeric compactness, locale-
appropriate separator.

**Someone has to pick the language at send time** — there's still no
`Order.locale` column (see the original Feature 181 gap), so:
- **Booking Confirmation / Wine Order Receipt** — `createBooking.ts` reads
  the guest's own `site_locale` cookie (same one the checkout-language branch
  already used) for the reservation-only path. `settle.ts` runs from a
  payment webhook with no cookie access, so it falls back to the tenant's
  `default_locale` Setting instead — **the paid-confirmation path uses the
  site's default language, not necessarily the guest's own choice.** Flagged
  as a known, accepted asymmetry rather than fixed by adding an `Order.locale`
  column, which would have been a real schema migration for a gap this small.
- **Invoice Email** — sent manually from Orders, so the admin picks EN/KA in
  a new "Language" toggle in the "Send Invoice by Email" modal
  (`OrdersTable.tsx`), defaulting to Georgian (prior behavior). Switching the
  toggle only replaces the message box's text if it still matches the *other*
  language's default — an admin's own edits are never silently overwritten.
  `OrderDetail.tsx`'s one-click "resend" call passes no locale, so it keeps
  defaulting to Georgian too.

**Files touched (this follow-up):**
New: `app/admin/(panel)/content/MessagesPanel.tsx`.
Deleted: `app/admin/(panel)/messages/` (page + client), the Settings page's
"Emails" section (box + state + handler), `nav.messages` adminT key.
Edited: `ContentClient.tsx`, `content/page.tsx` (winery/theme props),
`invoiceEmailTemplate.ts` (bilingual), `bookingConfirmationTemplate.ts` /
`wineOrderReceiptTemplate.ts` (KA defaults), `createBooking.ts`, `settle.ts`,
`app/actions/orders.ts` (`sendOrderInvoice` locale param), `orders/page.tsx`,
`OrdersTable.tsx` (language toggle), `lib/settings.ts` (removed the now-
obsolete SETTING_DEFAULTS entries), `lib/adminT.ts`.

## Known follow-on (not built, out of scope for this pass)

Per `Research-DynamicContentEditing.md`, the bigger ask — full super-admin-default + tenant-override editing across all content, not just these two email slots — is still open and unplanned. This feature is deliberately narrow: preview everything, editable slot only where it was cheap and safe (customer-facing, single-paragraph, no conditional-HTML risk).
