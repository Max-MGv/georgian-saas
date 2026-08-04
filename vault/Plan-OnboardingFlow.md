---
tags: [plan, feature-127, draft]
---

# Plan: Onboarding Flow (#127)

**Problem:** a new client currently has to hunt across ~6+ separate admin pages (Companies, Wines, Site Content, Settings, Backgrounds...) with no guidance, to go from an empty tenant shell to a working site. See [[FeatureLog]] #127.

**Goal (Max, 2026-08-04):** should feel like registering/onboarding on a consumer app — streamlined, guided, confidence-building — covering companies, images, default settings, and wines.

---

## Business-side decisions (Max, 2026-08-04)

**Wizard location — split by concern.** Super-admin keeps owning technical/platform fields exactly as it does today (domain, slug, theme preset, brand color override, logo, favicon, module toggles — see `createTenant()` in `app/actions/superAdmin.ts`). The `/admin` panel gets a new business-data wizard for everything else. This mirrors the boundary that already exists in the code (super-admin = `Tenant`-table platform config, `/admin` = tenant-scoped server actions) and is forward-compatible with self-service later: a future signup flow only needs to produce the same minimal `Tenant` row super-admin produces now, then hand off into the same `/admin` wizard.

**Gating — skippable, with a persistent nudge.** Not a forced/blocking flow. A tenant admin can leave the wizard and use the normal panel any time; a "finish setup" banner/checklist stays visible until everything's done.

**Self-service-readiness — designed in now, not deferred.** `createTenant()` gets extended to also provision the tenant-admin's Supabase login (currently a manual step), so there's a real automated "first login" moment to build the wizard around. Full self-service signup (billing, domain automation) stays a separate, unscheduled future project — this just removes the one prerequisite it would need from this codebase.

**Launch bar.** A tenant counts as "launched" once:
- ≥1 wine populated, *if* the wine-orders module is on
- ≥1 company populated, *only if* the client answers yes to a wizard qualifying question ("do you work with tour companies / B2B partners?") — individual/walk-in bookings work with zero companies, so this isn't a blanket requirement
- (branding is already handled by super-admin, so it's not a launch condition here)

**"Essentials now, full details later."** Wizard-created records (companies, wines) are intentionally minimal — see field breakdown below. A post-launch nudge tracks which records still need their full details filled in (starting with Georgian name/description — this codebase has hit the "Georgian toggle does nothing because the row was never seeded" bug shape multiple times already, e.g. #131, #138; this plan should not add a new instance of it). Nothing stays silently half-done forever, it's just deferred with an explicit, can't-miss reminder.

---

## Architecture decisions (Max, 2026-08-04)

**Shared components in "minimal mode," not separate wizard-only forms (Option B).** The wizard renders the *same* `CompanyForm`/`WineForm` components used on the real admin pages, with a prop that reduces which fields show, writing through the *same* server actions (`createCompany()`, etc.) — never a parallel implementation. When the real form changes, the wizard's view of it changes for free. The alternative (small bespoke wizard forms) was rejected because this codebase has already been bitten by exactly that class of drift once (a new `OrderStatus` value that didn't propagate to every place that needed to know about it — 4 separate omissions found only by deliberate audit).

**Minimal-mode field breakdown, current schema:**

| Entity | Wizard asks | Deferred to the real admin page |
|---|---|---|
| Company | `name`, auto-generated `accessCode`. Module flags (`isBookingCompany`/`isWineOrderCompany`) auto-set from the tenant's own active modules, not asked. | `identificationCode`, contact details, `wineDiscountPercent`, custom pricing tiers (`prices` relation) |
| Wine | `name`, `wineType`, `sweetness`, one `WineVintage` (`year` + `price`) | `nameKa`, `description`, `color`, `sparkling`, `alcoholLevel`, `imagePath`, additional vintages |

⚠️ **This wine field breakdown is written against the current schema and will need revisiting — see Sequencing below.**

**Completeness is computed live, never stored as a frozen flag.** Both "which wizard steps are done" and "which records are minimally-filled vs fully-detailed" are derived on read from current module flags + current data, the same shape as the existing `requireModule.ts` gating. A stored `onboardingComplete: true/false` boolean would go stale the moment a module is toggled on/off after launch (e.g. wine orders enabled post-launch on a tenant with zero wines) — computing it live means the nudge is always correct with no extra bookkeeping.

**Copy lives in the existing `adminT.ts` dictionary**, new `onboarding.*`/`guide.*` namespace, both locales — not a new translation file. Matches the existing precedent of `lib/legalContent.ts`/`lib/t.ts`: one dictionary per concern, no duplicate systems. Not DB/`SiteContent`-editable — this copy explains the *platform's* UI, not tenant-owned content.

---

## Relationship to #139 (per-page help/guide feature)

Two distinct asks got disambiguated in planning:
- **Static tooltips** (#139 as originally scoped) — cheap, passive, always-there `(i)` icons on non-obvious fields.
- **An activatable guide** (Max, 2026-08-04) — wants both eventually: a first-time tour, and an always-available "remind me wherever I am" toggle.

**Sequencing decided:** #127 (this plan) produces the EN/KA explanatory copy as a byproduct of building each step. #139, immediately following, becomes a toggleable "guide mode" that surfaces that same copy inline anywhere in the admin panel — zero duplicate content-writing. A full scripted, DOM-anchored, multi-page tour is deliberately **not** committed to now: it's a materially bigger build (every step has to target a real element on a real page, and this codebase already has documented scars in `MaintenanceNotes.md` from coupled components breaking silently when one side changes without the other). Revisit only if the toggle-mode version turns out not to be enough once real users have used it.

---

## Phases

**Phase 0 — Foundations** (nothing user-facing; everything else depends on this being right)
- Refactor `CompanyForm`/`WineForm` to support a minimal-mode render, sharing existing server actions
- Extend `createTenant()` to also provision the tenant-admin Supabase login
- Add `onboarding.*`/`guide.*` keys to `adminT.ts`
- Build the completeness-check module: live-computed, at both step level and individual-record level

**Phase 1 — Wizard shell**
- Linear, progress-bar step framework, resumable across sessions
- Module-conditional step list, including the "do you work with companies?" qualifying question
- The "launch" action — flips visible state once the derived required-conditions are true

**Phase 2 — Step content**
- Business basics (contact info)
- Catalogue essentials — wine and/or companies per the conditions above (the actual launch gate)
- Content & photos (optional — neutral fallbacks from #125 already cover a skip)
- Review & launch

**Phase 3 — Post-launch "finish full details" nudge**
- One banner/checklist surfacing both skipped optional steps and minimally-filled records, each linking straight to the real page to complete it

**Phase 4 — #139 guide-mode toggle** (immediate follow-on, reuses Phase 0–3's copy)

**Phase 5 — later, not committed now**
- Scripted first-time tour
- Actual public self-service signup (billing, domain automation) — sits on top of Phase 0's provisioning work but is a separate future project

---

## Sequencing against the wine hierarchy change — now scoped, see [[Plan-WineVintageDetails]] (#146)

The wine hierarchy revision flagged here now has its own plan: a tenant-wide `wineDetailLevel` (`PRODUCT`/`VINTAGE`) setting, super-admin-only, **defaulting to `VINTAGE` for every new tenant**. That default changes this plan's assumption: the wine field breakdown table above (name/type/sweetness + one vintage) was written for `PRODUCT` mode, but most new tenants will actually be in `VINTAGE` mode from creation. Phase 2's wine catalogue-essentials step needs a mode-aware minimal form — in `VINTAGE` mode, type/sweetness/sparkling/alcohol are asked per-vintage instead of once per wine, and per #146's "no guessed data" rule, an unfilled field must show as "not specified," never silently inherited.

**Coupled to #146 shipping first (unchanged):** Phase 0's `WineForm` minimal-mode refactor, Phase 2's wine catalogue-essentials step.

**Not coupled, can proceed independently (unchanged):** everything else — Company minimal-mode refactor, tenant-admin provisioning, the completeness-check engine, the wizard shell (Phase 1), business basics/companies-step/content-photos/review steps (Phase 2), the nudge system (Phase 3), the guide-mode toggle (Phase 4).

Sequencing choice (full-sequential vs. split tracks) still open — revisit once #146 is scheduled.
