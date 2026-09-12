-- CreateTable
CREATE TABLE "DemoEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "route" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoEvent_tenantId_name_createdAt_idx" ON "DemoEvent"("tenantId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "DemoEvent_tenantId_sessionId_idx" ON "DemoEvent"("tenantId", "sessionId");
