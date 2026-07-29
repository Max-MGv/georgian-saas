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
`DEFAULT_TENANT_ID` in `.env` was originally set to **Nikalas Marani's** ID; since the #79 dev/staging environment work (2026-07-23), local `.env` points at the **dev** DB and `DEFAULT_TENANT_ID` there is **Staging Winery**'s ID instead (confirmed directly 2026-07-26). So on `localhost:3000`, every admin page currently shows Staging Winery's data — for any logged-in user, super_admin or not. This is easy to mistake for "super_admin sees everything," which it does not. To locally preview a different tenant's admin, you'd need to either change `DEFAULT_TENANT_ID` or give that tenant a real resolvable domain (`winery2.local` currently has no hosts-file entry, so it isn't reachable locally — see `SessionLog.md` 2026-07-17 session 3).

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

---

## 6. Legal page content — `lib/legalContent.ts` is not live-linked to already-seeded tenants

**What the dependency is:**
`saas/lib/legalContent.ts` (`LEGAL_CONTENT_EN`/`LEGAL_CONTENT_KA`) is the source text for the 3 legal documents (Feature #128), but it's only consulted at two moments: as the English code-fallback in `ContentClient.tsx` (shown only when a tenant has no DB row for that key), and when a tenant's rows are first created — either automatically in `createTenant()` for new tenants, or by running `scripts/seed-legal-content.ts` once for existing ones. Once a `SiteContent` row exists for a tenant, that row is what renders — editing `legalContent.ts` afterward does **not** retroactively change it.

**What this means in practice:** if the legal wording needs a correction after tenants already have it seeded (e.g. the native Georgian/legal review flagged in `Plan-LegalPages.md` turns up a needed fix), editing the constants file alone isn't enough — you also need to either re-run the backfill script after clearing the affected rows for each tenant (loses any tenant-specific edits an admin may have made in the meantime), or push the correction through each tenant's admin panel by hand. There is no "push this update to everyone" mechanism, by design — the same reason `EditableText` fallback edits never retroactively touch existing tenant rows for any other content field either.

**Files involved:**
- `saas/lib/legalContent.ts` — the source text
- `saas/app/actions/superAdmin.ts` — `createTenant()`'s seed-on-creation hook
- `saas/scripts/seed-legal-content.ts` — the create-only backfill for existing tenants
- Full feature reference: `Features/Feature 128 - Legal Pages.md`

---

## 7. `EditableLongText` duplicates `EditableText`'s save/cancel/reset logic — not a shared base

**What the dependency is:**
`components/EditableLongText.tsx` (textarea-based, used only by the Legal tab) was built as a parallel implementation of `components/EditableText.tsx` (contentEditable-based, used everywhere else), not a shared abstraction — same Save/Cancel/Reset behavior and the same `saveContent`/`deleteContent` server actions underneath, but two separate component bodies.

**What this means in practice:** a behavior change to `EditableText.tsx` (e.g. the save button's pending state, the reset confirmation flow, or the `adminT` key names it reads) will not automatically apply to `EditableLongText.tsx` — it has to be updated in both places by hand if you want them to stay in sync. Deliberate tradeoff at the time (the two components' actual DOM/interaction needs — contentEditable span vs. textarea — are different enough that a shared base would have been an early abstraction over two use cases, not a proven pattern yet).

---

## 8. `saas/vercel.json` must stay in `saas/`, not the repo root — and it is load-bearing for site speed

**What the dependency is:**
`saas/vercel.json` pins Vercel Function execution to `fra1` (Frankfurt), matching the `eu-central-1` Supabase projects. Without it, Vercel defaults to `iad1` (Washington DC) and **every database round trip crosses the Atlantic** — which is exactly what made the whole site take ~3s to respond before 2026-07-29.

**The trap:** this repo has `saas/` + `dashboard/` + `vault/` and **no root `package.json`**, so Vercel's Root Directory is `saas`. `vercel.json` is read *relative to the Root Directory*. Moved to the repo root, it is **silently ignored** — no error, no warning, the site just gets slow again.

**What this means in practice:**
- Don't relocate, rename, or "tidy" this file into the repo root.
- If page loads ever regress to multiple seconds, check `X-Vercel-Id` before investigating anything else:
  ```bash
  curl -s -D - -o /dev/null https://nikalasmarani.vercel.app/ | grep -i x-vercel-id
  ```
  Expected `fra1::fra1::…`. A second segment of `iad1` means the pin is gone.
- If the Supabase projects are ever moved to another region, this file must move with them.

Background and measurements: [[Plan-Performance]], [[Perf-Baseline-2026-07-29]].

---

## 9. `getAllSettings()` returns payment details — server-only, never hand the map to a client component

**What the dependency is:**
`app/actions/settings.ts` exposes two readers, and they are not interchangeable:
- `getSetting(key)` — one key, resolves the tenant internally. Right choice for the ~100 call sites needing one or two settings.
- `getAllSettings(tenantId)` — the tenant's **entire** settings map in one query. Used by the public pages that need many.

**The risk:** that map includes `payment_iban`, `payment_personal_number`, `payment_bank_code`, and `payment_recipient_name`. Passing it wholesale into a client component would serialize the winery's bank details into the page HTML for every visitor. The old per-key pattern made that mistake nearly impossible; the batch version makes it a one-liner.

**What this means in practice:**
- Read the specific keys you need out of the map and pass **those** as props — the way `(site)/page.tsx` and `(site)/layout.tsx` already do. Never `<Component settings={settings} />`.
- Don't reimplement `getSetting()` on top of `getAllSettings()`. Uncached, that would make every single-key read fetch the whole table — strictly worse than today.
- `getAllContent(tenantId, locale)` follows the same shape (all sections, one query) but carries no secrets.

Both take `tenantId` explicitly rather than calling `getTenantId()` (which reads `headers()`) — that was a prerequisite for wrapping them in a cache. Caching was ultimately **not** built (see [[Plan-Performance]]), but the signature is deliberate and worth keeping if it ever is.

---

## 10. `test-rls.ts` silently skips its cross-tenant tests on a one-tenant database

**What the dependency is:**
`scripts/test-rls.ts` is the 21-test isolation suite referenced throughout [[RLS-Architecture]]. Its section 4, "Cross-tenant isolation", is the part that actually proves RLS works — and it **skips itself** when the database contains fewer than two tenants, printing `⚠️ Cross-tenant tests skipped (only 1 tenant in DB)` and still reporting a clean pass.

The dev database normally holds exactly one tenant (Staging Winery). So the everyday result of running the suite is a green "18 passed, 0 failed" **in which nothing cross-tenant was checked at all**.

**Why it matters:** the RLS checklist's step 7 is "verify with `check-rls.ts`". `check-rls.ts` only confirms a policy *exists* and RLS is *enabled* — it does not exercise it. If a new table's policy were subtly wrong (wrong column, wrong `current_setting` key, missing `WITH CHECK`), both scripts would still come back green on the dev DB. Discovered 2026-07-29 while adding the `Payment` table.

**What to do when adding a tenanted table:** don't rely on the green tick. `scripts/test-payment-rls.ts` is the pattern to copy — it stands up two throwaway tenants, writes a row under each, and asserts both directions (read by direct id returns `null`; cross-tenant `updateMany` affects 0 rows), then deletes them. Roughly 40 lines, and it's the only thing that actually proves the new policy holds.

**Files involved:**
- `saas/scripts/test-rls.ts` — the suite with the conditional skip
- `saas/scripts/check-rls.ts` — existence/enabled check only, not a behavioural test
- `saas/scripts/test-payment-rls.ts` — the two-tenant pattern worth copying
