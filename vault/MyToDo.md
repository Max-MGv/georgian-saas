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

## 🔧 Still outstanding (from previous sessions)

- [ ] Run `setup-rls.ts` against Supabase to create `app_user` role + RLS policies (Sprint 3A — script is ready, just needs to be run)
- [ ] Verify **nikalasmarani.ge** in Resend — unlocks email delivery to any customer (currently only delivers to max.mghvdliashvili@gmail.com)
- [ ] **Gallery page** — images already in `saas/public/images/slider/` and `gallery/` — just needs wiring into the public site
- [ ] **Order detail tap target audit** (v1.4 Mobile Admin last item) — verify all buttons ≥ 44px, no horizontal overflow on phone
- [ ] **PDF invoice email attachment** — send PDF alongside HTML invoice email (follow-up to the HTML-only email feature)
- [ ] Security fixes **#5, #6, #7** from Plan-SecurityAndBugFixes.md (minor, no security risk)
- [ ] **Sprint 4** — per-tenant admin auth (Supabase user tied to `tenantId`)

---

## ✅ Recently confirmed working (no re-test needed)

- v1.6 Image upload, compression, tenant isolation — ✅ Claude tested
- v1.5 Page backgrounds — ✅ Max tested
- Multi-tenant Sprint 1–3A — ✅ Claude tested (TypeScript + DB push confirmed)
