-- Add-on groups (T-7, vault/Plan-AddOnsAndWine.md — Part A: add-ons; wine on bookings is a separate, later migration)
--
-- Additive for every reader that exists today: new table, new nullable columns, and ONE relaxed constraint
-- (OrderMasterclass.masterclassItemId may now be NULL, and deleting an item sets it NULL instead of being refused —
-- KnownBugs #94). Old code keeps working against this schema; its only difference is that an item with order lines can
-- now be deleted, after which the old order page would not know what to call the line. New code reads the snapshots.
--
-- Every existing item lands in one "Masterclass" group per winery, shown to companies only and on every visit type —
-- exactly what the booking form did before. Every existing order line gets its snapshots filled from its item.

-- CreateTable
CREATE TABLE "AddOnGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameKa" TEXT,
    "showToCompanies" BOOLEAN NOT NULL DEFAULT true,
    "showToIndividuals" BOOLEAN NOT NULL DEFAULT false,
    "visitTypes" "VisitType"[] DEFAULT ARRAY[]::"VisitType"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddOnGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AddOnGroup_tenantId_idx" ON "AddOnGroup"("tenantId");

-- AlterTable
ALTER TABLE "MasterclassItem" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "nameKa" TEXT;

-- AlterTable
ALTER TABLE "OrderMasterclass" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "groupNameKaSnapshot" TEXT,
ADD COLUMN     "groupNameSnapshot" TEXT,
ADD COLUMN     "nameKaSnapshot" TEXT,
ADD COLUMN     "nameSnapshot" TEXT,
ADD COLUMN     "unitSnapshot" "MasterclassUnit",
ALTER COLUMN "masterclassItemId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "MasterclassItem_groupId_idx" ON "MasterclassItem"("groupId");

-- AddForeignKey
ALTER TABLE "MasterclassItem" ADD CONSTRAINT "MasterclassItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AddOnGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: the line keeps its snapshot when the group goes
ALTER TABLE "OrderMasterclass" ADD CONSTRAINT "OrderMasterclass_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AddOnGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace the item foreign key: RESTRICT → SET NULL (the line is a snapshot; deleting a used item must not be refused)
ALTER TABLE "OrderMasterclass" DROP CONSTRAINT "OrderMasterclass_masterclassItemId_fkey";
ALTER TABLE "OrderMasterclass" ADD CONSTRAINT "OrderMasterclass_masterclassItemId_fkey" FOREIGN KEY ("masterclassItemId") REFERENCES "MasterclassItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Row-level security: AddOnGroup carries its own tenantId → direct policy ───────────────
-- In the migration (not only scripts/setup-rls.ts) so production needs only `migrate deploy`.
ALTER TABLE "AddOnGroup" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AddOnGroup"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "AddOnGroup" TO app_user';
  END IF;
  -- Second, independent lock against Supabase's REST API (KnownBugs #73).
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AddOnGroup" FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- ── Backfill (idempotent: every statement is guarded, a re-run changes nothing) ───────────
-- 1. One "Masterclass" group per winery that has items. The name is the winery's own booking-form header
--    (Content → Booking form → "Masterclass Add-ons header") when they customised it, else the plain word.
--    Deterministic id (md5 of the tenant) so a re-run cannot create a second group.
INSERT INTO "AddOnGroup" ("id", "tenantId", "nameEn", "nameKa", "showToCompanies", "showToIndividuals", "sortOrder")
SELECT 'ag' || substr(md5(t."tenantId" || ':masterclass'), 1, 22),
       t."tenantId",
       COALESCE((SELECT sc."value" FROM "SiteContent" sc WHERE sc."tenantId" = t."tenantId" AND sc."key" = 'form_masterclass_header' AND sc."locale" = 'en' LIMIT 1), 'Masterclass'),
       COALESCE((SELECT sc."value" FROM "SiteContent" sc WHERE sc."tenantId" = t."tenantId" AND sc."key" = 'form_masterclass_header' AND sc."locale" = 'ka' LIMIT 1), 'მასტერკლასი'),
       true,
       false,
       0
FROM (SELECT DISTINCT "tenantId" FROM "MasterclassItem" WHERE "tenantId" IS NOT NULL) t
WHERE NOT EXISTS (SELECT 1 FROM "AddOnGroup" g WHERE g."tenantId" = t."tenantId");

-- 2. Every item without a group goes into its winery's first group.
UPDATE "MasterclassItem" i
SET "groupId" = (SELECT g."id" FROM "AddOnGroup" g WHERE g."tenantId" = i."tenantId" ORDER BY g."sortOrder", g."createdAt", g."id" LIMIT 1)
WHERE i."groupId" IS NULL AND i."tenantId" IS NOT NULL;

-- 3. Every order line gets the snapshots of its item and group (what the invoice said stays what it said).
UPDATE "OrderMasterclass" l
SET "nameSnapshot" = i."name",
    "nameKaSnapshot" = i."nameKa",
    "unitSnapshot" = i."unitType",
    "groupId" = i."groupId",
    "groupNameSnapshot" = g."nameEn",
    "groupNameKaSnapshot" = g."nameKa"
FROM "MasterclassItem" i
LEFT JOIN "AddOnGroup" g ON g."id" = i."groupId"
WHERE l."masterclassItemId" = i."id" AND l."nameSnapshot" IS NULL;
