-- History events for wine on bookings (T-22, vault/Plan-AddOnsAndWine.md §4.8). Additive: three new enum values, written only
-- by the T-22 code. Their own migration, as ALTER TYPE ... ADD VALUE is (see 20261012144005_order_event_delivery_fee_set).

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'WINE_ADDED';
ALTER TYPE "OrderEventType" ADD VALUE 'WINE_REMOVED';
ALTER TYPE "OrderEventType" ADD VALUE 'GUEST_PURCHASE_LINKED';
