
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'INVOICE_SENT', 'PAID', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('TASTING', 'TASTING_LUNCH');

-- CreateEnum
CREATE TYPE "WineType" AS ENUM ('RED', 'WHITE', 'AMBER', 'ROSE');

-- CreateEnum
CREATE TYPE "Sweetness" AS ENUM ('DRY', 'SEMI_DRY', 'SEMI_SWEET', 'SWEET');

-- CreateEnum
CREATE TYPE "MasterclassUnit" AS ENUM ('PER_PERSON', 'PER_PIECE', 'FLAT');

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "logoUrl" TEXT,
    "logoAlt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "theme" JSONB,
    "logoUrl" TEXT,
    "logoAlt" TEXT,
    "faviconUrl" TEXT,
    "displayName" TEXT,
    "modulesBooking" BOOLEAN NOT NULL DEFAULT true,
    "modulesWineOrders" BOOLEAN NOT NULL DEFAULT false,
    "modulesPublicSite" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identificationCode" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "address" TEXT,
    "accessCode" TEXT,
    "isIndividual" BOOLEAN NOT NULL DEFAULT false,
    "isBookingCompany" BOOLEAN NOT NULL DEFAULT true,
    "isWineOrderCompany" BOOLEAN NOT NULL DEFAULT false,
    "wineDiscountPercent" DOUBLE PRECISION,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "bookingType" "BookingType" NOT NULL DEFAULT 'INDIVIDUAL',
    "visitType" "VisitType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "lunchGuestCount" INTEGER NOT NULL DEFAULT 0,
    "tastingGuestCount" INTEGER NOT NULL DEFAULT 0,
    "freeGuestCount" INTEGER NOT NULL DEFAULT 0,
    "hotDishVegetable" TEXT,
    "hotDishMeat" TEXT,
    "foodNotes" TEXT,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "totalPrice" DOUBLE PRECISION,
    "tenantId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Price" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "minGuests" INTEGER NOT NULL,
    "maxGuests" INTEGER NOT NULL,
    "pricePerPerson" DOUBLE PRECISION NOT NULL,
    "tastingLunchPricePerPerson" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "registrationPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDisplayPrice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterclassItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" "MasterclassUnit" NOT NULL DEFAULT 'PER_PIECE',
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterclassItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMasterclass" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "masterclassItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderMasterclass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderExtra" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WineOrder" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "llcName" TEXT,
    "llcId" TEXT,
    "address" TEXT NOT NULL,
    "workingHours" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION,
    "discountPercent" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tenantId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "tenantId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "tenantId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedDate" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wineType" "WineType" NOT NULL DEFAULT 'RED',
    "sweetness" "Sweetness" NOT NULL DEFAULT 'DRY',
    "sparkling" BOOLEAN NOT NULL DEFAULT false,
    "alcoholLevel" DOUBLE PRECISION,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#7c1d23',
    "imagePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WineVintage" (
    "id" TEXT NOT NULL,
    "wineId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "imagePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WineVintage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WineOrderItem" (
    "id" TEXT NOT NULL,
    "wineOrderId" TEXT NOT NULL,
    "wineVintageId" TEXT,
    "wineNameSnapshot" TEXT NOT NULL,
    "vintageYearSnapshot" INTEGER NOT NULL,
    "priceSnapshot" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "WineOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_tenantId_key" ON "Setting"("key", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteContent_key_locale_tenantId_key" ON "SiteContent"("key", "locale", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedDate_date_tenantId_key" ON "BlockedDate"("date", "tenantId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMasterclass" ADD CONSTRAINT "OrderMasterclass_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMasterclass" ADD CONSTRAINT "OrderMasterclass_masterclassItemId_fkey" FOREIGN KEY ("masterclassItemId") REFERENCES "MasterclassItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExtra" ADD CONSTRAINT "OrderExtra_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineVintage" ADD CONSTRAINT "WineVintage_wineId_fkey" FOREIGN KEY ("wineId") REFERENCES "Wine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrderItem" ADD CONSTRAINT "WineOrderItem_wineOrderId_fkey" FOREIGN KEY ("wineOrderId") REFERENCES "WineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrderItem" ADD CONSTRAINT "WineOrderItem_wineVintageId_fkey" FOREIGN KEY ("wineVintageId") REFERENCES "WineVintage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

