---
tags: [plan, active]
---

# Plan: Enhanced Company Booking System

## Overview
Build a richer company booking experience: split guest counts, hot dish menu selection, masterclass add-ons, and admin-editable order extras. Admin-side first, then optionally exposed on the public site via a settings toggle. Individual bookings are untouched.

**Guiding principle:** each step is self-contained and testable before proceeding to the next.

---

## Step 1 — Database schema ✅ Pending
**Goal:** lay the foundation every subsequent step builds on.

### New fields on `Order`
```prisma
lunchGuestCount     Int     @default(0)
tastingGuestCount   Int     @default(0)
freeGuestCount      Int     @default(0)   // guide, driver, under-12 — no charge
hotDishVegetable    String? // selected menu item name (snapshot)
hotDishMeat         String? // selected menu item name (snapshot)
foodNotes           String? // free-text kitchen notes
```

### New model: `MenuItem`
Hot dish options managed by admin.
```prisma
model MenuItem {
  id        String   @id @default(cuid())
  name      String
  type      String   // "VEGETABLE" | "MEAT"
  active    Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
}
```

### New model: `MasterclassItem`
Masterclass types with pricing.
```prisma
model MasterclassItem {
  id           String              @id @default(cuid())
  name         String              // e.g. "Churchkhela", "Khinkali", "Baklava"
  unit         String              // e.g. "person", "piece", "portion"
  pricePerUnit Float
  active       Boolean             @default(true)
  sortOrder    Int                 @default(0)
  createdAt    DateTime            @default(now())
  orderLines   OrderMasterclass[]
}
```

### New model: `OrderMasterclass`
Junction table — which masterclass items are on an order.
```prisma
model OrderMasterclass {
  id                String          @id @default(cuid())
  orderId           String
  masterclassItemId String
  quantity          Int
  pricePerUnit      Float           // snapshot at time of booking
  order             Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  masterclassItem   MasterclassItem @relation(fields: [masterclassItemId], references: [id])
}
```

### New model: `OrderExtra`
Admin-entered extra charges (additional wine, food, etc.)
```prisma
model OrderExtra {
  id          String   @id @default(cuid())
  orderId     String
  label       String   // e.g. "Additional wine", "Extra food"
  amount      Float    // total ₾ for this line
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
}
```

### Actions
- `prisma db push --skip-generate`
- Run `prisma generate` (stop dev server first on Windows)

### Validation
- Prisma Studio shows new tables/columns
- Existing orders unaffected (all new fields default to 0/null)

---

## Step 2 — Menu Items admin panel ✅ Pending
**Goal:** admin can manage hot dish options so they appear in dropdowns later.

### Files
- `saas/app/admin/menu-items/page.tsx` — server component, fetches items grouped by type
- `saas/app/admin/menu-items/MenuItemsClient.tsx` — inline CRUD (same pattern as wines)
- `saas/app/actions/menuItems.ts` — `createMenuItem`, `updateMenuItem`, `deleteMenuItem`
- `saas/app/admin/layout.tsx` — add "Menu Items" nav link

### UI
Two sections: Vegetable dishes / Meat dishes. Each row: name, active toggle, sort order, edit/delete. Add button per section.

### Validation
- Add a vegetable dish and a meat dish in admin
- Edit and delete work
- Active toggle works

---

## Step 3 — Masterclass Items admin panel ✅ Pending
**Goal:** admin can manage masterclass types + prices.

### Files
- `saas/app/admin/masterclass/page.tsx`
- `saas/app/admin/masterclass/MasterclassClient.tsx` — inline CRUD
- `saas/app/actions/masterclassItems.ts` — `createMasterclassItem`, `updateMasterclassItem`, `deleteMasterclassItem`
- `saas/app/admin/layout.tsx` — add "Masterclass" nav link

### UI
Table: Name | Unit | Price/unit | Active | Actions. Add row at bottom.

### Validation
- Add Churchkhela (piece, X₾), Khinkali (piece, Y₾), Baklava (piece, Z₾)
- Edit prices, delete items

---

## Step 4 — Clickable order detail page ✅ Pending
**Goal:** admin can click any order → see full detail + fill in enhanced fields.

### Files
- `saas/app/admin/orders/[id]/page.tsx` — server component: fetches order + masterclass items + order's extras + masterclass lines
- `saas/app/admin/orders/[id]/OrderDetail.tsx` — client component with sections:
  1. **Base info** (read-only): date, time, guest, company, visit type, contact
  2. **Guest counts** (editable): lunch guests, tasting guests, free guests → recalculates totalPrice
  3. **Hot dish** (editable): vegetable dropdown + meat dropdown (from MenuItem table)
  4. **Masterclass** (editable): add/remove masterclass lines (item + quantity) → each updates price
  5. **Extras** (editable): add/remove extra charge lines (label + ₾ amount)
  6. **Food notes** (editable): free-text textarea
  7. **Total** (calculated): sum of guest pricing + masterclass lines + extras
- `saas/app/actions/orders.ts` — add `updateOrderEnhanced` action
- `saas/app/actions/orderMasterclass.ts` — add/remove masterclass lines
- `saas/app/actions/orderExtras.ts` — add/remove extra lines
- `saas/app/admin/orders/OrdersTable.tsx` — make rows clickable (link to `/admin/orders/[id]`)

### Pricing recalculation logic
```
totalPrice =
  (tastingGuestCount × price.pricePerPerson) +
  (lunchGuestCount   × price.tastingLunchPricePerPerson) +
  price.registrationPrice +
  sum(masterclassLines: quantity × pricePerUnit) +
  sum(extras: amount)
```
Falls back to existing `guestCount × rate` for orders without split counts.

### Validation
- Click an order → detail page loads
- Fill in lunch/tasting/free guest counts → total updates
- Select hot dishes
- Add a masterclass line → total updates
- Add an extra charge → total updates
- Save — changes persist on refresh

---

## Step 5 — Admin create enhanced order ✅ Pending
**Goal:** admin can create a full company order from scratch without going through the public booking form.

### Files
- `saas/app/admin/orders/new/page.tsx` — server component (fetches companies, menu items, masterclass items)
- `saas/app/admin/orders/new/NewOrderForm.tsx` — client component: full company order form
- `saas/app/actions/orders.ts` — add `createOrderAdmin` action
- `saas/app/admin/orders/page.tsx` — add "New Order" button linking to `/admin/orders/new`

### Form fields
- Company (required, dropdown)
- Date + time slot
- Lunch guest count + tasting guest count + free guest count
- Hot dish — vegetable (dropdown from MenuItem) + meat (dropdown)
- Masterclass add-ons (checkbox per item + quantity input)
- Extras (dynamic add rows: label + amount)
- Food notes
- Contact name + phone

### Validation
- Create a full company order from admin
- Appears in orders list with correct total
- Detail page shows all fields

---

## Step 6 — Settings toggle + enhanced public booking form ✅ Pending
**Goal:** when admin flips the toggle, company booking path on the public site uses the enhanced form.

### New setting key
`enable_enhanced_company_booking` (default: `false`)

### Files
- `saas/app/actions/settings.ts` — add key to DEFAULTS
- `saas/app/admin/settings/SettingsClient.tsx` — add toggle in Booking section
- `saas/app/(site)/page.tsx` or booking component — read setting server-side; if enabled and user selects a company, render enhanced form instead of simple form
- `saas/app/(site)/components/EnhancedCompanyBookingForm.tsx` — NEW: public-facing enhanced form (company bookings only)
- `saas/app/actions/createBooking.ts` — handle enhanced fields

### Behaviour
- Toggle OFF (default): existing public form, unchanged
- Toggle ON: company dropdown selected → enhanced form appears with full fields
- Individual bookings: always use simple form regardless of toggle

### Validation
- Toggle OFF → public site unchanged
- Toggle ON → select a company → enhanced fields appear
- Submit enhanced booking → order saved with all fields → appears in admin detail with correct data

---

## Step 7 — Invoice updates (optional, after Step 6) ✅ Pending
**Goal:** invoice reflects split guest counts and masterclass/extra line items.

### Changes
- `InvoicePrint.tsx` — if `lunchGuestCount` or `tastingGuestCount` set, use those instead of `guestCount`
- Add masterclass lines section to invoice
- Add extras section to invoice

---

## Dependencies map
```
Step 1 (DB)
  └── Step 2 (Menu Items admin)
  └── Step 3 (Masterclass admin)
  └── Step 4 (Order detail) — needs Step 2 + 3 for dropdowns
        └── Step 5 (Admin create order) — shares UI patterns with Step 4
              └── Step 6 (Public form toggle) — needs Step 5's action
                    └── Step 7 (Invoice) — purely additive
```

---

## Current status
| Step | Status | Notes |
|---|---|---|
| 1 — DB schema | ✅ Done | Pushed to Supabase, Prisma client generated |
| 2 — Menu Items admin | ✅ Done | /admin/menu-items live |
| 3 — Masterclass admin | ✅ Done | /admin/masterclass live — MasterclassUnit enum (PER_PERSON/PER_PIECE/FLAT) in DB and lib/masterclass.ts |
| 4 — Order detail page | ✅ Done | /admin/orders/[id] live — rows clickable, guest counts, hot dish, masterclass, extras, live total |
| 5 — Admin create order | ✅ Done | /admin/orders/new live — full form + createOrderAdmin action; TC2+TC7 bugs fixed |
| 6 — Public form toggle | ✅ Done | enable_enhanced_company_booking setting; enhanced BookingForm with split counts, hot dishes, masterclass add-ons |
| 7 — Invoice updates | ✅ Done | Simple/Detailed picker on print button; detailed: split counts, masterclass lines, extras, itemised breakdown |
