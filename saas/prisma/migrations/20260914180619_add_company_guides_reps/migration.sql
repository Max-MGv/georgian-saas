-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "guideId" TEXT;

-- CreateTable
CREATE TABLE "CompanyGuide" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyRepresentative" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyRepresentative_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompanyGuide" ADD CONSTRAINT "CompanyGuide_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRepresentative" ADD CONSTRAINT "CompanyRepresentative_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "CompanyGuide"("id") ON DELETE SET NULL ON UPDATE CASCADE;
