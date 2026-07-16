---
tags: [todo, testing]
---

# My To-Do List

Things Max needs to test or do manually. Claude updates this after each session.

---

## 🚧 In Progress — Next to build

### #118 — Wine catalogue UX (Claude tested 2026-07-16, needs Max to test on real device)
1. Go to `/wines` → grid shows only `+` per card (no steppers at rest)
2. Click `+` on Saperavi → stepper `− 1 +` appears; click into number → type `12` → replaces cleanly (no leading zero)
3. Sticky bar appears at bottom: bottle count, wine names, total
4. Hover over the qty number → confirm NO up/down spinner arrows
5. Click "Place Reservation →" → drawer slides in from right; catalogue visible behind
6. Drawer top panel shows order summary (line items + total + discount hint text in italic)
7. Select "Wine Test Company" in dropdown → code popup appears ON TOP of drawer (not behind it)
8. Enter Q8VBA6QY → contact auto-fills
9. Fill address → "Place Reservation" → success screen shows INSIDE drawer
10. "Place another order" → drawer closes, catalogue resets to zero

### #115 — Company wine % discount (Claude tested 2026-07-16, needs Max to test on real device)
1. Go to `/admin/companies` → Wine Orders tab → click Edit on Wine Test Company
2. "Wine discount" section appears in slide-over (below Modules checkboxes) → enter `10` → Save
3. Go to `/wines` → add wines to cart → click "Place Reservation →"
4. In drawer: select "Wine Test Company" → code popup appears → enter Q8VBA6QY
5. Drawer order summary should update: ~~original~~ · **−10%** badge · discounted total (wine red)
6. Hint text (*"Company discounts…"*) should be gone (hidden when discount is active)
7. Fill in remaining form fields → Place Reservation → verify success
8. Go to `/admin/wine-orders` → new order card should show `−10%` green badge next to the amount
9. Switch to Table view → same `−10%` badge visible
10. Edit Wine Test Company → set discount to blank → save → repeat order flow → hint text returns, no badge

### #116 — Wine hierarchy: WineProduct + WineVintage schema (Feature #12 from drafts)
- **Two-level DB schema:**
  - `Wine` (parent product): `id, tenantId, name, key String (auto-slug from name e.g. "rkatsiteli"), sortOrder, createdAt` — removes `price, color, imagePath, description` (those move to vintage)
  - `WineVintage` (child): `id, wineId, tenantId, year Int?, color String? (red/white/orange/rosé), dryness String? (dry/semi-dry/semi-sweet/sweet), alcoholPercent Float?, price Float, imagePath String?, active Boolean @default(true), sortOrder Int, description String?`
- **Migration script needed:** converts existing flat Wine rows → Wine parent + one WineVintage child each
- **Admin:** expand wine product to see/add vintages; edit vintage opens inline fields for year, color, dryness, alcohol%, price, image, active
- **Public catalogue:** wine card shows product; if multiple vintages, selector per vintage; order items reference `vintageId`
- **Scope:** touches schema, admin wines page, public wines page, `submitWineOrder`, wine orders admin display, statistics
- **Do last** — biggest refactor on this list
- **Files:** `saas/prisma/schema.prisma`, migration script, `saas/app/admin/(panel)/wines/`, `saas/app/(site)/wines/`, `saas/app/actions/submitWineOrder.ts`, `saas/app/admin/(panel)/wine-orders/`

---

## 📝 Draft ideas — still needs design (trimmed 2026-07-01)

> These are rough notes from Max — details still being figured out, don't build yet.

1. **Companies — tier editing** — couldn't see "Add tier" button when editing tiers. Verify it was a UI bug or just hidden (check before building anything).
2. **Company code — ensure data is actually used** — data entered via the code popup (like Company ID) should flow through to the order. Company ID is not currently on the booking form — needs a plan.
3. **Wine orders admin — box stickers** — generate printable stickers to label each box (what wine is inside). Simple layout, one per box.
4. **Wine orders — invoice + email** — same invoice options as booking orders: print + email. Needs both printout and email delivery.
5. **Email planning reminder** — plan how emails will work since clients will use the sub-domain (not their own domain). Think through sender address, deliverability, reply-to setup.

---

## ✅ Confirmed working — Features #115, #117, #118 (2026-07-16, Claude tested)

**#117 — Company module system** — Bookings/Wine Orders tab toggle in admin; module flags on Company; companyId FK on WineOrder; public pages filter by module. Wine Test Company (code Q8VBA6QY) created as test data. End-to-end order flow verified.

**#115 — Company wine % discount** — `wineDiscountPercent` on Company; discount field in EditPanel; `verifyCompanyCode`/`findCompanyByCode` return discount; `submitWineOrder` applies discount; drawer shows struck-through total + `−X%` badge; admin order cards + table show badge. Claude tested.

**#118 — Wine catalogue UX** — Drawer checkout; sticky bar; `+` only at zero stepper; no spinner arrows; discount hint; z-index fix for popups. Claude tested all flows including code popup layering over drawer.

---

## 🧪 Needs testing — Features #112, #113, #114 (2026-07-01)

### #112 — Guest price label
1. Go to home page → scroll to the two package cards
2. The "minimum X guests" text should now be: **person silhouette icon** + "X ან მეტი სტუმარი" (Georgian) or "X or more guests" (English)

### #113/#114 — Hide company dropdown + New Company request
**First: test with setting OFF (default behavior unchanged)**
1. Go to `/admin/settings` → Booking section → confirm "Hide company dropdown" toggle is OFF
2. Go to home page → select Tour Company → verify company **dropdown still appears**
3. Select a company with a code → verify code **popup still works** (old behavior unchanged)

**Then: turn ON and test new behavior**
4. Turn ON "Hide company dropdown" in Settings
5. Home page → select Tour Company → verify **dropdown is gone**, code input appears instead
6. Click "New Company? →" → verify popup opens with 4 fields → fill Company Name + Your Name + Phone → click "Send Request" → verify "Request received!" appears → close
7. In code input: type a wrong code → click Confirm → verify "Code not recognised." appears
8. Type a valid company code → click Confirm → verify green chip with company name appears + all form fields (Name, Phone, etc.) auto-fill
9. Click × on the chip → verify chip disappears, code input returns, profile fields clear
10. Select Tour Company but don't enter a code → click "Request Booking" → verify error "Please enter and confirm your company code."
11. Go to `/wines` → verify steps 5–10 work the same way in the wine order form
12. Turn OFF setting again → verify dropdown returns on both forms

---

## 🧪 Needs testing — Wine Orders overhaul (2026-06-27)

1. **Table view** — switch to Table → filter by status + search by company name → verify rows update
2. **Pack mode — pre-selection** — switch to Pack → verify confirmed+paid orders are pre-checked, others unchecked
3. **Pack mode — include/exclude** — uncheck one order → verify summary totals update immediately
4. **Box size** — change from 6 to 12 → verify box counts recalculate (full boxes + partial)
5. **Print** — click Print button in any layout → verify packing sheet opens → print dialog appears → sheet shows correct wine totals + per-company breakdown
6. **Layout A** — switch to layout A in Pack mode → verify split panel (table left, summary right, sticky)
7. **Layout C** — switch to layout C → verify top collapsible → click ▼ to expand → confirm summary shows
8. **Inline confirm** — click any stepper step (in Cards or Table view) → verify "→ X?" row appears → click ✓ → verify status changes → also test auto-dismiss (wait 5 seconds without clicking)

---

## 🧪 Needs testing — v1.7 Company Access Codes

1. **Set a code on a company**
   - Go to `/admin/companies`
   - Click **Edit** on any company (e.g. Test Company #1)
   - Slide-over should open with all profile fields + Access code section
   - Set: Contact name, phone, email, address
   - Set a memorable code like `MARANI42` (or click "Generate new code")
   - Click **Copy** to copy the code
   - Click **Save changes**

2. **Test the booking form popup**
   - Go to the public site home page
   - Click **Tour Company** booking type
   - Select the company you just set a code for
   - A popup should appear asking for the code
   - Enter the **wrong** code → should see error message
   - Enter the **correct** code → popup closes, name/phone/email should auto-fill
   - Confirm the fields are still editable

3. **Test "Remember this device"**
   - With the checkbox checked, submit the code
   - Refresh the page, select the same company again
   - Popup should NOT appear (remembered for 30 days)

4. **Test the wine orders page**
   - Go to `/wines`
   - Scroll down to the reservation form
   - The "Ordering as a company?" dropdown should appear at the top
   - Select the same company → popup appears → enter code → fields auto-fill

5. **Test the escape link**
   - On the booking form, select a company with a code
   - In the popup, click **"I'm not a company rep — book as individual"**
   - Popup should close and booking type should switch back to Individual

---

## 🧪 Needs testing — Dynamic Branding

1. ~~**Seed Nikalas Marani branding**~~ — ✅ Claude ran `seed-branding.ts`
2. **Super-admin logo upload** — go to `/super-admin/tenants` → edit Nikalas Marani → verify Display Name, Logo, Favicon fields appear; try uploading a logo
3. **Client settings branding** — go to `/admin/settings` → scroll to **Branding** section (above Closed Days) → verify it shows Upload logo + Upload favicon buttons → upload a file → verify preview appears and "✓ Saved" flashes → reload page → verify it persists
4. **Cache TTL** — after uploading a logo, wait up to 5 min and reload the public site → logo should update
5. **Wines page title** — go to `/wines` → check the browser tab title reads "Order Wine — Nikalas Marani" (not hardcoded, reads from DB via header)
6. **Wines page logo** — on the `/wines` page, the logo image in the page heading (above the wine grid) should match whatever logo is set in branding — not the hardcoded fallback
7. **Invoice display name** — go to `/admin/orders` → click the print icon on any order → verify the printed invoice shows "Nikalas Marani" (coming from the DB, not hardcoded); same on the order detail page print

> **What is a favicon?** The tiny icon shown in your browser tab next to the page title. Upload a small PNG (32×32px) of the NM logo and it'll appear in tabs, bookmarks, and phone shortcuts.

---

## 🧪 Needs testing — Contact Info settings

**Contact Info** section is live in `/admin/settings`, seeded with NM defaults (✅ seed-contact.ts already run), and wired to the public site.

1. Go to `/admin/settings` → scroll to **Contact Info** (collapsible section between Branding and Closed Days) → click the section header to expand
2. Each field shows its current value (or faded italic placeholder if empty) — click the **red pencil icon** to edit
3. Change a value → click the **red return arrow (↵)** to save → should see green **"Saved"** text appear briefly below the field
4. Press **Escape** while editing → should cancel without saving (value returns to what it was)
5. Reload the **public site home page** → footer should show your address · phone · email
6. Check the nav bar → phone/email/Facebook/Instagram icons should link to your values
7. Click the Facebook icon → should go to your page (not the hardcoded NM fallback)

> **Note:** Fields fall back to Nikalas Marani defaults if left blank — nothing breaks if you leave some empty.

---

## 🧪 Needs testing — Settings edit/save UX (pencil/save pattern)

Same inline edit UX applied to Payment Details, Alt text, and Booking Rules — test that the pattern works consistently.

1. Go to `/admin/settings` → **Payment Details** section → click pencil on any row (e.g. Recipient Name) → edit → click return arrow → "Saved" should appear
2. **Branding** section → click pencil next to the Logo Alt text field → edit → return arrow → "Saved"
3. **Booking Rules** section → click pencil on "Wine Tasting minimum" → change value → return arrow → "Saved"

---

## 🔍 Explore — Needs research + brainstorm before building

- [ ] **Dev/prod environments** — explore options for separating development from production. We have one Vercel deployment + one Supabase project right now. Brainstormed options below:

  **Option A — Separate Supabase project for dev (recommended base)**
  Create a free second Supabase project (`georgian-saas-dev`). Local `.env` points at dev DB; Vercel production env vars point at live DB. Schema migrations (`prisma db push`) run against dev first, then prod.
  - ✅ Completely isolated — seed scripts, test tenants, broken migrations can't touch NM
  - ✅ Free (Supabase free tier = 2 projects)
  - ⚠️ Two schemas to keep in sync manually (run `db push` twice per migration)

  **Option B — Vercel Preview Deployments + staging DB (pairs with A)**
  Every git branch pushed gets a Vercel preview URL automatically (e.g. `georgian-saas-git-feature-x.vercel.app`). Vercel scopes env vars by environment: Production / Preview / Development — preview deployments point at dev Supabase, production at live.
  - ✅ Every branch testable at a real URL before merging to master
  - ✅ Good for showing a client a feature before going live
  - ✅ Free on Vercel hobby plan
  - ⚠️ Needs Option A to be safe

  **Option C — Local dev only, prod DB read-only (not recommended)**
  No second Supabase. Discipline only.
  - ❌ One bad script wipes NM live data. Not viable with 2+ tenants.

  **Recommendation: A + B together.** Setup cost ~30 min:
  1. Create free Supabase project `georgian-saas-dev`
  2. Run `prisma db push` against it to clone schema
  3. Add `DEV_DATABASE_URL` + `DEV_DIRECT_URL` to local `.env`
  4. In Vercel: set DATABASE_URL for Production = live Supabase, Preview = dev Supabase
  5. Done — local + preview branches hit dev DB, master pushes hit prod

- [ ] **Data migration tool / service** — clients will have existing data in Excel/CSV/other formats (bookings history, company lists, price tiers, wine catalogue). Need to decide: use an existing ETL framework (e.g. Airbyte, Papa Parse + custom scripts, Google Sheets API) vs. build a lightweight in-app import UI. Scope to explore: one-time admin import (CSV upload → map columns → preview → confirm), handling duplicates, what tables are in scope (companies, wines, historical orders), and whether this is a paid onboarding service or self-serve.

---

## 🔧 Planned — Pre-onboarding cleanup (before adding new tenants)

- [x] **Neutral fallback defaults** ✅ — rendering components already clean. Admin login page now uses platform logo (`x-platform-logo`) with no NM fallback. `PlatformConfig` DB table added; super-admin Settings page lets you upload the login page logo. New tenants with no logo set see neutral "Admin Panel" text only.
- [ ] **Multi-tenant auto emailing** — each tenant needs its own sender address (e.g. `bookings@theirwinery.ge`) or at minimum a branded reply-to. Covers: per-tenant `from` address in Resend, booking confirmation email, invoice email, and any future automated emails. Requires domain verification per tenant in Resend. Depends on NM domain migration being settled first.
- [ ] **NM domain migration** — Nikalas Marani will eventually move to its own standalone deployment; the current multi-tenant SaaS becomes the platform for all other clients. Plan the migration before onboarding a second tenant.

---

## 🔧 Still outstanding (from previous sessions)

- [x] **Redo visual content editor** — iframe approach implemented 2026-06-22 ✅

- [x] Run `setup-rls.ts` against Supabase — confirmed deployed, all 12 tables have tenant_isolation policies ✅
- [x] **Update Vercel `DATABASE_URL`** to port 6543 + `?pgbouncer=true` — ✅ confirmed updated 7 hours ago in Vercel dashboard
- [ ] Verify **nikalasmarani.ge** in Resend — unlocks email delivery to any customer (currently only delivers to max.mghvdliashvili@gmail.com)
- [ ] **Gallery page** — images already in `saas/public/images/slider/` and `gallery/` — just needs wiring into the public site
- [ ] **Order detail tap target audit** (v1.4 Mobile Admin last item) — verify all buttons ≥ 44px, no horizontal overflow on phone
- [ ] **PDF invoice email attachment** — send PDF alongside HTML invoice email (follow-up to the HTML-only email feature)
- [x] Security fixes **#5, #6, #7** — all already resolved (verified 2026-07-01)
- [ ] **Phase 6 testing** — log in with `max.mghvdliashvili@gmail.com` → confirm admin works; log in with `nikalasmarani@email.ge` → confirm it works on nikalasmarani.ge

---

## ✅ Recently confirmed working (no re-test needed)

- v1.6 Image upload, compression, tenant isolation — ✅ Claude tested
- v1.5 Page backgrounds — ✅ Max tested
- Multi-tenant Sprint 1–3A — ✅ Claude tested (TypeScript + DB push confirmed)
