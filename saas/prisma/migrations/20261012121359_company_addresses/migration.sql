-- Company addresses (T-13, vault/Plan-WineOrderFeatures.md Chunk 1)
--
-- A company can have several delivery addresses ("Vake branch", "Saburtalo branch") and a wine
-- order records which one it went to. Additive only: nothing is dropped. Company.address stays
-- until production has run this backfill; a later cleanup migration drops it.

-- AlterTable
ALTER TABLE "WineOrder" ADD COLUMN     "addressLabel" TEXT,
ADD COLUMN     "companyAddressId" TEXT;

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT,
    "address" TEXT NOT NULL,
    "workingHours" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_idx" ON "CompanyAddress"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_companyAddressId_fkey" FOREIGN KEY ("companyAddressId") REFERENCES "CompanyAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill: every company's existing address becomes its first CompanyAddress ──────────
-- Configuration someone typed, so it is carried across rather than left behind. Whitespace-only
-- values are skipped (they were never a real address). Past wine orders are NOT linked to the
-- new rows: their address text is already their snapshot, and guessing a link would invent a
-- fact nobody recorded.
INSERT INTO "CompanyAddress" ("id", "companyId", "label", "address", "workingHours", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    c."id",
    NULL,
    btrim(c."address"),
    NULL,
    0,
    true,
    c."createdAt",
    CURRENT_TIMESTAMP
FROM "Company" c
WHERE c."address" IS NOT NULL AND btrim(c."address") <> '';

-- ── Row-level security (same shape as CompanyPerson: JOIN to Company) ─────────────────────
-- Written here, not only in scripts/setup-rls.ts, so production gets the policy from
-- `prisma migrate deploy` alone. setup-rls.ts carries the same table in both of its lists
-- (MaintenanceNotes §26 H18) so a re-run stays identical. Role-existence guarded so a plain
-- Postgres (the shadow database) applies this file too.
ALTER TABLE "CompanyAddress" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "CompanyAddress"
  USING (
    EXISTS (
      SELECT 1 FROM "Company" c
      WHERE c.id = "CompanyAddress"."companyId"
        AND c."tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Company" c
      WHERE c.id = "CompanyAddress"."companyId"
        AND c."tenantId" = current_setting('app.tenant_id', true)
    )
  );

DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "CompanyAddress" TO app_user';
  END IF;
  -- Second, independent lock against Supabase's REST API (KnownBugs #73): the app reaches this
  -- table only through Prisma, never through the anon/authenticated keys.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "CompanyAddress" FROM %I', r);
    END IF;
  END LOOP;
END
$$;
