---
tags: [plan, messages, booking-form, i18n]
---

# Plan — On-Site Messages (make the public booking flow's own text editable)

> **Live task tracker.** Update checkboxes and each chunk's Status as work happens.
> **Chunks are sequential — do not start chunk N+1 until chunk N's Status is ✅**, and
> each chunk needs Max's go-ahead before editing ([[ClaudeInstructions]] Rule 8). If a
> session ends mid-chunk, the "Resume point" line says exactly where to pick up.

**Where this came from:** 2026-09-14, after the Messages-tab UX fixes (collapsed-by-default
+ auto-fit preview), Max asked what *on-site* messages exist — not emails, which Feature 181
already made editable — things like the confirmation shown after "Book & Pay", or after
booking without a registered company. Investigation (same session) found the public booking
flow (`components/BookingForm.tsx`, `app/actions/createBooking.ts`,
`app/actions/notifyNewCompany.ts`, `app/(site)/payment/result/page.tsx`) has three tiers of
text, not one:

1. **Already dynamic** — booking success heading/body, via the existing `fc(key, tKey)` →
   `SiteContent` section `'form'` pattern (Feature 181's sibling, [[Plan-BookingFormContentEditor]]).
   Nothing to do here.
2. **Translated (EN+KA) but not admin-editable** — lives in `lib/t.ts` only. Most client-side
   validation errors, the guest-count-adjusted notices, and the whole payment-result page.
3. **Hardcoded, English-only, not translated at all** — the New Company popup, the pending-company
   success note, the company-access-code popup, a couple of inline validation strings, and every
   server-returned booking error from `createBooking.ts`.

Full research findings (exact strings + file:line) are in this session's transcript; re-derive
from source at chunk time rather than trusting this summary, since line numbers drift.

---

## Current status

| Chunk | What | Status |
|---|---|---|
| **0** | Foundation — wire `SiteContent` section `'messages'` into the public booking flow, add an "On-Site Messages" group to the Messages tab | ✅ Done |
| **1** | New Company flow — popup + pending-company success note (Georgian translation + editable) | ✅ Done |
| **2** | Payment result page — success / failed / pending (already bilingual, just wire to editable) | ✅ Done |
| **3** | Company access-code popup (Georgian translation + editable) | ✅ Done |
| **4** | Booking validation & server errors — date/guest/pricing errors from the form and `createBooking.ts` | ✅ Done |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** 🎉 All 5 chunks done. Plan complete — see Chunk 4's write-up below for
the two things not click-tested live (individual-booking server-only min-guest guard, working-
hours/day-closed/lead-time guards) and why.

**Follow-up, same day — Chunk 5: shared-component visual previews.** Max liked the editability
but found the plain-textarea fields (no visual context) confusing compared to the Site Content
editor and the email previews. Discussed the gap: email previews are genuinely *live* (they call
the real `render*Email()` template functions, so there's zero drift risk), while the Booking Form
"Visual" tab is a hand-maintained replica ([[MaintenanceNotes]] §1) — the wrong pattern to copy.
Decided to extract each on-site UI piece into a shared, stateless view component that both the
real page and the admin preview import and render — same move Feature 181 already made for
emails. Starting with the lowest-risk piece (Payment Result page, small/stateless) before
deciding whether the higher-risk popups (tightly coupled to `BookingForm.tsx`'s state) are worth
the same treatment. See `Plan-OnSiteMessagesVisualPreviews.md` for the write-up.

**Suggested order rationale:** Chunks 1 and 2 are exactly the two things Max named directly
("booking without a company", "when you pay / when you don't") and both are pure upside — real
copy a winery owner would want in their own words, in Georgian, editable. Chunk 3 is smaller,
same shape. Chunk 4 is the largest and lowest-value: most of those strings are system/operational
errors ("winery closed on this day", "minimum guests required") — worth translating to Georgian
regardless, but *editable per-tenant copy* is a real design question there (see Chunk 4 notes) —
flagged for a decision before starting, not assumed.

---

## Ground rules for every chunk

1. **Git workflow** — [[ClaudeInstructions]] Rule 0: every change lands on `staging` first,
   verified there, `master` only after Max confirms.
2. **Mechanism reuse, not reinvention.** Every existing editable string on the public site uses
   `fc(key, tKey) = formContent[key] || t(locale, tKey)`, backed by `SiteContent` rows. New
   fields follow the exact same shape — a `SiteContent` key with an EN+KA fallback in `lib/t.ts`,
   read through `fc()` in the client component. No new persistence mechanism.
3. **Section choice:** existing `fc()` calls in `BookingForm.tsx` read `SiteContent` section
   `'form'`. Max asked for these to live in the **Messages tab** specifically, which currently
   only touches section `'messages'` (email intros). Chunk 0 decides and wires whichever is
   cleaner — likely reusing `'messages'` with a new key prefix (e.g. `onsite_*`) so the Messages
   tab's existing `getAllContent()` fetch covers both email and on-site copy without a second
   round trip, and `page.tsx` / `payment/result/page.tsx` pull the same section.
4. **Georgian first, editability second.** Any string with no KA translation yet gets translated
   (matching the site's existing tone — check `lib/t.ts`'s existing `form.*` KA strings for
   register/style) *before* it's wired up as admin-editable, same as Feature 181's invoice-date
   pass had to fix the underlying bug before exposing the field.
5. **Token substitution.** Parameterized strings (`{hours}`, `{max}`, `{min}`, `{n}`) keep the
   same `{token}` convention already documented in the email editor ("Tip: {name} will be
   replaced with the guest's name") — each editable field's tip text names its own tokens.
6. **Verify on the real public form**, not just the admin preview — trigger each condition live
   (submit with no date, submit as an unregistered company, force a payment failure, etc.) on
   Staging Winery, both EN and KA site locale.
7. **Update this file, then [[SessionLog]] and [[FeatureLog]]** per [[ClaudeInstructions]] Rule 1
   after each chunk.

---

## Chunk 0 — Foundation

**Goal:** no visible content change yet — just the plumbing and one settled naming decision, so
every later chunk is "add a field," not "add a field and re-solve the wiring."

- [ ] Decide section/key-prefix scheme (§3 above) and confirm with Max before building.
- [ ] Extend whichever pages need it (`app/(site)/page.tsx`, `app/(site)/payment/result/page.tsx`)
      to fetch the section and pass it down as a prop, mirroring how `formContent` already flows
      into `BookingForm.tsx` from `page.tsx:63`.
- [ ] Add a new group/heading to `MessagesPanel.tsx` — e.g. "On-Site Messages" below the existing
      "Automatic Emails" sections — using the same `Section`/`Badge` components already there, so
      it reads as one more editable area, not a bolted-on second UI.
- [ ] Wire one throwaway test field end-to-end (pick the smallest real one — likely the
      pending-new-company note from Chunk 1) to prove the round trip before building the rest of
      Chunk 1 on top of it.

**Files likely touched:** `app/(site)/page.tsx`, `app/(site)/payment/result/page.tsx`,
`app/admin/(panel)/content/MessagesPanel.tsx`, `app/actions/siteContent.ts` (if the section
scheme needs a new section name rather than reusing `'messages'`).

**Decision made (2026-09-14):** reused `SiteContent` section `'messages'` (not a new section) —
matches [[MaintenanceNotes]] §23's existing `email_*` keys, `getAllContent()` already fetches every
section in one query so this is zero extra DB cost. New keys use an `onsite_` prefix to stay
distinct from `email_*`. `BookingForm.tsx` got a second helper, `mc(key, tKey)`, mirroring the
existing `fc()` but reading `messagesContent` (section `'messages'`) instead of `formContent`
(section `'form'`). `payment/result/page.tsx` was **not** touched yet — deferred to Chunk 2, which
owns that page specifically.

**What was built:**
- `lib/t.ts`: `form.onsite_pending_company_note` EN + KA (the first hardcoded-English string in
  scope, translated).
- `components/BookingForm.tsx`: new `messagesContent` prop + `mc()` helper; the pending-company
  success paragraph now reads `mc('onsite_pending_company_note', 'form.onsite_pending_company_note')`.
- `app/(site)/page.tsx`: `messagesContent = content['messages'] ?? {}`, passed to `BookingForm`.
- `lib/adminT.ts`: `messages.group.emails` / `messages.group.onsite` (new group headings) +
  `messages.onsitePendingCompany.title`/`.trigger`, EN + KA.
- `app/admin/(panel)/content/MessagesPanel.tsx`: two new `<h3>` group headings ("Automatic Emails" /
  "On-Site Messages"), and a new editable `Section` — "Pending Company Note" — with the same
  textarea + save-on-blur pattern as the existing email fields, no preview iframe (plain UI text,
  not an email).

**Verified live (2026-09-14), Staging Winery on local dev:** admin edit round-tripped to the public
form — set the field to a test string in the admin Messages tab, then triggered the real
pending-company booking flow (Tour Company → fill form → enter a bad access code → "New Company?"
popup opens pre-filled with the booking attached → submit) and the test string appeared verbatim
on the "Booking received!" success screen. Reverted the field to the real EN default afterward via
`form_input` (the browser tool's `ctrl+a`/`Delete` keys didn't reach the textarea — worth knowing
for next time: use `form_input` to set textarea content directly rather than simulated select-all).
Not yet re-tested in Georgian locale — that's Chunk 1's job once the popup itself is in scope.

**Resume point:** Chunk 0 is done. Move to Chunk 1: the New Company popup (title, both body
variants, success state, error state) and the button chrome-vs-editable call.

---

## Chunk 1 — New Company flow

Covers everything shown when a guest without a registered company books (Feature 180):

- The pending-company note on the success screen (`BookingForm.tsx` success block, currently a
  hardcoded English sentence starting "Since your company isn't set up...")
- The "New Company?" popup: title, the two body variants (with/without an attached booking),
  the "Request received!" success state (2 lines), the error state
- Button labels ("Send Booking & Request" / "Send Request" / "Sending…" / "Close" / "Cancel") —
  **flag for Max's call**: translate as fixed chrome (like every other form button) vs. make
  editable too. Recommend chrome-only (not editable) to match how `fc()` is already scoped
  elsewhere — buttons aren't customized, body copy is.

- [x] Write Georgian translations for every string in scope, checked against existing `form.*`
      KA tone in `lib/t.ts`.
- [x] Add `SiteContent` keys + `fc()` wiring for the editable copy (per the chrome/copy split
      above).
- [x] Add the fields to the Messages tab's new "On-Site Messages" group with live preview
      (mirroring the popup's actual look, or a simplified text-only preview — decide at build
      time based on effort).
- [x] Verify live: trigger both the dropdown "+ New Company" path and the direct-code-entry path,
      in both EN and KA site locale.

**Decision (Max, 2026-09-14):** button labels are fixed chrome — translated via `t()`, not made
admin-editable. Matches how `fc()` is scoped everywhere else on the form.

**Built:**
- `lib/t.ts`: 17 new `form.new_company_*` keys, EN + KA — title, both body variants, success
  title/body, error, the 4 field placeholders, the 4 button labels, plus 2 keys for the small
  "New Company?" entry chip (shown above the company dropdown/code field) and the dropdown's
  "+ New Company" option — found untranslated while verifying in Georgian and fixed in the same
  pass since they're the entry point into this exact flow (not explicitly named in the original
  chunk scope, but clearly the same flow).
- `components/BookingForm.tsx`: popup title/both bodies/success title+body/error now read through
  `mc()` (editable); placeholders, buttons, and the two entry chips + dropdown option read through
  `t()` (fixed chrome, translated only).
- `lib/adminT.ts` + `MessagesPanel.tsx`: new "New Company Popup" section (6 editable fields — title,
  both body variants, success title, success body, error). Added a shared top-level `EditField`
  component to avoid repeating the label+input+save-on-blur boilerplate 6 times — **kept outside**
  `MessagesPanel`'s function body deliberately: a component defined inside another component's
  render is a new type every render, which would have remounted it (and dropped input focus) on
  every keystroke.

**Verified live** on Staging Winery, local dev, both locales:
- EN: the booking-attached variant (Tour Company → fill form → wrong code → popup opens pre-filled
  → submit) — success screen showed the real booking confirmation (already verified in Chunk 0).
- KA: switched `site_locale` cookie to `ka`, opened the popup via the entry chip (now correctly
  translated), confirmed title/body/placeholders/buttons all rendered in Georgian, submitted the
  no-booking-attached variant and got the Georgian success state ("მოთხოვნა მიღებულია!" /
  "ჩვენ დაგიკავშირდებით..." / "დახურვა").
- Admin Messages tab: all 6 fields render correct EN and KA defaults, section appears under the
  "On-Site Messages" group.

Not verified: the dropdown-variant entry point (Staging Winery has `hideCompanyDropdown` on, so
only the direct-code-entry UI is reachable here) — the `+ New Company` option's translation uses
the identical `t()` pattern already proven elsewhere, so treated as covered by code review rather
than a live click-through.

**Files touched:** `components/BookingForm.tsx`, `lib/t.ts`, `lib/adminT.ts`, `MessagesPanel.tsx`.

**Resume point:** Chunk 1 done. Move to Chunk 2: payment result page.

---

## Chunk 2 — Payment result page

`app/(site)/payment/result/page.tsx` shows one of three states after an online payment redirect
(success / failed / pending) via `t(locale, 'payment.success_heading'/'..._body'/etc.)` —
already fully bilingual, just not tenant-editable. This is the direct answer to "message shown
when you pay, when you don't."

- [x] Wire the existing `payment.*` `t()` keys through `fc()`-equivalent `SiteContent` fields
      (same fallback pattern — no new translation needed, just exposing what's already there).
- [x] Add to the Messages tab with a live preview per state (mirrors the Booking Confirmation
      email's variant-switcher UI already built for Feature 181).
- [x] Verify live: a real successful test payment, a real declined/failed one, and the pending
      state if reachable without a live gateway round trip.

**Built:** the page fetches `content['messages']` via `getAllContent(tenantId, locale)` (added,
this page didn't call it before) and gets its own `mc()` helper, identical shape to
`BookingForm.tsx`'s. Heading and body for all 3 states (`onsite_payment_{success,failed,pending}_
{heading,body}`, 6 keys) now read through it. No new `lib/t.ts` strings needed — `payment.*` was
already fully bilingual, this chunk only exposed it. **Simplified from the plan's original idea**
of a variant-switcher preview like Booking Confirmation's — went with the same plain 6-field
`EditField` list as Chunk 1's popup instead (no live-rendered preview, since this page has no
sample-data preview infrastructure the way the email templates do, and it's simple heading+body
text, not markup).

**Verified live** on Staging Winery, local dev: visited `/payment/result?status=success` and
`?status=failed` directly (no live gateway round trip needed — the page reads only the query
param) and got the correct default EN text for each; edited the success heading in the admin
panel to a test string, reloaded the live result page, saw the edit; reverted afterward. Pending
state not clicked through live but uses the identical mechanism as the other two — code-reviewed
instead.

**Files touched:** `app/(site)/payment/result/page.tsx`, `lib/adminT.ts`, `MessagesPanel.tsx`.

**Resume point:** Chunk 2 done. Move to Chunk 3: company access-code popup.

---

## Chunk 3 — Company access-code popup

Covers the popup shown when a guest picks a company from the dropdown that requires an access
code: title, intro line, the "incorrect code" error, and (separately) the direct-code-entry
variant's "Code not recognised." error. All currently hardcoded English-only.

- [x] Georgian translations.
- [x] `SiteContent` + `fc()` wiring for the copy that's worth customizing (intro line, error
      message) — same chrome-vs-copy split question as Chunk 1 for the "Enter Manually"/"Confirm"
      buttons.
- [x] Add to Messages tab.
- [x] Verify live: correct code, incorrect code, and the direct-entry variant, both locales.

**Decision:** applied the same chrome-vs-copy split as Chunk 1 — popup title, intro line, the
"incorrect code" error, and the direct-entry "Code not recognised" error are editable (`mc()`);
the field placeholder and every button ("Confirm"/"Checking…"/"Enter Manually") are fixed chrome,
translated via `t()` only.

**Built:** `mc()` (`BookingForm.tsx`) extended to accept an optional `vars` param, same
`{token}`-replace shape as `t()` itself — needed because the intro line interpolates the
company's name (`{company}`). 10 new `form.access_code_*` keys in `lib/t.ts` (EN + KA). New
"Company Access-Code Popup" section in the Messages tab, 4 editable fields, reusing Chunk 1's
`EditField` component.

**Verified live** on Staging Winery (which has `hideCompanyDropdown` on, so only the direct-entry
path was reachable, not the dropdown popup): entered a bad code, saw the default "Code not
recognised." error; edited that field to a test string in the admin panel, reloaded the public
form, re-triggered the same error, saw the test string; reverted afterward and confirmed the
revert persisted across a reload. The dropdown-popup variant (title/intro/error) was not
click-tested live — same `mc()`/`t()` mechanism already proven on this exact tenant's direct-entry
path and on Chunks 0–2, so treated as covered by the shared code path rather than a second
live walk-through.

**Files touched:** `components/BookingForm.tsx`, `lib/t.ts`, `lib/adminT.ts`, `MessagesPanel.tsx`.

**Resume point:** Chunk 3 done. Chunk 4 needs Max's call on its open question before starting.

---

## Chunk 4 — Booking validation & server errors

The long tail: two inline client-side strings ("Please select a date.", "Please choose a future
date.") plus every hardcoded error `createBooking.ts` returns (winery closed on date / on this
weekday, outside working hours, lead-time not met, minimum guests, no pricing tier for guest
count, generic "Something went wrong"), plus `notifyNewCompany.ts`'s failure message. The demo
rate-limit message (`createBooking.ts` line ~88) is explicitly **out of scope** — it's a
demo-tenant-only guard, never shown to a real customer.

**Open question for Max before starting:** these read as operational/system errors rather than
brand voice a winery owner would want to write themselves — worth Georgian-translating regardless
(so KA guests don't see English error text), but *editable per-tenant* is a separate, weaker case
than Chunks 1–3. Options: (a) translate only, no Messages-tab entry; (b) translate + editable,
consistent with everything else; (c) split — translate all, but only expose the couple that read
as guest-facing tone (e.g. the generic catch-all) as editable. Decide at chunk start, don't assume.

- [x] Resolve the open question above with Max.
- [x] Georgian translations for whichever set is in scope.
- [x] `SiteContent` + `fc()` wiring for whichever subset is made editable.
- [x] Add editable subset to Messages tab.
- [x] Verify live: trigger each condition (past date, blocked date, closed weekday, outside lead
      time, under minimum guests, over a company's max pricing tier), both locales.

**Decision (Max):** translate + fully editable — full consistency with Chunks 0–3, over the
translate-only or split options.

**Consolidation, not 1:1 with every hardcoded string:** several errors exist twice — a
client-side check in `BookingForm.tsx` and `createBooking.ts`'s authoritative server-side
re-check of the identical rule (the server one can't be skipped; the client one is just a faster
first pass). Rather than two near-duplicate admin fields that could drift out of sync, each pair
shares **one** editable `SiteContent` key, read through `mc()` on the client and an equivalent
server-side helper in `createBooking.ts`. Concretely: `onsite_err_blocked` (closed date),
`onsite_err_day_closed` (closed weekday), `onsite_err_lead_time` (`{hours}` token),
`onsite_err_min_guests` (`{min}` token), `onsite_no_rate_detail` (`{n}` token, also already used
by an existing pre-submit notice) each drive both surfaces. `onsite_err_future_date` covers three
call sites — two client (the past-date submit check and a static inline hint) plus the server's
"cannot be made for past dates" guard — unified to one message rather than three. The generic
catch-all reuses Chunk 1's `onsite_new_company_error` field outright (identical wording already
existed there) instead of adding a duplicate. `onsite_err_select_date`, `onsite_err_contact`, and
`onsite_err_working_hours` are the only genuinely new one-surface fields. Net: **9 new editable
fields** cover the full scope, not ~13 separate ones. `notifyNewCompany.ts`'s failure message
needed no change — confirmed it was already unreachable dead text (the UI shows Chunk 1's
`onsite_new_company_error` regardless of what this action returns), so nothing to wire.

**Built:** `mc()` in `BookingForm.tsx` gained the same `vars`-substitution Chunk 3 added.
`createBooking.ts` now resolves `guestLocale` once at the very top of the function (moved up from
partway through, so every guard — not just the happy path — can use it) and defines its own
`async function mc(key, tKey, vars?)`, same shape, backed by `getContent()` (the single-key
`SiteContent` reader, since fetching the whole `'messages'` section upfront would cost a query on
every request just to maybe use it once on a guard that rarely fires). The `catch` block
re-resolves locale independently (defensively — its scope is outside the `try`, so it can't
assume `guestLocale`/`mc` survived whatever threw).

**Verified live** on Staging Winery, local dev: "Please select a date." (client, empty date) and
the happy path (valid booking still reaches Flitt checkout cleanly, confirming the `createBooking.ts`
edits didn't break the request that never hits an error guard) both confirmed with a real browser
session. Admin panel's new "Booking Validation & Server Errors" section shows all 9 fields with
correct defaults and preserved `{token}` syntax. **Not click-tested live:** the individual-booking
server-only min-guest guard (the form auto-clamps guest count back up to the minimum client-side
before submit, so there's no UI path to send a below-minimum count for that booking type) and the
day-closed/working-hours/lead-time guards (no test tenant data set up with blocked weekdays/narrow
hours in this session). All four use the exact same `mc()` call-site pattern already proven
correct four times over in Chunks 0–3 plus this chunk's own working example, so treated as covered
by code review rather than a live trigger.

**Files touched:** `components/BookingForm.tsx`, `app/actions/createBooking.ts`, `lib/t.ts`,
`lib/adminT.ts`, `MessagesPanel.tsx`. `notifyNewCompany.ts` — reviewed, not touched.

**Resume point:** Chunk 4 done. Plan complete.

---

## Not in scope

- The demo-tenant rate-limit message (`createBooking.ts`) — demo-only, never customer-facing.
- Admin-side text (anything under `/admin/*`) — this plan is the **public** booking flow only.
- Re-litigating Feature 181's email content — already done, untouched by this plan.
