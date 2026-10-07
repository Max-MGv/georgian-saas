---
tags: [audit, mobile]
---

# Full mobile audit — 2026-10-02

Read-only audit; no code changed. Follows `HANDOFF-MobileProduct.md` (2026-09-12), which found zero horizontal
overflow and a list of small tap targets. This pass re-measured that and added a visual + interaction pass.

**Method.** Headless Chromium, iPhone 13 emulation (390×664), against localhost (dev DB, Staging Winery),
signed in with the Playwright suite's own test logins. 34 routes (public, tenant admin, super-admin), plus
interactions: nav menu, booking form, date field, wine cart, orders views/filters/status menu, order detail.
Overflow-only second pass at 320 px. Georgian checked on the guest site only.
**Not covered:** admin in Georgian (would need a Settings write), submitting any form, real iOS Safari,
Orders "Board" view (screenshot raced the view switch — unconfirmed).
Next.js dev-mode overlays ("N" badge, "1 Issue", "Rendering…") are dev-only and were ignored.

## Status update — same day

**Fixed (FeatureLog #219, uncommitted):** defects 2, 3, 4, 5, 6, 11, 12, plus the Max-requested compaction of the
banners / revenue strip on Orders and Wine Orders. **Still open:** 1 (super-admin), 7 (date formats), 8 (bug
button), 9 (wine shop list view), 10 (content editor on touch), the tap-target / 16px-input pass, and the
admin-nav decision.

## Verdict by area

| Area | State |
|---|---|
| Guest site (/, /wines, /about, /contact, legal) | Good. Zero small tap targets on main pages, no overflow at 390 or 320, Georgian fine. |
| Admin Orders list + order detail | Good. Card list, collapsible Filters, readable detail page. |
| Admin Statistics | Better than the old plan assumed — charts reflow. |
| Admin data-entry pages | Usable but rough: clipped/squeezed rows, small controls. |
| Super-admin | Broken on phones (page is 605 px wide at a 390 viewport). |

## Defects (measured / seen)

1. **Super-admin overflows on every page.** Top nav is one unwrapped 546 px row → layout widens to 605 px (606 at
   320). Tenant cards: name hidden behind the slug pill, stats clipped ("wine ord"). Orders table clipped.
2. **Admin /wine-orders overflows at 320 px** (344 wide); header is also indented ~72 px more than other pages.
3. **Orders → Filters panel: the "To" date field runs out of the card** (From/To sit side by side and don't fit).
4. **Companies row summary is crushed**: name wraps to 3 lines, the "2 tiers · Code set · 0 wine orders" badge text
   overlaps itself, Edit/Delete crowd the row.
5. **Settings → Booking rules: unit label "guests" is clipped** at the card edge.
6. **Onboarding stepper labels break mid-word** ("Compa/nies", "Bookin/g details", "Payme/nt info") — the first
   screen a new tenant sees.
7. **Two date formats**: public form is DD/MM/YYYY; admin New Order, Wine Orders filters use the browser's native
   mm/dd/yyyy.
8. **Bug-report button floats over form content** on the public site (covers right edge of Time Slot, visit-type
   cards, Tasting+Lunch). Rendered in `app/(site)/layout.tsx` for all guests (not checked whether a flag gates it).
9. **Wine shop list view on a phone** is a cramped 4-column table; once a quantity is set the stepper squeezes the
   Total column. Grid (default) is fine.
10. **Site Content editor says "Hover any text to edit"** — no hover on touch. Preview also shows two stacked
    bug-report buttons (editor's + the embedded site's). Editing by tap not tested.
11. **Orders "Table" and "List" are identical on mobile** (both the card list) — redundant toggle.
12. Mobile nav menu stays open after switching language.

## Tap targets / text (admin)

Under 32 px tall: status pills 26 px; "?" hint 16 px; wines/menu-items icon buttons 22–24 px, some 8×8;
Edit/Delete 26 px; orders-list "Finish details" 30 px; wine-orders filter chips 26 px (126 of 159 controls on
that page are under 32 px). Admin inputs/selects are 14 px (iOS Safari zooms the page on focus under 16 px):
orders/new 12, settings 10, statistics 3, wine-orders/new 9. Tiny text (<12 px): wine-orders 70 nodes, statistics
30 (chart axes), super-admin ~10–19 per page. Admin nav is 11 links in a 390 px scroller (to x=956).

## Stale docs found

`Plan-MobileAdmin.md` checkboxes are all unticked, but the Orders card layout and collapsible filter bar exist
and work. `HANDOFF-MobileProduct.md`'s small-tap-target list still holds for admin; the public Menu button is now
42×42 and the footer links pass.

## Recommended order

1. Cheap fixes (one sitting): defects 3, 5, 6, 2, 4, 11, 12.
2. Public: move/shrink the bug button on mobile (8); date format in admin (7).
3. Admin touch pass: 16 px inputs, ≥36 px controls on the pages a winery uses on the go (Orders, Wine Orders).
4. Super-admin: wrap/collapse the nav, stack the tenant cards (low priority — only Max uses it).
5. Decide Content editor on touch (10): leave desktop-only with a notice, or add tap-to-edit.
6. Decision for Max: the 11-link admin nav (scroller vs. drawer) — carried over from the 2026-09-12 handoff.

Screenshots were in the session scratchpad only (not kept).
