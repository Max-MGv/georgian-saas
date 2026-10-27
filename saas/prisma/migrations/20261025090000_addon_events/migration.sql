-- History events for add-on lines (T-7, vault/Plan-AddOnsAndWine.md §4.8). Additive: three new enum values.
-- Nothing writes them until the T-7 code is live; nothing reads the event list as a whole (it is an audit trail).

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'ADDON_ADDED';
ALTER TYPE "OrderEventType" ADD VALUE 'ADDON_REMOVED';
ALTER TYPE "OrderEventType" ADD VALUE 'ADDON_QTY_SYNCED';
