-- Negotiated wine prices per company + exporter flag (T-12, vault/Plan-WineOrderFeatures.md Chunk 9)
-- Additive only. "Exceptions only": rows exist just where a price was agreed.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isExporter" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompanyWinePrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "wineVintageId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyWinePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyWinePrice_wineVintageId_idx" ON "CompanyWinePrice"("wineVintageId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyWinePrice_companyId_wineVintageId_key" ON "CompanyWinePrice"("companyId", "wineVintageId");

-- AddForeignKey
ALTER TABLE "CompanyWinePrice" ADD CONSTRAINT "CompanyWinePrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyWinePrice" ADD CONSTRAINT "CompanyWinePrice_wineVintageId_fkey" FOREIGN KEY ("wineVintageId") REFERENCES "WineVintage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Money guard: a negotiated price is tetri, whole, non-negative ─────────────────────────
ALTER TABLE "CompanyWinePrice" ADD CONSTRAINT "CompanyWinePrice_price_nonnegative" CHECK ("price" >= 0);

-- ── Row-level security (JOIN to Company, like CompanyPerson / CompanyAddress) ─────────────
-- In the migration so production needs only `migrate deploy`; scripts/setup-rls.ts carries the
-- same policy. Role-existence guarded for the shadow database.
ALTER TABLE "CompanyWinePrice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "CompanyWinePrice"
  USING (
    EXISTS (
      SELECT 1 FROM "Company" c
      WHERE c.id = "CompanyWinePrice"."companyId"
        AND c."tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Company" c
      WHERE c.id = "CompanyWinePrice"."companyId"
        AND c."tenantId" = current_setting('app.tenant_id', true)
    )
  );

DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "CompanyWinePrice" TO app_user';
  END IF;
  -- Second, independent lock against Supabase's REST API (KnownBugs #73).
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "CompanyWinePrice" FROM %I', r);
    END IF;
  END LOOP;
END
$$;
