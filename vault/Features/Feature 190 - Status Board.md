---
tags: [feature, orders, wine-orders]
---

# Feature 190 — Status Board

## What it does

A 4th view on both order screens, grouping orders into columns by status instead of a flat list —
scan the whole pipeline at a glance instead of filtering to one status at a time.

- **Booking Orders** (`/admin/orders?view=board`): `Table / List / Calendar / Board` toggle. Columns:
  New → Confirmed → Invoice Sent → Pending Payment → Paid → Completed → Cancelled, always all 7, even
  empty ones.
- **Wine Orders** (`/admin/wine-orders`): `Cards / Table / Board / Pack` mode switch. Columns: Pending
  → Confirmed → Paid → Delivered → Cancelled, then Awaiting Payment / Payment Failed appended **only
  if they hold something**.

Each column scrolls independently past ~65% of viewport height; the board itself scrolls
horizontally. A card's status pill opens the same dropdown the page's other views already use;
picking a new status moves the card to that column immediately (same optimistic-update pattern as
Table/List/Cards elsewhere). Booking Orders board cards navigate to the order detail page on click
(no detail page exists for wine orders, so those cards are the whole surface).

## Why this shape

Max liked the "Status Board" option from a three-way mockup comparison (Grid Cards / Compact List /
Status Board) built for the 2026-09-16 List view work (Feature 189) — he picked List for booking
orders at the time, then asked afterward to build Board too, for both order types. Full reasoning for
every non-obvious call (why not drag-and-drop, why board cards skip the row-action icons List has, why
the two boards differ on hiding empty limbo columns) is in `Plan-StatusBoard.md` — not repeated here.

## Files touched

- `app/admin/(panel)/orders/ViewToggle.tsx` — `'board'` added to `View`.
- `app/admin/(panel)/orders/page.tsx` — `board` included in the `isTableLike` fetch branch; passed
  through to `OrdersTable`.
- `app/admin/(panel)/orders/OrdersTable.tsx` — new `OrdersBoardColumns` component, reuses the parent's
  `statusMenuId`/`toggleStatusMenu`/`handleStatusChange` (the same portal-rendered dropdown Table and
  List already share) and `router.push`.
- `app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — `'board'` added to `Mode`; new `BoardView`
  component; new `boardOrders` memo (see bug below).
- `lib/adminT.ts` — `orders.view.board`, `orders.board.empty`, `wineOrders.mode.board`,
  `wineOrders.board.wine`/`wines`/`bottles` (EN/KA).

## Real bug found and fixed while verifying live

`BoardView` was first wired to receive `filteredOrders` — the same list Cards/Table use, which
deliberately excludes `pending_payment`/`payment_failed` orders whenever no filter chip is explicitly
selected (`filteredOrders`'s own comment: "Unpaid gateway leftovers are reachable only through their
own tabs"). That rule exists so an undifferentiated list isn't cluttered by permanently-accumulating
payment limbo. The board isn't an undifferentiated list — it already isolates every status into its
own column — so the same rule just left those two columns permanently empty. Confirmed live: 3 real
`pending_payment` orders existed, the board's own "Awaiting Payment" column showed "None."

Fixed with a second memo, `boardOrders`, identical to `filteredOrders` minus that one exclusion line.
`BoardView` also stopped taking a `statusCounts` prop for deciding which limbo columns to show —
it now checks its own (correct) `orders` prop directly (`orders.some(o => o.status === s)`), so the
"should this column render" decision and "what's inside it" decision can no longer point at two
different filtered sets again.

## Second bug found and fixed — QA subagent pass, same day

A subagent asked to QA-test the feature "like a real user" (bugs, loopholes, bad design, brand
continuity) found one real bug: Wine Orders' `BoardView` status dropdown was `position: absolute`
nested inside its own column's `overflow-y-auto` (`maxHeight: 65vh`) container — for a card near or
past that container's bottom, the menu was clipped by its own ancestor badly enough that a hit-test
at the menu's own screen position resolved to nothing. Booking Orders' board never had this because
its dropdown already portals to `document.body` (built earlier for the table/list views' sticky-
column clipping). Fixed by giving Wine Orders' board the same treatment: `statusMenuRect` state,
`toggleStatusMenu()` capturing the trigger's `getBoundingClientRect()`, the identical viewport-edge
flip math Booking Orders' portal uses, one portal render at the bottom of `BoardView` replacing the
per-card inline `<div>`. Verified live — reproduced the clipped/unreachable state, then confirmed the
fix at a taller viewport with a 7-card column scrolled to its last card.

Two lower-priority QA findings, deliberately left as-is: a payment-limbo order's status pill shows
nothing highlighted in its dropdown (pre-existing in `TableView`, not a regression); neither board has
an explicit horizontal-scroll affordance. Full report in `SessionLog.md`'s same-day follow-up entry.

## What to test

- Both boards: column counts match the number of cards rendered under them.
- Status-pill dropdown on a board card changes the order's status and the card moves to the new
  column without a page reload.
- Booking Orders board: all 7 columns always render, including "None" for an empty one; card click
  opens the order detail page; existing filters (date range, company, status, nationality) still
  narrow the board's contents same as Table/List.
- Wine Orders board: Awaiting Payment / Payment Failed columns are absent when empty, present with
  their real orders when not — this is the exact case the live bug above was in.
- `tsc --noEmit` clean (confirmed both before and after the `boardOrders` fix).

**Not yet done:** Max hasn't confirmed in the live UI yet (Claude-tested only). Nothing pushed to
`staging` — that's still a separate step.
