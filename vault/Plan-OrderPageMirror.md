---
tags: [plan, admin, orders, T-215]
---

# Plan — the order page mirrors the booking form (T-215, part 2)

**Status:** ✅ **ON PRODUCTION since 2026-10-24** (master `1a34c4e`; staging check by Claude in Brave, tier 5 7/7, live read-only check, release note draft on the production board). Earlier: on staging 2026-10-24 (`d495774`, T-215 Ready to test; tier-5 post-payment-extras passed on staging) (Max: "go ahead and build that" — all recommendations taken: company
changeable before payment, one Name box, lines edited in place, day-first dates). Testing → staging → T-215 review card.

**What was built:**
- Every card (Booking Info, Contacts, Guest breakdown, Masterclass, Extras) read-only until the **red pencil**
  (Settings icon); one card at a time; shared Save / Cancel; "Saved" note per card. Order total stays computed.
- **Booking Info:** `DateInput` (DD/MM/YYYY), time (`slotOptions`), **Company** select (Individual + booking companies),
  **nationality** (`NationalityPicker`, company + tenant switch), notes → new action `updateOrderBooking` — a company
  change is refused once paid, re-priced with `adminQuote` from the new table (Individuals table for an individual;
  refused if the guests are not individual-shaped); picked contact links cleared (individual: contact rows removed).
- **Contacts:** New Order's block — `ContactRoleFields` per contact type with "Choose the …" from the company's people
  (`useContactSelection` asAdmin, new `prefill()` to start from the recorded contacts), one Name box → new action
  `updateOrderContacts` (rewrites rows via `writeOrderContacts`, copies the contact person into Order.name/…).
  Individual: the booker.
- **Guest breakdown:** summary in view mode; the existing fields + `updateOrderEnhanced` in edit mode; pencil hidden once
  paid (lock note stays).
- **Masterclass / Extras:** view = plain lines; edit = quantity / label + amount boxes saved by new actions
  `updateMasterclassLine` (keeps the sold price) / `updateOrderExtra` (history: removed + added, `edited: true` —
  no new enum value); add / remove still act at once inside edit mode.
- **Side panel:** one Name box (`splitFullName`) + `DateInput`; `updateOrder` no longer requires a surname.
- **New Order:** `DateInput` too (dates day-first on every order screen).
**Max (2026-10-24):** "everything that can be inputted must be editable as well. the orders page should mirror the
booking section. before editing anything lets review how it does not mirror it. and the mirroring should also include
the easy picking for guides and stuff supporting autofill like experience."
**Already on staging (part 1, `0be1aea` + `8eee877`):** Booking Info → Edit (date, time, notes), Contacts → Edit
(contact person name / phone / email), side-panel note → order page, shared time slots.

## Review — what a booking can be entered with vs what the order page can change

Screens compared: public booking form (`components/BookingForm.tsx`), admin New Order
(`orders/new/NewOrderForm.tsx`), order page (`orders/[id]/OrderDetail.tsx`), as of `8eee877`.

| What | Public form | Admin New Order | Order page today |
|---|---|---|---|
| Individual or company | toggle | the Company dropdown ("Individual" option) | ❌ fixed after booking |
| Company | dropdown + access code | dropdown | ❌ only "Link company" on an order that has none (Feature 180) |
| Nationality tags (company, if enabled) | picker | same `NationalityPicker` | ❌ not shown at all |
| Visit type | tiles | select | ✅ (Guest Breakdown) |
| Guests per product / guest count | boxes | boxes (`GuestFields`) | ✅ same `GuestFields` |
| Typed rates (company without a price row) | — | ✅ | ✅ |
| Date | day-first picker, closed days | native date box | ✅ native date box (part 1) |
| Time | from opening hours | fixed list | ✅ fixed list + the order's own time (part 1) |
| Contact person name | **one Name box** | **one Name box** (`splitFullName`) | ⚠ First + Last boxes (part 1 copied the side panel) |
| Contact person phone / email | ✅ | ✅ | ✅ (part 1) |
| **Choose the contact person from the company's people → autofill** | popup picker | "Choose the …" dropdown | ❌ |
| **Guide and every other contact type** (name / phone / email) | ✅ one block per type | ✅ `ContactRoleFields` per type | ❌ read-only list |
| **Choose the guide etc. from the company's people → autofill** | popup picker | dropdown per type | ❌ |
| Hot dish (veg / meat), off without a lunch guest | ✅ | ✅ | ✅ |
| Food notes | ✅ | ✅ | ✅ |
| Internal notes | — | ✅ | ✅ (part 1) |
| Masterclass add-ons | add with quantity | add lines | ⚠ add / remove only — an existing line's quantity can't be changed |
| Extra charges | — | add | ⚠ add / remove only — can't be edited |

**Not mirrored on purpose (guest-facing, New Order already leaves them out):** access code step, "New Company?" request,
closed days / opening hours / lead time / min-max checks, payment step, emails.

**How New Order does the picking (to reuse):** `page.tsx` loads the tenant's contact types + each company's people;
`rolePicker(role)` renders "Choose the {role}" with the company's people for that role; picking fills name / phone /
email (`pickFor`), typing over it keeps the typed values (`setTypedContact`); every type renders through
`components/ContactRoleFields.tsx`. On save `createOrderAdmin` writes `OrderContact` rows (role, `personId` when picked,
name / phone / email snapshots) and copies the contact person into `Order.name/surname/phone/email`.

## Proposed build (after Max's answers)

1. **One "Contacts" editor = New Order's contact block:** Contact Person + every contact type through
   `ContactRoleFields`, each with the "Choose …" dropdown of the order's company's people (autofill), one Name box.
   New server action (e.g. `updateOrderContacts`) that rewrites the order's `OrderContact` rows with the same rules as
   `createOrderAdmin` (shared helper, not a copy) and keeps `Order.name/surname/phone/email` in step. Past orders keep
   their snapshot (`personId` SetNull rule, KnownBugs #56).
2. **Nationality tags** on the order page (shown + editable, same gate and validation as New Order).
3. **Company / booking type** editable (see Q1).
4. **Masterclass and extras** lines editable in place (see Q3).
5. Side panel follows (one Name box) so the two edit screens match; MaintenanceNotes §32/§37 updated; QA spec + screenshots.

## QA pass (2026-10-24, after Max asked "did you test adding and removing stuff, edge cases, like a QA tester?")

Honest answer at the time: no — only scripted happy paths + a few edge cases. Then a 31-case edge-case pass through the
real UI (`saas/tests/_qa/t215-qa-edge.spec.ts`, untracked; report in `tests/_qa/shots/t215-qa/report.json`), every case
reproduced step by step before fixing (`t215-debug-*.spec.ts`). **Real findings, all fixed:**
1. **31/02 saved as 3 March** — `new Date('2027-02-31')` rolls over. Shared `lib/isoDate.ts` (`isIsoDate`) on every admin
   order-date write (+ wine orders, which had its own copy) and in `DateInput` (a complete impossible date now reports
   "" → "Please choose a valid date." instead of silently keeping the old date behind the typed text).
2. **Masterclass quantity 2.5 silently became 2** (`parseInt`) — `Number()` now, refused with the server's message.
3. **Cancel did not undo adding / removing a masterclass line or extra** (they saved at once) — now drafts until Save;
   Save applies the difference against a snapshot (each step written into the snapshot, so a retried Save never repeats
   one); Cancel restores. New line quantity checked before it is added.
4. **A removed (picked) guide could come back linked** to the old person — the editor prefilled from props that lag the
   refresh, and the picker hook carried state between edits. `updateOrderContacts` now returns what it wrote; the page
   keeps `contactsNow`; opening the editor resets + prefills synchronously, then loads the people with
   `resolve(…, { keepSelection: true })`.
5. **Cards showed old values for seconds after Save** (router.refresh lag, 7–8 s on the dev DB) — a card now stays on
   "Saving…" until the refresh has landed (`useTransition`), then closes.
Also (Max): empty contact types and empty notes / food notes / nationality show "—" before editing.
Final: QA 31/31, mirror 3/3, admin-orders + contact-orphan-safety green, `test-contact-resolution` 27/27.

## Max's decisions (2026-10-24)

- **D-1 — click Edit to edit, on every card** (Booking info, Contacts, Guest breakdown, Masterclass, Extras): read-only
  until the edit icon is clicked, one card at a time, Save / Cancel. Guest breakdown loses its always-open fields.
- **D-2 — the edit control is the red pencil icon, not text:** the Settings one (`SettingsClient.tsx`, `#9b090c`, the
  "square + pencil" path, no border, hover opacity). Replaces part 1's "Edit" text button.
- Mockup shown in chat 2026-10-24 (interactive: pencils open each card; Contacts pickers fill name / phone / email).

## Questions for Max

- **Q1 — changing the company or individual ↔ company on an existing order:** it re-prices from the new company's table
  (or the Individuals table). Recommendation: allow on unpaid orders, locked once paid (same as guests today).
- **Q2 — contact person name:** one Name box like the booking forms (recommended), on the order page and the side panel.
- **Q3 — masterclass / extras:** edit an existing line's quantity / amount in place (recommended), or keep remove + re-add.
- (Separate, already an open item: admin date boxes show month-first in English — fix in this plan or leave?)
