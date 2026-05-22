---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-05-22 — Latest session (full detail, continued)

### Completed
- **KnownBugs.md** created in vault — tracks open/resolved bugs with status column; first entry: date filters broken on admin orders panel
- **Admin mobile responsiveness** — nav restructured to two-row layout (brand+logout top, scrollable links bottom); orders table wrapped in `overflow-x-auto` with `min-w-[700px]`; edit slide-over changed from fixed 400px to `w-full sm:w-[400px]`
- **Error states & loading indicators** — `saas/app/admin/loading.tsx` skeleton added for server-side page transitions; CompaniesClient buttons now show "Saving…" / "Deleting…" and Cancel disabled during async ops
- **FeatureLog.md** created in vault — tracks every feature with Status / Claude tested / User tested columns (20 entries backfilled)
- **iOS Safari zoom fix** — `input, select, textarea { font-size: 16px }` added to `globals.css`; pushed to Vercel
- **Confirm dialogs** — discovered already done in a prior session (inline Yes/No in orders, companies, price tiers); roadmap updated

### Instructions added
- Feature tracking rule: after every feature, update `vault/FeatureLog.md`
- Handoff files: move from Claude memory to vault (this file)

### Also completed (continuation)
- **Email confirmation** — Resend installed, `lib/emails/bookingConfirmation.ts` sends branded HTML email on booking; fires after DB save (fire-and-forget, never blocks booking); sandbox mode confirmed working (email received by Max); full delivery to any customer requires verifying nikalasmarani.ge domain in Resend
- **Guest count bug fixed** — was using `Number(e.target.value)` which snapped to 0 on backspace; now uses string state, converts on blur; clamps to min 4 with warning message
- **KnownBugs #3 added** — time slot picker allows past hours on today's date
- **Vault fully reorganised** — all Claude instructions, session log, feature log moved to vault; Claude memory files are now pointers only

### Pending user tests
- Order delete confirm (feature #5)
- Wine Orders admin tab (feature #15)
- Admin mobile responsiveness (feature #19)
- Error states & loading indicators (feature #20)

### Next up (priority order)
1. Fix time slot picker — block past hours on today's date (KnownBugs #3)
2. Fix date filters on admin orders (KnownBugs #1)
3. Verify nikalasmarani.ge domain in Resend → emails go to any customer
4. Georgian/English language toggle (v1.1)

---

## 2026-05-19 — Previous session (full detail)

- Built public site: About, Contact, Order Wine pages under `(site)` route group
- SiteNav.tsx: sticky header, logo, desktop nav + hamburger mobile menu, social icons (phone, email, Facebook, Instagram)
- Order Wine page (`/wines`): 6 wines, gradient placeholder cards, grid/list toggle, B2B reservation form
- WineOrder Prisma model added, `prisma db push` run, orders save to DB
- Admin wine orders tab (`/admin/wine-orders`) added
- Brand assets: `saas/public/icons/` — logo-dark.svg, phone.svg, envelope.svg
- Mobile: hamburger menu, grid columns fixed for small screens, overflow-x-auto on list table
- Fixed Prisma DLL locked on Windows: stop preview before `prisma generate`
- Deployed to Vercel: georgian-saas-mg-productions-projects.vercel.app

---

## Older sessions (compressed)

- 2026-05-18 — Order edit/delete slide-over, filter fixes (individuals only, upcoming), dedup script, preview server setup, credentials saved to credentials.txt
- 2026-05-17 — Orders list, companies CRUD, price tiers with validations, seed script, statistics page, nav fixes
- 2026-05-17 — Scaffolded saas app, Supabase connected, booking form built, admin auth, dashboard Architecture tab
- 2026-05-16 — GitHub Pages live, repo restructured, React Flow dashboard built
- 2026-05-16 — Project kickoff, Obsidian vault created, tech stack decided, per-client architecture chosen
