---
tags: [qa, testing]
---

# Manual QA — every "Ready to test" ticket (started 2026-10-15)

Max: "test the tickets as the user instead of me … as a manual QA tester would. Make a list and tick off as tested,
one by one." Each step is the ticket's own "how to test", done by clicking through **staging.vineworks.ge** (dev DB)
like a user, with screenshots on phone (~390px) and desktop. Test data created here is removed afterwards.

Legend: `[x]` passed · `[!]` problem found (see note) · `[ ]` not done yet · `[-]` needs Max's go / can't be done by me

## Already on production (shipped 2026-10-15, `aa760cf`) — confirm on staging, admin on phone was never checked

### T-5 — no iOS zoom on admin fields (phone)
- [x] Admin → Orders → New order on phone (390px): 11 fields all 16px, nothing wider than the screen, clean to "Create order"
- [x] Settings (12 fields, whole page), Wine Orders list + New (13 fields), Companies → Edit Company panel, Site Content —
  all 16px, no overflow. Nothing caused by the bigger text (checked the one suspicious row at 14px too — same).
  Pre-existing cosmetic notes → Findings F1–F3.
- [-] Real iPhone tap (only Max can do this)

### T-23 — winery name once on /wines
- [x] Phone + desktop: name/logo once in header; "Order wine" + subtitle still there (checked on live production
  after the 2026-10-15 push, 390px + 1440px, and against the old production build before it)

### T-6 — "Add company" opens the full form
- [x] Bookings tab: + Add Booking Company → "ZZ QA Booking Co" → Save → Edit Company opens with the name, URL clean (390px)
- [x] Wine Orders tab: same ("ZZ QA Wine Co") — Wine Orders ticked, Wine discount + Exporter + Wine prices sections there
- [x] Test companies deleted afterwards (both gone)
- [!] On a phone the name row (box + Save + Cancel) runs 25px off-screen → **F6 (caused by T-5, on production)**

### T-11 — Site Content → Messages on phone
- [x] Booking Confirmation preview looks like a small desktop version, 320.00₾, variant pills wrap (390px)
- [x] Wine Order Receipt (150 + 120 − 27 = 243.00₾) and Invoice Email (240 + 80 = 320.00₾) readable on phone → F5
- [x] Desktop unchanged (2026-10-16, Brave full screen 1920px): Booking Confirmation preview at full email width,
  320.00₾, readable. Also re-checked on desktop that the fixes changed nothing there: New wine order field pairs aligned,
  working hours 150px boxes on one line, bug button hides while the wine checkout drawer is open.

### T-21 — booking form: masterclass row + contact summary
- [x] Tour Company → Alazani Valley Tours → code → picker "Who should we put on this booking?" → Levan (contact) +
  Zviad (guide) → Contact Person is one line with "Edit"; Edit → Name/Phone/Email boxes with the details (390px + 1440px).
  Staging has "Personal access codes" ON, which hides the picker — switched it OFF for this test and back ON after (verified).
- [x] Masterclass: one row "Add a masterclass (4 available)" → tap → tick Khinkali → tap → "1 selected · 35₾" (phone + desktop)
- [x] Submit works (phone): total 4 × 58₾ + 35₾ = 267₾ → review sheet → "Booking received!". Admin → Orders shows it with
  contact Levan, guide Zviad, masterclass 35.00₾. Test booking left on staging (note "ZZ QA test booking (T-21)"). → F7

## On staging only

### T-79 — Settings page in one database trip
- [x] Every Settings section shows its values (language, booking toggles, payment details, card payments, booking rules,
  lead time, visit duration, working hours, contact page, branding, contact info, closed days, contact types, wine
  delivery) — whole page scrolled at 390px
- [x] Toggle "Detailed invoice" on → reload → on → off → reload → off. Number "Wine Tasting minimum" 4 → 5 (Save icon)
  → reload → 5 → back to 4 → reload → 4. Staging left as found. → F8

### T-13 — several addresses per wine company
- [x] Companies → Sighnaghi Wine Bar → Addresses: added "ZZ QA Tbilisi branch — Rustaveli Ave 1, Tbilisi (10:00-18:00)"
  and "ZZ QA Batumi branch — Gorgiladze St 5, Batumi"; still there after reopening (390px). Name box is narrow on a phone.
- [x] /wines → Rkatsiteli → Checkout → Sighnaghi + code → 10% off (13.50₾) → "Choose a delivery address" lists the old
  address + both new ones + "Other address…"; picking one shows a "Delivering to …" card
- [x] Card order went to Flitt **test mode** page (13.50 GEL) — stopped there, not paid (unpaid card orders don't show in
  admin). To see a card: set Sighnaghi Card payment = "Always skip" → "Place a Reservation" (date required) → "Order
  received!" → Wine Orders card: 📍 "ZZ QA Batumi branch — Gorgiladze St 5, Batumi", Delivery, Preferred 21 Nov 2026.
  **To undo at the end:** Sighnaghi Card payment back to Default; delete the two ZZ QA addresses.

### T-8 — minimum order, pickup vs delivery, zone fees
- [x] Settings: zone "Tbilisi / თბილისი 15₾" added; Minimum = Bottles 3; Offer pickup ON; Save → survives reload
- [x] /wines: 2 bottles → drawer shows "Minimum order: 3 bottles" (top + above button), button greyed; 3 bottles →
  Delivery / "Pickup at the winery" switch; Sighnaghi + code + Tbilisi zone → Wines 40.50₾ + Delivery — Tbilisi 15₾ =
  55.50₾ ✓; area "Other" → "Delivery — fee to be confirmed" ✓
- [x] Order with "Other" area placed ("ZZ QA Tester T-8", 40.50₾, 27 Nov) → card "Delivery fee to set" → Set fee 20 →
  "Delivery 20₾ · Change fee", total 60.50₾
- [x] Paid order: marked Confirmed → Paid (Cash) → Change fee 20 → 25 → "Owes 5₾ · Record payment · Card payment link",
  total 65.50₾. Card payment link → "Checkout link · Copy link · Show QR code · Done"; QR popup "Scan to pay by card"
  (Open link / Close) works. Record payment → 5₾ Bank transfer → Save → "Owes" gone.
  Note: status confirm prompts close themselves after 5 s (by design, `WineOrdersClient.tsx:1591`).
- [x] Delivery / Pickup filter pills (multi-select): Pickup only → "No orders match the filters." (staging has no pickup
  orders); Delivery → delivery orders
- [ ] Settings restored afterwards (zone, minimum, pickup) — at the end, with the other staging undo items

### T-14 — preferred delivery date + calendar
- [x] Checkout: added closed day 25 Nov 2026 in Settings → picking it shows "We are closed on that day — please choose
  another." and the button stays disabled; a valid date (21 Nov) submitted fine (T-13 order)
- [x] Wine Orders card "Preferred: 21 Nov 2026" → Change → inline date + Save/Clear/Cancel → 24 Nov → card shows 24 Nov
- [x] Calendar tab: October shows counts; → November: badge on 24; tap → "Tue 24 Nov · 1 wine order", "No preferred
  date (27)" listed under it; tap the order → back to its card in Cards, opened
  **To undo at the end:** remove closed day 25 Nov 2026.

### T-12 — company wine prices + exporter flag
- [x] Companies → Sighnaghi (10% discount) → Wine prices: Rkatsiteli 2026 15₾ → 12₾ (shows ~~15₾~~ + "Standard" reset);
  Exporter ticked; Save changes → list shows "Exporter" badge
- [x] /wines with Sighnaghi + code: Rkatsiteli 2026 card shows 12₾/bottle; 3 bottles → 36₾ (negotiated price replaces the
  10% discount, as designed)
- [-] Company without code is not offered — can't test: every company on staging has a code (the four wine companies are
  the only ones in the dropdown)
- [x] Wine Orders → "Exporter" pill → only Sighnaghi's 21 orders, each with an "Exporter" mark
  **To undo at the end:** Sighnaghi Rkatsiteli 2026 back to Standard, Exporter off.

### T-9 — individual wine orders
- [x] /wines checkout → Individual: only delivery address / name / phone / email / preferred date → submit → Flitt test
  page "Wine order — 1 bottle, ZZ QA Individual T-9", 15.00 GEL (stopped, not paid)
- [!] Wine Orders card shows "Individual" — it's there, but on a phone a long name truncates the title and the badge is
  hidden inside the ellipsis → F10
- [x] Admin → New wine order → "Ordering as: Individual (private person)" removes the Company section and LLC fields →
  added Mtsvane 2023 × 1 → Create order → card "ZZ QA Admin Individual T-9", 16₾ (80 total). → F9, F11
- [-] Decision for Max (from the ticket): switch starts on Company — keep, or default to Individual?

### T-83 — QA fixes
- [x] /wines in Georgian (KA is inside the ☰ menu at this width): order drawer, Company/Individual, Delivery/Pickup,
  placeholders, minimum notice, code popup and New Company popup all Georgian. Only Latin left: wine names (data) and the
  date placeholder "DD/MM/YYYY" (+ hidden label "Open calendar"). Wording itself is for Max to read.
- [x] Date picker: min = today, max = 16 Oct 2027 (one year); typing 20/12/2027 → Georgian "too far ahead" message
- [x] Admin language KA → Wine Orders dates "27 ნოე. 2026"; Calendar in Georgian; "No preferred date (28)" — all 28 are
  "ახალი" (open). Admin language set back to EN.
- [!] Companies: 4-letter code "ABCD" refused ("Use at least 6 characters — short codes are easy to guess.") — but the
  message is at the top of the panel, 505px off-screen while you press Save at the bottom → F13. Cancelled, code unchanged.
- [x] Record a fee payment twice quickly (two Save clicks back-to-back) → after reload: Paid, no "Owes", no credit — one
  payment only. Also: fee editor warns "A card link for 5₾ was created on 16 Oct and is not paid yet".

### T-84 — Tickets v2 (tested 2026-10-16 in the app's browser pane on the local dev server = same code + dev DB;
Brave had disconnected. Pane width 629px.)
- [x] Tier 1: click a card → panel over the board (`?t=22`), shows chips + Request/Analysis/Solution/Links/Images; Esc
  closes it; browser Back closes it; board still there
- [x] "Waiting for me" (`?f=waiting`, 15) → board shows only empty Inbox/Backlog at this width (the Ready-to-test column
  is off to the right — list view is the useful one on a narrow screen) → list view → open T-84 → j → T-10 → k → T-84
- [x] T-10's screenshot opens in the image viewer over the page (zoom / open / close); Esc closes only the viewer
- [-] Ctrl+V a screenshot / paste into Quick add — not possible in the pane (no image clipboard). For Max.
- [x] Quick add "ZZ QA quick-add test ticket" → "Added T-133 · open" (that note disappears within ~3 s — easy to miss)
  → priority Normal → Low, type Task → Idea (activity: "updated priority, type"), status → Closed → "Close this ticket —
  why?" → Obsolete → "Closed · Obsolete". T-133 left closed.
- [x] Tier 2: T-84 shows Analysis, Solution, Decisions (3 + the answered question), Links: plan chip (button) + commit
  chips linking to github.com/Max-MGv/georgian-saas/commit/…
- [x] Tier 3 (2026-10-16, Brave reconnected, staging, 427px): staging admin → red button → Bug + text + screenshot (file
  upload) → Send → arrives as **T-134** (Bug · widget · Admin), reporter's words with "T-84" auto-linked, screenshot under
  Images, Client box "sees on My Reports: Received". Wrote a message to the client (no email button pressed) → My Reports
  shows the report + screenshot + "Reply from VineWorks". Closed T-134 as Obsolete → client sees "Closed". (Report
  notification email to Max was sent by the app as normal.)

### T-115 — Release notes (same setup)
- [x] Releases overview: counts (2 releases · 0 published · 2 drafts, 9 changes for clients +1 internal, 12 screenshots),
  filters All / Published / Drafts / Shown to clients, search, collapsed timeline with plain summaries
- [x] 7 Oct 2026 → Client view: summary + each change with Before/After phone shots side by side, readable
- [x] Edit view: Publish, Show to clients, pencil / move / hide per change. Developer view: release record (status,
  last change, 9 changes (1 internal), 10 screenshots, EN ✓ KA ✓). ქართული: Georgian text and dates ("7 ოქტ. 2026").

### T-10 — bug report on production
- [-] Sending a real report on nikalasmarani.vineworks.ge writes to the production database — needs Max's go

## Visual fixes made (Max 2026-10-16: "fix any visual bugs you see, anything else ask me first")
Commit `3bc08a5` on **staging** only — NOT production. tsc clean; lint errors in these files are the same 4 as before.
- F6 — `globals.css` phone rule: `min-width: 0` on inputs/selects/textareas (T-5 regression; also fixes Masterclass add row)
- F1 — `SettingsClient.tsx`: working-hours "open – to – close" grouped, shrinks instead of wrapping (daily + per-day rows)
- F3 — `NewWineOrderForm.tsx` `Field`: half fields push their box to the bottom (`mt-auto`) so wrapped labels don't misalign
- F11 — `NewWineOrderForm.tsx`: wine table `overflow-x-auto` + `whitespace-nowrap`; vintage select basis 100 → 130px
- F10 — `WineOrdersClient.tsx` card title: name truncates on its own; Exporter/Individual marks sit outside it
- F13 — `CompaniesClient.tsx` EditPanel: error line scrolls into view when it appears
- F14 — `SiteNav.tsx` phone menu: EN|KA switch `self-start`
- [x] Re-checked (2026-10-16) at 390px with screenshots — admin ones on the local dev server (same code + dev DB,
  `tests/_qa/qa-fixes-verify*.spec.ts`, untracked): F6 Companies/Menu Items/Masterclass rows fit (no page overflow,
  "Cancel" whole); F1 times on one line; F3 boxes aligned; F11 table scrolls in its box, Total visible; F10 badge visible on
  collapsed + open card; F13 error on screen; F14 on staging (compact pill).

- [x] Re-checked again **on staging itself** (Brave, real 427px window, 2026-10-16): Companies add row fits (Cancel at
  396/427px), Menu Items add dish fits, working hours on one line, Enter in "Wine Tasting minimum" → "Saved", New wine
  order Individual → "CONTACT & DELIVERY" + aligned boxes + vintage "2026 — 40₾" + table scrolls in its box, Individual
  badge visible on the collapsed card.

## Max's decisions 2026-10-16 → done, commit `1132b2e` on **staging** only (NOT production)
1. F2 → **hide the bug button while a popup is open**: `BugReportWidget.tsx` hides its trigger whenever any fixed element
   (other than itself) covers ~the whole screen. Verified on staging: hidden during the booking review sheet and the wine
   checkout drawer, back afterwards; hidden while Edit Company is open (local).
2. F5 → yes: invoice email "1 guest" / "2 guests" (`invoiceEmailTemplate.ts`, Georgian unchanged). Printed invoice is
   Georgian-only — not affected.
3. F7 → yes: review sheet lists each masterclass add-on (name × qty, price) and the guide / other roles. Verified on
   staging: "Khinkali folding class 35₾", "Guide ZZ Guide", total 267₾.
4. F8 → sure: Enter saves the Settings pencil fields (payment details, booking rules, logo alt text, contact info).
   Verified locally: Enter on "Wine Tasting minimum" saves and closes the editor (same value re-saved).
5. F9 → yes: individual orders' section reads "Contact & Delivery" / "კონტაქტი და მიწოდება" (verified locally).
6. F12 → yes: Companies → Wine Orders tab counts wine orders (Sighnaghi now "22 orders").
7. Georgian "DD/MM/YYYY" placeholder → doesn't matter, left as is.
8. T-9 default → **Company** (unchanged).

## New finding
- **F15 (pre-existing, dev-only error)** Settings → Closed days: the date is formatted with the browser locale, so the
  server renders "Wed 25 November 2026" and the browser "Wed, 25 November 2026" → React hydration error (Next dev overlay
  "1 Issue"; React re-renders, nothing visibly wrong). Only appears when a closed day exists. Same family as KnownBugs #81.
  Not fixed — Max to decide.

## Staging test data — restored 2026-10-16
Closed day 25 Nov removed; wine zone Tbilisi deleted, minimum → No minimum, pickup off; Sighnaghi: Rkatsiteli 2026 →
Standard, Exporter off, card payment Default, both ZZ QA addresses deleted; Personal access codes back ON; admin language
EN; Alazani code unchanged. **Left on purpose:** the "ZZ QA …" test orders/bookings (T-21 booking, T-13/T-8/T-9 wine
orders, T-9 admin individual order) and two unpaid Flitt test-mode attempts (not visible in admin).

## Findings
Phone checks run at 390px inside a same-origin frame in Max's signed-in Brave (Brave's window can't go narrower than ~740px).

- **F1 (minor, pre-existing)** Settings → Working hours on a phone: the two time boxes (150px each) + "to" don't fit in one
  row, so the second time drops below with "to" dangling after the first. Same at the old 14px — not caused by T-5.
- **F2 (minor, pre-existing)** The floating bug-report button covers the right end of bottom-row buttons on phones
  (Edit Company "Copy"/"Cancel", New Order "Create order" edge).
- **F3 (minor, staging wine form)** Wine Orders → New on a phone: the label "Contact person phone number *" wraps to two
  lines, so its box sits lower than the Name box next to it. Also Settings → Instagram field a few px wider than the others.
- **F6 (REGRESSION from T-5 — live on production since 2026-10-15)** On phones, one-line "add" rows (text box + buttons in
  a row) no longer fit: T-5 raised the box text from 13px to 16px, the box grows, and flex won't shrink it below its
  natural width. Seen: Companies → + Add Booking Company (Cancel half off-screen, page scrolls sideways by 9px) and
  Menu Items → + Add dish ("Cancel" cut to "Cance"). Both fit at the old size (checked by switching back to 13px).
  Masterclass → + Add item overflows at BOTH sizes (older issue, same fix). Sweep of every admin page's visible fields
  found no other cases at page load. **Proposed fix (needs Max's OK):** in the T-5 phone rule in `saas/app/globals.css`
  add `min-width: 0` to inputs/selects/textareas so they can shrink inside a row. Then retest these three rows.
- **F7 (minor, booking form review sheet)** "Review your visit" shows Total 267₾ but no masterclass line (35₾) and no
  guide, so the guest can't see what makes up the total. On a phone the "Confirm & Request Booking" label is clipped
  on the right.
- **F8 (minor UX, Settings)** Pencil-to-edit number fields (Booking rules etc.): pressing Enter does nothing and the new
  value is silently lost on the next page load unless the small Save icon (same spot as the pencil) is tapped. On a
  phone keyboard "Go"/Enter is the natural move. Suggest: Enter = Save.
- **F9 (wording, T-9)** Admin → New wine order as Individual: the section is still headed "BUSINESS & CONTACT".
- **F10 (T-9, phone)** Wine Orders card: the "Individual" badge sits inside the title line, which truncates with "…" — with a
  long name the badge is pushed 17px past the edge and hidden. Badge should sit outside the truncated text (like "New").
- **F11 (minor, phone)** Admin → New wine order → Wines table: the "Total" column is cut at the right edge ("16.00", no ₾);
  the Vintage select also clips ("2023 — 16(").
- **F12 (pre-existing, also on production)** Companies → Wine Orders tab says "0 orders" for every wine company, even
  Sighnaghi with several wine orders: the count is `_count.orders` = **booking** orders only
  (`saas/app/admin/(panel)/companies/page.tsx` ~line 49). The Wine Orders tab should count `wineOrders`.
- **F13 (visual, Edit Company)** Save errors (e.g. code too short) are shown at the top of the panel; you press Save at
  the bottom and see nothing happen. Error should scroll into view (or show next to Save).
- **F14 (minor, public menu on phone)** ☰ menu: the EN | KA switch is a full-width pill with both labels squeezed left.
- **F5 (real emails, pre-existing)** The English invoice email says "2 guest" / "4 guest" — the label is a fixed word with
  no plural (`saas/lib/emails/templates/invoiceEmailTemplate.ts:46`, used at lines 142–144). Goes out on real invoices.
  Georgian ("კაცი") is fine.
- **F4 (pre-existing, KnownBugs #87)** Individual booking card price can differ from the total (display tier vs matched tier).
