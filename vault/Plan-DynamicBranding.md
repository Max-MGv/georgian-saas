---
tags: [plan, v3, branding]
---

# Plan: Dynamic Branding (Logo, Favicon, Display Name)

**Status:** In progress — 2026-06-26

## Goal
Per-tenant logo, favicon, and display name — stored in DB, forwarded via proxy headers, rendered in all layouts. Same pattern as brand colors.

## Concerns / Decisions

- **Cache TTL**: Proxy cache switching from process-lifetime to 5-minute TTL. Logo changes need to propagate without a full redeploy.
- **SVG + Next.js Image**: Home hero logo switches from `<Image>` to `<img>` — SVG from remote storage isn't optimized by Next.js anyway, and it's not an LCP element.
- **Supabase domain**: Add Supabase Storage hostname to `next.config.js` `images.remotePatterns`.
- **One logo only**: Must work on light/cream background. No light/dark variants for now.
- **Invoices excluded**: `InvoicePrint.tsx` keeps hardcoded "Nikalas Marani" for now — only one client, flag for later.
- **Separate columns, not theme JSON**: `logoUrl`, `logoAlt`, `faviconUrl`, `displayName` as typed Prisma columns (not in `theme Json?`).

## Steps

- [ ] **Step 1 — Schema**: Add `logoUrl String?`, `logoAlt String?`, `faviconUrl String?`, `displayName String?` to `Tenant`. `prisma db push`.
- [ ] **Step 2 — Proxy**: Extend `TenantInfo` with 4 new fields. Forward as `x-tenant-logo`, `x-tenant-logo-alt`, `x-tenant-favicon`, `x-tenant-name`. Switch to 5-min TTL cache.
- [ ] **Step 3 — Root layout**: `generateMetadata()` reads `x-tenant-name` for `<title>` + description. Dynamic `<link rel="icon">` from `x-tenant-favicon`.
- [ ] **Step 4 — SiteNav**: Thread logoUrl/alt from `(site)/layout.tsx` headers → `SiteNav.tsx`. Fallback to `/icons/logo-dark.svg`.
- [ ] **Step 5 — Home hero**: Replace `<Image>` with `<img>` for logo, read from header.
- [ ] **Step 6 — Admin layouts**: `admin/layout.tsx` + `admin/login/page.tsx` → dynamic logo + display name from headers.
- [ ] **Step 7 — next.config.js**: Add Supabase Storage domain to `remotePatterns`.
- [ ] **Step 8 — Super-admin upload UI**: Logo + favicon file pickers in `TenantFormClient.tsx`. Upload to Supabase Storage `logos` bucket. Note: "must work on light background".
- [ ] **Step 9 — Client settings upload**: Branding section in `/admin/settings` for client self-service logo upload.
- [ ] **Step 10 — Seed Nikalas Marani**: Set `displayName`, `logoUrl = "/icons/logo-dark.svg"` on their tenant row.

## Key files

- `saas/prisma/schema.prisma`
- `saas/proxy.ts`
- `saas/next.config.js` (or `.ts`)
- `saas/app/layout.tsx`
- `saas/app/(site)/layout.tsx`
- `saas/app/(site)/SiteNav.tsx`
- `saas/app/(site)/page.tsx`
- `saas/app/admin/layout.tsx`
- `saas/app/admin/login/page.tsx`
- `saas/app/super-admin/tenants/TenantFormClient.tsx`
- `saas/app/admin/settings/SettingsClient.tsx`
- `saas/app/actions/superAdmin.ts` (logo upload action)

## Follow-ups (not in this sprint)
- Invoice dynamic name (`InvoicePrint.tsx`)
- Light/dark logo variants
- Apple Touch Icon / manifest icons
