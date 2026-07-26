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
- Make sure `BookingForm.tsx` reads that key via the `fc(key, tKey)` helper (line ~48: `formContent[key] || t(locale, tKey)`) instead of calling `t()` directly
- Seed the new key in `saas/scripts/seed-ka.ts` for the Georgian locale — a key with no `ka` row there makes the content-locale KA toggle a silent no-op for that field (this exact bug was issue #131 part 1: 20 fields existed in `FIELDS.form` for months with zero `ka` rows)

**If you remove a field from the form:**
- Remove its `FIELDS.form` entry in `ContentClient.tsx` to avoid orphaned admin controls
- Remove any DB seed rows for that key if present

**Two variants — Simple vs. Detailed (added for #131 part 2, 2026-07-23):**
`BookingForm.tsx` has an `isEnhanced` branch (real toggle = `enable_enhanced_company_booking` setting + a company booking selected) that adds: split guest counts (Tasting/Lunch/Free-Guide, replacing the single "Number of Guests" field), a Hot Dish Selection block, a Masterclass Add-ons block, and Food Notes (Food Notes is **only** rendered inside `isEnhanced` — never in the simple/individual form). `BookingFormVisualPanel.tsx` mirrors both variants behind a `variant: 'simple' | 'detailed'` prop, toggled independently of the tenant's live setting so admins can preview/edit either one at any time. Only the 3 detailed-variant **section headers** are tenant-editable (`form_guest_counts_header`/`form_hot_dish_header`/`form_masterclass_header`) — deliberately not the guest sub-labels, dropdown option text, or masterclass item rows, since those are tied to or populated by other admin-managed data (`minGuestsTasting`/`minGuestsTastingLunch` settings, `MenuItem`/`MasterclassItem` records at `/admin/menu-items` and `/admin/masterclass`), not SiteContent. If you add a 4th detailed-only section, decide the same "is this a fixed label or backed by other admin data" question before deciding whether it gets a `FIELDS.form` entry.

**Files involved:**
- `saas/components/BookingForm.tsx` — public form, reads labels via the `fc()` helper (falls back to `lib/t.ts` when no SiteContent override exists)
- `saas/app/admin/(panel)/content/ContentClient.tsx` — `FIELDS.form` array defines which keys appear in admin panel; also owns the Simple/Detailed toggle state (`formVariant`) for the Booking Form tab
- `saas/app/admin/(panel)/content/BookingFormVisualPanel.tsx` — visual replica of the form used in the admin editor, takes a `variant` prop; layout must stay in sync with `BookingForm.tsx`
- `saas/scripts/seed-ka.ts` — Georgian locale seed data; run with `npx tsx scripts/seed-ka.ts` from `saas/` after adding new `form_*` keys

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
`localhost` isn't a real tenant domain, so `resolveTenant()` falls back to a fixed `DEFAULT_TENANT_ID` env var instead of a domain lookup. (Since #123, 2026-07-18, this fallback applies **only** to localhost — any other unrecognized domain resolves to no tenant at all and shows the `/welcome` placeholder. Previously `tenantId` fell back to `DEFAULT_TENANT_ID` on every unknown domain while branding/module flags fell back to generic defaults, causing a split-brain state.)
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

---

## 5. Wine name (EN/KA) — resolve through `wineDisplayName()`, don't read `wine.name` directly on customer-facing surfaces

**What the dependency is:**
`Wine` has two name fields: `name` (required, English/canonical) and `nameKa` (optional, Georgian override). `saas/lib/wineName.ts` exports `wineDisplayName(wine, locale)`, which returns `nameKa` when the locale is `'ka'` and `nameKa` is non-empty, otherwise falls back to `name`.

**Where resolution happens (once, server-side):** `saas/app/(site)/wines/page.tsx` resolves the name before it ever reaches the client — the flattened wine list handed to `WineCatalogueClient` already has the correct string in its `name` field. From there it flows unchanged into the cart, the order-summary drawer, the `submitWineOrder` payload, and `WineOrderItem.wineNameSnapshot`. **If you add a new customer-facing surface that reads wine names from the DB directly** (a new page, an email template, a CSV export), route it through `wineDisplayName()` too — reading `wine.name` straight from Prisma will silently ignore any Georgian names admins have entered.

**Where it doesn't apply:** the admin panel (`WinesClient.tsx`) always shows/edits the raw `name`/`nameKa` pair directly — there's no resolution there, since the admin needs to see and edit both values, not a resolved single string.

**Files involved:**
- `saas/lib/wineName.ts` — the resolver
- `saas/app/(site)/wines/page.tsx` — the one place resolution happens for the live app
- `saas/app/admin/(panel)/wines/WinesClient.tsx` — admin editor, EN/KA toggle on the Name field
- Full design + what's still English-only on the public wines page: `Plan-BilingualWineName.md`

**If you ever want a real cross-tenant reporting view** (e.g. "total revenue across all clients" on the super-admin Tenants page), that has to be built explicitly — it doesn't fall out of the existing per-tenant admin pages.
