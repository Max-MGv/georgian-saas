---
tags: [todo, testing]
---

# My To-Do List

Things Max needs to test or do manually. Claude updates this after each session.

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

## 🔧 Still outstanding (from previous sessions)

- [x] **Redo visual content editor** — iframe approach implemented 2026-06-22 ✅

- [x] Run `setup-rls.ts` against Supabase — confirmed deployed, all 12 tables have tenant_isolation policies ✅
- [x] **Update Vercel `DATABASE_URL`** to port 6543 + `?pgbouncer=true` — ✅ confirmed updated 7 hours ago in Vercel dashboard
- [ ] Verify **nikalasmarani.ge** in Resend — unlocks email delivery to any customer (currently only delivers to max.mghvdliashvili@gmail.com)
- [ ] **Gallery page** — images already in `saas/public/images/slider/` and `gallery/` — just needs wiring into the public site
- [ ] **Order detail tap target audit** (v1.4 Mobile Admin last item) — verify all buttons ≥ 44px, no horizontal overflow on phone
- [ ] **PDF invoice email attachment** — send PDF alongside HTML invoice email (follow-up to the HTML-only email feature)
- [ ] Security fixes **#5, #6, #7** from Plan-SecurityAndBugFixes.md (minor, no security risk)
- [ ] **Phase 6 testing** — log in with `max.mghvdliashvili@gmail.com` → confirm admin works; log in with `nikalasmarani@email.ge` → confirm it works on nikalasmarani.ge

---

## ✅ Recently confirmed working (no re-test needed)

- v1.6 Image upload, compression, tenant isolation — ✅ Claude tested
- v1.5 Page backgrounds — ✅ Max tested
- Multi-tenant Sprint 1–3A — ✅ Claude tested (TypeScript + DB push confirmed)
