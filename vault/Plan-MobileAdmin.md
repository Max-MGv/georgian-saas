---
tags: [plan, mobile, admin]
---

# Plan: Mobile Admin Optimization

## Goal

Make the admin panel genuinely usable on a phone for the tasks an owner actually does on the go — checking orders, reading booking details, updating a status. Not full parity with desktop.

---

## What owners actually do on their phone

1. Check if a new booking came in
2. See what's happening today / this weekend
3. Open an order and see the details
4. Mark an order as confirmed / paid
5. Check wine orders

Everything else (managing companies, prices, wines, settings, content editor, creating orders) is done at a desk. Those pages stay desktop-only.

---

## Page priority

| Page | Priority | Approach |
|---|---|---|
| Orders list | 🔴 Must fix | Replace table with cards on mobile |
| Order detail | 🟡 Light audit | Mostly vertical already — check tap targets |
| Wine Orders | 🟡 Light audit | Already card-based — check column collapse |
| Statistics | ⚪ Skip | Charts don't reflow well, not urgent on mobile |
| Companies | ⚪ Skip | Desktop-only is fine |
| Wines | ⚪ Skip | Desktop-only is fine |
| Menu Items | ⚪ Skip | Rarely changed |
| Masterclass | ⚪ Skip | Rarely changed |
| Settings | ⚪ Skip | Rarely changed |
| Content editor | ⚪ Skip | Visual editor — impossible on mobile by design |
| Admin nav | ✅ Already fine | `overflow-x-auto` horizontal scroll works |

---

## Piece 1 — Orders list: mobile card view

**The problem:** 15-column data table is unreadable on a phone screen.

**The fix:** On screens narrower than `md` (768px), hide the table and show a card list instead. On desktop, show the table exactly as today. Two layouts, one page.

### Each card shows:
- Name + surname (bold)
- Date + time slot on one line
- Guest count + visit type (Tasting or Tasting + Lunch)
- Company name (if company booking)
- Status badge (same colours as table)
- Total price

### Tap behaviour:
- Tap anywhere on the card → navigates to `/admin/orders/[id]` detail page

### Filter bar on mobile:
- Show the **Upcoming** quick button (most common action) always visible
- Show a **Filters ▼** button that toggles an expand panel below
- Expanded panel shows: From date, To date, Company, Status
- Clear button resets all
- Desktop filter bar stays exactly as-is

---

## Piece 2 — Order detail: tap target audit

The detail page is mostly a vertical form. Expected to work reasonably on mobile already. Check:
- All buttons at least 44px tall (iOS minimum tap target)
- Save / status change buttons easy to reach
- Guest count inputs don't require precise tapping
- No horizontal overflow

---

## Piece 3 — Wine Orders: column collapse

The Wine Orders page uses a 3-column card layout. On a phone the 3 columns will be too narrow. Fix:
- `grid-cols-1` on mobile, `grid-cols-3` at `md` breakpoint

---

## Estimate

| Piece | Effort |
|---|---|
| Orders list card view | ~3 hours |
| Orders filter bar collapse | ~1.5 hours |
| Order detail audit + fixes | ~1 hour |
| Wine Orders column fix | ~30 min |
| **Total** | **~6 hours** |

---

## Status

- [ ] Orders list: mobile card layout
- [ ] Orders filter bar: collapsible on mobile
- [ ] Order detail: tap target audit
- [ ] Wine Orders: column collapse on mobile
