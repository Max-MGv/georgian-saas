-- Feature 191, contract step: replace the status reference tables with one
-- enum per order type plus milestone timestamps.
--
-- WHY THIS REPLACES THE DESIGN THE EARLIER MIGRATIONS BUILT (Max's call,
-- 2026-09-17, full reasoning in vault/Plan-StatusModel.md):
--
--   * A shared vocabulary table needed an `appliesTo` discriminator to say
--     which words belong to which order type. That filtered the dropdown but
--     never the foreign key, so nothing in the database stopped a booking
--     being marked DELIVERED. Two enums make it unrepresentable.
--   * The financial axis was a ladder (unpaid -> invoiced -> paid), so marking
--     an invoiced order paid erased the fact that an invoice had been sent.
--     Independent timestamps cannot overwrite one another.
--   * `paidAtStage` existed to place the Paid step on the flow-line without
--     timestamping every transition. With real timestamps the placement is a
--     comparison, and a timestamp cannot go stale the way a snapshotted code
--     could.
--   * The CHECK holding `paidAt` and `financialStatusId` in agreement is no
--     longer needed at all: paid-ness was stored twice and the two could
--     disagree. `paidAt` is now the only place it lives.
--
-- ALL ORDER DATA IS DELETED. Both databases held only test/seed rows on
-- 2026-09-17 and Max confirmed they are disposable. On a fresh database the
-- deletes below are no-ops.

-- ── 1. Wipe order data ──────────────────────────────────────────────────
-- Children first: Payment's order relations are optional, so an unguarded
-- delete of the parents would blank the references rather than remove the rows.
DELETE FROM "Payment";
DELETE FROM "OrderMasterclass";
DELETE FROM "OrderExtra";
DELETE FROM "WineOrderItem";
DELETE FROM "Order";
DELETE FROM "WineOrder";

-- ── 2. New stage enums ──────────────────────────────────────────────────
CREATE TYPE "BookingStage"  AS ENUM ('NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "WineOrderStage" AS ENUM ('NEW', 'CONFIRMED', 'DELIVERED', 'CANCELLED');

-- ── 3. Order ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "Order_tenantId_status_idx";

ALTER TABLE "Order"
  DROP CONSTRAINT IF EXISTS "Order_processStatusId_fkey",
  DROP CONSTRAINT IF EXISTS "Order_financialStatusId_fkey",
  DROP COLUMN "status",
  DROP COLUMN "processStatusId",
  DROP COLUMN "financialStatusId",
  DROP COLUMN "paidAtStage",
  ADD COLUMN "stage"         "BookingStage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "confirmedAt"   TIMESTAMP(3),
  ADD COLUMN "completedAt"   TIMESTAMP(3),
  ADD COLUMN "invoiceSentAt" TIMESTAMP(3),
  ADD COLUMN "abandonedAt"   TIMESTAMP(3);

CREATE INDEX "Order_tenantId_stage_idx"       ON "Order"("tenantId", "stage");
CREATE INDEX "Order_tenantId_abandonedAt_idx" ON "Order"("tenantId", "abandonedAt");

-- ── 4. WineOrder ────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "WineOrder_tenantId_status_idx";

ALTER TABLE "WineOrder"
  DROP CONSTRAINT IF EXISTS "WineOrder_processStatusId_fkey",
  DROP CONSTRAINT IF EXISTS "WineOrder_financialStatusId_fkey",
  DROP COLUMN "status",
  DROP COLUMN "processStatusId",
  DROP COLUMN "financialStatusId",
  DROP COLUMN "paidAtStage",
  ADD COLUMN "stage"       "WineOrderStage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "abandonedAt" TIMESTAMP(3);

CREATE INDEX "WineOrder_tenantId_stage_idx"       ON "WineOrder"("tenantId", "stage");
CREATE INDEX "WineOrder_tenantId_abandonedAt_idx" ON "WineOrder"("tenantId", "abandonedAt");

-- ── 5. Retire the reference tables and their enums ──────────────────────
DROP TABLE IF EXISTS "ProcessStatus";
DROP TABLE IF EXISTS "FinancialStatus";
DROP TYPE  IF EXISTS "StatusScope";
DROP TYPE  IF EXISTS "OrderStatus";

-- ── 6. Constraints ──────────────────────────────────────────────────────
-- `stage` is denormalised: it is derivable from the timestamps, and kept as a
-- column anyway because the board groups by it and every filter and count
-- reads it. These hold the two in agreement.
--
-- Deliberately only the CURRENT stage's own timestamp. A stricter "every stage
-- at or below the current one must have a date" would reject something
-- legitimate: an admin entering a walk-in order that is already complete never
-- passed through CONFIRMED, and inventing a date for it would be a lie.
-- NEW needs no timestamp (createdAt is it) and CANCELLED has no column.
ALTER TABLE "Order" ADD CONSTRAINT "Order_stage_has_timestamp" CHECK (
  ("stage" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL) AND
  ("stage" <> 'COMPLETED' OR "completedAt" IS NOT NULL)
);

ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_stage_has_timestamp" CHECK (
  ("stage" <> 'CONFIRMED' OR "confirmedAt" IS NOT NULL) AND
  ("stage" <> 'DELIVERED' OR "deliveredAt" IS NOT NULL)
);

-- An abandoned order is one that never completed. If money arrived it
-- completed, so the two can never both be true -- which is what lets every
-- surface test abandonment with a single `abandonedAt IS NULL` rather than a
-- compound condition a filter could get half right.
ALTER TABLE "Order" ADD CONSTRAINT "Order_abandoned_is_unpaid"
  CHECK ("abandonedAt" IS NULL OR "paidAt" IS NULL);

ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_abandoned_is_unpaid"
  CHECK ("abandonedAt" IS NULL OR "paidAt" IS NULL);
