---
tags: [todo, testing]
---

# My To-Do List

Things Max needs to test or do manually. Claude updates this after each session.

---

## 🚧 In Progress — Next to build

### #123–#126 — Domain migration, no-tenant state, neutral fallbacks, set password (Claude tested 2026-07-18 live, needs Max to test)

**Reminder first:** tell the Nikalas Marani family their site + admin login both moved to `nikalasmarani.vercel.app` (same credentials; old `georgian-saas.vercel.app` now shows the platform placeholder).

1. **#126 Set password (untested by any human):** `/super-admin/users` → "Set password" on a test account (e.g. Test Winery's admin, or create one) → type a new password (min 6 chars, shown in plain text so you can copy it) → "Password updated ✓" → log in with the new password to confirm it took
2. **#124 Check button:** `/super-admin/tenants` → Edit Nikalas Marani → click "Check" next to Domain → green ✓ "resolves to this tenant"; same for Test Winery
3. **#125 Neutral blank tenant:** open `testwinery.vercel.app` → should show "Test Winery" as text logo, blue-gradient hero (its brand color), generic copy, NO prices anywhere (package cards and booking form both), booking form says "Price will be confirmed after submission", no dead social icons
4. **#125 NM regression check:** open `nikalasmarani.vercel.app` (EN and KA) → everything identical to before: logo, photos, Kakheti texts, 50₾/100₾ prices, contact info — plus the EN Contact page now shows phone/email/address (they were blank before, bonus fix)
5. **#123 Platform HQ:** `georgian-saas.vercel.app` → placeholder pitch page; `/super-admin` there → login → lands in the platform panel
6. Optional: submit a test booking on `testwinery.vercel.app` → order should save with 0₾ total (no invented price) and appear in its admin

### #121 + #122 — Super admin login default + cross-tenant Orders view (Claude tested 2026-07-17 in browser, needs Max to test)
1. Log out, log back in as super_admin (or visit `/admin/login` while already logged in) → should land on `/super-admin/tenants` directly, not `/admin`
2. Confirm "← Tenant Admin" (in super-admin nav) and "⬡ Platform" (in admin nav) still both work to switch views manually
3. Go to `/super-admin/orders` → "Bookings" tab should default to "Upcoming only" checked, showing only future bookings
4. Uncheck "Upcoming only" → all 60 Nikalas Marani bookings appear
5. Click "Wine Orders" tab → all 9 wine orders appear with Pending/Confirmed/Paid/Delivered/Cancelled status labels (different from booking statuses)
6. Try the tenant dropdown and status pills on both tabs — list should filter correctly
7. Click any "Open ↗" link → should open the real tenant's own admin page in a new tab (order detail for bookings, wine orders list for wine orders) — not a broken link

### #120 — Per-tenant module toggles (Claude tested 2026-07-17 in browser, needs Max to test)
1. Go to `/super-admin/tenants` → Edit → Test Winery → "Modules" section shows 3 checkboxes (Bookings / Wine Orders / Public website) — Bookings and Public website checked by default, Wine Orders unchecked
2. Check "Wine Orders" → Save → reload the page → confirm it's still checked (persistence)
3. Uncheck "Public website" → an amber note appears explaining the domain will show "coming soon" — **do NOT actually save this on Nikalas Marani**, only test on Test Winery or briefly on Nikalas Marani yourself if you want to see the live redirect (it takes the real public site offline while it's off)
4. On `nikalasmarani.ge` admin: confirm Wines, Wine Orders, Orders, Menu Items, Masterclass all still show in the nav as normal (all modules are on for the real tenant — this should be completely unchanged from before)
5. `/admin/statistics` and `/admin/companies` still show the Bookings/Wine Orders tab switchers (both modules on for Nikalas Marani)
6. If you want to see the "coming soon" page and public-site kill switch working live: toggle "Public website" off for Nikalas Marani for a few seconds, check `nikalasmarani.ge` shows the coming-soon message with the winery logo, then turn it back on immediately
7. Visit `/coming-soon` directly any time — should show "Nikalas Marani — Our site is coming soon" with the logo, regardless of the toggle state

### #119 — Super-admin panel quick wins (Claude tested 2026-07-17 in browser, needs Max to test)
1. Go to `/super-admin/tenants` → each card shows a "wine orders" stat and an "Open ↗" link next to the domain that opens the live site in a new tab
2. Click Edit on a tenant → Tenant ID field appears at top with a Copy button → click it → button flashes "Copied ✓" for ~2s → paste somewhere to confirm the ID copied
3. Try creating a new tenant with a domain or slug that's already taken → should show a friendly error ("That domain is already used by another tenant...") instead of a raw DB error
4. Go to `/super-admin/users` → click "Remove access" on a non-you user → confirm row appears ("Remove access? Yes, remove / Cancel") before anything happens
5. **Important — the actual bug fix to verify**: on Users page, change a tenant admin to "Super admin" (or vice versa), save, then reload the page → the OLD role badge should be gone, not still showing alongside the new one. Before this fix, Supabase's metadata merge meant old roles never actually cleared.

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

### #116 — Wine hierarchy (Claude tested 2026-07-17, needs Max to test — especially admin, which Claude couldn't log into)
**First: set the real wine types!** Migration defaulted every wine to RED / DRY / year 2026 — fix each one in admin.
1. Go to `/admin/wines` → each wine row shows badges (RED, DRY) + "1 vintage" → click a row to expand
2. Expanded row shows the vintage sub-list (2026 · old price) → click Edit on the product → set the real type (e.g. Rkatsiteli Amber → AMBER), sweetness, sparkling, alcohol % → Save
3. Vintage: Edit → change year to the real year → Save; try "+ Add vintage" with a second year + different price
4. Vintage image override: edit a vintage → pick a photo → "override image" tag appears on the vintage row → public card for that vintage shows the override photo
5. Delete a vintage → wine disappears from public catalogue if it has no other active vintage (admin row stays)
6. Go to `/wines` → each vintage is its own card with a year badge; meta line shows "Red Dry", "Sparkling", alcohol %
7. Filter pills: Type + Style rows → combinations filter correctly; "All" resets each row
8. Order 2 different vintages → drawer shows "Name YEAR ×qty" lines → submit → success
9. `/admin/wine-orders` → new order shows items as "Wine Name · 2026 × 3 bottles"; old (pre-migration) orders still display their wines
10. Pack mode → summary groups bottles by wine + year; print sheet looks right
11. `/admin/statistics` → wine charts still render (now read from line items)
12. Note: a test order "TEST — Feature 116 verification" (pending, 18₾) exists from Claude's verification — cancel it or ignore it

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
- [ ] **Multi-tenant auto emailing** — decided 2026-07-17: shared platform sending domain (default) + per-tenant custom domain later as opt-in; tenant-supplied SMTP/API credentials explicitly rejected. **Blocked: Max doesn't own a domain yet for the shared platform sender.** Full analysis + rough build steps in [[Plan-MultiTenantEmail]].
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
