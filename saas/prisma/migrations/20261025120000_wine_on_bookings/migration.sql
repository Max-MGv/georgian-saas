-- Wine for the table on bookings + guest purchases (T-22, vault/Plan-AddOnsAndWine.md — Part B)
--
-- Additive for every reader that exists today:
--   * WineVintage.bookable (default false → no wine is offered on any booking until the admin switches it on)
--   * WineOrderItem may now belong to a BOOKING (orderId) instead of a wine order (wineOrderId) — exactly one (CHECK);
--     it gains negotiated / discountPercent / lineTotal (what THIS line was charged, rounded per line — Max, C-1)
--   * WineOrder.sourceOrderId — "the visit this order came out of" (guest purchases), SET NULL if the booking goes
--   * AddOnGroup.kind (ITEMS | WINE) — the one "Wine for the table" row among the add-on groups
--   * the WineOrderItem tenant policy now also accepts a line whose parent is one of the tenant's bookings
-- Every existing wine line gets its lineTotal; each discounted order's lines add up to its stored totalAmount exactly.

-- CreateEnum
CREATE TYPE "AddOnGroupKind" AS ENUM ('ITEMS', 'WINE');

-- AlterTable
ALTER TABLE "AddOnGroup" ADD COLUMN "kind" "AddOnGroupKind" NOT NULL DEFAULT 'ITEMS';

-- At most one "Wine for the table" group per winery
CREATE UNIQUE INDEX "AddOnGroup_one_wine_per_tenant" ON "AddOnGroup"("tenantId") WHERE "kind" = 'WINE';

-- AlterTable
ALTER TABLE "WineVintage" ADD COLUMN "bookable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WineOrderItem" ALTER COLUMN "wineOrderId" DROP NOT NULL,
ADD COLUMN "orderId" TEXT,
ADD COLUMN "negotiated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "discountPercent" DOUBLE PRECISION,
ADD COLUMN "lineTotal" INTEGER;

-- AlterTable
ALTER TABLE "WineOrder" ADD COLUMN "sourceOrderId" TEXT;

-- CreateIndex
CREATE INDEX "WineOrderItem_orderId_idx" ON "WineOrderItem"("orderId");
CREATE INDEX "WineOrder_tenantId_sourceOrderId_idx" ON "WineOrder"("tenantId", "sourceOrderId");

-- AddForeignKey
ALTER TABLE "WineOrderItem" ADD CONSTRAINT "WineOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill: every existing wine line gets its lineTotal (idempotent — guarded by lineTotal IS NULL) ──────────
-- 1. Orders without a company %: the line is exactly quantity × the price charged per bottle.
UPDATE "WineOrderItem" i
SET "lineTotal" = i."quantity" * i."priceSnapshot"
FROM "WineOrder" o
WHERE o."id" = i."wineOrderId" AND i."lineTotal" IS NULL AND COALESCE(o."discountPercent", 0) <= 0;

-- 2. Orders with a company %: each line rounded on its own (C-1), the % recorded on the line.
--    (An older line does not say whether its price was a negotiated one; every line is treated as standard here.)
UPDATE "WineOrderItem" i
SET "lineTotal" = ROUND(i."quantity" * i."priceSnapshot" * (100 - LEAST(o."discountPercent", 100)) / 100.0)::int,
    "discountPercent" = LEAST(o."discountPercent", 100)
FROM "WineOrder" o
WHERE o."id" = i."wineOrderId" AND i."lineTotal" IS NULL AND COALESCE(o."discountPercent", 0) > 0;

-- 3. Make each discounted order's lines add up to its stored totalAmount exactly: the difference (a few tetri of rounding, or a
--    negotiated line the step above could not know about) goes on the order's biggest line. Nothing moves when it already adds up.
WITH diff AS (
  SELECT o."id" AS oid, o."totalAmount" - SUM(i."lineTotal") AS d
  FROM "WineOrder" o JOIN "WineOrderItem" i ON i."wineOrderId" = o."id"
  WHERE COALESCE(o."discountPercent", 0) > 0 AND o."totalAmount" IS NOT NULL
  GROUP BY o."id", o."totalAmount"
  HAVING o."totalAmount" <> SUM(i."lineTotal")
), big AS (
  SELECT DISTINCT ON (i."wineOrderId") i."id" AS iid, i."wineOrderId" AS oid
  FROM "WineOrderItem" i JOIN diff ON diff.oid = i."wineOrderId"
  ORDER BY i."wineOrderId", i."quantity" * i."priceSnapshot" DESC, i."id"
)
UPDATE "WineOrderItem" i
SET "lineTotal" = i."lineTotal" + diff.d
FROM big JOIN diff ON diff.oid = big.oid
WHERE i."id" = big.iid;

-- ── Guards (CHECK, not just app code) ──────────────────────────────────────────────────────
-- A wine line belongs to exactly one parent: a wine order or a booking. NOT VALID first so a mistake in existing rows cannot
-- block the deploy half-way, then VALIDATE (every existing row has a wine order).
ALTER TABLE "WineOrderItem" ADD CONSTRAINT "WineOrderItem_one_parent" CHECK (num_nonnulls("wineOrderId", "orderId") = 1) NOT VALID;
ALTER TABLE "WineOrderItem" VALIDATE CONSTRAINT "WineOrderItem_one_parent";
ALTER TABLE "WineOrderItem" ADD CONSTRAINT "WineOrderItem_lineTotal_nonnegative" CHECK ("lineTotal" IS NULL OR "lineTotal" >= 0);

-- ── Row-level security: a wine line belongs to the tenant through its wine order OR its booking ─────────────────
DROP POLICY IF EXISTS tenant_isolation ON "WineOrderItem";
CREATE POLICY tenant_isolation ON "WineOrderItem"
  USING (
    EXISTS (SELECT 1 FROM "WineOrder" wo WHERE wo."id" = "WineOrderItem"."wineOrderId" AND wo."tenantId" = current_setting('app.tenant_id', true))
    OR EXISTS (SELECT 1 FROM "Order" o WHERE o."id" = "WineOrderItem"."orderId" AND o."tenantId" = current_setting('app.tenant_id', true))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "WineOrder" wo WHERE wo."id" = "WineOrderItem"."wineOrderId" AND wo."tenantId" = current_setting('app.tenant_id', true))
    OR EXISTS (SELECT 1 FROM "Order" o WHERE o."id" = "WineOrderItem"."orderId" AND o."tenantId" = current_setting('app.tenant_id', true))
  );
