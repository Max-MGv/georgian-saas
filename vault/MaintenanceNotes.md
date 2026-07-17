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
- `saas/app/admin/content/BookingFormVisualPanel.tsx` — visual replica of the form used in the admin editor; layout must stay in sync with `BookingForm.tsx`
- `saas/prisma/seed-ka.ts` — Georgian locale seed data

---

---

## 2. Admin route group structure — `(panel)` vs root

**What the structure is:**
`app/admin/` has two distinct zones:
- `app/admin/login/` — standalone login page; inherits the root pass-through `app/admin/layout.tsx`; **no nav bar**
- `app/admin/(panel)/` — all other admin pages (orders, companies, settings, etc.); inherits `app/admin/(panel)/layout.tsx` which renders the full nav bar with logo, nav links, logout

**Why it matters:**
If you add a new admin page that should have the nav bar, it must go inside `app/admin/(panel)/`. If you put it at `app/admin/mynewpage/` it will get a bare page with no nav.

If you add a new auth-related page (e.g. forgot-password, magic-link callback) that should be standalone, put it alongside `login/` at the root admin level.

**The `(panel)` name is invisible to Next.js routing** — `/admin/orders` still resolves to `app/admin/(panel)/orders/page.tsx`. Route group names in parentheses never appear in the URL.

---

## 3. `prisma db push` on Windows — stop dev server first

**What the dependency is:**
On Windows, Node locks `.dll.node` binary files while they are in use. `prisma generate` (which runs automatically at the end of `prisma db push`) writes a temp file then renames it over the existing Prisma client binary. That rename fails with `EPERM` if the dev server is running, because the server has the binary loaded and locked.

**What goes wrong if you forget:**
- Schema is pushed to the DB ✅
- Prisma client is NOT regenerated ❌
- The generated client is left in an inconsistent/partial state
- Dev server crashes on every request trying to use it
- Each crash leaks an open Postgres connection
- After 9 leaked connections the pool is exhausted → `connection pool timeout` errors for every page

**The rule:**
Before running `prisma db push` or `npx prisma generate`:
1. Stop the dev server (Ctrl+C in the terminal running `npm run dev`)
2. Run `prisma db push`
3. Confirm output ends with `✔ Generated Prisma Client`
4. Restart the dev server

This is Windows-only. On Mac/Linux the rename succeeds even with the file open, so this step is not needed there. Does not affect production (Vercel bakes the client at build time, never replaces it at runtime).

---

## 4. Admin panel is always scoped to ONE tenant — never "all tenants," not even for super_admin

**What the dependency is:**
`/admin/*` pages (Orders, Companies, Statistics, Wine Orders, etc.) always show exactly one tenant's data — whichever tenant the current *domain* resolves to. This is true regardless of who's logged in, including `super_admin`.

`proxy.ts` resolves the tenant from the `Host` header on every request and forwards it as `x-tenant-id`. Every admin page reads that single ID and filters its DB queries by it. The `super_admin` role only changes the **access check** — "is this user allowed to view this tenant's admin" — it does not aggregate data across tenants. There is no cross-tenant view anywhere in the app today.

**The localhost trap:**
`localhost` isn't a real tenant domain, so `resolveTenant()` falls back to a fixed `DEFAULT_TENANT_ID` env var instead of a domain lookup:
```ts
if (isLocal) {
  const defaultId = process.env.DEFAULT_TENANT_ID
  if (defaultId) tenant = await db.tenant.findUnique({ where: { id: defaultId } })
}
```
`DEFAULT_TENANT_ID` in `.env` is currently set to **Nikalas Marani's** ID. So on `localhost:3000`, every admin page shows Nikalas Marani's data — for any logged-in user, super_admin or not. This is easy to mistake for "super_admin sees everything," which it does not. To locally preview a different tenant's admin, you'd need to either change `DEFAULT_TENANT_ID` or give that tenant a real resolvable domain (`winery2.local` currently has no hosts-file entry, so it isn't reachable locally — see `SessionLog.md` 2026-07-17 session 3).

**Files involved:**
- `saas/proxy.ts` — `resolveTenant()`, the `DEFAULT_TENANT_ID` fallback
- Every page under `saas/app/admin/(panel)/` — reads `x-tenant-id` via `getTenantId()`, scopes all queries to it

**If you ever want a real cross-tenant reporting view** (e.g. "total revenue across all clients" on the super-admin Tenants page), that has to be built explicitly — it doesn't fall out of the existing per-tenant admin pages.
