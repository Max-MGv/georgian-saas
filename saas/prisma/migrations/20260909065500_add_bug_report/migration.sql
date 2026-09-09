-- CreateEnum
CREATE TYPE "BugReportType" AS ENUM ('BUG', 'FEATURE');

-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "BugReportSurface" AS ENUM ('PUBLIC_SITE', 'ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "type" "BugReportType" NOT NULL,
    "status" "BugReportStatus" NOT NULL DEFAULT 'NEW',
    "surface" "BugReportSurface" NOT NULL,
    "comment" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "breadcrumbs" JSONB,
    "pageUrl" TEXT NOT NULL,
    "userAgent" TEXT,
    "tenantId" TEXT,
    "submitterEmail" TEXT,
    "submitterUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_tenantId_idx" ON "BugReport"("tenantId");

-- CreateIndex
CREATE INDEX "BugReport_status_idx" ON "BugReport"("status");
