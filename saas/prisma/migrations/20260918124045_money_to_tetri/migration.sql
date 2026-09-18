-- Money becomes an integer number of tetri (chunk 3 of vault/DataModel/Plan-DataModel.md).
--
-- Float cannot represent 0.10 exactly, so sums drift and an invoice ends up
-- disagreeing with the gateway by a tetri. Flitt has always been *sent* tetri
-- (toMinorUnits in lib/payments/flitt.ts); this moves that conversion from the
-- edge of the payment call to the edge of the database.
--
-- WRITTEN BY HAND, DELIBERATELY. `prisma migrate dev` generates
-- `ALTER TABLE ... TYPE INTEGER` with a plain cast, which turns 45.0 into 45 —
-- not 4550 — and would have silently divided every catalog price by 100.
-- The USING clauses below are the whole point of this file.
--
-- Safe because no surviving value has sub-tetri precision: verified 2026-09-18
-- that zero rows in Price, WineVintage or MasterclassItem have more than two
-- decimal places, so ROUND(x * 100) is exact and lossless.

-- ── 1. Wipe transactional data ────────────────────────────────────────────────
-- Authorised by Max on 2026-09-18 and re-confirmed on the day: all of it is
-- fake on both dev and production. Company is deliberately NOT wiped — deleting
-- it would cascade away Price, CompanyGuide and CompanyRepresentative, and
-- price tiers are tenant configuration, not disposable test data.
--
-- Explicit and in dependency order rather than relying on the cascades, so this
-- file states exactly what it destroys.
DELETE FROM "Payment";
DELETE FROM "OrderExtra";
DELETE FROM "OrderMasterclass";
DELETE FROM "WineOrderItem";
DELETE FROM "Order";
DELETE FROM "WineOrder";

-- ── 2. Catalog prices: convert, do not drop ───────────────────────────────────
-- These survive the wipe and hold real configuration. ×100 with rounding.
ALTER TABLE "Price"
  ALTER COLUMN "pricePerPerson" TYPE INTEGER USING ROUND("pricePerPerson" * 100),
  ALTER COLUMN "tastingLunchPricePerPerson" TYPE INTEGER USING ROUND("tastingLunchPricePerPerson" * 100),
  ALTER COLUMN "registrationPrice" TYPE INTEGER USING ROUND("registrationPrice" * 100);

ALTER TABLE "WineVintage"
  ALTER COLUMN "price" TYPE INTEGER USING ROUND("price" * 100);

ALTER TABLE "MasterclassItem"
  ALTER COLUMN "pricePerUnit" TYPE INTEGER USING ROUND("pricePerUnit" * 100);

-- ── 3. Transactional money columns ────────────────────────────────────────────
-- Emptied in step 1, so these touch zero rows. The USING clause is kept anyway
-- so the file is correct if it is ever replayed against data.
ALTER TABLE "Order"
  ALTER COLUMN "totalPrice" TYPE INTEGER USING ROUND("totalPrice" * 100);

ALTER TABLE "WineOrder"
  ALTER COLUMN "totalAmount" TYPE INTEGER USING ROUND("totalAmount" * 100);

ALTER TABLE "OrderExtra"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);

ALTER TABLE "OrderMasterclass"
  ALTER COLUMN "pricePerUnit" TYPE INTEGER USING ROUND("pricePerUnit" * 100);

ALTER TABLE "WineOrderItem"
  ALTER COLUMN "priceSnapshot" TYPE INTEGER USING ROUND("priceSnapshot" * 100);

ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);
