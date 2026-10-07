---
tags: [plan, mobile, bugs]
---

# Plan — Max's annotated-screenshot bug reports (2026-10-05)

**Status: ✅ APPROVED 2026-10-07 and BUILT on the `staging` working tree (uncommitted) — see [[Feature 221 - Mobile bug reports 2026-10-05]]. Awaiting Max's check on a real phone.**

**Max's answers (2026-10-07):** tenant font always wins; booking-card status pill NOT tappable but add the same style of view to the wine-order cards; Companies icons on mobile only; Pack = mostly look but keep Print available; calendar = panel under the grid; delivered-unpaid = fade only when delivered AND paid (option A); search icon = my call (added).

New working format: Max takes iPhone screenshots of `staging.vineworks.ge` (Safari), draws on them and types a
comment. Originals live in `vault/BugReports-2026-10-05/` (this folder: `IMG_4604`–`IMG_4612`).

- The iPhone saved them as **HEIC with a `.PNG` extension** (Claude's image reader rejects that). They were converted
  to real PNGs (`IMG_*.png`); the untouched originals are in `originals-heic/`. **Next time: send them as real PNG/JPG,
  or just drop them in the folder — conversion is a one-liner, but worth knowing.**
- Reproduction evidence: `vault/BugReports-2026-10-05/repro/` — screenshots + `repro-2026-10-05.js` (re-runnable; read-only).

**How reproduced.** Headless Chromium, iPhone 13 (390 px, touch), localhost dev server, Staging Winery tenant, signed in
with the suite's own test login. **Caveat:** Max's screenshots are from real iOS Safari on staging. Chromium reproduces
layout and event behaviour exactly; it cannot reproduce Safari's own rendering of `<input type="date">` (item 2) —
that one is confirmed from the code + the screenshot, not from my run.

---

## Summary

| # | Screenshot | Max's comment (verbatim-ish) | Verdict | Size |
|---|---|---|---|---|
| 1 | 4604 | "The last bar goes past the screen (iban)" — Settings → Payment details | ✅ Reproduced | Small |
| 2 | 4605 + 4611 | "Closed days empty bar doesn't make it clear what it is" / "Bars with no clear labeling on mobile" | ✅ Reproduced (code + screenshot) | Small |
| 3 | 4606 | Wine Orders → Pack: "No orders selected" + `??` | ✅ Reproduced — Pack is unusable on a phone | Medium |
| 4 | 4607 | "In mobile if I press to see preview, shows preview for split second and then goes inside, we still want preview to be preview able, suggest way to do so" — Orders calendar | ✅ Reproduced | Medium |
| 5 | 4608 + 4609 | "This image is fine, but … use the image after labeled as mobile view reference image to perhaps build a new one? It seems more readable" | 🎨 Design request, not a bug | Medium–Large |
| 6 | 4610 | "Orders that get mark as delivered get grayed out - but they haven't been paid yet, confusing, let's think how it should be" | ✅ Reproduced — it is **deliberate**, but wrong | Small–Medium |
| 7 | 4612 | "each section uses too much space. For mobile for sure we can replace them with icons, maybe on desktop too" — Companies | ✅ Measured: 119 px per company | Small |

Stray pink dashes on 4604, 4607 and 4610 look like accidental marker touches — I ignored them. **Tell me if any was meant.**

---

## 1. Settings → Payment details: rows run past the screen (IBAN)

**What Max sees.** On the phone the IBAN box and its edit pencil extend beyond the card; the value is cut off
(`GE65TB7183445064…`). Personal ID and Bank code have the same problem to a lesser degree (pencil hugging / clipped by the
card edge).

**Reproduced.** Row content is wider than the row on every payment row: IBAN row 455 px of content in a 356 px row; the
box ends at x=434 and the pencil at x=472 on a 390 px screen (clipped by the card's `overflow-hidden`). Personal ID 369 vs
356, Bank code 361 vs 356. While editing, the input is squeezed to 76 px wide.

**Why.** `SettingsClient.tsx:782-784` — each row is `label (fixed w-48 = 192 px) + field + pencil` in one line. On a 390 px
screen that leaves ~140 px for the field, and a text field's own minimum width plus the long value push the row wider
than the card. Nothing tells the field it is allowed to shrink (`min-w-0` missing) and the label never gives way.

**Fix (how).** Under the `md` breakpoint, **stack the row**: label on its own line, then value + pencil beneath, value
allowed to wrap/shrink (`min-w-0`, `break-all` for IBAN). Desktop unchanged. Same treatment is worth applying to the other
label+field rows in Settings that share the pattern (I will check rather than assume). EN + KA both checked at 390 px.

**Risk.** Low. Pure layout, one file. **Verify.** Re-run the measurement: no row wider than its card at 390 and 320 px.

---

## 2. Date fields show an empty bar with no hint (Closed Days; Wine Orders From/To)

**What Max sees.** A blank rounded box next to "Reason (optional)" — Closed Days — and two blank boxes + an arrow in the
Wine Orders filters (on Board, but it is the same bar on Cards/Table/Pack). Nothing says "date".

**Why.** iOS Safari renders an empty `<input type="date">` as **a blank box** — unlike desktop browsers it shows no
`dd/mm/yyyy` placeholder. The code gives the Wine Orders ones only a `title` ("From"/"To"), which touch devices never
display, and the Closed Days one nothing at all (`placeholder:null`, no label, no aria-label — measured). So this is a
missing-label bug, not a rendering bug. (Could not render real Safari; reasoning is from the screenshot + the code.)

**Fix (how).** Give every bare date field a **visible label**, and when empty show a visible hint. Cleanest approach: a
small shared `LabeledDateField` — tiny label above ("Date to close", "From", "To"), the native input beneath (so the
iOS picker still opens on tap), plus a calendar icon so it reads as a date. Apply to: Settings Closed Days,
Wine Orders filters (4 modes), and check `orders/new/NewOrderForm.tsx:408` + the Orders-page order-edit date
(`OrdersTable.tsx:1527`) for the same gap. Search box already has a placeholder; I'd add a magnifier icon only if you
want it (question below).

**Risk.** Low. **Verify.** On staging via your phone; I can only prove the label exists in DOM and is visible.

---

## 3. Wine Orders → Pack is unusable on a phone

**What Max sees.** A 90 px column of empty checkboxes on the left and a "No orders selected." box on the right. No company
names, nothing to read. The `??` — it looks broken.

**Reproduced.** At 390 px the orders list column is **38 px wide**, the side panel is **300 px**.

**Why.** `PackingView.tsx:356-361` is a desktop two-column layout: list `flex-1` + summary panel hard-coded `width: 300`.
The phone has 342 px of room in total, so the panel takes it all and the list — the thing you tap to select orders — is
crushed until the text vanishes. Pack mode was built desktop-only and never given a phone layout (it was not in the
2026-10-02 audit's list).

**Fix (how).** Phone layout, one column:
1. The orders list at full width, each order a tappable row (checkbox + company + bottle count + status mark).
2. The summary ("N selected → boxes → Print") moves into a **sticky bottom bar** (collapsed: "3 orders · 18 bottles ·
   [Print]"), expandable upward to the full summary. Desktop keeps today's side panel.

**Needs your answer (Q4):** do you ever actually pack/print from a phone, or only look? That decides whether the print
button belongs on the phone at all.

**Risk.** Medium — it touches `PackingView`/`PackingTable`; both are used by the desktop path, so I will gate by
breakpoint and re-check desktop 1280 px is pixel-identical. [[MaintenanceNotes]] read before touching.

---

## 4. Orders calendar (phone): preview flashes and then the page jumps away

**What Max sees.** Tap a day → a preview of that day's bookings flickers for a split second → the page navigates to the
filtered table. The preview can never be read.

**Reproduced.** Tap on a day with bookings: popover appears at ~200–350 ms, **same tap also fires navigation**. (On the dev
server navigation took >1.5 s so the popover stayed; on staging it is fast, which is why you only see a flash.)

**Why.** `CalendarView.tsx` — the preview is a **hover** feature (`onMouseEnter` + 200 ms delay). A phone has no hover, so a
tap makes the browser *emulate* hover **and** fire `click`; `click` runs `handleDayClick` → `router.push(...)` and the page
leaves. Two features fighting over one gesture.

**Fix (how) — recommendation: tap = select the day, show it inline.**
- On touch: tapping a day **selects** it (outlined) and shows that day's bookings in a panel **directly under the
  calendar** (name · time · guests · status · total — the same content as today's popover). Each row opens that order;
  a "View all N in table" link keeps today's navigate behaviour as an explicit choice.
- Desktop (mouse): unchanged — hover preview, click navigates.
- Chosen by input type (`(hover: hover)` / `pointer: fine`), not screen width, so a tablet with a mouse and a small
  desktop window both behave sensibly.

Alternative if you prefer an overlay: a bottom sheet instead of the inline panel (more "app-like", but another layer
that can clip/scroll badly; inline is the more robust of the two).

**Risk.** Medium. One component. **Verify.** Touch-tap test timeline: preview present and still present 3 s later, URL unchanged.

---

## 5. New mobile order card based on the "Booking Views" reference (design request)

**What Max wants.** The current mobile Orders card (4608) is "fine" but the card in the **"Booking Views" mockup (4609,
"Grid of cards")** reads better. Build a new mobile card using it as the reference.

**Assumption to confirm (Q1):** "the image labelled mobile view reference image" = **IMG_4609** (it is the only one
carrying a "Reference image" label; it is the Grid-of-cards option from the 2026-09-16 mockup, Artifact
`DVMLBHcyPNsUbKSkEb8FP4`, see [[Plan-StatusBoard]]).

**Why it reads better (what I see differing).**

| | Current card (4608) | Reference (4609) |
|---|---|---|
| Name | name + two unlabelled icons (₾✓, ⚠) crammed beside it | name only, big; **sub-line = Individual / the contact person** |
| Status | amber pill + ▾ top right | a clean coloured pill top right (Confirmed / Paid / New / Invoice sent) |
| Type | text buried in "4 guests · Wine Tasting" | **a distinct Individual / Company tag**, right-aligned under the status |
| Extras | not shown | icons: 👥 guests · 🍷 masterclass · 🍴 food |
| Money | bottom-left, then "View details ›" | bottom-right, bold |
| Edge | thick coloured left bar | none — the pill carries the colour |
| Height | ~177 px | ~122 px → more orders per screen |

**Fix (how).** Replace the phone card in `OrdersTable.tsx:891-967` with the reference layout, keeping what must not be
lost: whole card taps to the order; status pill still opens the (portal) status menu — its tap target stays ≥ 42 px; the
payment (`₾✓`) and balance-due marks stay but become readable (inside the pill row or as labelled chips, not bare
glyphs). Desktop views untouched. EN + KA at 390/320 px; long Georgian names truncate, not wrap into the price.

**Needs your answers (Q1–Q3 below).** Biggest open point: the reference mockup uses a sans-serif font, the app uses the
tenant's serif theme font — I'd keep the tenant font (theme consistency) and take only the layout.

**Risk.** Medium–large (visible, every phone user's main screen, status menu interplay) — I'd mock it as a static
before/after in the browser first and show you before wiring it.

---

## 6. Delivered-but-unpaid wine orders are greyed out

**What Max sees.** A "Delivered" wine order is faded to the point of looking disabled — but it hasn't been paid, so it is
the very order the winery still has to chase.

**Reproduced.** Both Delivered cards render at `opacity: 0.55`.

**Why — and this is the interesting part.** It is **deliberate**, and the code comment says why:
`WineOrdersClient.tsx:109-116` `isInactiveOrder = DELIVERED || CANCELLED` — "being owed money is not a reason to keep it in
the winery's packing queue, it is a reason for it to show up under the Unpaid filter." That reasoning came from the
two-axis status model ([[Plan-StatusModel]]): *process* (new → confirmed → delivered) and *payment* are separate. The
dimming follows the process axis only. The visual result contradicts the product's own point ("delivered and unpaid" is
the **normal** B2B state): the one thing that should shout is the quietest thing on screen.

**Options.**
- **A (recommended).** Fade only when the order is **finished on both axes** — (Delivered **and** Paid) or Cancelled.
  Delivered-unpaid stays fully readable and gets a clear amber **"Unpaid"** chip next to the total. Costs nothing in
  "packing queue" terms because Pack mode already excludes Delivered orders (`WineOrdersClient.tsx:1295`).
- **B.** Keep the fade, add a bright "Awaiting payment" badge on top of it. (Fixes the confusion but a faded card with a
  shouting badge is mixed signals.)
- **C.** Sort/group: Delivered-unpaid float above the finished ones, no fade. (A + a sort rule; more change.)

Also affects the Board/Table views' consistency (they show `PaidMark` only when paid — an *absent* mark is the only "unpaid"
signal). With A I would add the visible Unpaid chip there too so all four views say the same thing.

**Risk.** Low–medium; one file, a visual rule. Existing Playwright wine-order specs to re-run.

---

## 7. Companies list: each company takes too much vertical space

**What Max sees.** Every company is a tall block: name + badges, a "2 tiers · 6 orders" line, then two full-width-ish text
buttons "Edit"/"Delete".

**Measured.** 119 px per company on a phone; the Edit/Delete buttons alone are 42 px tall each, on their own line.
(2026-10-02's fix put them on a separate line *because* side by side they crushed the name — that is the trade-off we
are now revisiting.)

**Fix (how).** Replace the two text buttons with **icon buttons** (pencil, trash), 40×40 hit targets with `aria-label`s
(so screen-reader/translations stay), placed in the top-right of the summary row, so the row becomes name + badges (left)
and ✎ 🗑 (right). Expect ~64–72 px per company (≈ 45 % shorter). Delete keeps its confirm step (the "Delete this
company? Yes / Cancel" row) — unchanged, it appears in the same place. **Desktop (your "maybe"):** I'd keep text buttons on
desktop where there is room and the words are clearer, *unless* you want icons everywhere — see Q3.

**Risk.** Low. One file (`CompaniesClient.tsx`); the Individuals row shares the pattern, will check it.

---

## Questions for Max (answers change what gets built)

1. **Item 5:** Is "mobile view reference image" **IMG_4609** (Booking Views / Grid of cards)? Keep the **tenant's serif font**
   or copy the mockup's sans-serif too? Should the new card also replace the Wine Orders card on phones, or Booking Orders only?
2. **Item 5:** In the reference the status is just a pill. Must the pill still be **tappable to change status** on the
   phone (today it is), or is the card read-only and status changes happen inside the order?
3. **Item 7:** Icons on **desktop too**, or phone only? (Icon-only is unlabelled; I'd keep words on desktop.)
4. **Item 3:** Do you **print packing sheets from a phone**, or is Pack a look-only mode there?
5. **Item 4:** Inline panel under the calendar (recommended) or a bottom sheet?
6. **Item 6:** Option A, B or C?
7. **Item 2:** Want a magnifier icon in the search box too, or only the date fields labelled?

## Proposed order if approved

Quick, low-risk, one commit each on `staging`: **1 → 2 → 7 → 6** (all small, all layout/label). Then **3 → 4** (medium,
phone-only branches). Then **5** last — mock first, you approve the look, then build. After each: re-run the repro script,
`tsc --noEmit`, check desktop 1280 px unchanged, check Georgian, and update [[FeatureLog]] / [[KnownBugs]] / [[SessionLog]].
Nothing goes to `master` without your explicit OK (Rule 0).

## Process notes for this working format

- Worked well: one comment per screenshot, drawn marker on the exact thing. Ambiguities this round: three stray pink dashes;
  4608/4609 need a one-line pointer ("4609 is the reference for 4608").
- Suggestion: name files by topic (`orders-calendar.png`) or put the number in the comment ("#4 …") so the plan can map 1:1.
- Staging is real Safari; my repro is Chromium. For anything that is Safari-specific (date inputs, keyboard, safe areas) I
  will say plainly when I could only reason about it, and ask you to confirm on your phone.
