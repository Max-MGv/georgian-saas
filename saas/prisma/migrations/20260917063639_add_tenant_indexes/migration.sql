-- CreateIndex
CREATE INDEX "BlockedDate_tenantId_date_idx" ON "BlockedDate"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");

-- CreateIndex
CREATE INDEX "MasterclassItem_tenantId_idx" ON "MasterclassItem"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE INDEX "Order_tenantId_date_idx" ON "Order"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Setting_tenantId_idx" ON "Setting"("tenantId");

-- CreateIndex
CREATE INDEX "SiteContent_tenantId_locale_idx" ON "SiteContent"("tenantId", "locale");

-- CreateIndex
CREATE INDEX "Wine_tenantId_idx" ON "Wine"("tenantId");

-- CreateIndex
CREATE INDEX "WineOrder_tenantId_status_idx" ON "WineOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WineOrder_tenantId_createdAt_idx" ON "WineOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WineVintage_tenantId_idx" ON "WineVintage"("tenantId");

-- CreateIndex
CREATE INDEX "WineVintage_wineId_idx" ON "WineVintage"("wineId");
