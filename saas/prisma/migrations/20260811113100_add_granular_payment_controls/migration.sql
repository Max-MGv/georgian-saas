-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "skipPayment" BOOLEAN;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "paymentEnabledCompanies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentEnabledIndividuals" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentEnabledWineOrders" BOOLEAN NOT NULL DEFAULT true;
