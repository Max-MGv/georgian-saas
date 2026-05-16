---
tags: [features, mvp]
---

# MVP Features (v1)

Goal: a winery owner can manage their entire booking operation through this app.

---

## Public Side (customer-facing)

- [ ] Booking form
  - Visit type selector: Wine Tasting / Tasting + Lunch
  - Fields: Name, Surname, Email, Phone, Date, Time, Number of guests
  - Submit button → confirmation message shown
- [ ] No login required for customers

---

## Admin Panel (owner-facing)

### Auth
- [ ] Email + password login (Supabase Auth)
- [ ] All `/admin` routes redirect to login if not authenticated
- [ ] Logout button

### Orders
- [ ] List all bookings (table view)
- [ ] Filter by: date range, company
- [ ] Per-row: edit button, delete button, print button
- [ ] Edit modal: change any field, add internal notes
- [ ] Revenue total shown at bottom of filtered list

### Companies
- [ ] List of partner companies (tour operators, agencies)
- [ ] Add new company
- [ ] Edit / delete company

### Prices
- [ ] Per-company pricing tiers based on group size
- [ ] Fields: company, max guests threshold, price per person, registration price
- [ ] Add / edit / delete price rows

### Statistics
- [ ] Summary cards: total bookings, total revenue, last booking date
- [ ] Revenue by month (bar chart)
- [ ] Revenue by company (bar chart or list)
- [ ] Filter by year, month, company

---

## Out of Scope for v1

| Feature | When |
|---|---|
| Georgian ↔ English toggle | v1.1 |
| Online payments (card/bank) | v2 |
| Customer accounts | v2 |
| Email confirmation to customer | v1.1 (easy with Resend) |
| Mobile app | Not planned |
| Calendar / availability view | v1.1 |
| Multi-tenant (shared DB) | When 20+ clients |

---

## Related

- [[Database Schema]]
- [[Roadmap]]
