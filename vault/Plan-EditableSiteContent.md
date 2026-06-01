---
tags: [plan, content]
---

# Plan: Editable Site Content

**Goal:** Allow the admin to edit all public-facing hardcoded text from the admin panel, with changes reflected immediately on the live site.

**Status:** ✅ Complete (2026-06-01)

---

## What Was Built

### Admin editor — `/admin/content`

Two modes, toggled at the top:

**Text mode** — flat labeled list of editable fields per section. Sections: Navigation / Home / Form / About / Contact. Click any field to edit inline; Save/Cancel per field. Good for bulk editing or when you know exactly what you want to change.

**Visual mode** — faithful replica of the public site rendered inside the admin panel (framed, not the live URL). Shows nav bar + page body for Home, About, Contact. Every hardcoded string is an `EditableText` — hover to see the pencil badge, click to edit in-place, Save/Cancel below. The booking form is shown as a visual-only structure (non-interactive) with all labels editable.

**Locale switcher** — EN / KA tabs on both modes. Editing in EN only affects English content; Georgian content is separate and saved independently.

### Reset to default

Every `EditableText` field shows a `↺` badge (tan, left of the pencil) when hovered — but **only if a DB value has been saved for that field**. Hovering `↺` shows a tooltip: `Reset to: "[fallback text]"`. Clicking calls `deleteContent`, which deletes the DB row; the live site immediately reverts to the hardcoded fallback.

---

## Content keys (all sections)

### `nav`
`nav_home`, `nav_about`, `nav_wines`, `nav_contact`, `nav_book`

### `home`
`home_location_eyebrow`, `home_hero_subtitle`, `home_book_btn`, `home_order_wine_btn`, `home_package1_title`, `home_package1_desc`, `home_package2_title`, `home_package2_desc`, `home_book_heading`, `home_booking_intro`

### `form`
`form_booking_type`, `form_individual`, `form_company_type`, `form_visit_type`, `form_tasting`, `form_tasting_lunch`, `form_date`, `form_time_slot`, `form_num_guests`, `form_first_name`, `form_last_name`, `form_phone`, `form_email`, `form_food_notes`, `form_food_notes_sub`, `form_food_notes_placeholder`, `form_submit`, `form_cancel_policy`, `form_success_heading`, `form_success_body`

### `about`
`about_eyebrow`, `about_heading`, `about_story_p1`, `about_story_p2`, `about_story_p3`, `about_expect_heading`, `about_expect1_label`, `about_expect1_text`, `about_expect2_label`, `about_expect2_text`, `about_expect3_label`, `about_expect3_text`, `about_cta_text`, `about_cta_btn`

### `contact`
`contact_eyebrow`, `contact_heading`, `contact_label_phone`, `contact_phone`, `contact_note_phone`, `contact_label_email`, `contact_email`, `contact_note_email`, `contact_label_location`, `contact_address`, `contact_note_location`, `contact_label_cancel`, `contact_cancel_value`, `contact_note_cancel`, `contact_find_us`, `contact_map_directions`, `contact_book_cta`, `contact_book_btn`

---

## How it works (data flow)

1. Admin edits a field in `/admin/content` → `saveContent(key, value, section, label, locale)` → upserts `SiteContent` row
2. Public page loads → `getContentMap(section, locale)` → returns `{key: value}` map → `c['key'] || fallback`
3. If admin resets → `deleteContent(key, locale)` → deletes the row → next page load uses hardcoded fallback

The fallback is always the hardcoded string in the JSX/t() call. The site never goes blank.

---

## Files

### Components
- `saas/components/EditableText.tsx` — inline editing + reset badge + save/cancel/flash
- `saas/app/admin/content/ContentClient.tsx` — mode switcher, FIELDS schema, all Visual* and TextMode components

### Actions
- `saas/app/actions/siteContent.ts` — `getContent`, `getContentMap`, `saveContent`, `deleteContent`
- `saas/app/actions/locale.ts` — `setLocale` (writes `site_locale` cookie)

### Public pages (all use DB values with hardcoded fallback)
- `saas/app/(site)/layout.tsx` — fetches nav content, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — nav labels + book button from DB
- `saas/app/(site)/page.tsx` — home content + form content → BookingForm
- `saas/app/(site)/about/page.tsx`
- `saas/app/(site)/contact/page.tsx`
- `saas/components/BookingForm.tsx` — `formContent` prop, `fc()` helper

---

## What was NOT built (original Phase 2 items, deferred)

- **AdminBar** on the live public site — editing happens in `/admin/content` instead (simpler auth)
- **Default language setting** in Settings page — locale switcher in admin content page covers this for now
- **LocaleSwitcher for public visitors** — EN/KA toggle visible to visitors in SiteNav was descoped; admin controls locale only
