-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "financialStatusId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidAtStage" TEXT,
ADD COLUMN     "processStatusId" TEXT;

-- AlterTable
ALTER TABLE "WineOrder" ADD COLUMN     "financialStatusId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidAtStage" TEXT,
ADD COLUMN     "processStatusId" TEXT;

-- CreateTable
CREATE TABLE "ProcessStatus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessStatus_tenantId_idx" ON "ProcessStatus"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStatus_tenantId_code_key" ON "ProcessStatus"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FinancialStatus_tenantId_idx" ON "FinancialStatus"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatus_tenantId_code_key" ON "FinancialStatus"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_processStatusId_fkey" FOREIGN KEY ("processStatusId") REFERENCES "ProcessStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_financialStatusId_fkey" FOREIGN KEY ("financialStatusId") REFERENCES "FinancialStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_processStatusId_fkey" FOREIGN KEY ("processStatusId") REFERENCES "ProcessStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WineOrder" ADD CONSTRAINT "WineOrder_financialStatusId_fkey" FOREIGN KEY ("financialStatusId") REFERENCES "FinancialStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Everything below is hand-written; Prisma cannot express it in schema.prisma.
-- See vault/Plan-StatusModel.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- Postgres treats NULLs as DISTINCT in a unique constraint, so the generated
-- ("tenantId", "code") uniques above do NOT prevent duplicate *global* rows
-- (tenantId IS NULL). These partial uniques close that hole. Without them the
-- "one shared vocabulary" guarantee is unenforced.
CREATE UNIQUE INDEX "ProcessStatus_code_global_key" ON "ProcessStatus"("code") WHERE "tenantId" IS NULL;
CREATE UNIQUE INDEX "FinancialStatus_code_global_key" ON "FinancialStatus"("code") WHERE "tenantId" IS NULL;

-- Reference data, seeded here rather than in a seed script so every
-- environment (dev / staging / prod) ends up byte-identical.
--
-- Ids are stable, readable strings instead of cuids: these rows are referenced
-- by backfill SQL and by future migrations, and a generated id would differ per
-- environment.
--
-- sortOrder is gap-seeded 100/200/300/400 so a status can later be INSERTed
-- between two existing ones without renumbering.
--
-- One shared vocabulary across both order types. They agree on pending /
-- confirmed / cancelled and differ only on the final fulfilment word, so
-- 'delivered' (wine) and 'completed' (bookings) both sit at 300 — the same
-- position in two domains. 'NEW' collapses into 'pending'; it was the same
-- state under a different word. Display labels stay per-order-type in the
-- frontend, exactly as they already are today.
INSERT INTO "ProcessStatus" ("id", "tenantId", "code", "sortOrder") VALUES
  ('ps_pending',   NULL, 'pending',   100),
  ('ps_confirmed', NULL, 'confirmed', 200),
  ('ps_delivered', NULL, 'delivered', 300),
  ('ps_completed', NULL, 'completed', 300),
  ('ps_cancelled', NULL, 'cancelled', 400);

INSERT INTO "FinancialStatus" ("id", "tenantId", "code", "sortOrder") VALUES
  ('fs_unpaid',   NULL, 'unpaid',   100),
  ('fs_invoiced', NULL, 'invoiced', 200),
  ('fs_paid',     NULL, 'paid',     300);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Deliberately partial. The old single column recorded only ONE value, so for
-- some rows the other axis is genuinely unknowable and is left NULL rather than
-- guessed. NULL here is safe: no application code reads these columns yet.
-- Unresolved rows are reported by scripts/check-status-backfill.ts and must be
-- settled before Plan-StatusModel chunks 3-5 make these columns authoritative.

-- Process axis. Payment-limbo rows are pre-fulfilment, so they map to pending.
UPDATE "WineOrder" SET "processStatusId" = 'ps_pending'   WHERE "status" IN ('pending', 'pending_payment', 'payment_failed');
UPDATE "WineOrder" SET "processStatusId" = 'ps_confirmed' WHERE "status" = 'confirmed';
UPDATE "WineOrder" SET "processStatusId" = 'ps_delivered' WHERE "status" = 'delivered';
UPDATE "WineOrder" SET "processStatusId" = 'ps_cancelled' WHERE "status" = 'cancelled';
-- status = 'paid' left NULL: cannot tell which fulfilment stage was active.

UPDATE "Order" SET "processStatusId" = 'ps_pending'   WHERE "status" IN ('NEW', 'PENDING_PAYMENT');
UPDATE "Order" SET "processStatusId" = 'ps_confirmed' WHERE "status" = 'CONFIRMED';
UPDATE "Order" SET "processStatusId" = 'ps_completed' WHERE "status" = 'COMPLETED';
UPDATE "Order" SET "processStatusId" = 'ps_cancelled' WHERE "status" = 'CANCELLED';
-- status IN ('PAID','INVOICE_SENT') left NULL: same reason.

-- Financial axis. 'pending'/'confirmed' are safe as unpaid: under the old
-- linear stepper an order had to pass *through* paid to go further, so a row
-- resting at those values had not been paid.
UPDATE "WineOrder" SET "financialStatusId" = 'fs_unpaid' WHERE "status" IN ('pending', 'confirmed', 'pending_payment', 'payment_failed');
UPDATE "WineOrder" SET "financialStatusId" = 'fs_paid'   WHERE "status" = 'paid';
-- 'delivered' / 'cancelled' left NULL: unknowable.

UPDATE "Order" SET "financialStatusId" = 'fs_unpaid'   WHERE "status" IN ('NEW', 'CONFIRMED', 'PENDING_PAYMENT');
UPDATE "Order" SET "financialStatusId" = 'fs_invoiced' WHERE "status" = 'INVOICE_SENT';
UPDATE "Order" SET "financialStatusId" = 'fs_paid'     WHERE "status" = 'PAID';
-- 'COMPLETED' / 'CANCELLED' left NULL: unknowable.

-- paidAt, recovered from the gateway record where one exists. The dev database
-- has zero settled Payment rows, so this is a no-op there; it is written for
-- production, where real Flitt settlements may exist.
UPDATE "WineOrder" wo SET "paidAt" = p."settledAt"
  FROM "Payment" p
  WHERE p."wineOrderId" = wo."id" AND p."settledAt" IS NOT NULL AND wo."paidAt" IS NULL;

UPDATE "Order" o SET "paidAt" = p."settledAt"
  FROM "Payment" p
  WHERE p."orderId" = o."id" AND p."settledAt" IS NOT NULL AND o."paidAt" IS NULL;

-- A recovered settlement timestamp is itself proof of payment, so it wins over
-- the status-derived guess above (including for rows left NULL by it).
UPDATE "WineOrder" SET "financialStatusId" = 'fs_paid' WHERE "paidAt" IS NOT NULL;
UPDATE "Order"     SET "financialStatusId" = 'fs_paid' WHERE "paidAt" IS NOT NULL;
