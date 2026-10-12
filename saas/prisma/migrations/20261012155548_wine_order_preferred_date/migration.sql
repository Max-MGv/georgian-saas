-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'PREFERRED_DATE_CHANGED';

-- AlterTable
ALTER TABLE "WineOrder" ADD COLUMN     "preferredDate" DATE;

-- CreateIndex
CREATE INDEX "WineOrder_tenantId_preferredDate_idx" ON "WineOrder"("tenantId", "preferredDate");
