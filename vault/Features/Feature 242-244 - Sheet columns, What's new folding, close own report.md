---
tags: [feature]
---

# Features 242–244 — Sheet columns (T-151), What's new folding (T-301a), close your own report (T-301b)

Built and shipped 2026-10-27 on Max's go. All code-only, no migration. FeatureLog rows #242, #243, #244. Production: master `e37cff2` (+ card folding in `243d176`).

## 242 — Booking sheet: the admin picks which columns print (T-151)

**What:** the "Print Sheet" preview has a "Columns to print" checkbox row. The preview and the hidden print copy follow it live. The choice is saved **per winery** (whole team, every device) and is separate from the Orders table's on-screen "Columns" (that one is per browser). Nothing is unticked by default, so every sheet looks as before until someone unticks. The date/time column is always printed (not offered). "Kitchen total" was renamed **"Total guests"** (same number: Tasting + Lunch + Tasting & Lunch + Free; internal key still `kitchenTotal`).

**Decisions:** store the HIDDEN keys (default = nothing hidden), so a column added later appears for everyone; one tenant setting `booking_sheet_hidden_columns` (comma-separated), no migration; Max asked for "Total guests incl. free" — the sheet already had that column under another name, so he chose rename, not duplicate.

**Files:**
- `saas/lib/bookingSheetColumns.ts` (new) — the one column list (key + label key), `parseHiddenColumns`, `serializeHiddenColumns`, setting name.
- `saas/app/admin/(panel)/orders/BookingSheetPrint.tsx` — renders from the list (`cellFor` switch), `hiddenColumns` prop.
- `saas/app/admin/(panel)/orders/OrdersTable.tsx` — picker in the preview modal, local state + `updateSetting` (reverts and shows an error if the save fails).
- `saas/app/admin/(panel)/orders/page.tsx` — reads the setting, passes `sheetHiddenColumns`.
- `saas/lib/settings.ts` (default `''`), `saas/lib/adminT.ts` (EN + KA labels).

**Edge cases:** unknown keys in the setting are dropped; a failed save puts the box back; the picker lives in the modal, which the print stylesheet hides (`body > * { display:none }` except the portal), so it never prints.

**Test:** Orders → Print Sheet → untick Contact + Phone → both disappear from preview and print; reload and reopen — still unticked; open from another browser — same; phone width wraps.

## 243 — What's new folded (T-301a)

**What:** on the clients' What's new page each release date is a fold/unfold button (chevron, `aria-expanded`), only the newest release starts open; inside an open release every change card is folded to its title and opens on click (added later the same night). The Super Admin editor and its preview are unchanged (`ReleaseHeading` takes optional `open/onToggle`, `ChangeCard` an optional `collapsible`; only `WhatsNew` passes them).

**File:** `saas/components/WhatsNew.tsx` only (+ the page that feeds it is unchanged).

**Gotcha:** `WHATS_NEW_LABELS` is exported from a client module — a server page must not import and pass it (arrives empty → "Cannot read properties of undefined (reading 'howTo')"); the real page builds labels from `adminT`.

## 244 — Clients can close their own report (T-301b)

**What:** My Reports shows "Close this report" (asks once: Yes, close it / Keep it open) on reports that are New or In progress.
- Alone on its ticket → the ticket is closed as **Obsolete** (timeline actor `reporter`); the client sees "Closed".
- Merged with duplicates (several reports on one ticket) → only that report leaves the ticket (`ticketId = null`, status CLOSED) and a comment is added; the ticket stays open for the others.
- A ticket already **Done** (fixed, waiting to go live) is refused ("already fixed and waiting to go live"). Someone else's report, or an already-closed one, is refused. The user id always comes from the session.
- Max chose "reuse Obsolete" over a new "Withdrawn by client" reason (that would have needed a production migration).

**Files:** `saas/lib/ticketService.ts` (`withdrawReport`), `saas/app/actions/bugReports.ts` (`resolveMyBugReport`), `saas/app/admin/(panel)/my-reports/page.tsx` + `CloseReportButton.tsx` (new), `saas/lib/adminT.ts` (`myReports.close*` EN + KA).

**Not handled (by design):** the production → staging copy has since been cancelled, so nothing needs to follow the close there.

**Test:** `scripts/_qa/_withdraw_report_check.ts --write` (5 cases: alone, someone else's, merged, Done, closed twice — creates and removes its own tickets) + click-through on My Reports with a planted report (`_withdraw_report_ui.ts create|cleanup`). No Playwright spec.

## Not done / follow-ups
- Georgian wording for all of it is Claude's.
- No Playwright specs for any of the three.
- The wording of "Total guests" in KA is "სულ სტუმრები".
