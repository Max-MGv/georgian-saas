---
tags: [plan, orders, wine-orders]
---

# Plan: Status Board view (Booking Orders + Wine Orders)

Max liked the "Status Board" mockup (option C, alongside Grid Cards and Compact List) from the
2026-09-16 Booking Views comparison — he picked Compact List for booking orders at the time, but
asked afterward to build Status Board too, for **both** Booking Orders and Wine Orders.

Mockup reference (the exact design Max approved): Artifact `DVMLBHcyPNsUbKSkEb8FP4`, tab C. Columns
grouped by status, horizontally scrollable, one card per order, click-to-open like every other view.

## Design decisions

1. **A 4th view, not a replacement.** Booking Orders: `ViewToggle` becomes Table / List / Calendar /
   Board (`?view=board`). Wine Orders: `WineOrdersClient`'s mode switch becomes Cards / Table / Pack /
   Board.
2. **Status change via the existing pill-dropdown, not drag-and-drop.** Both files already have a
   proven "click the status pill → dropdown → pick a status" interaction (`OrdersTable`'s portal-based
   menu; `WineOrdersClient`'s `TableView` dropdown with the 5-second confirm/undo). The board reuses
   it verbatim instead of introducing drag-and-drop, which the mockup itself didn't attempt and which
   would be a much larger, riskier addition (real DnD library or hand-rolled HTML5 DnD, touch support,
   a11y) for a feature nobody has asked for yet.
3. **Cards are click-to-open, not full row-action parity.** Booking Orders board cards navigate to
   the order detail page on click (same as Table/List), but — unlike List, which deliberately got full
   print/email/edit/delete icon parity — board cards carry no action icons. A 220px column is too
   narrow for 4 icons without either cramming or wrapping, and the mockup's own framing ("reduced to
   small icons instead of full text") was for the *wider* Grid Cards option, not the board. Anyone who
   needs those actions is one click away via the order detail page, Table, or List.
4. **Booking Orders board always shows all 7 status columns**, including empty ones, matching the
   mockup exactly (New → Confirmed → Invoice Sent → Pending Payment → Paid → Completed, Cancelled at
   the end). Wine Orders board **hides the two payment-limbo columns (`pending_payment`,
   `payment_failed`) when empty**, matching the existing `FilterBar` convention in that file (a limbo
   tab with nothing in it is noise for the common case of a winery not taking card payments) — a
   deliberate difference between the two boards, not an inconsistency.
5. **Existing filters apply unchanged**, including the status filter/tabs. Picking a single status
   while on Board just shows one populated column — no special-casing needed, and it's a legitimate
   way to use the view.
6. **Columns scroll independently** (`max-height` + `overflow-y-auto` per column) so a status with 50
   orders doesn't blow out page height — the mockup only had to handle 1-2 cards per column.
7. **No schema/DB changes.** Purely a new client-side grouping of data both pages already fetch.

## Booking Orders — files touched

- `app/admin/(panel)/orders/ViewToggle.tsx` — add `'board'` to `View`, add the option.
- `app/admin/(panel)/orders/page.tsx` — `SearchParams.view` gains `'board'`; the `view`/`isTableLike`
  computation includes it (same fetch as Table/List); pass `view="board"` through to `OrdersTable`.
- `app/admin/(panel)/orders/OrdersTable.tsx` — new `OrdersBoardColumns` component (sibling to the
  existing `OrdersListRows`), rendered when `view === 'board'`. Reuses the parent's `statusMenuId` /
  `toggleStatusMenu` / `handleStatusChange` (same portal-rendered dropdown already shared by Table and
  List) and `router.push` for click-to-open. `STATUS_CONFIG`'s existing declaration order (NEW,
  CONFIRMED, INVOICE_SENT, PENDING_PAYMENT, PAID, COMPLETED, CANCELLED) is the column order.
- `lib/adminT.ts` — `orders.view.board` (EN/KA).

## Wine Orders — files touched

- `app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — `Mode` gains `'board'`; new `BoardView`
  component (sibling to `TableView`/`PackingTable`), columns = `STAGES` (pending, confirmed, paid,
  delivered) + cancelled, then the two limbo statuses appended only if present. Reuses
  `requestChange`/`confirmChange`/`cancelChange` and `STATUS_COLOR`. No navigation (wine orders have no
  detail page) — the card itself is the whole surface, same fields as `TableView`'s row (business
  name, wine item chips, amount, status pill).
  **New `boardOrders` memo** (separate from `filteredOrders`): identical filters minus the "hide
  limbo unless a tab is picked" rule that `filteredOrders` applies for Cards/Table. Caught live while
  verifying — passing `filteredOrders` to the board left Awaiting Payment/Payment Failed permanently
  empty (3 real pending_payment orders, board showed "None") because that rule exists for an
  undifferentiated list, and the board already isolates every status into its own column.
- `lib/adminT.ts` — `wineOrders.mode.board` (EN/KA).

## Bug found by QA subagent, fixed same day

Wine Orders' `BoardView` status dropdown was `position: absolute` nested inside its own column's
`overflow-y-auto` container — clipped, to the point of being geometrically unreachable, for any card
near the column's bottom edge. Booking Orders' board never had this because its dropdown already
portals to `document.body`. Fixed by giving Wine Orders' board the identical portal treatment. Full
writeup: `Features/Feature 190 - Status Board.md` and `SessionLog.md`.

## Not doing (out of scope unless asked)

- Drag-and-drop status changes.
- A dedicated `data-tour` anchor for the new view (nothing in the existing demo tour references view
  switching within Orders/Wine Orders).
- Pack-mode integration on the wine-orders board (board is for status triage, Pack already exists for
  packing).
