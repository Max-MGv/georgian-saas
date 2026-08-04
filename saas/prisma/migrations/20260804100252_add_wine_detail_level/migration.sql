-- CreateEnum
CREATE TYPE "WineDetailLevel" AS ENUM ('PRODUCT', 'VINTAGE');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "wineDetailLevel" "WineDetailLevel" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "WineVintage" ADD COLUMN     "alcoholLevel" DOUBLE PRECISION,
ADD COLUMN     "sparkling" BOOLEAN,
ADD COLUMN     "sweetness" "Sweetness",
ADD COLUMN     "wineType" "WineType";
