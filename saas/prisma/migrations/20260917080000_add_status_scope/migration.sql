-- Scopes the status vocabulary to an order type (Plan-StatusModel chunk 3.5).
--
-- Both order types share new/confirmed/cancelled, but 'delivered' is wine-only
-- and 'completed' is bookings-only, and until now nothing in the schema could
-- say which. Without it the frontend would hardcode each type's code list, and
-- a newly inserted status would stay invisible until someone shipped code —
-- which is the exact promise the dimension tables were chosen to keep.
--
-- Prisma generates this as a bare `ADD COLUMN ... NOT NULL`, which cannot run
-- against populated tables. Hand-written as the standard three steps instead:
-- add nullable, backfill, then enforce. The column is deliberately left with no
-- default — there is no safe guess, so any future insert has to state its scope.

-- CreateEnum
CREATE TYPE "StatusScope" AS ENUM ('BOOKING', 'WINE_ORDER', 'BOTH');

-- Step 1: add nullable so existing rows survive.
ALTER TABLE "ProcessStatus"   ADD COLUMN "appliesTo" "StatusScope";
ALTER TABLE "FinancialStatus" ADD COLUMN "appliesTo" "StatusScope";

-- Step 2: backfill. The two 300-slot rows are what this column exists for —
-- same position in the flow, one per domain.
UPDATE "ProcessStatus" SET "appliesTo" = 'BOTH'       WHERE "code" IN ('new', 'confirmed', 'cancelled');
UPDATE "ProcessStatus" SET "appliesTo" = 'WINE_ORDER' WHERE "code" = 'delivered';
UPDATE "ProcessStatus" SET "appliesTo" = 'BOOKING'    WHERE "code" = 'completed';

-- unpaid/paid are universal; 'invoiced' is bookings-only because only bookings
-- have an invoice-send flow (sendOrderInvoice). A one-row UPDATE if wine orders
-- ever get one — see open question 2 in Plan-StatusModel.
UPDATE "FinancialStatus" SET "appliesTo" = 'BOTH'    WHERE "code" IN ('unpaid', 'paid');
UPDATE "FinancialStatus" SET "appliesTo" = 'BOOKING' WHERE "code" = 'invoiced';

-- Step 3: enforce. Fails loudly if any row above was missed, which is the point.
ALTER TABLE "ProcessStatus"   ALTER COLUMN "appliesTo" SET NOT NULL;
ALTER TABLE "FinancialStatus" ALTER COLUMN "appliesTo" SET NOT NULL;
