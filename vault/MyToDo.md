---
tags: [todo, testing]
---

# My To-Do List

Things Max needs to test or do manually. Claude updates this after each session.

---

## 📝 Draft ideas — needs review before building (2026-06-27)

> These are rough notes from Max — details still being figured out, don't build yet.

1. **Companies — tier editing** — couldn't see "Add tier" button when editing tiers. Verify it was a UI bug or just hidden (check before building anything).
2. **Booking page — hide company list** — add a setting to hide the company dropdown so clients can't see who else you work with. When toggled, show a code-entry box instead; entering the code auto-fills company info.
3. **Booking page — first-time company registration** — need a user-friendly way for new companies to fill in their profile (inc. company ID) during their first booking, without disrupting the existing flow. Still thinking about UX.
4. **Wine orders — custom wine pricing per company** — allow per-company price overrides for wines. Likely a section in the Companies page. Needs design.
5. **Wine orders — company code check on order form** — make sure the access code system works on the wine ordering page, same as booking page.
6. **Company code — ensure data is actually used** — data entered via the code popup (like Company ID) should flow through to the order. Company ID is not currently on the booking form — needs a plan.
7. **Booking page — guest price label** — replace "minimum 4 guests" with something like "price is for 4 or more guests" — probably with an icon.
8. **Wine orders admin — box stickers** — generate printable stickers to label each box (what wine is inside). Simple layout, one per box.
9. **Wine orders — invoice + email** — same invoice options as booking orders: print + email. Needs both printout and email delivery.
10. **Email planning reminder** — plan how emails will work since clients will use the sub-domain (not their own domain). Think through sender address, deliverability, reply-to setup.
11. **Site content not rendering** — check what's going on; content edits don't seem to be showing on the public site.

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

## 🔧 Planned — Pre-onboarding cleanup (before adding new tenants)

- [ ] **Neutral fallback defaults** *(in progress 2026-07-01)* — replace all NM-specific hardcoded fallbacks (`'Nikalas Marani'`, NM email/phone/social URLs) with neutral strings (`'Your Winery'`, `''`, etc.) across: SiteNav, layout.tsx, InvoicePrint, WineCatalogueClient, email templates, and any other component. Email templates now also fetch winery name + contact info from the DB so they are fully tenant-aware. New tenants should never see NM branding if their settings are empty.
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
- [ ] Security fixes **#5, #6, #7** from Plan-SecurityAndBugFixes.md (minor, no security risk)
- [ ] **Phase 6 testing** — log in with `max.mghvdliashvili@gmail.com` → confirm admin works; log in with `nikalasmarani@email.ge` → confirm it works on nikalasmarani.ge

---

## ✅ Recently confirmed working (no re-test needed)

- v1.6 Image upload, compression, tenant isolation — ✅ Claude tested
- v1.5 Page backgrounds — ✅ Max tested
- Multi-tenant Sprint 1–3A — ✅ Claude tested (TypeScript + DB push confirmed)
