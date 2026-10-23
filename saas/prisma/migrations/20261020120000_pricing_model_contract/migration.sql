-- Plan-PricingModel Chunk 4 (T-152) — contract. Hand-written (prisma migrate diff output + a backfill re-run).
-- RUN ONLY AFTER the code without the old fields is deployed: an app whose Prisma client still knows the old
-- columns selects them on every query and would fail once they are gone. (Production runbook step 6.)

-- ── 1. Final idempotent backfill: rows the OLD code wrote after the expand migration ───────────────────
-- Same statements as 20261019210217_pricing_model_expand (minus the once-only company fee). Touches only
-- rows whose new columns are still NULL.
-- Price: Tasting only = old tasting price; Tasting & Lunch = old tasting + old lunch add-on
-- (all-in, same money — A-1); Lunch only stays NULL = not offered (D-7).
-- A real new-model row never has all three NULL, so that is the "not yet converted" marker.
UPDATE "Price"
SET "tastingOnlyPrice"  = "pricePerPerson",
    "tastingLunchPrice" = "pricePerPerson" + "tastingLunchPricePerPerson"
WHERE "tastingOnlyPrice" IS NULL AND "lunchOnlyPrice" IS NULL AND "tastingLunchPrice" IS NULL;

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

-- ── 2. Contract: counts required, old columns gone ─────────────────────────────────────────────────────
-- AlterTable
ALTER TABLE "InvoiceSent" DROP COLUMN "lunchGuestCount",
DROP COLUMN "tastingGuestCount",
ALTER COLUMN "lunchOnlyGuests" SET NOT NULL,
ALTER COLUMN "lunchOnlyGuests" SET DEFAULT 0,
ALTER COLUMN "tastingLunchGuests" SET NOT NULL,
ALTER COLUMN "tastingLunchGuests" SET DEFAULT 0,
ALTER COLUMN "tastingOnlyGuests" SET NOT NULL,
ALTER COLUMN "tastingOnlyGuests" SET DEFAULT 0;
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "lunchGuestCount",
DROP COLUMN "lunchRateSnapshot",
DROP COLUMN "tastingGuestCount",
DROP COLUMN "tastingRateSnapshot",
ALTER COLUMN "lunchOnlyGuests" SET NOT NULL,
ALTER COLUMN "lunchOnlyGuests" SET DEFAULT 0,
ALTER COLUMN "tastingLunchGuests" SET NOT NULL,
ALTER COLUMN "tastingLunchGuests" SET DEFAULT 0,
ALTER COLUMN "tastingOnlyGuests" SET NOT NULL,
ALTER COLUMN "tastingOnlyGuests" SET DEFAULT 0;
-- AlterTable
ALTER TABLE "Price" DROP COLUMN "pricePerPerson",
DROP COLUMN "registrationPrice",
DROP COLUMN "tastingLunchPricePerPerson";
