---
tags: [research, discovery]
---

# Product Analysis — nikalasmarani.ge

Reference product audit. Last checked: 2026-05-17.

---

## What the site does today

### Public pages
| Page | What's there |
|---|---|
| Home | Hero, packages overview, gallery slider, contact info |
| Wine Ordering | Booking form + package selection |
| Gallery | Photo gallery |
| About | Winery info |
| Contact | Address, phone, email, map |

### Booking packages
| Package | Price | Minimum |
|---|---|---|
| Basic Tasting | 50₾/person | 200₾ (4 people minimum effective) |
| Tasting + Full Meal | 100₾/person | 400₾ (4 people minimum effective) |

Time slots: 11:00–18:00 (selector on form)

### Booking form fields (visible)
- Visit type (tasting / tasting+meal) — implicit from package selection
- Time slot
- Total price display (read-only, calculated)
- *(Full field list needs manual walkthrough — email, name, guest count likely present but not confirmed from HTML)*

### Wine catalogue
6 wines listed with images and "View Details" links:
- Saperavi Petnat (2022)
- Rkacikheli Petnat (2022)
- Rkacikheli (2022)
- Saperavi (2022)
- Budeshuri Saperavi (2022)
- Rkacikheli Qisi (2022)

### Other
- Language toggle: Georgian / English
- Shopping cart icon (unclear if functional)
- Facebook links
- Privacy Policy, Terms and Conditions, Return Policy pages
- 48-hour cancellation policy for refunds

---

## What the site is missing (our opportunity)

| Gap | Our solution |
|---|---|
| No admin panel | Admin panel is our core product |
| No order management | Orders list + detail + edit/delete |
| No partner company pricing | Companies + Prices module |
| No revenue statistics | Statistics page with charts |
| No booking confirmation email (unclear) | Email confirmation via Resend |
| No calendar view for bookings | Calendar view in v1.1 |

---

## Decisions needed

- [ ] Do we clone the public-facing winery site (home, about, gallery) or only build the booking widget + admin panel?
  - *Option A:* Full site replacement (more value, more work)
  - *Option B:* Booking widget only, client keeps existing site and embeds our form (faster MVP)
- [ ] Is the wine catalogue (product listings) part of our scope?
- [ ] Do we replicate the minimum order logic (e.g. 200₾ min for basic)?

---

## Related

- [[Roadmap]]
- [[MVP Features]]
- [[Business Model]]
