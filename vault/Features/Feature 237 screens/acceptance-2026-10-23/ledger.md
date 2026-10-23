# Acceptance ledger 2026-10-23 (run 2, started 13:04)

## Inherited from an earlier run today (11:45-11:51, cut off, no ledger written)
Evidence: screenshots t152-step1-kakheti-original-tiers.jpg / t152-step1-kakheti-lunch30-fee25.jpg / t152-step2-booking-received.jpg
- Kakheti Wine Routes row 1-10 Lunch: ORIGINAL "not offered" (empty) -> set to 30 by earlier run. Needs restore check.
- Kakheti Wine Routes Registration fee: ORIGINAL "none" -> set to 25 by earlier run. Needs restore check.
- Earlier run submitted a public company booking (Kakheti, probably ZZ Acceptance). Needs to be found + deleted.
- Original Kakheti tiers: 1-10 T55/L-/TL95; 11-20 T45/L-/TL85; 21-100 T38/L-/TL75. Individuals card "60/105 shown on site".

## Changes / creations in this run
- 13:10 Checked current state: Kakheti is back to original (Lunch not offered on all rows, fee none) -> earlier run's changes appear RESTORED.
- ORIGINAL snapshot (13:10):
  - Individuals: 1-2 T90/TL150; 3-6 T70/TL120; 7-100 T60/TL105 (STAR on 7-100, "Shown on site"). Header "60/105 shown on site".
  - Alazani: 1-12 T58/L-/TL98; 13-100 T46/L-/TL86; fee none
  - Caucasus: 1-15 T50/L42/TL90; 16-100 T42/L38/TL80; fee none
  - Kakheti: 1-10 T55/L-/TL95; 11-20 T45/L-/TL85; 21-100 T38/L-/TL75; fee none
  - Silk Road: 1-20 T52/L45/TL92; 21-100 T40/L40/TL78; fee none
  - Tbilisi Tour Collective: 1-10 T60/L-/TL100; 11-30 T48/L-/TL88; fee none
- 13:14 CHANGE: Tbilisi Tour Collective row 1-10 Lunch: original EMPTY (not offered) -> 35 (Save clicked)
- 13:15 CHANGE: Tbilisi Tour Collective Registration fee: original NONE (0) -> 20
- T152 step1: tier row shows Tasting / Lunch / Tasting & Lunch per row; edit form has 'Lunch ₾/person' + hint 'Leave Lunch empty if you do not offer lunch on its own'. Fee 'Charged once per booking... 0 = none'. PASS so far
- 13:17 Orders list: 370 bookings, NO 'ZZ Acceptance' orders present (earlier run's booking already gone). Other ZZ orders present ('ZZ QA Claude ...', 'ZZPaymentIntegrity Off') are NOT mine - left alone.
- T272 step1: home cards 60₾ '7+ guests' and 105₾ '7+ guests' with person icon (starred row 7-100). PASS. r2-t272-step1-home-cards-7plus.jpg
- T272 step2: 4 -> 3-6 70/120 (280); 1 -> 1-2 90/150 ('90₾ × 1 guests' grammar); 8 -> 7+ 60/105 (480 / 840). PASS. PROBLEM: 101 guests -> tiles '1–2 guests' 90/150, total 150×101=15150₾ although 8..100 shows '7+ guests' 105.
- T272 step3: Tour Company tiles 'Company rate' (both). PASS. Obs: 'Minimum is 1 guests — reset to 1.' grammar.
- T152 step2: Tbilisi (code ok) Wine Tasting -> Tasting + Free/Guide; Tasting+Lunch -> Tasting/Lunch/Tasting & Lunch/Free. 3T+2L+12TL+1F = 1326 (3x60 row1-10, 2x35 row1-10, 12x88 row11-30, reg 20) = expected. PROBLEM (again): Guide Name field strips spaces 'ZZ Acceptance Guide' -> 'ZZAcceptanceGuide'.
- 13:24 CREATED: public company booking 'ZZ Acceptance 1' Tbilisi Tour Collective, 02/12/2026 12:00, 3T+2L+12TL+1F, 1326₾ (Booking received). TO DELETE.
- T152 step2 compare: Alazani (no lunch) Tasting+Lunch shows Tasting / Tasting & Lunch / Free only. PASS (step 2 overall PASS, admin check pending)
- T152 step3: 1 paying + 3 free -> 'Free guests (guide, driver) can't be more than the paying guests: 1 at most.' blocked. Lunch visit with 0 lunch guests + hot dish -> 'This is a Tasting + Lunch visit but no one is booked for lunch. Enter the lunch guests, or switch to Wine Tasting.' blocked. PASS. (no order created for ZZ Acceptance 2)
- 13:31 CHANGE on my order ZZ Acceptance 1: Tasting 3 -> 11 (saved). Total 1326 -> 1674 after reload (11x48 row 11-30 + 2x35 + 12x88 + 20). (order will be deleted anyway)
- T152 step2 admin check: order page shows Tasting 3x60 / Lunch 2x35 / T&L 12x88 / Registration fee 20 / Total 1326. Order list row shows 3/2/12/1, 1326. PASS
- T152 step5: re-priced live (Tasting 11x48 'row 11–30 guests') saved, sticks after reload 1674. PASS. Lunch 15 live: 'Lunch (15 × 35₾) · no row covers 15 guests — the highest price, from row 1–10'. Free 30 > 25 -> 'Free guests can't be more than the paying guests: 25 at most.' PROBLEM: while free > paying, hot-dish selects are cleared+disabled with wrong hint 'Hot dishes are for lunch guests — add a Lunch or Tasting & Lunch guest first.' though 14 lunch guests. Obs: quick-edit side panel date shows 12/02/2026 (US order) and says 'Visit type & price are not editable...delete this order' while order page lets you change them; admin visit-type dropdown has a third option 'Lunch'.
- 13:37 CREATED: admin order 'ZZ Acceptance 3' Tbilisi, 04 Dec 2026 11:00, Wine Tasting 9 + 2 free, 560₾ (9x60 + fee 20), id cmvkrdlx80007kw0886xfa1wo. TO DELETE.
- T152 step4: company New Order shows Tasting/Free (Wine Tasting) and Tasting/Lunch/T&L/Free (Tasting+Lunch); price lines live with 'row 1–10 guests'; 9T+12F -> 'Free guests can't be more than the paying guests: 9 at most.' total '—', create refused; Lunch 15 -> 'no row covers 15 guests — the highest price, from row 1–10'; 9T+2F created 560. PASS. Obs: date input is mm/dd/yyyy (browser native, US order); Wine Tasting visit shows hint 'Hot dishes are for lunch guests — add a Lunch or Tasting & Lunch guest first.' though no lunch boxes exist for that visit type.
- 13:40 CREATED: admin individual order 'ZZ Acceptance 4', 05 Dec 2026 11:00, Wine Tasting 4 guests, 280₾, id cmvkrewus000bkw08so7an0dq. TO DELETE.
- T152 step6: New Order no company 4 guests Wine Tasting -> 'Tasting (4 × 70₾) · row 3–6 guests' 280, no rate box; matches Individuals row 3-6 T70. Created. Order page hint 'Hot dishes are for lunch guests — switch the visit to Tasting + Lunch first.' PASS. Live (unsaved): 8 -> 8x60 row 7–100; 101 -> '101 × 90₾ · no row covers 101 guests — the highest price, from row 1–2' = 9090. Obs: CONTACTS card says 'No contacts recorded.' on individual order although phone/email shown above.
- T152 step7 invoice: Print on order page calls window.print (suppressed in my tab); captured print portal and rendered on screen: Georgian invoice, date '02.12.2026 12:00' (day-first), one line per product დეგუსტაცია და სადილი 12 / სადილი 2 / დეგუსტაცია 11 and amounts 1056 / 70 / 528, რეგისტრაციის საფასური 20, 'დამ. სტუმრების კვება 0.00', total 1674. No 'მხოლოდ'. PASS. Nothing sent (Send Invoice never clicked).
- T152 step7 list/sheet: column picker has Tasting / Lunch / Tasting & Lunch / Free (+Total guests off). Booking sheet preview (on screen, print suppressed): ZZ1 row 11/2/12/1 kitchen total 26 (incl free), ZZ3 9/-/-/2 = 11, ZZ4 4. PASS. Obs: with no filter the sheet covers 02 Apr 2025 – 24 Jan 2027 (all 373 bookings); preview table wider than modal (Nationality column cut), date column wraps to 5 lines.
- T152 step7 statistics: (under 'Show historical breakdown →') Revenue ₾ — last 6 months axis 0–22,000₾ with bars 9,086…21,250₾ (same range). Guests by product: Tasting 1680 / Lunch 17 / Tasting & Lunch 1090 / Free 65. Booking type: Individual 218 / Company 126 (one Individual group); overview 'Revenue by company' has single 'Individual'. PASS. Obs: 'This Month 52 / 25,574₾' vs Oct bar 22 / 10,221₾ (different meaning, unexplained); overview Upcoming 39 vs Orders page 43 (year-scoped); Kakheti 42 bookings (Top companies) vs 46 orders (Companies page).
- 13:47 Settings ORIGINALS: Admin panel language EN (assumed from UI); default site language (not changed); Booking rules: WT min 1, T+L min 1, max ∞/∞, Company minimum Tasting '—', Lunch '—', Tasting & Lunch '—' (blank).
- 13:49 CHANGE: Settings > Booking rules > Company minimum — Tasting: original BLANK '—' -> 5
- T152 step8: Company minimum — Tasting/Lunch/Tasting & Lunch blank by default; set Tasting 5 -> public Alazani 3 Tasting refused 'At least 5 guests are needed for Tasting.' (no order created, ZZ Acceptance 5 not submitted). PASS (restore next)
- 13:52 RESTORED: Company minimum — Tasting 5 -> blank '—' (verify after reload at end)
- 13:53 CHANGE: Admin panel language: original EN -> KA (default site language EN, not touched)
- Wording check (KA admin): order page/total, Companies tiers, Settings booking rules, Statistics use დეგუსტაცია / სადილი / დეგუსტაცია და სადილი; no product 'მხოლოდ' (only generic uses in Settings help texts: 'only here', 'total only', 'this company only', 'Bookings only'). EN pages: no 'Tasting only'/'Lunch only'. PASS. Obs: dates in KA admin still English months ('02 Dec 2026'). Settings company minimum blank after reload (restore confirmed).
- 13:56 RESTORED: Admin panel language KA -> EN (screenshot r2-cleanup-admin-language-EN.jpg). Default site language EN untouched.
- 13:59 CHANGE: public site visitor language (browser preference) EN -> KA via nav toggle (phone frame). Original EN. Must switch back.
- 14:02 RESTORED: public site language KA -> EN (tiles read 'Company rate' in EN again).
- T272 step4: resize_window had NO effect (window stays 1920 wide, maximized) -> phone width tested in a 390px same-origin iframe inside my tab. EN + KA: cards '7+ guests'/'7+ სტუმარი', tiles 1->'1–2 სტუმარი' 90/150, 4->'3–6' 70/120, 8->'7+' 60/105 ('/ პერსონა'), company tiles 'საკომპანიო ტარიფი', company boxes 2x2 დეგუსტაცია / სადილი / დეგუსტაცია და სადილი / უფასო / გიდი. scrollWidth 375 (no sideways scroll), tiles same height, no clipping. PASS. Obs: floating bug-report button covers the Total amount on phone; html lang stays en-GB in KA.
- 14:04 CHANGE: Individuals star (Show on site): original on 7–100 row -> clicking '★ Show on site' on 3–6 row
- T272 step5: star moved to 3–6 -> admin header '70₾ / 120₾ shown on site'; home cards 70₾ '3–6 guests' / 120₾ '3–6 guests'. PASS. Restoring star to 7–100 next.
- 14:07 RESTORED: Individuals star back on 7–100 (header '60₾ / 105₾ shown on site', after reload).
- 14:09 RESTORED: Tbilisi row 1-10 Lunch 35 -> empty ('not offered'); Tbilisi Registration fee 20 -> 0 ('none'). Verified after reload: all 5 companies + Individuals match the 13:10 ORIGINAL snapshot exactly.
- 14:11 DELETED: ZZ Acceptance 1 (Admin > Orders > Delete order > Yes; row gone)
- 14:12 DELETED: ZZ Acceptance 3 (row gone)
- 14:13 DELETED: ZZ Acceptance 4 (row gone)
- 14:14 FINAL VERIFY: Orders list after reload = 370 bookings (same as start), Upcoming 40, Future revenue 18,019₾ (same as start), no 'ZZ Acceptance' rows. Companies/Individuals prices, fees, star = originals. Settings company minimums blank, admin language EN, default site language EN. Public home in EN, cards 60₾/105₾ '7+ guests'.
- Window size: resize_window calls had no effect (window stayed maximized), nothing to restore.
## CLEANUP COMPLETE - nothing left outstanding from this run.
