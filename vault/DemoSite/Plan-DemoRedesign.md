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
| **0** | Seed the demo with a trading winery + kill the setup banner | ⬜ Not started |
| **1** | Front door (framing interstitial + fix `/admin` dead end) | ⬜ Not started |
| **2** | Spotlight tour (replaces today's corner checklist) | ⬜ Not started |
| **3** | Feature rail (surface the invisible depth) | ⬜ Not started |
| **4** | Live mirror (flagship two-pane view) | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** Phase 0 has not been started. Begin at task 0.1.

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

**Status:** ⬜ Not started
**Resume point:** Not started — begin at 0.1.
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
- [ ] **0.1 — Design the seed shape.** Decide and write down (here) the target numbers
      before writing code: how many past vs. future bookings, over what date range, what
      the revenue curve looks like (a real summer peak — August is Kakheti's harvest
      season), how many tour companies on which price tiers, how many wine orders in each
      status (pending / confirmed / paid / delivered). Aim for roughly **18 months of
      history**. Use plausible Georgian names and real wines already in the catalogue
      (Rkatsiteli, Rkatsiteli Amber, Saperavi).
- [ ] **0.2 — Write `saas/scripts/seed-demo-data.ts`.** Must be **idempotent** (safe to
      re-run — clears its own previously-seeded rows first, never touches other tenants),
      look the tenant up **by slug** (`vineworks-demo`) not by hardcoded ID, and refuse to
      run against a non-demo tenant. Model it on the existing
      `scripts/clone-nm-to-demo.ts` and `scripts/rebrand-demo-tenant.ts`, which already
      follow this shape. Also see `vault/Seeding/` for prior seeding conventions.
- [ ] **0.3 — Run against dev + verify.** Orders list populated, Statistics charts drawing
      a real curve, wine orders spread across statuses, packing view showing real box
      counts. Screenshot for Max.
- [ ] **0.4 — Suppress the setup banner for the demo tenant.** `OnboardingBanner` and
      `FinishDetailsBanner` are rendered in `saas/app/admin/(panel)/layout.tsx`. Gate both
      on `tenantId !== DEMO_TENANT_ID`. (Alternative: actually complete the onboarding
      steps for the demo tenant so the banner retires naturally — decide which, note the
      choice here.)
- [ ] **0.5 — Ship.** `staging` → verify → Max's go-ahead → `master`. Then run the seed
      script against **prod** as its own deliberate, separate step.
- [ ] **0.6 — Schedule regeneration.** Wire the same script to run on a schedule so
      visitor tinkering doesn't degrade it. **This is the same machinery as the "nightly
      reset" item** carried over from [[Plan-DemoSite]] — they are one job, not two.

### Notes / decisions
_(record the seed shape numbers and the 0.4 decision here once made)_

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
