-- CreateTable
CREATE TABLE "InvoiceSent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "orderId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "companyName" TEXT,
    "totalPrice" INTEGER NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "tastingGuestCount" INTEGER NOT NULL,
    "lunchGuestCount" INTEGER NOT NULL,
    "freeGuestCount" INTEGER NOT NULL,
    "visitType" TEXT NOT NULL,
    "masterclassLines" JSONB NOT NULL,
    "extras" JSONB NOT NULL,
    "customMessage" TEXT NOT NULL,
    "locale" TEXT NOT NULL,

    CONSTRAINT "InvoiceSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceSent_tenantId_orderId_idx" ON "InvoiceSent"("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "InvoiceSent" ADD CONSTRAINT "InvoiceSent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
