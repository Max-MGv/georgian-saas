-- Delivery zones, pickup and delivery fee columns (T-8, vault/Plan-WineOrderFeatures.md Chunk 4)
--
-- Additive only. Every existing order becomes fulfilment DELIVERY with no fee and nothing
-- pending, i.e. exactly what it was. WineOrder.totalAmount stays wines-only (Max, 2026-10-12).

-- CreateEnum
CREATE TYPE "WineFulfilment" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterTable
ALTER TABLE "CompanyAddress" ADD COLUMN     "deliveryZoneId" TEXT;

-- AlterTable
ALTER TABLE "WineOrder" ADD COLUMN     "deliveryFee" INTEGER,
ADD COLUMN     "deliveryFeePending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryZoneId" TEXT,
ADD COLUMN     "deliveryZoneName" TEXT,
ADD COLUMN     "fulfilment" "WineFulfilment" NOT NULL DEFAULT 'DELIVERY';

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameKa" TEXT,
    "fee" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryZone_tenantId_idx" ON "DeliveryZone"("tenantId");

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Money guards (CHECK, not just app code) ───────────────────────────────────────────────
-- A fee is tetri: whole and never negative. A pickup order carries no delivery fee or zone.
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_fee_nonnegative" CHECK ("fee" >= 0);
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_deliveryFee_nonnegative"
  CHECK ("deliveryFee" IS NULL OR "deliveryFee" >= 0);
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_pickup_has_no_delivery"
  CHECK ("fulfilment" <> 'PICKUP' OR ("deliveryFee" IS NULL AND "deliveryZoneId" IS NULL AND "deliveryFeePending" = false));

-- ── Row-level security: DeliveryZone carries its own tenantId → direct policy ─────────────
-- In the migration (not only scripts/setup-rls.ts) so production needs only `migrate deploy`.
ALTER TABLE "DeliveryZone" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "DeliveryZone"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "DeliveryZone" TO app_user';
  END IF;
  -- Second, independent lock against Supabase's REST API (KnownBugs #73).
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "DeliveryZone" FROM %I', r);
    END IF;
  END LOOP;
END
$$;
