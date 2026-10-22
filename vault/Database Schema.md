---
tags: [tech, database]
---

# Database Schema

Using **Prisma ORM** with **PostgreSQL** (hosted on Supabase).
Schema lives at `saas/prisma/schema.prisma`. After any change: `prisma db push --skip-generate`, then stop dev server and run `prisma generate`.

---

## Current Models (live in production)

### Company
Partner tour operators and agencies.
```prisma
model Company {
  id                 String   @id @default(cuid())
  name               String
  identificationCode String?  // Georgian legal ID shown on invoices
  orders             Order[]
  prices             Price[]
  createdAt          DateTime @default(now())
}
```

### Order
Every booking submitted (public form or admin). **Pricing fields as of 2026-10-22 (T-152 product model)** —
`saas/prisma/schema.prisma` is the source of truth for everything else (stage/milestone dates, payments,
contacts, nationalities). Money is **tetri** (Int, 100 = ₾1) since the 2026-09-18 money refactor.
```prisma
model Order {
  visitType           VisitType   // TASTING | TASTING_LUNCH | LUNCH (Lunch only: company simple form)
  bookingType         BookingType // INDIVIDUAL | COMPANY
  guestCount          Int         // = the four boxes below, summed — never typed (the kitchen count)
  tastingOnlyGuests   Int         // the boxes: every guest is in exactly one
  lunchOnlyGuests     Int
  tastingLunchGuests  Int
  freeGuestCount      Int         // guide, driver, under-12 — never charged
  tastingOnlyRate     Int?        // per-person rates this order was SOLD at (frozen; null = no guests on it /
  lunchOnlyRate       Int?        //   not priced yet). recalcOrderTotal re-prices from these, never live tiers.
  tastingLunchRate    Int?
  registrationFeeSnapshot Int?
  totalPrice          Int?        // Σ box × rate + registration + masterclass lines + extras
  hotDishVegetable    String?     // only when someone has lunch (A-11)
  hotDishMeat         String?
  foodNotes           String?
  // … plus contact, stage/milestones, payments, masterclassLines, extras — see schema.prisma
}
```

### Price
Per-company price table. One row = a guest range with a price per product.
```prisma
model Price {
  minGuests          Int
  maxGuests          Int
  tastingOnlyPrice   Int?   // tetri per person; null = not offered on this row (never ₾0)
  lunchOnlyPrice     Int?   //   blank for most companies — Lunch only is opt-in per company
  tastingLunchPrice  Int?   //   ALL-IN, not tasting + an add-on
  isDisplayPrice     Boolean
}
// Company.registrationFee Int — one flat fee per booking (was per row, as registrationPrice)
```

### Wine
Wine catalogue items shown on the public `/wines` page.
```prisma
model Wine {
  id        String   @id @default(cuid())
  name      String
  type      String   // e.g. "Red", "White", "Amber"
  price     Float
  color     String   @default("#7c1d23")  // hex, used as gradient fallback
  imagePath String?  // e.g. "/images/products/george.png"
  active    Boolean  @default(true)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
}
```

### WineOrder
B2B wine reservation requests from the `/wines` page reservation form.
```prisma
model WineOrder {
  id          String   @id @default(cuid())
  companyName String
  contactName String
  phone       String
  email       String?
  notes       String?
  createdAt   DateTime @default(now())
}
```

### Setting
Key-value store for admin-configurable settings.
```prisma
model Setting {
  key   String @id
  value String
}
```

**Current setting keys:**
| Key | Default | Purpose |
|---|---|---|
| `show_company_price_after_booking` | `false` | Show/hide price on booking confirmation for company bookings |
| `payment_recipient_name` | `""` | Invoice: recipient name |
| `payment_personal_number` | `""` | Invoice: personal ID number |
| `payment_bank_name` | `""` | Invoice: bank name |
| `payment_bank_code` | `""` | Invoice: bank SWIFT code |
| `payment_iban` | `""` | Invoice: IBAN |
| `enable_enhanced_company_booking` | `false` | *(planned v1.2 Step 6)* Toggle enhanced public form |

### MenuItem
Admin-managed hot dish options for company booking form dropdowns. Live at `/admin/menu-items`.
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

### MasterclassItem
Masterclass types with per-unit pricing. Live at `/admin/masterclass`.
```prisma
enum MasterclassUnit {
  PER_PERSON  // auto-multiplied by guest count
  PER_PIECE   // admin enters quantity per order
  FLAT        // fixed charge, added once
}

model MasterclassItem {
  id           String           @id @default(cuid())
  name         String           // e.g. "Churchkhela", "Khinkali", "Baklava"
  unitType     MasterclassUnit  @default(PER_PIECE)
  pricePerUnit Float
  active       Boolean          @default(true)
  sortOrder    Int              @default(0)
  createdAt    DateTime         @default(now())
  orderLines   OrderMasterclass[]
}
```
Shared types/labels live in `saas/lib/masterclass.ts` (neutral file, safe to import from server or client).

### OrderMasterclass
Junction table — which masterclass items are on an order.
```prisma
model OrderMasterclass {
  id                String          @id @default(cuid())
  orderId           String
  masterclassItemId String
  quantity          Int
  pricePerUnit      Float           // price snapshot at time of booking
  order             Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  masterclassItem   MasterclassItem @relation(fields: [masterclassItemId], references: [id])
}
```

### OrderExtra
Admin-entered extra charges on an order (additional wine, food, etc.)
```prisma
model OrderExtra {
  id      String  @id @default(cuid())
  orderId String
  label   String  // e.g. "Additional wine", "Extra food"
  amount  Float   // total ₾ for this line
  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
}
```

---

## Pricing Logic

**The product model (T-152, 2026-10-22)** — full rules and where they live: [[MaintenanceNotes]] §22.
```
each product with guests finds its row by ITS OWN count (no exact row → highest-priced row offering it)
totalPrice = Σ (box × that product's rate) + registration fee + Σ masterclass (qty × catalogue price) + Σ extras
```
A product with guests but no rate is refused on the public form ("not offered") and needs a typed rate on the
admin screens. Free guests are never charged. The old "party size picks one tier" rule (2026-09-19) is retired.

---

## Related
- [[Architecture]]
- [[Tech Stack]]
- [[Plan-EnhancedCompanyBooking]]
