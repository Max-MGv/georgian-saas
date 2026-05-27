---
tags: [features, mvp]
---

# Feature Status

> MVP shipped. This file tracks what's done, what's in progress, and what's planned. For full session-by-session history see [[SessionLog]]. For detailed step-by-step plans see [[Plan-EnhancedCompanyBooking]].

---

## Public Site (customer-facing) — Live ✅

- [x] Home page: hero, packages, booking form
- [x] About page: winery story, what to expect
- [x] Contact page: phone, email, location
- [x] Wine catalogue (`/wines`): grid/list toggle, dynamic from DB, real product images with gradient fallback
- [x] Booking form: individual vs. company, tasting vs. tasting+lunch, live price preview, saves to DB
- [x] Email confirmation on booking (Resend sandbox — delivers to admin email only until domain verified)
- [x] Logo (SVG) in hero, nav, admin login
- [x] iOS Safari zoom fix (font-size ≥ 16px on inputs)
- [x] Mobile responsive nav (hamburger menu)
- [x] Company rate privacy: price shown after booking only if admin toggle is on

---

## Admin Panel — Live ✅

### Auth
- [x] Email + password login (Supabase Auth)
- [x] All `/admin` routes protected by middleware
- [x] Logout button

### Orders (`/admin/orders`)
- [x] Table: date, time, name, booking type, company, guests, visit type, total price
- [x] Filters: date range, company, individuals only, upcoming quick button
- [x] Revenue total (updates with filters)
- [x] Edit slide-over: date, time, guests, name, phone, email, notes
- [x] Delete with inline confirm
- [x] Print invoice: printer icon → Georgian-language invoice via browser print dialog

### Companies (`/admin/companies`)
- [x] Inline CRUD (add/edit/delete)
- [x] Identification code field (shown on invoices)
- [x] Price tiers: guest range + tasting rate + tasting+lunch rate + registration fee
- [x] Tier validation (no overlapping ranges)

### Wines (`/admin/wines`)
- [x] Full CRUD: name, type, price, color, active toggle, sort order
- [x] Inline image picker (6 product photos from nikalasmarani.ge)
- [x] Changes reflect immediately on public `/wines` page (force-dynamic)

### Wine Orders (`/admin/wine-orders`)
- [x] Table of B2B wine reservation requests from public `/wines` form

### Statistics (`/admin/statistics`)
- [x] V2 (default): upcoming bookings, year/month/company filters, horizontal bar charts
- [x] V1 (toggle): summary cards, monthly bar charts, visit/booking type breakdowns, top companies

### Settings (`/admin/settings`)
- [x] Toggle: show/hide company price on booking confirmation
- [x] Payment details: 5 fields (recipient name, personal ID, bank name, bank code, IBAN) — shown on printed invoices

### Invoice
- [x] Georgian-language layout: header, company, სადილი / დეგუსტაცია sections, total, payment details
- [x] Triggered by printer icon on orders table
- [x] Renders via React portal → single page, correct isolation with `@media print`

---

## v1.2 — Enhanced Company Booking (In Progress 🔄)

Full plan + steps: [[Plan-EnhancedCompanyBooking]]

- [ ] Step 1: DB schema — split guest counts, MenuItem, MasterclassItem, OrderMasterclass, OrderExtra
- [ ] Step 2: Menu Items admin (`/admin/menu-items`) — manage hot dish dropdown options
- [ ] Step 3: Masterclass admin (`/admin/masterclass`) — manage masterclass types + unit prices
- [ ] Step 4: Order detail page (`/admin/orders/[id]`) — view + edit enhanced fields, recalculate total
- [ ] Step 5: Admin create order (`/admin/orders/new`) — full company order from scratch
- [ ] Step 6: Public form toggle — settings switch enables enhanced form for company bookings
- [ ] Step 7: Invoice updates — reflect split counts + masterclass/extras as line items (optional)

---

## v1.1 — Remaining Items

- [ ] Fix date filters on admin orders panel (KnownBugs #1)
- [ ] Verify nikalasmarani.ge in Resend → unlock email to any customer
- [ ] Gallery page — wire up downloaded slider/gallery photos on public site
- [ ] Georgian / English language toggle

---

## v2 — Growth (Not Started)

- [ ] Online payments (Georgian bank or Stripe)
- [ ] Customer can view/cancel their own booking
- [ ] Multiple admin users with roles
- [ ] Availability limits (max bookings per time slot)
- [ ] Calendar view for bookings
- [ ] Export orders to CSV/Excel

---

## Out of Scope

| Feature | Decision |
|---|---|
| Multi-tenant (shared DB) | v3 — when 20+ clients |
| Mobile app | Not planned |
| Customer accounts | v2 |
| Block-out dates | v1.2 or later |

---

## Related
- [[Database Schema]]
- [[Roadmap]]
- [[SessionLog]]
- [[Plan-EnhancedCompanyBooking]]
