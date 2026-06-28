---
tags: [maintenance, dependencies]
---

# Maintenance Notes

Structural dependencies and coupled code that must be kept in sync. Read this before any non-trivial change to the booking form, admin site-content editor, or public-site layout.

---

## 1. BookingForm ↔ Admin "Booking Form" visual panel

**What the dependency is:**
`saas/components/BookingForm.tsx` (the public-facing booking form) and the admin Site Content editor's "Booking Form" tab (`saas/app/admin/content/ContentClient.tsx` → `FieldsPanel` with section `'form'`) are visually independent but share the same SiteContent key names.

The admin panel lets the winery edit the labels (e.g. "First Name", "Request Booking", "48-hour cancellation policy"). Those labels are stored in the `SiteContent` table under keys like `form_first_name`, `form_submit`, `form_cancel_policy`, etc. `BookingForm.tsx` reads them at render time via `formContent` prop.

**If you change the form's visual structure** (add a new field, rename a section, add a new label):
- Add the new key + fallback to `FIELDS.form` in `ContentClient.tsx` so it appears in the admin panel
- Make sure `BookingForm.tsx` reads that key from `formContent` (or uses the fallback from `t()`)
- Optionally seed the new key in `saas/prisma/seed-ka.ts` for the Georgian locale

**If you remove a field from the form:**
- Remove its `FIELDS.form` entry in `ContentClient.tsx` to avoid orphaned admin controls
- Remove any DB seed rows for that key if present

**Files involved:**
- `saas/components/BookingForm.tsx` — public form, reads labels from `formContent` prop
- `saas/app/admin/content/ContentClient.tsx` — `FIELDS.form` array defines which keys appear in admin panel
- `saas/prisma/seed-ka.ts` — Georgian locale seed data

---

## 2. [Add future dependencies here]
