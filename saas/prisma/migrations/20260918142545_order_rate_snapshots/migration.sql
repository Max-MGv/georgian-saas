-- Rate snapshots on Order, in tetri (chunk 4 of vault/DataModel/Plan-DataModel.md).
--
-- recalcOrderTotal re-read the company's LIVE Price rows, so changing a
-- company's rates and then touching an old booking — adding an extra, editing
-- guest counts — silently re-priced the whole booking at today's rates. A fact
-- must not move when a dimension changes. Same reason OrderMasterclass.
-- pricePerUnit and WineOrderItem.priceSnapshot already exist; this makes
-- bookings consistent with them.
--
-- Nullable: orders created before this column existed have no snapshot, and
-- recalc falls back to the old live-tier lookup for them (and says so in the
-- log). New orders always carry one.
ALTER TABLE "Order"
  ADD COLUMN "tastingRateSnapshot" INTEGER,
  ADD COLUMN "lunchRateSnapshot" INTEGER,
  ADD COLUMN "registrationFeeSnapshot" INTEGER;
