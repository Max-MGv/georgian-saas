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
Every booking submitted (public form or admin).
```prisma
model Order {
  id                  String             @id @default(cuid())
  date                DateTime
  timeSlot            String
  bookingType         String             // "INDIVIDUAL" | "COMPANY"
  visitType           String             // "TASTING" | "TASTING_LUNCH"
  guestCount          Int
  lunchGuestCount     Int                @default(0)
  tastingGuestCount   Int                @default(0)
  freeGuestCount      Int                @default(0)   // guide, driver, under-12 — no charge
  hotDishVegetable    String?            // snapshot of selected menu item name
  hotDishMeat         String?            // snapshot of selected menu item name
  foodNotes           String?            // free-text kitchen notes
  name                String
  surname             String
  email               String?
  phone               String?
  notes               String?
  totalPrice          Float?
  companyId           String?
  company             Company?           @relation(fields: [companyId], references: [id])
  masterclassLines    OrderMasterclass[]
  extras              OrderExtra[]
  createdAt           DateTime           @default(now())
}
```

### Price
Per-company pricing tiers by group size.
```prisma
model Price {
  id                       String  @id @default(cuid())
  companyId                String
  company                  Company @relation(fields: [companyId], references: [id])
  minGuests                Int
  maxGuests                Int
  pricePerPerson           Float   // tasting rate
  tastingLunchPricePerPerson Float @default(0)  // tasting+lunch rate
  registrationPrice        Float
}
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

### Current (simple)
```
totalPrice = guestCount × ratePerPerson + registrationPrice

ratePerPerson = visitType === 'TASTING'
  ? price.pricePerPerson
  : price.tastingLunchPricePerPerson || price.pricePerPerson
```

### Enhanced (Step 4 — order detail UI, in progress)
```
totalPrice =
  (tastingGuestCount × price.pricePerPerson) +
  (lunchGuestCount   × price.tastingLunchPricePerPerson) +
  price.registrationPrice +
  Σ(masterclassLines: quantity × pricePerUnit) +
  Σ(extras: amount)
```
Falls back to current logic if split counts are all 0. DB schema is ready; recalculation UI comes in Step 4.

---

## Related
- [[Architecture]]
- [[Tech Stack]]
- [[Plan-EnhancedCompanyBooking]]
