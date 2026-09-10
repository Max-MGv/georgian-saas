---
tags: [plan, demo, vineworks, marketing]
---

# Plan — Demo Site Redesign (making `demo.vineworks.ge` actually sell)

> **This is the live task tracker.** Update the checkboxes and the Status line of each
> phase as work happens. If a session ends mid-phase, the "Resume point" line at the top
> of that phase says exactly where to pick up.

**Design rationale for all of this:** [[DemoDirections]] (and the published artifact —
link in [[DemoSite-README|README]]). **How the demo was originally built:** [[Plan-DemoSite]].
**Industry research behind the decisions:** [[Research-DemoPatterns]].

---

## Current status

| Phase | What | Status |
|---|---|---|
| **0** | Seed the demo with a trading winery + kill the setup banner | 🚧 In progress |
| **1** | Front door (framing interstitial + fix `/admin` dead end) | ⬜ Not started |
| **2** | Spotlight tour (replaces today's corner checklist) | ⬜ Not started |
| **3** | Feature rail (surface the invisible depth) | ⬜ Not started |
| **4** | Live mirror (flagship two-pane view) | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** Phase 0 — 0.1–0.4 are done and verified on **dev**. Next: 0.5,
ship to `staging`, get Max's go-ahead, merge to `master`, then run the seed script against
**prod** as its own separate step. Nothing has been written to the prod database yet.

---

## Ground rules for every phase

1. **Git workflow is non-negotiable** — read [[ClaudeInstructions]] Rule 0. Build locally →
   commit to `staging` → verify → get Max's explicit go-ahead → merge to `master`.
   `master` deploys to real customers (Nikalas Marani's live site), not just the demo.
2. **Local preview trick.** `localhost` resolves to whatever `DEFAULT_TENANT_ID` is set to
   in `saas/.env` (currently Staging Winery, `cmrxb85wo0000vlc0d964nzf8`). To preview the
   demo tenant locally, temporarily set it to the **dev** demo tenant
   `cmtvgl6e60000vl6w9se65t86`, then **revert it before committing**. See
   [[MaintenanceNotes]] §4.
3. **Two demo tenants exist** — dev `cmtvgl6e60000vl6w9se65t86`, prod
   `cmtvi582n0000vl7kjq44ir5p`. Code must never hardcode either; read
   `NEXT_PUBLIC_DEMO_TENANT_ID` via `saas/lib/demoTenant.ts`.
4. **The demo tenant is a real tenant in the real production database.** Scripts that
   write to it are production writes. Point them at dev first, always.
5. **Anything gated to the demo must be a no-op for every other tenant** — the pattern is
   already established in `DemoModeBanner.tsx` / `DemoChecklist.tsx` (`if (tenantId !==
   DEMO_TENANT_ID) return null`). Regression-check a real tenant before shipping.
6. **Update this file as you go.** Tick boxes, move the Status, rewrite the Resume point.

---

## Phase 0 — Seed the demo with a winery that's actually trading

**Status:** 🚧 In progress — built and verified on dev, not yet shipped
**Resume point:** 0.1–0.4 done. Next is **0.5** — push to `staging`, verify there, get
Max's go-ahead, merge to `master`, then run `npx tsx scripts/seed-demo-data.ts` against
the **prod** database as a separate deliberate step. **The prod demo tenant is still
empty** — only dev has been seeded. After that, 0.6 (scheduled regeneration).
**Why first:** every other phase still dead-ends on `No orders found` without this. It is
the highest-value, lowest-risk work in the whole plan.

### The problem being fixed
Captured live on 2026-09-10 from production:
- `/admin/orders` → **"No orders found"**, `0 bookings`
- `/admin/statistics` → **`0` upcoming orders, `0₾` future revenue**, "No data for this
  period" on both charts
- A **"Finish setting up your account"** banner sits on top of every admin page, telling
  prospects the product is half-built

### Tasks
- [x] **0.1 — Design the seed shape.** ✅ 2026-09-10 — numbers recorded below. Decide and write down (here) the target numbers
      before writing code: how many past vs. future bookings, over what date range, what
      the revenue curve looks like (a real summer peak — August is Kakheti's harvest
      season), how many tour companies on which price tiers, how many wine orders in each
      status (pending / confirmed / paid / delivered). Aim for roughly **18 months of
      history**. Use plausible Georgian names and real wines already in the catalogue
      (Rkatsiteli, Rkatsiteli Amber, Saperavi).
- [x] **0.2 — Write `saas/scripts/seed-demo-data.ts`.** ✅ 2026-09-10 Must be **idempotent** (safe to
      re-run — clears its own previously-seeded rows first, never touches other tenants),
      look the tenant up **by slug** (`vineworks-demo`) not by hardcoded ID, and refuse to
      run against a non-demo tenant. Model it on the existing
      `scripts/clone-nm-to-demo.ts` and `scripts/rebrand-demo-tenant.ts`, which already
      follow this shape. Also see `vault/Seeding/` for prior seeding conventions.
- [x] **0.3 — Run against dev + verify.** ✅ 2026-09-10 — results below. Orders list populated, Statistics charts drawing
      a real curve, wine orders spread across statuses, packing view showing real box
      counts. Screenshot for Max.
- [x] **0.4 — Suppress the setup banner for the demo tenant.** ✅ 2026-09-10 — gated in
      `saas/app/admin/(panel)/layout.tsx`; regression-checked against Staging Winery,
      which still shows its banner. `OnboardingBanner` and
      `FinishDetailsBanner` are rendered in `saas/app/admin/(panel)/layout.tsx`. Gate both
      on `tenantId !== DEMO_TENANT_ID`. (Alternative: actually complete the onboarding
      steps for the demo tenant so the banner retires naturally — decide which, note the
      choice here.)
- [ ] **0.5 — Ship.** 🚧 Pushed to `staging` 2026-09-10 as commit `95ffe91`; awaiting
      Max's go-ahead to merge to `master`, then the prod seed run.
      **Know what staging can and cannot prove here:** the staging preview URL resolves
      tenants through its own `DEFAULT_TENANT_ID`, which is Staging Winery — so the
      preview **cannot display the demo tenant at all**. What staging verifies is that
      the build compiles and that a real tenant is unaffected (its banner still shows).
      The demo side was verified locally against the dev DB, which is the same database
      the staging preview reads. `demo.vineworks.ge` only changes after the `master`
      merge **and** the separate prod seed run.
      Original task text: `staging` → verify → Max's go-ahead → `master`. Then run the seed
      script against **prod** as its own deliberate, separate step.
- [ ] **0.6 — Schedule regeneration.** Wire the same script to run on a schedule so
      visitor tinkering doesn't degrade it. **This is the same machinery as the "nightly
      reset" item** carried over from [[Plan-DemoSite]] — they are one job, not two.

### Notes / decisions

#### 0.1 — Seed shape (decided 2026-09-10)

**Reference date for everything below: 2026-09-10.** The script computes all dates
relative to "today" at run time, so it stays correct when re-run months later.

**What the surfaces actually read** (checked in code, not assumed):
- `statistics/page.tsx` builds its bar chart from **the last 6 months of `Order.date`**
  only — so the summer peak has to land inside Apr–Sep to be visible today.
- `StatisticsV2.tsx` top cards are **upcoming only** (`date >= today`): upcoming count,
  future revenue, next order. Without future-dated bookings these stay `0` even with
  years of history behind them.
- Top-companies panel shows the **top 5 by revenue** — so we need at least 5 booking
  companies with real volume.
- `orders/page.tsx` loads **every** order for the tenant (no pagination). ~400 rows is
  comfortable; this is why the range below is capped rather than open-ended.

**Bookings — 18 months back + 3.5 months forward (Mar 2025 → Dec 2026), ~400 orders.**
Monthly counts, shaped as a real Kakheti winery trades — August peak (harvest), January
trough:

| 2025 | Mar 8 · Apr 12 · May 18 · Jun 24 · Jul 30 · Aug 34 · Sep 28 · Oct 16 · Nov 8 · Dec 6 |
|---|---|
| **2026** | Jan 5 · Feb 6 · Mar 10 · Apr 15 · May 21 · Jun 27 · Jul 33 · **Aug 38** · Sep 30 |
| **ahead** | Oct 18 · Nov 9 · Dec 7 |

Year-on-year 2026 runs ~12% above 2025 — the chart should read as a business growing,
not a flat line. Annual revenue lands around **₾80–90k**, right for a boutique winery.

**Mix:** 70% `INDIVIDUAL` / 30% `COMPANY` · 55% `TASTING` / 45% `TASTING_LUNCH` ·
individuals 2–6 guests, companies 8–25. Prices come from the company's own `Price` tier
rows, never invented — so the numbers reconcile if anyone checks them against Companies.

**Booking statuses** (a real book looks different behind and ahead):
- **Past dates:** `COMPLETED` 85% · `PAID` 7% · `CANCELLED` 8%
- **Future dates:** `CONFIRMED` 40% · `NEW` 25% · `PAID` 20% · `INVOICE_SENT` 15%

Roughly a fifth of bookings carry masterclass lines and a hot-dish selection, so the
order-detail expansion isn't empty either.

**Companies — the junk has to go.** The demo tenant today carries `Test Company # 1`,
`Test Company # 2`, `Cookie Company`, `x` and `Wine Test Company`, plus gibberish menu
items. Seeding 18 months of trading against "Cookie Company" is still not a sellable
demo. The script replaces the booking/wine cast with named fictional operators:

- **Booking:** `Individuals` (kept — walk-ins) · Kakheti Wine Routes · Tbilisi Tour
  Collective · Caucasus Vine Travel · Alazani Valley Tours · Silk Road Journeys —
  each on a **different price tier ladder**, which is what makes the per-company pricing
  feature visible at all.
- **Wine (B2B):** Sighnaghi Wine Bar (10% off) · Restaurant Kakhuri (15%) ·
  Vinoteka Batumi (5%) · Marani Import, Berlin (20%).

**Wine orders — 45 over 12 months**, using wines already in the catalogue (Saperavi,
Rkatsiteli, Rkatsiteli Amber, Mtsvane, Kisi, Rosé) at their real vintage prices, 12–120
bottles per line. Statuses: `delivered` 45% · `paid` 20% · `confirmed` 15% ·
`pending` 15% · `cancelled` 5% — enough live rows for the packing view to show real box
counts.

**Idempotency:** the script **deletes every Order and WineOrder on the demo tenant and
rebuilds them**, rather than tracking which rows it made. There is no real customer data
on this tenant by definition, and wiping visitor tinkering is exactly what task 0.6
wants from the scheduled regeneration — one behaviour, not two. Guarded by a hard refusal
unless `tenant.slug === 'vineworks-demo'`.

#### 0.4 — Banner suppression: gate, don't complete

Decision: **gate both banners on `tenantId !== DEMO_TENANT_ID`** rather than completing
the onboarding steps for the demo tenant. `getFinishDetailsStatus` recomputes live on
every page load, so a visitor toggling any setting could bring the banner back — a
"completed" tenant is not a stable state on a sandbox strangers can edit. Two one-line
guards can't regress.

#### 0.2–0.4 — what was actually built (2026-09-10)

**`saas/scripts/seed-demo-data.ts`** — deterministic (fixed-seed PRNG, so two runs produce
identical data and screenshots stay valid), looks the tenant up by slug and refuses
anything else, `--dry-run` flag reports without writing, prints the masked DB host before
it touches anything. Its pricing math is a deliberate mirror of `lib/pricing.ts`
`recalcOrderTotal`, so every seeded total reconciles against that company's tier ladder.

**Verified on dev, 2026-09-10** (localhost temporarily pointed at the dev demo tenant,
`.env` reverted straight after):

| Surface | Before | After |
|---|---|---|
| `/admin/orders` | "No orders found", 0 bookings | **403 bookings** |
| Statistics — upcoming | `0` | **57 bookings ahead** |
| Statistics — future revenue | `0₾` | **30,998₾** |
| Statistics — next order | — | Fri, 11 Sep 2026 |
| Both charts | "No data for this period" | drawing; company chart ranks all 6 operators |
| Setup banner | "Finish setting up your account" | gone |
| Companies list | Test Company # 1, Cookie Company, x | 6 named operators + 4 B2B wine buyers |

Status spread came out: Completed 283 · Cancelled 41 · Paid 33 · Confirmed 26 · New 13 ·
Invoice Sent 7. Lifetime revenue ~243,800₾ over 21 months.

Revenue by month, last 6: Apr 7,363 · May 13,280 · Jun 16,623 · Jul 26,848 ·
**Aug 27,545** · Sep 18,521 — a clean rising curve peaking in August.

**One correction made during the build:** the first run produced a *noisy* revenue curve
in which August, the busiest month by booking count, showed **less** money than July —
because the company/individual mix was a flat 30% all year, so a month could fill up with
small individual bookings. Group business in Kakheti concentrates in season, so the mix is
now weighted (40% company Jun–Sep, 22% otherwise, still ~30% overall). That is what
produces the curve above.

**Regression check:** signed into Staging Winery (a real, non-demo tenant) on localhost —
`FinishDetailsBanner` still renders there ("5 companies still need full details"), so the
gate is genuinely a no-op for everyone but the demo.

**Still open in this phase:** the **prod** demo tenant has not been touched. 0.5 ships the
code and then runs the script against prod as its own separate step.

**Flagged for Max, not yet actioned:** `rebrand-demo-tenant.ts` scrubs the tenant row,
settings and site content but **never touched Companies**. The prod demo tenant was cloned
from Nikalas Marani's real production data, so it may currently be publishing his real B2B
customers' company names, contact people, phone numbers and emails on a public demo site.
Could not be confirmed — reading the prod DB was blocked in this session. Running the seed
script against prod fixes it as a side effect, since it replaces the whole cast.

---

## Phase 1 — The front door

**Status:** ⬜ Not started
**Resume point:** Not started — blocked on nothing, but lands better after Phase 0.
**Design reference:** [[DemoDirections]] → Direction 01.

An interstitial at the root of `demo.vineworks.ge` that says what Vineworks is and lets
the visitor choose a path, instead of dropping a stranger onto an unexplained winery site.

### Tasks
- [ ] **1.1 — Build the interstitial.** One screen. Product framing headline, one line of
      subcopy, three path cards, a genuinely prominent "skip" link. Design in
      [[DemoDirections]].
- [ ] **1.2 — Wire the three paths.** (a) *I run a winery* → auto-signs in as the demo
      admin and lands on `/admin/orders` (reuse `DemoModeBanner.tsx`'s existing sign-in
      logic — don't rewrite it); (b) *Show me the guest view* → the public site;
      (c) *How fast is setup?* → `/admin/onboarding`.
- [ ] **1.3 — Don't show it twice.** `localStorage` flag, same pattern as
      `DemoChecklist.tsx`. A returning visitor goes straight to the site.
- [ ] **1.4 — Close the `/admin` dead end.** Today, opening `/admin` directly on the demo
      tenant (shared link, reload, expired session) shows a bare email + password form
      with no credentials and no way back. For the demo tenant only, the login page should
      either auto-sign-in or show a one-click "Enter the demo" button. Touches
      `saas/app/admin/login/LoginForm.tsx`.
- [ ] **1.5 — Verify + ship.** Include a regression check that a real tenant's `/admin`
      login is completely unchanged.

---

## Phase 2 — The spotlight tour

**Status:** ⬜ Not started
**Resume point:** Not started.
**Design reference:** [[DemoDirections]] → Direction 03.

Replaces the corner checklist shipped 2026-09-10 (`saas/components/DemoChecklist.tsx`,
[[FeatureLog]] #159) with a real guided walkthrough: dimmed backdrop, spotlight ring on the
actual element, tooltip explaining why it matters **in money**.

### Tasks
- [ ] **2.1 — Build the spotlight component.** Dim scrim, cutout ring positioned from the
      target element's `getBoundingClientRect()`, tooltip, progress indicator,
      next / back / always-visible skip. **Render the tooltip through a `document.body`
      portal** — see [[KnownBugs]] #7: popovers nested inside `overflow-hidden` ancestors
      get silently clipped, and this codebase has hit that bug twice.
- [ ] **2.2 — Write the steps (max 7).** Each step names a commercial benefit, not a UI
      action. Not *"See it land in Orders"* but *"A ₾600 booking that arrived at 23:40
      while you slept."* Draft the copy here before building.
- [ ] **2.3 — Replace `DemoChecklist.tsx`.** Keep its auto-detection logic (route-change
      tracking + the `vineworks-demo:booked` CustomEvent dispatched from
      `BookingForm.tsx` and `WineCatalogueClient.tsx`) — that part works and is tested.
      Replace the presentation only.
- [ ] **2.4 — Mobile.** A dimmed spotlight on a 375px screen needs different tooltip
      placement. Check Georgian too — [[KnownBugs]] #8 and #18 are both "Georgian text is
      longer and broke the layout" bugs.
- [ ] **2.5 — Verify + ship.**

### Draft step copy
_(write the 7 steps here before building)_

---

## Phase 3 — The feature rail

**Status:** ⬜ Not started
**Resume point:** Not started.
**Design reference:** [[DemoDirections]] → Direction 04.

A persistent, clickable menu of everything the platform does — because packing sheets,
per-company price tiers, masterclass add-ons, theme presets, card payments and the
Georgian/English layer are currently impossible for a visitor to discover.

### Tasks
- [ ] **3.1 — Decide placement.** The admin already has a full nav row; a second rail will
      compete with it. Options: collapsible rail, public-side only, or a slide-out. Decide
      and record here before building.
- [ ] **3.2 — Build the rail** with the capability list grouped (Guest-facing / Back office
      / Platform).
- [ ] **3.3 — Deep links + annotations.** Each item routes to the screen that proves it and
      pins a short callout to the relevant element.
- [ ] **3.4 — Verify + ship.**

**Note:** this same list is the feature list for the `vineworks.ge` marketing site when
that gets built — each row deep-linking into live proof. Build it with that reuse in mind.

---

## Phase 4 — The live mirror (flagship)

**Status:** ⬜ Not started
**Resume point:** Not started. **Do not start before Phases 0–2 are shipped.**
**Design reference:** [[DemoDirections]] → Direction 02.

Guest site and back office side by side in one view. Book on the left, watch it land on
the right. The one thing none of the researched competitors do, and the hero asset for the
marketing site.

### Tasks
- [ ] **4.1 — Decide the sync mechanism.** How does the right pane learn a booking landed?
      Options: `router.refresh()` on the admin pane triggered by the existing
      `vineworks-demo:booked` event; short polling; or server-sent events. Cheapest that
      works wins — record the decision here.
- [ ] **4.2 — Build the two-pane route** (e.g. `/live`). Both panes are the real
      components, not mockups.
- [ ] **4.3 — The landing moment.** New row highlighted, "just now" pill, brief animation.
      Respect `prefers-reduced-motion`.
- [ ] **4.4 — Mobile fallback.** Two panes can't fit at 375px — stack them and auto-scroll
      to the admin pane after a booking submits.
- [ ] **4.5 — Verify + ship**, then capture the hero screenshot/GIF for `vineworks.ge`.

---

## Carried over from [[Plan-DemoSite]] — still open, not yet scheduled

- [ ] **Abuse guardrails** — rate-limit public-write actions (bookings, wine orders) on the
      demo tenant, and suppress real outbound emails from it so demo traffic doesn't hit
      the Resend quota or mail strangers. **Required before sharing the link widely.**
      Related: [[KnownBugs]] #19 (no rate limiting anywhere in the app).
- [ ] **Onboarding-wizard-as-demo** — letting a visitor genuinely run `/admin/onboarding`.
      Partially addressed by Phase 1's third path card. The bigger open question —
      disposable tenant per visitor vs. one shared sandbox — is still unresolved;
      [[Plan-DemoSite]] recommends starting with the shared sandbox.
- [ ] **Bug: wine-order address field** silently required for individuals with no error
      feedback ([[KnownBugs]]) — affects the real product, not just the demo.
- [ ] **Bug: Rkatsiteli mislabelled "RED DRY"** (it's a white grape) in the cloned
      catalogue — likely a real data-entry error on Nikalas Marani's live site too, worth
      checking there.
- [ ] **Wine bottle product photos** are still Nikalas Marani's real product shots.
      Deliberately deferred — Max can swap them via the Wines admin's image picker, no
      code needed.

---

## Reference — key facts you'll need

| Thing | Value |
|---|---|
| Live demo URL | `https://demo.vineworks.ge` |
| Demo tenant slug | `vineworks-demo` |
| Demo tenant ID (dev DB) | `cmtvgl6e60000vl6w9se65t86` |
| Demo tenant ID (prod DB) | `cmtvi582n0000vl7kjq44ir5p` |
| Env var driving the gate | `NEXT_PUBLIC_DEMO_TENANT_ID` (set per-environment in Vercel) |
| Demo admin login | `demo-admin@vineworks.ge` — password in `credentials.txt` (deliberately not a real secret; anonymous visitors are meant to land in it) |
| Local `DEFAULT_TENANT_ID` | `cmrxb85wo0000vlc0d964nzf8` (Staging Winery) — swap temporarily to preview the demo, then revert |
| Vercel project | `georgian-saas` · team `mg-productions-projects` |

### Files that already exist and matter here
- `saas/lib/demoTenant.ts` — the single source of truth for the demo gate
- `saas/components/DemoModeBanner.tsx` — role-switcher banner, has the auto-sign-in logic
- `saas/components/DemoChecklist.tsx` — today's corner checklist (Phase 2 replaces this)
- `saas/scripts/clone-nm-to-demo.ts` — clones NM's structural data into a demo tenant
- `saas/scripts/rebrand-demo-tenant.ts` — scrubs NM's real identity out (by slug, either DB)
- `saas/scripts/create-demo-admin.ts` / `-prod.ts` — creates the demo admin auth user
- `saas/app/(site)/layout.tsx` + `saas/app/admin/(panel)/layout.tsx` — where demo
  components are mounted
