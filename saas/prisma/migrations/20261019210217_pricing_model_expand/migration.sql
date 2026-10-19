-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "registrationFee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceSent" ADD COLUMN     "lunchOnlyGuests" INTEGER,
ADD COLUMN     "tastingLunchGuests" INTEGER,
ADD COLUMN     "tastingOnlyGuests" INTEGER,
ALTER COLUMN "tastingGuestCount" SET DEFAULT 0,
ALTER COLUMN "lunchGuestCount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "lunchOnlyGuests" INTEGER,
ADD COLUMN     "lunchOnlyRate" INTEGER,
ADD COLUMN     "tastingLunchGuests" INTEGER,
ADD COLUMN     "tastingLunchRate" INTEGER,
ADD COLUMN     "tastingOnlyGuests" INTEGER,
ADD COLUMN     "tastingOnlyRate" INTEGER;

-- AlterTable
ALTER TABLE "Price" ADD COLUMN     "lunchOnlyPrice" INTEGER,
ADD COLUMN     "tastingLunchPrice" INTEGER,
ADD COLUMN     "tastingOnlyPrice" INTEGER,
ALTER COLUMN "pricePerPerson" SET DEFAULT 0;

-- ════════════════════════════════════════════════════════════════════════════
-- Backfill (Plan-PricingModel §4.1, T-152). Hand-written; mirrors
-- countsFromLegacy() in lib/pricingUtils.ts exactly — scripts/_qa/pricing-expand-check.ts
-- compares every row against it. IDEMPOTENT: each statement only touches rows whose
-- new columns are still NULL, so it is re-run safely in Chunks 3 and 4 (and on
-- production after the code merge) for rows the old code wrote in between.
-- Old columns are NOT changed, so the old code keeps working on this schema.
-- ════════════════════════════════════════════════════════════════════════════

-- Price: Tasting only = old tasting price; Tasting & Lunch = old tasting + old lunch add-on
-- (all-in, same money — A-1); Lunch only stays NULL = not offered (D-7).
-- A real new-model row never has all three NULL, so that is the "not yet converted" marker.
UPDATE "Price"
SET "tastingOnlyPrice"  = "pricePerPerson",
    "tastingLunchPrice" = "pricePerPerson" + "tastingLunchPricePerPerson"
WHERE "tastingOnlyPrice" IS NULL AND "lunchOnlyPrice" IS NULL AND "tastingLunchPrice" IS NULL;

-- Company registration fee = the highest fee on its tiers (A-3). Run here only: after this
-- the company fee is edited directly and must not be overwritten by a re-run.
UPDATE "Company" c
SET "registrationFee" = x.fee
FROM (SELECT "companyId", MAX("registrationPrice") AS fee FROM "Price" GROUP BY "companyId") x
WHERE x."companyId" = c.id AND x.fee > 0 AND c."registrationFee" = 0;

-- Order: split → old tasting = Tasting only, old lunch (who also tasted) = Tasting & Lunch,
-- guests the split left out join Free (E-2, they were never charged). Unsplit → the whole
-- guestCount is on the visit type's product and any free count folds in (E-1: old unsplit
-- pricing charged them). Frozen rates copied as they are (old lunch rate is already all-in).
-- Every right-hand side reads the OLD row values (standard UPDATE semantics).
UPDATE "Order"
SET "tastingOnlyGuests" = CASE
      WHEN "tastingGuestCount" + "lunchGuestCount" > 0 THEN "tastingGuestCount"
      WHEN "visitType" = 'TASTING_LUNCH' THEN 0
      ELSE "guestCount" END,
    "lunchOnlyGuests" = 0,
    "tastingLunchGuests" = CASE
      WHEN "tastingGuestCount" + "lunchGuestCount" > 0 THEN "lunchGuestCount"
      WHEN "visitType" = 'TASTING_LUNCH' THEN "guestCount"
      ELSE 0 END,
    "freeGuestCount" = CASE
      WHEN "tastingGuestCount" + "lunchGuestCount" > 0
        THEN "freeGuestCount" + GREATEST(0, "guestCount" - ("tastingGuestCount" + "lunchGuestCount" + "freeGuestCount"))
      ELSE 0 END,
    "tastingOnlyRate"  = "tastingRateSnapshot",
    "tastingLunchRate" = "lunchRateSnapshot"
WHERE "tastingOnlyGuests" IS NULL;

-- InvoiceSent (append-only, MaintenanceNotes §31): the same facts under the new names. No
-- billed number changes and freeGuestCount is left exactly as it was sent.
UPDATE "InvoiceSent"
SET "tastingOnlyGuests" = CASE
      WHEN "tastingGuestCount" + "lunchGuestCount" > 0 THEN "tastingGuestCount"
      WHEN "visitType" = 'TASTING_LUNCH' THEN 0
      ELSE "guestCount" END,
    "lunchOnlyGuests" = 0,
    "tastingLunchGuests" = CASE
      WHEN "tastingGuestCount" + "lunchGuestCount" > 0 THEN "lunchGuestCount"
      WHEN "visitType" = 'TASTING_LUNCH' THEN "guestCount"
      ELSE 0 END
WHERE "tastingOnlyGuests" IS NULL;
