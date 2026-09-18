-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'STAGE_CHANGED', 'PAID', 'UNPAID', 'INVOICE_SENT', 'INVOICE_UNSENT', 'RESTORED', 'ABANDONED', 'PAYMENT_DECLINED', 'EXTRA_ADDED', 'EXTRA_REMOVED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('GUEST', 'ADMIN', 'SYSTEM', 'GATEWAY');

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "orderId" TEXT,
    "wineOrderId" TEXT,
    "type" "OrderEventType" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "fromStage" TEXT,
    "toStage" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEvent_tenantId_orderId_occurredAt_idx" ON "OrderEvent"("tenantId", "orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "OrderEvent_tenantId_wineOrderId_occurredAt_idx" ON "OrderEvent"("tenantId", "wineOrderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_wineOrderId_fkey" FOREIGN KEY ("wineOrderId") REFERENCES "WineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
