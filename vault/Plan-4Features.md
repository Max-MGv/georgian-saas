# Plan: 4 Features — Calendar, CSV Export, Min Guests, Block Dates

**Status: COMPLETE — all 4 features shipped to production on 2026-05-28.**

## Summary of what was built

| Feature | Status |
|---|---|
| Feature 6 — Calendar view (month grid, badges, hover preview, click-to-filter) | ✅ Done |
| Feature 7 — Export orders to CSV (filter-aware, 13 columns) | ✅ Done |
| Feature 8 — Configurable min guests per visit type | ✅ Done |
| Feature 9 — Block dates (closed days, DB model, Settings UI, form + server guards) | ✅ Done |

## Additional items shipped in the same session

- Calendar day hover preview (order details popover)
- Shimmer loading skeleton (`loading.tsx`)
- Progress bar animation on filter change
- Smooth scroll on public "Book a Visit" button
- Status filter in orders table (all 6 statuses)
- Status counts in dropdown (live per-status totals, disabled if 0)
- Fix: home page min guests was static (added `force-dynamic`)
- Fix: status filter intermittent (`startTransition` → direct `router.push`)
- Fix: `useSearchParams` production crash in ViewToggle

## Key files
- `saas/app/admin/orders/page.tsx`
- `saas/app/admin/orders/CalendarView.tsx` (NEW)
- `saas/app/admin/orders/ViewToggle.tsx` (NEW)
- `saas/app/admin/orders/loading.tsx` (NEW)
- `saas/app/admin/orders/OrdersFilters.tsx`
- `saas/app/actions/orders.ts`
- `saas/app/actions/blockedDates.ts` (NEW)
- `saas/app/admin/settings/page.tsx` + `SettingsClient.tsx`
- `saas/components/BookingForm.tsx`
- `saas/app/(site)/page.tsx`
- `saas/app/actions/createBooking.ts`
- `saas/app/globals.css`
- `saas/prisma/schema.prisma`
