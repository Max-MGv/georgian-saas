-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "flittMerchantId" TEXT,
ADD COLUMN     "flittSecretKey" TEXT,
ADD COLUMN     "modulesOnlinePayment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WineOrder" ADD COLUMN     "contactEmail" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "orderId" TEXT,
    "wineOrderId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'flitt',
    "providerPaymentId" TEXT,
    "checkoutUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_wineOrderId_idx" ON "Payment"("wineOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_wineOrderId_fkey" FOREIGN KEY ("wineOrderId") REFERENCES "WineOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
