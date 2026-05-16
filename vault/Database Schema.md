---
tags: [tech, database]
---

# Database Schema

Using **Prisma ORM** with **PostgreSQL** (hosted on Supabase).

---

## Schema

```prisma
model Company {
  id     String  @id @default(cuid())
  name   String
  orders Order[]
  prices Price[]
}

model Order {
  id            String    @id @default(cuid())
  date          DateTime
  time          String
  guestCount    Int
  visitType     String    // "tasting" | "tasting_lunch"
  name          String
  surname       String
  email         String?
  phone         String?
  notes         String?
  price         Float?
  companyId     String?
  company       Company?  @relation(fields: [companyId], references: [id])
  createdAt     DateTime  @default(now())
}

model Price {
  id                String  @id @default(cuid())
  companyId         String
  company           Company @relation(fields: [companyId], references: [id])
  maxGuests         Int
  pricePerPerson    Float
  registrationPrice Float
}
```

---

## How Pricing Works

The `Price` table stores tiers: if a group from company X has up to N guests, charge Y per person.

Example (matching the nikalasmarani reference):

| Company | Max guests | Price/person | Registration |
|---|---|---|---|
| გიორგია ტრაველი | 2 | 75 | 75 |
| გიორგია ტრაველი | 3 | 60 | 60 |
| გიორგია ტრაველი | 24 | 50 | 45 |
| გიორგია ტრაველი | 48 | 45 | 35 |
| გიორგია ტრაველი | 70 | 40 | 30 |

When an order comes in, find the price row where `maxGuests >= order.guestCount` (lowest matching threshold).

---

## Future Fields to Add (v1.1+)

- `Order.language` — for multilingual support
- `Order.status` — confirmed / pending / cancelled
- `Order.source` — website / phone / instagram / referral
- `User` model — if multiple staff need admin access

---

## Related

- [[Tech Stack]]
- [[MVP Features]]
