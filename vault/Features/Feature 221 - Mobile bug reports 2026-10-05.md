---
tags: [feature, mobile, admin]
---

# Feature 221 — Mobile fixes from Max's annotated screenshots (2026-10-05)

Source: nine iPhone screenshots with comments, `vault/BugReports-2026-10-05/`. Proposal and reasoning:
[[Plan-MobileBugReports-2026-10-05]]. Before/after evidence: `BugReports-2026-10-05/repro/` and `after/`.
**Status: built on `staging` working tree, NOT committed. Needs Max's check on a real phone.**

## What changed (user-facing)

| # | Where | Before | After |
|---|---|---|---|
| 1 | Settings → Payment details (+ Lead Time, Visit Duration, Working Hours) | Label (192px) + value + pencil on one line; IBAN and its pencil ran off the card | On phones the label sits above the value; nothing wider than its card at 390 and 320px. Desktop unchanged |
| 2 | Settings → Closed Days; Wine Orders filters | Blank unexplained boxes (iOS shows an empty date input as nothing) | Shared `DateInput`: `DD/MM/YYYY` hint, calendar icon, small "Date" / "From" / "To" labels. Search box gained a magnifier |
| 3 | Wine Orders → Pack, phone | 300px side panel left the order list 38px wide | One-column list of tappable rows + a bottom bar (orders · bottles · boxes, **Details**, **Print**). Desktop keeps the side panel |
| 4 | Orders → Calendar, phone | Tap = preview flash then navigate away | Tap selects the day; its bookings list under the calendar; each row opens the order; "View in table" keeps the old jump. Mouse devices unchanged (hover preview, click navigates) |
| 5a | Orders list, phone | Old card (accent bar, glyph marks, ~177px) | Card from the Booking Views "Grid of cards" reference: name + sub-line, status pill, date/time, Individual/Company tag, guests / masterclass / food icons, payment chips, total (~156px). Status pill is no longer tappable on the phone card — change status on the order's page |
| 5b | Wine Orders → Cards, phone | Full desktop-style card per order | Compact card in the same style; tap opens the full card in place (flow-line = status changes) and "Details ▾" closes it |
| 6 | Wine Orders (all views) | Delivered orders faded to 55% even if unpaid | Fade only when **Delivered and Paid** (or Cancelled). Delivered-unpaid stays full contrast with an amber **Unpaid** chip on cards, table, board and pack |
| 7 | Companies, phone | Text Edit / Delete on their own line (119px/row) | 40px pencil / trash icon buttons beside the name (~95px/row). Desktop keeps the words. Delete confirmation wraps onto its own line |

## Design decisions worth keeping

- **Tenant font and colours win.** The reference mockup's sans-serif was ignored; only its layout was taken.
- **Reused `components/DateInput.tsx`** (built for the public form after Bug #39) instead of a new component. Side effect: the admin
  Wine Orders filter is now DD/MM/YYYY like the rest of the site (audit item 7 of 2026-10-02, for those fields).
- **Hover vs touch is decided by the input device** (`(hover: hover) and (pointer: fine)`), not by width — in `CalendarView`.
  Phone-vs-desktop *components* (wine card, Pack bar) are decided by width in JS (`useIsPhone`) so only one copy is in the DOM.
- **Fade rule moved from the process axis to both axes** (`isInactiveOrder`, `WineOrdersClient.tsx`). It also drives list sorting
  and the "recently inactive" animation, so a delivered-unpaid order no longer sinks to the bottom; marking it paid does it.
  Reverses the old comment's reasoning ("being owed money is not a reason to keep it in the packing queue") — Pack mode
  already excluded Delivered, so nothing is lost.

## Files touched

`settings/SettingsClient.tsx`, `wine-orders/WineOrdersClient.tsx`, `wine-orders/PackingView.tsx`, `orders/CalendarView.tsx`,
`orders/OrdersTable.tsx`, `companies/CompaniesClient.tsx`, `lib/adminT.ts` (new keys: `settings.closedDays.dateLabel/reasonLabel`,
`packing.selectHint/details/selectAll`, `orders.calendar.tapHint/viewInTable` — EN + KA, parity 1147/1147).

## Double-check pass (2026-10-07, before commit)

Screenshots of every changed screen in English and Georgian at 390px, plus 320px and desktop 1280px — in
`BugReports-2026-10-05/final/`. It found **two real defects in my own work, both fixed**:
1. The Pack summary bar was `sticky`; opened at the top of the page it extended 106px below the visible screen (Print off-screen).
   Now `fixed` with a spacer under the list. Measured after: bar bottom 652 of 664, Print visible.
2. Georgian Closed Days: the "Reason (optional)" placeholder was cut off beside the long Georgian button. The field now takes its own row on phones.
Also confirmed: no horizontal overflow anywhere at 390/320, calendar select / deselect / month-change reset behave, language restored to EN, zero page errors.
Pre-existing quirks noticed, NOT caused by this work, left alone: Georgian "Pack" tab label wraps under its emoji; at 320px a long company name wraps beneath its chevron; the Individuals row's "?" is slightly clipped at 320px.

## Not done / limits

- Georgian wording of the 9 new keys is drafted, not native-reviewed.
- Real iPhone Safari was not available: date-field rendering and tap feel are confirmed only in headless Chromium (iPhone 13 emulation).
- The phone booking card lost its inline status menu on purpose (Max, 2026-10-05). `MaintenanceNotes` tap-target table updated.
- Companies row is ~20% shorter, not half: the ID / "Code set" / "tiers · orders" meta still takes two lines. Moving them behind the
  chevron would halve it — not done without asking.

## What to test (on a phone)

1. Settings → scroll to Payment details: IBAN fully visible; tap pencil, type, save. Closed Days: tap the date, picker opens.
2. Orders → Calendar: tap a day with bookings → list appears under the grid and stays; tap a row → order opens.
3. Orders list: tap a card → order opens. Check a Company booking and an Individual one, a paid one, one with balance due.
4. Wine Orders: Cards (tap a card, change a status, "Details ▾" to close), Delivered filter (unpaid not faded), Pack (select two, Details, Print), Board → Filters (From/To labelled).
5. Companies: pencil opens edit; trash shows the confirm line; confirm text fits.
6. Georgian: switch the admin language and repeat 1, 3, 4.
