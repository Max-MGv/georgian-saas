-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "nationalities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "enableCompanyNationalityBreakdown" BOOLEAN NOT NULL DEFAULT false;
