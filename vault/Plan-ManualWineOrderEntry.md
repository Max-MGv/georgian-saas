---
tags: [plan]
---

# Plan — Manual Wine Order Entry (admin panel)

**Status:** ✅ Done, built and verified live on local dev 2026-09-15 (see `SessionLog.md` and
`FeatureLog.md` #187). Not yet pushed to `staging` — pending Max's go-ahead per Rule 0.

Discount override question resolved: **no manual override** — discount stays strictly tied to a
linked company's `wineDiscountPercent`, same as the public flow, on Max's explicit call.

## Goal

A winery employee taking a wine order over the phone, or writing one up for a walk-in customer
who didn't use the public site, should be able to enter it from the admin panel — the same way
`/admin/orders/new` already lets staff enter a walk-in/phone **booking**.

## The existing precedent (bookings) — what to mirror

- `saas/app/admin/(panel)/orders/page.tsx` — a "New Order" link in the page header
  (`orders.newOrder`), `href="/admin/orders/new"`.
- `saas/app/admin/(panel)/orders/new/page.tsx` — server component, fetches companies (with
  price tiers), menu items, masterclass items; renders the form.
- `saas/app/admin/(panel)/orders/new/NewOrderForm.tsx` — client form. Individual vs. Company
  toggle (picking a company swaps in tier pricing and a guest-type breakdown); manual per-person
  rate fields when no tier/company applies; masterclass add-on lines and free-text "extras" built
  the same way (add/remove, client-side `tempId` list); live total computed client-side for
  display, recomputed authoritatively server-side.
- `saas/app/actions/orders.ts` → `createOrderAdmin()` — `requireAdmin()`-gated server action.
  Re-derives the price tier from the real `Company.prices` server-side rather than trusting a
  client-computed total; falls back to the admin-entered manual rate when there's no tier; creates
  the `Order` + `masterclassLines`/`extras` in one `withTenantDb` transaction. No online-payment
  gate — this path is deliberately outside the Flitt checkout flow, same as every other admin
  action on an order.

## The public wine-order flow — what it already gives us

- `saas/app/(site)/wines/WineCatalogueClient.tsx` — the storefront cart form. Business fields
  (`businessName`, `llcName`, `llcId`, `address`, `workingHours`, `contactName`, `contactPhone`,
  `contactEmail`), a wine selection cart (vintage + quantity, built from active `Wine`/
  `WineVintage` rows), and an optional company link via access code — which, when matched,
  **autofills** `businessName`/`llcName`/`contactName`/`contactPhone`/`address` from the company
  record and pulls in `Company.wineDiscountPercent` for the total.
- `saas/app/actions/submitWineOrder.ts` → `submitWineOrder()` — re-fetches real
  `WineVintage.price` and the real `Company.wineDiscountPercent` server-side rather than trusting
  the client's numbers (`KnownBugs.md` #22 — this file was the fix for exactly that class of bug,
  so the admin version should keep the same discipline even though only an admin can call it).
  Creates `WineOrder` + `WineOrderItem[]` (with name/year/price **snapshots**, so later wine/price
  edits don't retroactively change historical orders). Has an online-payment branch
  (`shouldTakePayment`/`startCheckout`) that the admin version should skip entirely — same
  reasoning as `createOrderAdmin` never touching Flitt.
- `WineOrder.status` defaults to `"pending"` (plain string, not an enum) and the admin already has
  a 4-stage stepper (`pending → confirmed → paid → delivered`, `WineOrdersClient.tsx`) to advance
  it after creation — so a manually-entered order needs no special initial-status handling, it
  just starts `pending` like any other and the employee advances it same as today (e.g. straight
  to `paid` for a walk-in who paid cash on the spot).

## What to build

1. **`createWineOrderAdmin()`** in `saas/app/actions/wineOrders.ts` (currently only has
   `updateWineOrderStatus`). Mirrors `createOrderAdmin`'s shape: `requireAdmin()`, re-fetch real
   `WineVintage.price` for every line server-side (never trust a client total, same as
   `submitWineOrder.ts`), re-fetch `Company.wineDiscountPercent` when a company is linked, create
   `WineOrder` + `WineOrderItem[]` in one `withTenantDb` transaction. No payment-gateway branch.

2. **`/admin/wine-orders/new/page.tsx`** — server component fetching companies (id, name,
   `wineDiscountPercent`, contact fields for autofill) and active `Wine` + `WineVintage` rows
   (name, year, price) for the picker.

3. **`NewWineOrderForm.tsx`** — client form, built on the same `Card`/`Field` pattern as
   `NewOrderForm.tsx` for visual consistency with the rest of `/admin`:
   - Business/contact fields (`businessName`, `llcName`, `llcId`, `address`, `workingHours`,
     `contactName`, `contactPhone`, `contactEmail`)
   - Optional company picker; selecting one autofills the fields above (editable after, same as
     the public form) and shows the discount that will apply
   - Wine line items: pick a wine + vintage, quantity, add/remove — same list-building pattern as
     `NewOrderForm.tsx`'s masterclass lines
   - Live total (subtotal, then discount applied if a company with `wineDiscountPercent` is
     linked), server-recomputed on submit
   - Submit → redirect back to `/admin/wine-orders`. **Confirmed there is no per-order detail
     route** (`app/admin/(panel)/wine-orders/` has only `page.tsx`, `WineOrdersClient.tsx`,
     `PackingView.tsx` — no `[id]/`, unlike bookings' `orders/[id]/OrderDetail.tsx`); everything
     lives inline in the card list. So this isn't an open question, it's just how the surface
     already works — land back on the list, and worth scrolling/highlighting the new card the way
     bookings' flow highlights a freshly-created row, if that's easy to do consistently with
     existing sort order.

4. **Wire it in** — "New Order" link in the wine-orders page header (`WineOrdersClient.tsx` or its
   `page.tsx`, wherever the header actually lives), same placement/style as the bookings one.

5. **Translations** — new `adminT.ts` keys under a `newWineOrder.*` namespace (mirroring
   `newOrder.*`), both EN and KA (`lib/t.ts`/`adminT.ts`'s KA table), per `MaintenanceNotes.md`'s
   rule on keeping translation tables in sync.

6. **Vault close-out** — `FeatureLog.md` new row, `Roadmap.md` checkbox, this file's Status line
   flipped once shipped.

## What was built (2026-09-15)

- `createWineOrderAdmin()` added to `app/actions/wineOrders.ts` — exactly as planned above:
  `requireAdmin()`-gated, re-fetches real `WineVintage.price` and `Company.wineDiscountPercent`
  server-side, no payment-gateway branch, creates `WineOrder` + `WineOrderItem[]` in one
  `withTenantDb` transaction.
- `app/admin/(panel)/wine-orders/new/page.tsx` + `NewWineOrderForm.tsx` — company picker with
  autofill (mirrors `WineCatalogueClient.tsx`'s `applyProfile()` exactly: business/LLC name take
  the company name unconditionally, contact/address/LLC-ID only overwrite when the company has
  that field set), wine+vintage+quantity line list, live total.
- "New Order" link wired into the Wine Orders page header (`wine-orders/page.tsx`), same
  placement/style as bookings'.
- Translations added under `newWineOrder.*` (both EN/KA) in `lib/adminT.ts`, KA flagged as
  drafted/not native-reviewed like the other KA additions in that file.
- Starting status: left as `pending` (schema default), no special-casing — confirmed this is
  consistent with every other order-creation path once built, no separate question needed.

**Verified live on local dev** (`saas`, dev DB, tenant "Staging Winery" — same tenant `staging.
vineworks.ge` points at): company-linked order (autofill from "Wine Test Company" confirmed
field-by-field, wine line added and priced from real server-side `WineVintage.price`, total
computed correctly); walk-in/no-company order (no discount line, as expected); empty-submit
validation (`"Business / customer name is required."` shown inline); both orders appeared
correctly in the Wine Orders list with right amount/wine-line/contact info; Georgian admin
locale checked — every new string rendered translated, nav label included. `tsc --noEmit` clean,
`eslint` clean on every changed/new file (two pre-existing unused-`db`-import warnings in files
this work touched, not introduced by it). Both test orders marked Cancelled afterward to keep
the dev DB tidy (no delete action exists for wine orders — Cancelled is the closest to cleanup
the existing UI offers).

## Not in scope

- No changes to the public `submitWineOrder.ts` flow or `WineCatalogueClient.tsx`.
- No changes to the online-payment (Flitt) path — this is explicitly the "outside the website"
  entry point, same as bookings' equivalent.
