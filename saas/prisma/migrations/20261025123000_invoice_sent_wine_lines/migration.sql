-- Wine for the table, as billed, on the permanent invoice record (T-22, vault/Plan-AddOnsAndWine.md §4.7).
-- Additive: one JSON column, default "[]" — every invoice sent before T-22 had no wine, which is exactly what it says.

-- AlterTable
ALTER TABLE "InvoiceSent" ADD COLUMN "wineLines" JSONB NOT NULL DEFAULT '[]';
