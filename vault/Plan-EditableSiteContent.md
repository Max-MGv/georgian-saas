---
tags: [plan, content]
---

# Plan: Editable Site Content

**Goal:** Allow the admin to edit public-facing page text through inline editing directly on the public pages. Full i18n foundation with EN/KA support. Admin sets default language; visitors can switch.

**Status:** Phase 2 in progress
**Author note:** Max approved inline editing + per-field save + EN/KA switcher on 2026-06-01.

---

## Phase 1 — Done ✅

1. ✅ `SiteContent` Prisma model + `prisma db push` + RLS grant
2. ✅ `siteContent.ts` server actions (get/save/upsert)
3. ✅ `/admin/content` page + `ContentClient.tsx` (3-tab bulk editor)
4. ✅ "Site Content" link added to admin nav
5. ✅ Home, About, Contact pages wired to fetch from DB with fallbacks

---

## Phase 2 — Inline Editing + i18n Foundation

### Architecture

- **Locale stored in cookie** `site_locale` ("en" | "ka"). Fallback = `default_locale` Setting from DB. Fallback of fallback = "en".
- **`SiteContent` schema** gets a `locale` field. Unique constraint becomes `[key, locale]`.
- **`EditableText` component** renders plain text for visitors; editable with per-field Save/Cancel for admins.
- **`AdminBar`** — thin strip above the nav, admin-only. Shows current locale + EN/KA switcher.
- **`LocaleSwitcher`** in `SiteNav` — visible to all visitors (EN | KA).
- **`default_locale` setting** — admin sets in Settings page.

---

## Step 1 — Schema

Add `locale` to `SiteContent`, change unique constraint:

```prisma
model SiteContent {
  id        String   @id @default(cuid())
  key       String
  value     String
  section   String
  label     String
  locale    String   @default("en")
  updatedAt DateTime @updatedAt

  @@unique([key, locale])
}
```

Run `npx prisma db push` after.

---

## Step 2 — Server Actions

Update `siteContent.ts`: all functions accept `locale` (default "en").
Add `locale.ts` server action: `setLocale(locale)` writes the `site_locale` cookie.

---

## Step 3 — `lib/siteContext.ts`

Shared utility returning `{ isAdmin, locale }`:
- Checks Supabase auth for admin
- Reads `site_locale` cookie; falls back to `default_locale` Setting; falls back to "en"

---

## Step 4 — `EditableText` component

`components/EditableText.tsx` (client):
- Props: `contentKey`, `section`, `label`, `locale`, `fallback`, `isAdmin`, `as`, `className`, `style`, `children`
- Non-admin: renders `<as className style>{children}</as>` — zero overhead
- Admin: hover shows dotted outline + pencil cursor. Click → `contenteditable`, solid border. Below field: [Save] [✕ Cancel] buttons. Save calls `saveContent` server action + shows "✓ Saved".

---

## Step 5 — `AdminBar` component

`components/AdminBar.tsx` (client):
- Thin strip pinned above the nav (`z-60`), wine/dark background
- Left: "Edit mode" label
- Right: [EN] [KA] switcher — calls `setLocale` + `router.refresh()`
- Only rendered when `isAdmin=true` from layout

---

## Step 6 — `LocaleSwitcher` component

`components/LocaleSwitcher.tsx` (client):
- Small [EN | KA] toggle for the public nav
- Calls `setLocale` + `router.refresh()`
- Shows current locale as active/bold

---

## Step 7 — Layout + SiteNav

- `(site)/layout.tsx` → make async, call `getSiteContext()`, render `<AdminBar>` if admin, pass `locale` to `<SiteNav>`
- `SiteNav.tsx` → accept `locale` prop, render `<LocaleSwitcher>` in desktop nav + mobile menu

---

## Step 8 — Public Pages

Each page: call `getSiteContext()`, fetch `getContentMap(section, locale)`, replace hardcoded strings with `<EditableText>` components.

---

## Step 9 — Admin Settings

Add "Default language" radio (English | Georgian) to `SettingsClient.tsx`. Saves to `Setting` key `default_locale`.

---

## Step 10 — `/admin/content` Locale Tabs

`ContentClient.tsx` receives `{ en: rows[], ka: rows[] }`. Outer tab = locale, inner tab = section.

---

## Implementation Order

1. Schema + `prisma db push`
2. Update `siteContent.ts`, create `locale.ts` action
3. Create `lib/siteContext.ts`
4. Create `EditableText`, `AdminBar`, `LocaleSwitcher` components
5. Update layout + SiteNav
6. Update public pages
7. Update admin Settings
8. Update admin content page

---

## Files to Create

- `saas/app/actions/locale.ts`
- `saas/lib/siteContext.ts`
- `saas/components/EditableText.tsx`
- `saas/components/AdminBar.tsx`
- `saas/components/LocaleSwitcher.tsx`

## Files to Modify

- `saas/prisma/schema.prisma`
- `saas/app/actions/siteContent.ts`
- `saas/app/admin/content/page.tsx`
- `saas/app/admin/content/ContentClient.tsx`
- `saas/app/admin/settings/page.tsx`
- `saas/app/admin/settings/SettingsClient.tsx`
- `saas/app/(site)/layout.tsx`
- `saas/app/(site)/SiteNav.tsx`
- `saas/app/(site)/page.tsx`
- `saas/app/(site)/about/page.tsx`
- `saas/app/(site)/contact/page.tsx`

---

## Done When

- Admin logs into `/admin`, visits the homepage, sees a thin admin bar + editable fields on hover
- Admin can switch EN/KA in the bar, edit text for each language, save per field
- Public visitors see a EN | KA toggle in the nav
- Admin can set the default language from the Settings page
- `/admin/content` still works as a bulk-edit fallback with locale tabs
