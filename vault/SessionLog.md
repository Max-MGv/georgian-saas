---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-06-22 — Company access codes (soft auth) — v1.7 complete

### Completed

**DB schema** (`saas/prisma/schema.prisma`)
- Added 5 nullable fields to Company model: `contactName`, `contactPhone`, `contactEmail`, `address`, `accessCode`
- `prisma db push` done — all columns live in DB

**Server actions** (`saas/app/actions/companies.ts`)
- `createCompany` — now auto-generates an 8-char alphanumeric access code on creation (e.g. `XK9F2M48`)
- `updateCompany` — extended to accept all 5 new profile fields
- `regenerateAccessCode(id)` — admin action; generates new code, saves, returns it
- `setAccessCode(id, code)` — admin action; sets a custom code (uppercased)
- `verifyCompanyCode(companyId, code)` — public action (no requireAdmin); verifies code case-insensitively; returns profile fields on match, error on mismatch

**Admin — Companies slide-over panel** (`saas/app/admin/companies/CompaniesClient.tsx`)
- Edit button now opens a full right-side slide-over panel (instead of inline edit)
- Panel sections: Company info (name, ID code, address), Contact person (name, phone, email), Access code
- Access code row: show/hide toggle, copy button, "Generate new code" button; edit inline (saves on blur)
- "Code set" green badge shown on company row when a code exists
- Price tier expand/edit functionality unchanged

**Booking form** (`saas/components/BookingForm.tsx`)
- Company type now includes `accessCode: string | null`
- Name/phone/email inputs converted from uncontrolled → controlled (state: `firstName`, `lastName`, `phone`, `email`)
- When company selected + code exists: popup appears (password input with show/hide toggle, "Remember device" checkbox, "I'm not a company rep" escape link)
- Correct code → `verifyCompanyCode` server call → splits `contactName` on first space into firstName/lastName; fills phone/email
- localStorage: key `company_auth_{companyId}`, 30-day expiry; on selection checks cache before showing popup
- Wrong code → inline error, unlimited retries

**Wine orders form** (`saas/app/(site)/wines/WineCatalogueClient.tsx`, `saas/app/(site)/wines/page.tsx`)
- Company dropdown added at top of reservation form (optional)
- Selecting company with a code → same popup flow
- Auto-fills: businessName, llcId, address, contactName, contactPhone
- No company selected → form works exactly as before

**TypeScript**: 0 errors

### Key files changed
- `saas/prisma/schema.prisma` — 5 new Company fields
- `saas/app/actions/companies.ts` — full rewrite: new actions + extended updateCompany
- `saas/app/admin/companies/CompaniesClient.tsx` — slide-over panel replaces inline edit
- `saas/app/admin/companies/page.tsx` — passes new fields to client
- `saas/components/BookingForm.tsx` — controlled inputs + code popup + auto-fill + localStorage
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — company selector + popup + controlled inputs
- `saas/app/(site)/wines/page.tsx` — fetches companies, passes as prop

### Next up (user testing)
1. Admin: open Companies page → click Edit on any company → verify slide-over opens with all fields
2. Admin: set a custom code (e.g. `MARANI42`) or use the generated one → click Copy
3. Public booking form: select that company → verify popup appears → enter wrong code (error) → enter correct code → verify name/phone/email auto-fill
4. Wine orders page: select company → same popup flow → verify fields auto-fill

---

## 2026-06-22 — Image/banner audit + two fixes: compression + tenant isolation (full detail)

### Completed

**Image/banner audit**
- Full review of how images and hero banners are handled vs. industry standards
- 7 findings documented; 2 implemented this session; 5 added as v1.6 roadmap items

**Fix 1 — Image compression on upload (`saas/app/actions/uploadImage.ts`)**
- Installed `sharp` as a dependency
- All uploaded background images are now compressed server-side before storage: resized to max 2000px wide, converted to WebP at quality 82
- Typical reduction: 3–9 MB raw file → ~150–300 KB WebP
- Stored filename is now `${tenantId}/${Date.now()}.webp` (includes tenant prefix — see Fix 2)

**Fix 2 — Tenant isolation in Supabase Storage (`saas/app/actions/uploadImage.ts`, `saas/app/admin/content/page.tsx`, `saas/app/admin/content/BackgroundsTab.tsx`)**
- Uploads stored at `${tenantId}/filename.webp` (previously flat shared bucket)
- `listUploadedImages()` in `page.tsx` now lists from `${tenantId}/` prefix — tenants only see their own images
- `deleteBgImage` validates the storage path starts with the caller's own `${tenantId}/` and has exactly one slash — blocks cross-tenant deletes
- `BackgroundsTab.tsx`: replaced `filenameFromUrl()` (returned only last URL segment) with `storagePathFromUrl()` (extracts full bucket-relative path after `/backgrounds/`) so the delete call passes the correct path including tenant prefix

**TypeScript**: 0 errors after all changes

### Key files changed
- `saas/app/actions/uploadImage.ts` — sharp compression + WebP conversion + tenant-scoped paths
- `saas/app/admin/content/page.tsx` — `listUploadedImages` scoped to tenant prefix
- `saas/app/admin/content/BackgroundsTab.tsx` — `storagePathFromUrl` replaces `filenameFromUrl`
- `saas/package.json` — sharp + @types/sharp added

### Remaining v1.6 items (see Roadmap)
- ~~LCP preload hint for hero image~~ ✅ Done
- ~~CSS media query for responsive backgrounds~~ ✅ Done
- ~~Next.js `<Image>` for logo~~ ✅ Done
- ~~Simplify background-size to `cover`~~ ✅ Done (cover + scale)
- ~~Alt text on uploaded image thumbnails~~ ✅ Done
- **v1.6 fully complete**

### Next up
- User test: upload a background image → confirm it appears, save it, delete it
- Run `setup-rls.ts` against Supabase (still outstanding from Sprint 3A)
- Sprint 4: per-tenant admin auth

---

## 2026-06-22 — RLS structural change: withTenantDb wrapper + setup-rls script (full detail)

### Completed

**Diagnosis**
- Ran `scripts/check-rls.ts` → confirmed RLS is ON for all 12 tables but with **0 policies**
- Root cause: Prisma connects as `postgres` (Supabase superuser), which **bypasses RLS by design**; policies have no effect unless the connection voluntarily downgrades to a non-superuser role

**`withTenantDb` wrapper — `saas/lib/db.ts`**
- Added `TxClient` type (Prisma transaction client shape)
- Added `withTenantDb(tenantId, fn)`: opens a `$transaction`, executes `set_config('app.tenant_id', tenantId, true)` (session variable for policies to read) and `SET LOCAL ROLE app_user` (voluntarily downgrade to non-superuser → RLS enforced), then runs `fn(tx)`
- `LOCAL` on both commands means they revert at COMMIT/ROLLBACK — no leakage between requests

**All 25 tenant data files updated to use `withTenantDb`**
- 13 server action files: `settings.ts`, `siteContent.ts`, `blockedDates.ts`, `companies.ts`, `wines.ts`, `wineOrders.ts`, `menuItems.ts`, `masterclassItems.ts`, `orderExtras.ts`, `orderMasterclass.ts`, `orders.ts`, `createBooking.ts`, `submitWineOrder.ts`
- 12 page files: `admin/wines/`, `admin/companies/`, `admin/menu-items/`, `admin/masterclass/`, `admin/wine-orders/`, `admin/content/`, `admin/orders/`, `admin/orders/new/`, `admin/orders/[id]/`, `admin/statistics/`, `(site)/`, `(site)/wines/`
- `lib/pricing.ts`: `recalcOrderTotal` now takes `tenantId` + uses `withTenantDb` internally
- Atomic read+write pattern: functions like `updateOrderEnhanced`, `addOrderExtra`, `addMasterclassLine` now group their read+write in one `withTenantDb` callback

**`scripts/setup-rls.ts` — NEW**
- Creates `app_user` role (NOLOGIN)
- GRANTs SELECT/INSERT/UPDATE/DELETE on all 12 tenanted tables; SELECT only on Tenant
- Creates `tenant_isolation` policies:
  - 9 tables with direct `tenantId`: `USING ("tenantId" = current_setting('app.tenant_id', true))`
  - `Price`: JOIN to Company
  - `OrderMasterclass`, `OrderExtra`: JOIN to Order
- Idempotent (DROP POLICY IF EXISTS before each CREATE)

**TypeScript check**: 0 errors after all changes

### Key files changed
- `saas/lib/db.ts` — `TxClient` type + `withTenantDb` function added
- `saas/lib/pricing.ts` — `recalcOrderTotal(orderId, tenantId)` new signature
- All 13 server action files in `saas/app/actions/` — wrapped with `withTenantDb`
- All 12 page files in `saas/app/` — wrapped with `withTenantDb`
- `saas/scripts/setup-rls.ts` — NEW: creates app_user role + all RLS policies

### Next up
- **Run `setup-rls.ts`** against Supabase to actually create the role and policies
- Verify with `check-rls.ts` — should show policies on all 12 tables
- Sprint 4: per-tenant admin auth

---

## 2026-06-22 — Multi-tenant architecture: Sprint 1A + 1B + Sprint 2 (full detail)

### Completed

**Sprint 1A — Schema + Seed**
- Added `Tenant` model to `schema.prisma` (`id, name, domain, slug, createdAt`)
- Added nullable `tenantId String?` to 9 tables: Company, Order, MenuItem, MasterclassItem, WineOrder, Setting, SiteContent, BlockedDate, Wine
- Child tables left without `tenantId` (always accessed via parent): Price, OrderMasterclass, OrderExtra
- Updated unique constraints: `SiteContent` → `@@unique([key, locale, tenantId])`; `BlockedDate` → `@@unique([date, tenantId])`
- Ran `prisma db push --accept-data-loss` successfully; all columns created in DB
- Created `scripts/seed-tenants.ts` — inserts 2 tenants, backfills 59 orders, 2 companies, 6 wines, 6 wine orders, 6 menu items, 5 masterclass items, 29 settings, 19 site content rows to Nikalas Marani tenant

**Sprint 1B — Middleware + Tenant Helper**
- Added `DEFAULT_TENANT_ID` to `.env` (fallback for localhost dev)
- Rewrote `saas/proxy.ts`: expanded matcher to all routes (not just `/admin`); added `resolveTenantId(host)` with module-level Map cache; sets `x-tenant-id` on every request header; localhost uses env fallback; auth redirect logic preserved
- Created `saas/lib/tenant.ts`: `getTenantId()` reads `x-tenant-id` from request headers; throws if missing (fail-safe against unscoped queries)

**Sprint 2 — Query Scoping (THE FLIP)**
- Setting PK changed from `key @id` → `id @id @default(cuid())` + `@@unique([key, tenantId])` via raw SQL script (`scripts/migrate-setting-pk.ts`) — handled safely because `prisma db push` cannot add a non-nullable column to tables with existing rows
- Updated all 13 server action files and 12 page/component files — 27 files total in a single coordinated pass (half-scoped is worse than unscoped)
- Security patterns applied: `findMany → where: { tenantId }`, `create → tenantId in data`, `update → updateMany with tenantId`, `delete → deleteMany with tenantId`, `findUnique on ID → findFirst with tenantId`
- Child tables (OrderMasterclass, OrderExtra) verified via parent Order tenantId before mutation
- Public actions (createBooking, submitWineOrder) also scoped — tenant resolved from request headers
- TypeScript: 0 errors after all changes
- Public site verified: `http://localhost:3000` home page loaded correctly with booking form

### Key files changed
- `saas/prisma/schema.prisma` — Tenant model + tenantId columns + unique constraint updates + Setting PK change
- `saas/proxy.ts` — full rewrite: tenant resolution + expanded matcher
- `saas/lib/tenant.ts` — NEW: `getTenantId()` helper
- `saas/.env` — `DEFAULT_TENANT_ID` added
- `saas/scripts/seed-tenants.ts` — NEW: tenant seed + backfill
- `saas/scripts/migrate-setting-pk.ts` — NEW: raw SQL PK migration for Setting
- All 13 server action files in `saas/app/actions/` — tenantId scoping
- All 12 page/component files in `saas/app/` with direct db calls — tenantId scoping
- `saas/scripts/seed-ka.ts` — updated to use new `key_locale_tenantId` accessor
- `vault/migration-progress.md` — NEW: full migration tracker with sprint-by-sprint details

### Key decisions
- Node.js runtime (not Edge) for proxy.ts by default in Next.js 16 → Prisma works directly, no Supabase REST fetch needed
- Module-level Map cache in proxy.ts avoids DB hit on every request after first resolution per domain
- All 27 files updated in one pass — no interim half-scoped state
- Localhost uses `DEFAULT_TENANT_ID` env var; second tenant testable via Windows hosts file trick (`127.0.0.1 winery2.local`)

### ⚠️ Needs user testing (Max to do manually)
See full checklist in `vault/migration-progress.md` → Sprint 2 "What to test" section.
1. Admin orders — visit `/admin/orders`, confirm 59 orders visible
2. Admin companies, wines, content, settings — spot check a few pages
3. Submit a test booking on public form → check it appears in admin orders
4. Second tenant isolation — add `127.0.0.1 winery2.local` to Windows hosts file, visit `http://winery2.local:3000/admin/orders` → should show 0 orders

### Next up
- Max to run the 4 user testing steps above (⚠️ these are for Max, not for Claude)
- Supabase RLS update to enforce `tenantId` (Sprint 2 deferred item — query scoping is now the primary guard)
- Sprint 4: per-tenant admin auth (Supabase user tied to `tenantId`)

---

## 2026-06-21 — Custom image upload for Backgrounds tab (full detail)

### Completed
- **Upload button in Backgrounds tab** — dashed `+`-style card added to the image picker grid (after all built-in images); clicking it opens a hidden `<input type="file" accept="image/*">`; the selected file is uploaded to Supabase Storage `backgrounds` bucket via `uploadBgImage` server action; the returned public URL is added to `extraImages` state and auto-selected as the active background.
- **Uploaded images appear in the grid** — shown alongside built-in winery/hero/gallery images; no visual difference except they have an X delete button.
- **Remove uploaded images** — hovering an uploaded image reveals a small dark `×` button in the top-right corner; clicking calls `deleteBgImage` server action (deletes from Supabase Storage) and removes from local state; if the deleted image was active it clears the selection.
- **Shared image list** — all 3 page editors (Home / About / Contact) share the same uploaded image list; uploading from one editor makes the image available in all.
- **Persisted across page loads** — `page.tsx` calls `supabase.storage.from('backgrounds').list()` on load and passes existing uploads as `uploadedImages` prop through `ContentClient` → `BackgroundsTab`.
- **Supabase Storage** — uses the `backgrounds` public bucket; `uploadBgImage` auto-creates the bucket on first upload; service role client (`SUPABASE_SERVICE_ROLE_KEY`) used server-side for write access; 10 MB file size limit; path traversal guard on delete.

### Key files changed
- `saas/lib/supabase/service.ts` — NEW: service role Supabase client
- `saas/app/actions/uploadImage.ts` — NEW: `uploadBgImage` + `deleteBgImage` server actions
- `saas/app/admin/content/page.tsx` — lists existing uploads from Supabase Storage on load
- `saas/app/admin/content/ContentClient.tsx` — `uploadedImages` prop added to Props + component signature + BackgroundsTab call
- `saas/app/admin/content/BackgroundsTab.tsx` — `ImagePicker` rewritten: upload button, uploaded image cells with hover-X, delete handler; `PageBgEditor` passes extraImages/onUpload/onDelete; `BackgroundsTab` manages `extraImages` state

### Next up
- User test: upload an image, set it as background, save; hover + delete an uploaded image
- One-time setup: ensure Supabase `backgrounds` bucket exists (auto-created on first upload)
- Gallery page still outstanding
- PDF invoice email attachment still outstanding
- Minor fixes #5–#7 from security plan

---

## 2026-06-19 — Hero subtitle box fix + responsive text (full detail)

### Completed
- **Hero subtitle — single unified box** — `saas/app/(site)/page.tsx`: replaced `display: inline` + `box-decoration-break: clone` + `border-radius: 0` (which fragmented the background into per-line boxes) with `display: block` on the span + `border-radius: 6px`. Box now renders as one clean rounded box.
- **Fluid font sizing** — removed Tailwind breakpoint classes; subtitle `<p>` now uses `fontSize: 'clamp(0.8rem, 2.2vw, 1.05rem)'` for continuous scaling as viewport is dragged.
- **Box stretches with viewport** — `<p>` changed from `maxWidth: '34ch'` to `width: 'min(90%, 680px)'` with `mx-auto`; span changed to `display: block` so it fills the container width rather than shrinking to longest line.
- **v1.5 Page Backgrounds user-tested ✅** — Max confirmed the full image feature is done: Backgrounds tab (pick images, adjust position/zoom, save, remove), hero banners on all 3 public pages, winery fallback images, hover effects. Features #75–#78 marked user-tested.

### Key files changed
- `saas/app/(site)/page.tsx` — subtitle span: `display: block`, `border-radius: 6px`, removed `box-decoration-break`; `<p>` width `min(90%, 680px)`, `clamp()` font size

### Next up
- Gallery page still outstanding (images in `public/images/slider/` + `gallery/`)
- PDF invoice email attachment still outstanding
- Minor fixes #5–#7 from security plan

---

## 2026-06-19 — Hero background images, admin backgrounds editor + hero UI polish (full detail)

### Completed
- **3 winery images imported** — `Winery Image 1.jfif`, `winery image 2.avif`, `winery image 3.jpg` converted to JPG via sharp; saved to `saas/public/images/winery1.jpg`, `winery2.jpg`, `winery3.jpg`
- **Admin Backgrounds tab** — new third mode in `/admin/content` (alongside Text / Visual); image picker grid (8 images), X/Y position sliders, zoom slider, 200×128px live preview; saves to `Setting` table; per-page (Home / About / Contact)
- **Hero banners on all 3 public pages** — Home gets a full-bleed hero wrapping existing content; About and Contact get a 300px hero banner at top; all read background settings from DB with hardcoded winery image fallbacks (winery1/2/3.jpg)
- **`updateSetting` revalidation expanded** — now also revalidates `/about`, `/contact`, `/admin/content`
- **Overlay style settled** — About + Contact: frosted card (light 0.30 tint, `backdrop-filter: blur(6px)` dark pill bottom-left). Home: combination approach (see below)
- **Home hero — combination design:**
  - Light overlay (0.32) that darkens to 0.70 on banner hover (`transition: background-color 0.45s ease`) via pure CSS `.hero-banner:hover .hero-overlay`
  - Logo displayed in original colours on a cream rounded box (`rgba(245,239,230,0.92)`, `border-radius: 22px`)
  - "Kakheti, Georgia" eyebrow: inline dark pill (`box-decoration-break: clone`) — hugs text per line
  - Subtitle: inline dark background with `box-decoration-break: clone`, `border-radius: 0` and padding sized to eliminate gaps between lines — lines merge into one connected block
  - Two buttons in individual opaque boxes; both get `2px solid rgba(255,255,255,0.65)` border; wine-red glow on Book hover, white glow on Order Wine hover; buttons scale 1.06 on individual hover, 1.04 on banner hover
- **Hero taller** — `pt-24 pb-20` for more image presence; `max-w-xl` for better centring

### Key decisions
- Settled on Option C (frosted card) for About + Contact, custom combination for Home
- `box-decoration-break: clone` with `border-radius: 0` and `padding: 11px` on the subtitle span is the technique that creates seamless per-line-width highlights
- Pure CSS hover (no client component) keeps the home page a server component

### Key files changed
- `saas/public/images/winery1.jpg`, `winery2.jpg`, `winery3.jpg` — NEW
- `saas/app/admin/content/BackgroundsTab.tsx` — NEW
- `saas/app/admin/content/ContentClient.tsx` — backgrounds mode added
- `saas/app/admin/content/page.tsx` — fetches bg settings
- `saas/app/actions/settings.ts` — expanded revalidatePath
- `saas/app/(site)/page.tsx` — full hero rewrite with all combination effects
- `saas/app/(site)/about/page.tsx` — 300px hero banner, frosted card style
- `saas/app/(site)/contact/page.tsx` — 300px hero banner, frosted card style

### Next up
- User test the Backgrounds tab — pick images, save, verify live
- Gallery page still outstanding (images in `public/images/slider/` + `gallery/`)
- PDF invoice email attachment still outstanding
- Minor fixes #5–#7 from security plan

---

## 2026-06-19 — Multi-tenant architecture plan (full detail)

### Completed
- **Multi-tenant plan written** — `vault/Plan-MultiTenant.md` created; full 8-phase plan for growing from 1 to N client companies on a shared DB + single deployment
- **Roadmap v3 expanded** — v3 section updated to reference the plan with sprint-by-sprint checkboxes

### Key decisions
- Architecture: Option A — single Supabase DB with `tenantId` column on every table (vs. separate DB per client or separate deployments)
- Domain routing: Next.js middleware reads `Host` header → resolves `tenantId`
- RLS is the safety net; query-level scoping is the primary guard
- Theming (colors, logo) via CSS variables — no separate codebase per client

### Key files changed
- `vault/Plan-MultiTenant.md` — NEW: full multi-tenant plan, 8 phases, sprint grouping
- `vault/Roadmap.md` — v3 Platform section expanded with sprint breakdown + plan reference

### Next up
- Start Sprint 1 when ready: create `tenants` table, seed it, write middleware, add nullable `tenantId` to all tables

---

## 2026-06-02 — Mobile admin plan + show password (full detail)

### Completed
- **Show password toggle on admin login** — added `showPassword` state to `LoginForm.tsx`; eye icon button (SVG, no library) positioned absolutely inside the password field wrapper; toggles `type="password"` / `type="text"`; eye-off icon shown when password visible, eye icon when hidden
- **Mobile admin plan written** — `vault/Plan-MobileAdmin.md` created; full plan for Orders list card view, filter bar collapse, order detail audit, wine orders column fix; v1.4 added to Roadmap

### Key files changed
- `saas/app/admin/login/LoginForm.tsx` — `showPassword` state, eye toggle button, `paddingRight` on input
- `vault/Plan-MobileAdmin.md` — NEW: full mobile admin plan
- `vault/Roadmap.md` — v1.4 Mobile Admin section added; old v1.4 Page Backgrounds renamed to v1.5
- `vault/FeatureLog.md` — feature #71 added

### Next up (remaining from this session)
- Order detail page: tap target audit (last piece of mobile plan)
- User test all mobile admin changes on a real phone

---

## 2026-06-01 — Date format + past date protection (full detail)

### Completed
- **DD/MM/YYYY custom date input** — built `saas/components/DateInput.tsx`: text input with DD/MM/YYYY placeholder, auto-inserts slashes as user types, calendar icon button opens native date picker via `showPicker()`, syncs internal YYYY-MM-DD value with display. Replaces all `input[type=date]` in booking form and admin orders filter bar. Universal — works the same regardless of OS/browser locale.
- **Past date protection** — booking form: `isPastDate` flag shows inline red warning immediately when user types a past date; handleSubmit blocks submission with error message. `createBooking.ts`: server-side guard compares `dateStr < todayStr` and returns error before any DB writes. Missing-date guard also added to handleSubmit.
- **lang="en-GB"** — set on `<html>` in `app/layout.tsx` (good for other locale-dependent behaviour; doesn't affect date inputs in Chrome which ignores it, hence the custom component).

### Key files changed
- `saas/components/DateInput.tsx` — NEW: universal DD/MM/YYYY input component
- `saas/components/BookingForm.tsx` — uses DateInput; hidden `name="date"` input; past-date warning + submit guard; missing-date submit guard
- `saas/app/admin/orders/OrdersFilters.tsx` — From/To filters use DateInput
- `saas/app/actions/createBooking.ts` — past-date server guard
- `saas/app/layout.tsx` — lang="en-GB"

### Next up
- User test the date filters — set From/To and confirm results update correctly
- User test the content editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Bug fix: date filter inputs (full detail)

### Completed
- **KnownBug #1 fixed — date filter inputs** — The "From" and "To" date inputs in the orders filter bar were controlled by server-side `params` props. When a user picked a date from the native picker, `onChange` fired, `router.push` started a navigation, but React immediately reset the input back to the old value (from `params`) while waiting for the server to respond. This made the selection look lost. Fix: added `localDateFrom`/`localDateTo` local state that updates instantly on change, then syncs back to server params once navigation settles (detected by the existing `navKey` effect). The server query itself was always correct — all bookings are stored at UTC midnight so the `gte`/`lte` Prisma filters were sound.

### Key files changed
- `saas/app/admin/orders/OrdersFilters.tsx` — added `localDateFrom`/`localDateTo` state; inputs now use local state; `setUpcoming`/`clearFilters` also update local state; `navKey` effect syncs on settlement

### Next up
- User test the date filters — set From/To and confirm results update correctly
- User test the content editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Security audit + fixes (full detail)

### Completed
- **Code inspection** — full review of recent features (editable content, booking form, server actions); 7 findings identified (2 critical, 2 medium, 3 minor).
- **Finding #1 disproved** — initial finding that admin routes were unprotected was wrong; `saas/proxy.ts` is the Next.js 16 middleware entry point and correctly redirects unauthenticated visitors to `/admin/login`. Verified by navigating to admin without session.
- **Finding #2 fixed — server action auth guard** — server actions are exposed as HTTP POST endpoints; the proxy only protects page URLs, so direct POSTs to action endpoints via public URLs bypassed auth entirely. Proved by calling `saveContent` via `POST /` with `Next-Action` header — DB was written without a session. Fix: created `lib/requireAdmin.ts` (checks Supabase session, throws Unauthorized if no user) and added `await requireAdmin()` to every write action across 12 files.
- **Finding #3 fixed — masterclass price from DB** — `createBooking` trusted client-supplied `pricePerUnit` for masterclass line items, allowing a user to submit `pricePerUnit: 0` and pay nothing for add-ons. Proved by submitting a booking with fake price — order created with totalPrice excluding masterclass cost. Fix: server now fetches `masterclassItem.pricePerUnit` from DB by ID and ignores the client value in both the total calculation and the stored record.
- **Finding #4 fixed — enhanced booking min-guest check** — min-guest validation used `guestCount` (total incl. free guests), so a booking with `guestCount: 10` but `tastingGuestCount: 0, lunchGuestCount: 0` passed validation with `totalPrice: 0`. Fix: enhanced bookings now validate `tastingGuestCount + lunchGuestCount` against the minimum.

### Key files changed
- `saas/lib/requireAdmin.ts` — NEW: Supabase auth check helper
- `saas/app/actions/siteContent.ts` — requireAdmin on saveContent, saveContentSection, deleteContent
- `saas/app/actions/settings.ts` — requireAdmin on updateSetting
- `saas/app/actions/blockedDates.ts` — requireAdmin on addBlockedDate, removeBlockedDate
- `saas/app/actions/companies.ts` — requireAdmin on createCompany, updateCompany, deleteCompany
- `saas/app/actions/orders.ts` — requireAdmin on all 6 write functions
- `saas/app/actions/wines.ts` — requireAdmin on createWine, updateWine, deleteWine
- `saas/app/actions/wineOrders.ts` — requireAdmin on updateWineOrderStatus
- `saas/app/actions/prices.ts` — requireAdmin on createPrice, updatePrice, deletePrice
- `saas/app/actions/masterclassItems.ts` — requireAdmin on all 3 write functions
- `saas/app/actions/menuItems.ts` — requireAdmin on all 3 write functions
- `saas/app/actions/orderExtras.ts` — requireAdmin on addOrderExtra, removeOrderExtra
- `saas/app/actions/orderMasterclass.ts` — requireAdmin on addMasterclassLine, removeMasterclassLine
- `saas/app/actions/createBooking.ts` — DB-fetched masterclass prices; paying-guest min check

### Remaining (minor — no security/pricing risk)
- **#5** `hasDbValue` false-negative in EditableText when empty string saved
- **#6** No `revalidatePath` in `saveContent`/`deleteContent`
- **#7** EditableText outer `<div>` wrapper breaks HTML semantics for inline elements

### Next up
- User test the editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Fix date filters on admin orders (KnownBugs #1)
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Dual-mode site content editor (full detail)

### Completed
- **Dual-mode content editor** — `/admin/content` now has **Text** mode (flat labeled list per section: Navigation / Home / About / Contact) and **Visual** mode (full faithful page preview — nav bar + page body — with every hardcoded string editable inline via hover+click).
- **New SiteContent keys** — added ~25 new keys for strings previously locked in `lib/t.ts`: nav labels (`nav_home`, `nav_about`, `nav_wines`, `nav_contact`, `nav_book`), button text (`home_book_btn`, `home_order_wine_btn`, `about_cta_btn`, `contact_book_btn`), page headings (`about_eyebrow`, `about_heading`, `contact_eyebrow`, `contact_heading`, etc.), card notes, directions text, CTAs.
- **Public pages wired** — `app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx` all check `SiteContent` first with `t()` as fallback, so edits in admin now show on the live site.
- **SiteNav wired** — `(site)/layout.tsx` fetches `getContentMap('nav', locale)` and passes to `SiteNav`; nav labels + "Book a Visit" button now DB-backed.
- **Visual mode details**: framed in a rounded border with drop shadow; nav links are inert (not navigating away); booking form shows as a visual placeholder (`pointer-events-none`); `Navigation` tab hidden in visual mode (nav always shown at top of each preview).

### Key files changed
- `saas/app/admin/content/ContentClient.tsx` — full rewrite with mode switcher, FIELDS schema, TextMode, VisualNav, VisualHome, VisualAbout, VisualContact
- `saas/app/(site)/layout.tsx` — fetches nav content map, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — accepts `navContent` prop, uses DB values with t() fallback
- `saas/app/(site)/page.tsx` — hero buttons + booking heading use new SiteContent keys
- `saas/app/(site)/about/page.tsx` — eyebrow, heading, expect heading, CTA from SiteContent
- `saas/app/(site)/contact/page.tsx` — eyebrow, heading, card notes, directions, CTA from SiteContent

### Extended (same session — notes from Max)
- **"Kakheti, Georgia" eyebrow** — was hardcoded, now editable via `home_location_eyebrow` key
- **Contact card headers** (Phone / Email / Location / Cancellation) — now editable via `contact_label_*` keys; wired to live contact page
- **Booking form preview in visual mode** — replaced gray placeholder with full form structure: Booking Type toggles, Visit Type options, Date, Time Slot, Number of Guests, First Name, Last Name, Phone, Email, "Request Booking" button, cancel policy text — all labels editable in-place
- **BookingForm wired** — accepts `formContent` prop; `fc()` helper uses DB value with `t()` fallback for all 14 visible labels; home page fetches `getContentMap('form', locale)` and passes it down
- **Form section tab** added to Text mode (Navigation / Home / Form / About / Contact)
- **Reset to default** — `↺` badge on `EditableText` hover (only when DB value exists); tooltip previews fallback text; click calls `deleteContent` action; value snaps to fallback; "↺ Reset to default" flash. `deleteContent` added to `siteContent.ts`.

### Key files changed (full session)
- `saas/app/admin/content/ContentClient.tsx` — full rewrite × 2: dual-mode editor, FIELDS schema, VisualNav, VisualHome, VisualAbout, VisualContact, VisualFormPreview, TextMode
- `saas/components/EditableText.tsx` — reset badge + tooltip + `deleteContent` call; `hasDbValue` guard
- `saas/app/actions/siteContent.ts` — `deleteContent` action added
- `saas/app/(site)/layout.tsx` — fetches nav content map, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — `navContent` prop; DB-backed nav labels + book button
- `saas/app/(site)/page.tsx` — `home_location_eyebrow`, hero buttons, book heading, `formContent` fetch + BookingForm prop
- `saas/app/(site)/about/page.tsx` — eyebrow, heading, expect heading, CTA from SiteContent
- `saas/app/(site)/contact/page.tsx` — eyebrow, heading, card headers + notes + directions + CTA from SiteContent
- `saas/components/BookingForm.tsx` — `formContent` prop, `fc()` helper, all visible labels DB-backed

### Next up
- **Security & bug fixes** — see `vault/Plan-SecurityAndBugFixes.md` (7 items, 2 critical)
- User test the editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Fix date filters on admin orders (KnownBugs #1)

---

## 2026-05-28 — Session 3 (full detail)

### Completed
- **Settings page — Georgian text replaced with English** — payment field labels, section header, and email placeholder were in Georgian; all switched to English. Translations saved to `vault/Features/Add Language/Georgian Translations.md` for future i18n work.
- **Calendar view** — Table/Calendar toggle on orders page; custom month grid (no library); booking count badge per day (wine red); click day → switches to table filtered to that date; today highlighted.
- **Calendar day hover preview** — Obsidian-style popover on day cells shows all orders for that day: name, time, guests, visit type, status (colour-coded), company, total. 200ms delay; right-aligns for cols 4–6 to avoid clipping; stays open when hovering onto the card.
- **Export orders to CSV** — "Export CSV" button in filter bar; respects active filters; downloads `orders-YYYY-MM-DD.csv`; 13 columns.
- **Configurable min guests per visit type** — Settings → Booking Rules section; two number inputs (Wine Tasting / Tasting + Lunch); saves on blur; enforced in BookingForm (dynamic min, inline warning) and createBooking (server guard); package cards on home page show dynamic minimum.
- **Fix: home page min guests static** — added `export const dynamic = 'force-dynamic'` to `app/(site)/page.tsx`; home page now re-fetches settings on each request instead of baking values at build time.
- **Block dates (closed days)** — new `BlockedDate` DB model (prisma db push); Settings → Closed Days section; date picker + optional reason + block button; list with × remove; public form shows inline error when blocked date selected; createBooking guards server-side.
- **Shimmer loading skeleton** — `loading.tsx` in `/admin/orders` shows a warm brown shimmer skeleton (header + filter bar + 9 rows) during page navigation. `@keyframes shimmer` in globals.css.
- **Smooth scroll on "Book a Visit"** — `scroll-behavior: smooth` added to `html` in globals.css.
- **Status filter** — Status dropdown in orders filter bar; all 6 statuses (NEW/CONFIRMED/INVOICE_SENT/PAID/COMPLETED/CANCELLED); integrated into all filter queries; `OrderStatus` enum cast fixes TypeScript.
- **Progress bar on filter change** — thin wine-red progress bar animates under filter bar while navigating (`@keyframes nav-progress`); filter bar dims to 60% opacity. Uses `useState` + `useEffect` watching params (not `useTransition` — more reliable for concurrent updates).
- **Fix: status filter intermittent** — replaced `startTransition(router.push)` with direct `router.push` + `useState/useEffect` approach; navigation is no longer a low-priority concurrent update that could be dropped.
- **Status counts in dropdown** — status dropdown shows live counts per status within the current date/company filter context: "New (12)", "Confirmed (3)" etc.; options with 0 orders are disabled (greyed out). Uses `db.order.groupBy` on a `baseWhere` that ignores the status filter itself.

### Key files changed this session
- `saas/app/admin/orders/page.tsx` — view param, calendar data, baseWhere + groupBy for statusCounts, CalendarView + ViewToggle integration; `include` on orders query fixed with `OrderStatus` cast
- `saas/app/admin/orders/CalendarView.tsx` — NEW: month grid + hover popover
- `saas/app/admin/orders/ViewToggle.tsx` — NEW: Table/Calendar toggle (no useSearchParams — receives params as props)
- `saas/app/admin/orders/OrdersFilters.tsx` — Export CSV button, status filter, progress bar, status counts, shimmer/loading state
- `saas/app/admin/orders/loading.tsx` — NEW: shimmer skeleton
- `saas/app/actions/orders.ts` — `exportOrdersCsv` action; `OrderStatus` cast on status filter
- `saas/app/admin/settings/page.tsx` — min guest settings + blocked dates fetch
- `saas/app/admin/settings/SettingsClient.tsx` — Booking section header, Booking Rules section, Closed Days section
- `saas/app/actions/settings.ts` — two new defaults
- `saas/app/actions/blockedDates.ts` — NEW: getBlockedDates, addBlockedDate, removeBlockedDate
- `saas/prisma/schema.prisma` — BlockedDate model added
- `saas/components/BookingForm.tsx` — dynamic minGuests props, blockedDates prop, inline blocked date error
- `saas/app/(site)/page.tsx` — force-dynamic, min guest + blocked dates fetch + BookingForm props
- `saas/app/actions/createBooking.ts` — server-side blocked date + min guest validation
- `saas/app/globals.css` — smooth scroll, shimmer keyframes, nav-progress keyframes

### Bugs fixed / lessons learned
- `useSearchParams()` in client components without a `<Suspense>` boundary crashes the entire page in Next.js App Router production builds (passes build, fails at runtime). Fix: remove `useSearchParams`, receive params as props from the server component instead.
- `startTransition(router.push)` makes navigation a low-priority concurrent update that can be interrupted. Fix: call `router.push` directly.
- Prisma `where` clause with a union type spread causes cascading type errors on `include` results — fix with `as OrderStatus` cast on the string param.
- Home page with settings-dependent content must have `export const dynamic = 'force-dynamic'` or values are baked in at build time.

- **Fix: calendar hover preview** — `e.currentTarget` is nullified by React after the event handler returns, so calling `.getBoundingClientRect()` inside a `setTimeout` always failed silently. Fixed by capturing `const target = e.currentTarget` before the timeout.

- **Wine description field** — `description String?` on Wine model; textarea in admin edit+add forms; shown on card below type/price
- **Wine orders status stepper** — Pending → Confirmed → Paid → Delivered (4 stages); active step has glow ring + bold label; inactive steps faded; stepper centered in col 3; optimistic UI; `updateWineOrderStatus` server action
- **Wine order ID on card** — `#xxxxxxxx` monospace badge (first 8 chars of cuid)
- **Wine order total amount** — `totalAmount Float?` on WineOrder schema; price now stored per wine in JSON (`{id, name, quantity, price}`); total computed in `submitWineOrder`; displayed on admin card
- **Schema**: `prisma db push` done — both Wine.description and WineOrder.totalAmount columns live in DB

### Key files changed this session
- `saas/prisma/schema.prisma` — Wine.description + WineOrder.totalAmount added
- `saas/app/actions/wines.ts` — description param added to createWine/updateWine
- `saas/app/actions/wineOrders.ts` — NEW: updateWineOrderStatus
- `saas/app/actions/submitWineOrder.ts` — price per wine in JSON; totalAmount computed and saved
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — price included in wines JSON on submit
- `saas/app/admin/wines/WinesClient.tsx` — description type, edit form textarea, display on card
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — NEW: status stepper client component
- `saas/app/admin/wine-orders/page.tsx` — now delegates to WineOrdersClient

### Bugs fixed / lessons learned
- Wine order JSON was missing `price` per bottle — amounts couldn't be computed without it. Fixed at submission time; old orders will show `—` for total (totalAmount is nullable).

- **Wine orders card layout redesign** — 3-column layout: col 1 (name/company/tags/address/contact), col 2 (amount/hours/phone, centered), col 3 (stepper); colored border on right edge matching status; status filter pills with solid color when selected; cancel order button removed; card width narrowed (`max-w-3xl`)

### Key files changed (wine orders redesign — 2026-05-28)
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — full layout redesign + stepper improvements + delivered status + filter pills
- `saas/app/admin/wine-orders/page.tsx` — max-w-5xl → max-w-3xl

- **Wine order statistics** — mode switcher (Bookings / Wine Orders pill toggle) on Statistics page; `WineStatistics.tsx` new component; 4 summary cards (total orders, total revenue, active orders, avg order value); year/month filter; status breakdown bars (5 statuses with matching colors from wine orders page); revenue by month/day chart; top wines by bottles ordered (bar chart aggregated from JSON); top customers by spend; all data fetched server-side in `statistics/page.tsx` using same displayTotal fallback logic as wine-orders page.

### Key files changed (wine order stats — 2026-05-29)
- `saas/app/admin/statistics/page.tsx` — added `db.wineOrder.findMany` + `db.wine.findMany`; wineOrders array with displayTotal computed server-side; passed as `wineOrders` prop
- `saas/app/admin/statistics/StatisticsClient.tsx` — added `mode` state (`bookings` | `wine`); pill switcher UI; renders `<WineStatistics>` when wine mode active; `wineOrders` prop added
- `saas/app/admin/statistics/WineStatistics.tsx` — NEW: full wine stats client component

### Next up
- **Fix date filters** on admin orders (KnownBugs #1) — date range filter doesn't work
- **Verify nikalasmarani.ge in Resend** — until done, invoice emails only deliver to max.mghvdliashvili@gmail.com, not real customers
- **Gallery page** — images already in `public/images/`, need to wire into public site
- **Send invoice by email — PDF attachment** — follow-up to HTML email; attach a PDF so customers get a proper document

---

## 2026-05-28 — Session 1 (compressed)

Settings text English; calendar view + hover preview; export CSV; configurable min guests; block dates; shimmer loading; smooth scroll; status filter + counts; progress bar on filter change.

---

## 2026-05-27 — Previous session (compressed)

Print invoice fixes (blank page, Georgian typos, payment section, 2-page bug); Vercel CLI set up; Supabase RLS on all 10 tables; Enhanced company booking Steps 4–6 (order detail page, admin create order, public form toggle with split counts/hot dishes/masterclass/live price breakdown).

---

## 2026-05-26 — Split pricing, Wine CRUD, company ID code, payment settings, print invoice

---

## Older sessions (compressed)

- 2026-05-22 — Statistics V2, logo rollout, 11 winery images downloaded, wine image assignment, email confirmation (Resend sandbox), admin mobile responsiveness, error states
- 2026-05-19 — Built public site (About, Contact, Wines catalogue), SiteNav, hamburger menu, WineOrder DB model, admin Wine Orders tab, brand assets (SVG logo, icons), deployed to Vercel
- 2026-05-18 — Order edit/delete slide-over, filter fixes (individuals only, upcoming), dedup script, preview server setup
- 2026-05-17 — Orders list, companies CRUD, price tiers with validations, seed script, statistics page, nav fixes
- 2026-05-17 — Scaffolded saas app, Supabase connected, booking form built, admin auth
- 2026-05-16 — GitHub Pages live, repo restructured, React Flow dashboard, project kickoff, vault created
