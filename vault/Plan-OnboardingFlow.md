---
tags: [plan, feature-127, draft]
---

# Plan: Onboarding Flow (#127)

> ⚠️ **STATUS (2026-08-07): this doc is a chronological decision log, oldest first — sections below are marked ⚠️ SUPERSEDED where the original 2026-08-04 plan no longer matches what was built.** Skip straight to "Philosophy reversal — comprehensive-upfront wizard, 5 → 7 steps" (below "Phase 3") for the current design. In short: the original "essentials now, full details later" premise was explicitly retired by Max on 2026-08-07 — the wizard now asks for everything a section needs upfront (7 steps: Companies, Wine Orders, Booking Details, Payment Info, Contact & Site Info, Photos, Review), not just Companies/Wines minimally. The reasoning below is kept, not deleted, because it explains *why* each earlier call was made — just don't read it as the current shape of the feature.

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

**"Essentials now, full details later."** ⚠️ **SUPERSEDED 2026-08-07 — retired as the wizard's governing philosophy, see "Philosophy reversal" section below.** Still true for the two entities it was originally written for (Companies, Wines keep their original minimal fields, unchanged by the reversal) but no longer describes the wizard as a whole — Payment Info and Booking Details, added later, ask for everything upfront instead. Original text kept for context: Wizard-created records (companies, wines) are intentionally minimal — see field breakdown below. A post-launch nudge tracks which records still need their full details filled in (starting with Georgian name/description — this codebase has hit the "Georgian toggle does nothing because the row was never seeded" bug shape multiple times already, e.g. #131, #138; this plan should not add a new instance of it). Nothing stays silently half-done forever, it's just deferred with an explicit, can't-miss reminder.

---

## Architecture decisions (Max, 2026-08-04)

**Shared components in "minimal mode," not separate wizard-only forms (Option B).** ⚠️ **The `CompanyForm`/`WineForm` components named here never actually existed in the codebase** — discovered when building started (2026-08-04, part 4): no dedicated form components to share, so minimal-mode instead calls the real server actions (`createCompany()`, `createWine()`, etc.) directly from wizard-specific step components. The underlying principle held (never a parallel implementation of the *write path*), just not via the specific mechanism described here. Original reasoning kept for context: the alternative (small bespoke wizard forms) was rejected because this codebase has already been bitten by exactly that class of drift once (a new `OrderStatus` value that didn't propagate to every place that needed to know about it — 4 separate omissions found only by deliberate audit).

**Minimal-mode field breakdown, current schema:** ⚠️ **Still accurate for Companies/Wines specifically (unchanged by the 2026-08-07 reversal below) — but no longer describes the whole wizard, which now also has Payment Info and Booking Details steps asking for everything upfront.**

| Entity | Wizard asks | Deferred to the real admin page |
|---|---|---|
| Company | `name`, auto-generated `accessCode`. Module flags (`isBookingCompany`/`isWineOrderCompany`) auto-set from the tenant's own active modules, not asked. | `identificationCode`, contact details, `wineDiscountPercent`, custom pricing tiers (`prices` relation) |
| Wine | `name`, `wineType`, `sweetness`, one `WineVintage` (`year` + `price`) | `nameKa`, `description`, `color`, `sparkling`, `alcoholLevel`, `imagePath`, additional vintages |

⚠️ **This wine field breakdown was written pre-#146 and needed revisiting — see Sequencing below; resolved there (VINTAGE-mode tenants ask per-vintage instead of once per wine).**

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

**Status recap, 2026-08-07:** Phase 0 done except Supabase auto-provisioning (still open, not needed for Max's current manual workflow). Phase 1 done, and grew — the step list is no longer just Companies/Wines/Contact/Photos/Review, see the Philosophy reversal section below for the current 7-step order. Phase 2 done, expanded well beyond "business basics + catalogue essentials" into full per-module coverage. Phase 3 done (see its own section below). Phase 4 (#139 guide mode) shipped separately, see [[Feature 139 - Guide Mode]]. Phase 5 still genuinely future, untouched.

**Phase 0 — Foundations** (nothing user-facing; everything else depends on this being right)
- ~~Refactor `CompanyForm`/`WineForm` to support a minimal-mode render, sharing existing server actions~~ — these components never existed, see the correction above; the actual mechanism (direct server-action calls from step components) shipped instead
- Extend `createTenant()` to also provision the tenant-admin Supabase login — **still not started**
- Add `onboarding.*`/`guide.*` keys to `adminT.ts` — done
- Build the completeness-check module: live-computed, at both step level and individual-record level — done, and extended twice since (Phase 3, then the 2026-08-07 rework)

**Phase 1 — Wizard shell**
- ~~Linear, progress-bar step framework~~ — shipped as icon-based `StepNav` (linear-forward, backward-only review), not a progress bar; resumable across sessions as planned
- Module-conditional step list, including the "do you work with companies?" qualifying question — done, and the module-conditional pattern extended to every new step added since
- The "launch" action — flips visible state once the derived required-conditions are true — done, though "launch" itself never became a technical gate (deliberate, see Review step notes below)

**Phase 2 — Step content**
- ~~Business basics (contact info)~~ — done, though the original Contact step had a real bug (wrong data store) fixed 2026-08-07, see [[KnownBugs]] #10
- Catalogue essentials — wine and/or companies per the conditions above (the actual launch gate) — done
- Content & photos (optional — neutral fallbacks from #125 already cover a skip) — done
- Review & launch — done, checklist since extended to 7 steps

**Phase 3 — Post-launch "finish full details" nudge**
- One banner/checklist surfacing both skipped optional steps and minimally-filled records, each linking straight to the real page to complete it — done (own section below), then rebuilt again 2026-08-07 to cover more than companies/wines and to render admin-wide instead of just `/admin/orders`

**Phase 4 — #139 guide-mode toggle** (immediate follow-on, reuses Phase 0–3's copy) — done, see [[Feature 139 - Guide Mode]]

**Phase 5 — later, not committed now**
- Scripted first-time tour
- Actual public self-service signup (billing, domain automation) — sits on top of Phase 0's provisioning work but is a separate future project

---

## Sequencing against the wine hierarchy change — now scoped, see [[Plan-WineVintageDetails]] (#146)

The wine hierarchy revision flagged here now has its own plan: a tenant-wide `wineDetailLevel` (`PRODUCT`/`VINTAGE`) setting, super-admin-only, **defaulting to `VINTAGE` for every new tenant**. That default changes this plan's assumption: the wine field breakdown table above (name/type/sweetness + one vintage) was written for `PRODUCT` mode, but most new tenants will actually be in `VINTAGE` mode from creation. Phase 2's wine catalogue-essentials step needs a mode-aware minimal form — in `VINTAGE` mode, type/sweetness/sparkling/alcohol are asked per-vintage instead of once per wine, and per #146's "no guessed data" rule, an unfilled field must show as "not specified," never silently inherited.

**Coupled to #146 shipping first (unchanged):** Phase 0's `WineForm` minimal-mode refactor, Phase 2's wine catalogue-essentials step.

**Not coupled, can proceed independently (unchanged):** everything else — Company minimal-mode refactor, tenant-admin provisioning, the completeness-check engine, the wizard shell (Phase 1), business basics/companies-step/content-photos/review steps (Phase 2), the nudge system (Phase 3), the guide-mode toggle (Phase 4).

Sequencing choice (full-sequential vs. split tracks) — resolved by events: #146 shipped 2026-08-04 (see [[Plan-WineVintageDetails]]), unblocking the wine step the same day, so the question of whether to split tracks never had to be answered — everything proceeded sequentially in one continuation.

---

## Companies step: built, reviewed, design not loved — proceeding to skeleton anyway (Max, 2026-08-04)

The Companies/Individuals-pricing step (see [[SessionLog]] "part 4" + six follow-ups, same day) is built and live-reviewed. Full review findings — prioritized UI/UX list, one confirmed bug (Georgian copy overflows the viewport horizontally on mobile in the Simple-mode add-company row, missing `flex-wrap` — `OnboardingClient.tsx` line ~242 vs. its Detailed-mode sibling at ~254 which has it), accessibility concerns (hover-only `title` tooltip badges, inconsistent with the real Companies page's visible-text-pill convention), and copy/goal-alignment issues — are not duplicated here; see the review delivered in-session 2026-08-04.

**Max's call after reviewing:** not a fan of the step's current visual design, but doesn't want to stall on it. Build the **remaining steps as a working skeleton** — structure + real minimal functionality, deferring full visual redesign (including revisiting the reviewed step) to a later pass once the whole flow exists to react to.

**New non-negotiable constraint for the skeleton, not just the eventual redesign:** *"I want the whole experience to be seamless, as little reading as possible, as visual as possible."* Cheap to build into the skeleton's bones now (icon-first step nav instead of "Step X of Y" text, no multi-sentence hint paragraphs on new steps, leaning into visual treatment for the inherently-visual steps); expensive to retrofit later — so this shapes the skeleton plan below even though visual polish itself is deferred.

### Skeleton plan (researched, confirmed with Max, not yet built)

Researched via two Explore/Plan agent passes grounded in the real code (`app/actions/wines.ts`, `app/actions/siteContent.ts`, `app/actions/uploadLogo.ts`, `app/actions/uploadImage.ts`, `app/actions/settings.ts`, `WinesClient.tsx`, `prisma/schema.prisma`), then spot-verified directly (confirmed `createWine`/`createVintage` return shapes, `getContentMap`, the `x-tenant-modules-wine-orders` header pattern, `BackgroundsTab.tsx` defaults, and that `lucide-react` is an installed-but-unused dependency with the icon set needed — `Wine`, `Grape`, `Building`, `Phone`, `Mail`, `MapPin`, `Upload`, `Image`, `Rocket`, `Check`, `PartyPopper`, `Sparkles`).

**Architecture unchanged from the plan above:** every new step calls the same unmodified real server actions in a reduced field set (never a parallel implementation); completeness stays live-computed, never a stored flag.

1. **Wizard shell** — `OnboardingClient.tsx` splits into `OnboardingWizard.tsx` (new shell: card frame, `StepNav`, active step, footer) + `steps/CompaniesStep.tsx` (today's content relocated verbatim) + `steps/shared.tsx` (extracted `C`/`SmallField`/`StatusIcon`). `steps/StepNav.tsx` is icon-only (no step-count text at all — `onboarding.stepLabel` becomes dead), non-linear (click any step to jump), state synced to a `?step=` URL param. Step order at the time: Companies → Wines (if `modulesWineOrders`) → Contact → Photos → Review. ⚠️ **Grew to 7 steps 2026-08-07** — Booking Details and Payment Info inserted before Contact, which was also renamed Contact & Site Info; see the Philosophy reversal section below. The non-linear-vs-linear-forward nav question below was also resolved differently than stated here — see item 1 of the next section.
2. **Wine catalogue step** — one small additive change: `createWine()` starts returning the created row (matches `createCompany()`'s existing shape; `WinesClient.tsx` already ignores the return value, so nothing breaks). New `createOnboardingWine()` wraps `createWine`+`createVintage` atomically with rollback, mirroring `createOnboardingCompany`. Name + year + price only — **confirmed with Max: no per-vintage type/sweetness/sparkling/alcohol fields in the wizard even in VINTAGE mode** (new-tenant default per #146), left "not specified" for the real Wines page, consistent with that feature's "no guessed data" rule.
3. **Contact info step** — thin wrapper `saveOnboardingContactInfo()` around the existing `saveContent()`, for `contact_phone`/`contact_email`/`contact_address` (these already live in the generic `SiteContent` system, edited today inside the big tabbed Content editor — no separate model). Autosave on blur, no Save button. **Confirmed: step counts as done once ANY ONE of the three fields is set**, not all three.
4. **Content & photos step** — no new actions; calls `uploadTenantLogo`/`saveTenantLogo` and `uploadBgImage`/`updateSetting('home_hero_bg_path', ...)` directly. Two large visual upload cards (logo, home hero image), leaning fully into "inherently visual" — big previews, drag-drop, no position/zoom sliders (that stays on the real Content → Backgrounds tab). **Confirmed: logo alt text defaults silently to the tenant name**, no field in the wizard.
5. **Review & Launch step** — visual checklist (icons, not paragraphs) of what's actually done, driven by the extended `OnboardingStatus`. **Confirmed: clicking Launch persists a `Setting` row (`onboarding_launched_at`, ISO timestamp) purely as a record — not a new gate.** The app stays fully functional throughout regardless (unchanged "skippable, not blocking" decision); readiness stays 100% live-computed either way.
6. **`getOnboardingStatus()` extension** — adds `wineOrdersModuleOn`, `wineStepDone` (≥1 wine with ≥1 vintage), `contactInfoStepDone`, `contentPhotosStepDone`, `readyToLaunch` (companies + individuals + wine, matching the plan's original Launch bar spec above), `launched`. `stepDone` is redefined to equal `readyToLaunch`, so `OnboardingBanner.tsx` needs zero code changes — it already just reads `status.stepDone`, and that field now correctly also waits on the wine step once a wine-orders tenant reaches this point, purely from the live-recompute rule already in place.

**Full plan detail, verification checklist, and exact function signatures**: written out in the plan-mode session file, not re-copied here in full — this vault entry is the durable record of the decisions and shape; re-derive exact code from the real files (all named above) when building, same as any other vault plan.

### Two gaps found against this doc's own earlier decisions, resolved before building

Asked to double-check the skeleton plan against this file's own earlier sections before starting — found two real, unreconciled points:

1. **Phase 1 (line 68) said "Linear, progress-bar step framework"** — the first skeleton draft made `StepNav` fully non-linear (jump to any step). **Resolved: linear-forward with backward-only review** — a single "Continue" action advances through steps in order (matches the original spec, and is the actual pattern real consumer-app onboarding uses — Stripe Connect, Typeform — zero navigational decisions, which serves "as little reading as possible" better than a free-jump stepper would). Progress dots let you click back to any *already-reached* step to revisit/edit, never forward past your furthest point. Resumes to the furthest-reached step on return. `?step=` in the URL is kept as an explicit override (for `OnboardingBanner` deep-links), bypassing the reached-only restriction since that's deliberate external intent, not an in-wizard shortcut.
2. **The Wine field-breakdown table (line 39) listed `color`/`sparkling` as deferred** — the first skeleton draft added a color-swatch picker and sparkling toggle to `WineStep` anyway (since `createWine()`'s signature requires values for both). **Resolved: stay deferred, no UI for either.** `sparkling` silently defaults `false`. `color` is silently derived from the `wineType` the step already asks for (a small internal `WineType → hex` map, not a user-facing field) rather than always sending the brand color regardless of type — avoids a white wine defaulting to a red swatch, at zero added UI/reading cost. Both values are freely editable later on the real Wines page, same as every other deferred field.

**Status: skeleton built and live-verified on Staging Winery, same session as the plan.** All items below done — full flow works end to end, `tsc --noEmit` clean.

- [x] §1 `steps/shared.tsx` — extract `C`/`SmallField`/`StatusIcon` from `OnboardingClient.tsx`
- [x] §1 `steps/CompaniesStep.tsx` — relocated verbatim, **plus fixed the confirmed mobile/Georgian overflow bug from the earlier review as a byproduct** (added the missing `flex-wrap` to both the main add-company row and the same pattern in `IndividualsPricingSection` — confirmed live, `scrollWidth === clientWidth` at 375px in Georgian, was 399 vs 375 before)
- [x] §1 `steps/StepNav.tsx` — linear-forward + backward-review icon nav, `?step=` deep-link override
- [x] §1 `OnboardingWizard.tsx` — shell wiring steps + StepNav + Continue/Launch footer
- [x] §6 `getOnboardingStatus()` extension — `wineOrdersModuleOn`/`wineStepDone`/`contactInfoStepDone`/`contentPhotosStepDone`/`readyToLaunch`/`launched`/`launchedAt`, `stepDone` now = `readyToLaunch`
- [x] §2 `createWine()` additive return-value change + `createOnboardingWine()` + `steps/WineStep.tsx` — deferred color/sparkling per the resolution above; color silently derived from `wineType` via a small internal map, sparkling always `false`; VINTAGE-mode tenants (the default) don't ask type/sweetness either, both default to schema defaults since VINTAGE-mode display never reads wine-level values
- [x] §3 `saveOnboardingContactInfo()` + `steps/ContactInfoStep.tsx` — autosave on blur
- [x] §4 `steps/ContentPhotosStep.tsx` — logo + hero upload, drag-drop, large previews, no new actions
- [x] §5 `launchTenant()` + `steps/ReviewStep.tsx`
- [x] `page.tsx` — new data fetches, renders `OnboardingWizard`; old `OnboardingClient.tsx` deleted
- [x] `adminT.ts` — new EN/KA keys for all four new steps, dead `onboarding.stepLabel` removed (both locales)
- [x] `tsc --noEmit` clean
- [x] Live-verified on Staging Winery (real seeded tenant, already fully "done" from earlier sessions — resumed straight to Review as expected): backward nav to Companies/Wines/Contact/Photos all render real existing data correctly; added a real test wine end-to-end (`createOnboardingWine` → real editable row confirmed on `/admin/wines`, then deleted); Launch → "Launched Aug 4, 2026" → Launch-again all work; `OnboardingBanner` on `/admin/orders` still correctly hidden (zero code changes needed, confirming the live-recompute design); mobile (375px) + Georgian spot-checked on Companies and Wines steps, no horizontal overflow.

**Not click-tested, disclosed rather than assumed:** the Photos step's actual upload interaction (drag-drop of a real file) and Contact step's autosave actually firing — both render correctly against real existing data, but exercising the write path would have meant uploading over Staging Winery's real logo/hero image or overwriting its real contact info. Both paths call already-proven, unmodified server actions (`uploadTenantLogo`/`uploadBgImage`/`saveContent`), so risk is low but not zero, consistent with how the Individuals-pricing empty-state was handled the same way in part 4.

**Deliberately still skeleton, not polished** — per Max's own framing: colors/spacing/copy density on the new steps follow the same inline-hex pattern as the rest of the admin panel, functional but not the visual redesign pass that's still owed to the whole wizard (including revisiting the Companies step's reviewed issues). Not committed to git — sitting in the working tree pending Max's review, per [[ClaudeInstructions]] Rule 0/8.

### Phase 3 — post-launch "finish full details" nudge: built and verified live, 2026-08-07

Before building, verified the field breakdown against real code and real Staging Winery data rather than trusting this doc's original table (line 34-41), which predates #146's VINTAGE-mode default and turned out to be stale for wine-level type/sweetness/sparkling/alcohol (non-nullable with defaults at the Wine level in this schema — "unset" isn't detectable there at all; the real per-vintage nullable fields are the correct signal for VINTAGE-mode tenants, confirmed Staging Winery is one).

**Trigger rules, confirmed against `prisma/schema.prisma`:**
- Company needs details if `identificationCode` is null, OR all of `contactName`/`contactPhone`/`contactEmail`/`address` are null, OR (⚠ **fixed 2026-08-07, was a bug for wine-order-only companies** — see [[KnownBugs]] #12) it's a booking company (`isBookingCompany`) with 0 `Price` tiers. Wine-order-only companies never use price tiers, so the pricing condition is now conditional on `isBookingCompany`, not blanket.
- Wine needs details if `nameKa` is null, OR `description` is null, OR `imagePath` is null, OR (VINTAGE-mode tenants only) any vintage has all four of `wineType`/`sweetness`/`sparkling`/`alcoholLevel` null.
- Deliberately excluded: `wineDiscountPercent` (optional forever for many companies) and wine `color` (auto-derived from `wineType` by the wizard — unset isn't distinguishable from "kept the default").

**Surfacing decision (Max, 2026-08-07):** one central banner over per-row badges on the Companies/Wines list pages — matches Phase 3's own spec wording ("**one** banner/checklist... each linking straight to the real page").

**Built:** `getFinishDetailsStatus()` in `app/actions/onboarding.ts` — a new function, not an extension of `getOnboardingStatus()`, since it runs heavier per-record queries (every Company and Wine row, plus vintages) that shouldn't run on every wizard-step load. Short-circuits to "nothing outstanding" until `readyToLaunch` is true, since `OnboardingBanner` already owns the pre-launch nudge. New `FinishDetailsBanner.tsx`, same visual shape as `OnboardingBanner.tsx`, rendered alongside it on `/admin/orders`; the two are mutually exclusive by construction (one disappears exactly where the other can start mattering), no shared state needed. Body copy uses explicit per-combination translation keys rather than composing translated fragments — string concatenation would have broken Georgian grammar (case endings and word order don't follow the English "N companies and M wines" template). Link priority: companies gap → `/admin/companies`, else wines gap → `/admin/wines`, else → `/admin/content` (covers the two optional steps, contact info and content/photos, both edited there).

**Process note:** implementation was delegated to a subagent given a fully-specified prompt (exact trigger rules, function signatures, file list, copy conventions) — then independently re-verified against the real file diffs, schema, and live data rather than trusting its own summary, per this project's standing practice for subagent-built work (see the earlier independent QC pass above). Caught one thing worth double-checking rather than a bug: a wine with an image already assigned but no `nameKa`/`description` confirmed the check is genuinely field-based, not assuming wizard-origin (no such flag exists in the schema, by design).

**Bug found and fixed as a byproduct, unrelated to this feature's own code:** `/admin/orders`'s page header (title + Table/Calendar toggle + "+ New Order" button, `orders/page.tsx` — pre-existing code, not part of this build) had no `flex-wrap`, overflowing at 375px in Georgian (424px vs 375px, confirmed not caused by the new banner via element-by-element inspection and a clean comparison against `/admin/wines` at the same width). Same bug class as #131 and the Companies-step fix. Fixed with `flex-wrap` + `gap-y-2`, re-verified clean. Logged as [[KnownBugs]] #9.

**Verified live on Staging Winery:** banner renders the correct real counts against real partial data, correct singular/plural EN copy, correct Georgian with working interpolation, correct link priority, mobile (375px) clean after the header fix, `OnboardingBanner` stays hidden with zero changes to it. `tsc --noEmit` clean. **Not click-tested:** the "banner disappears once nothing's outstanding" path — would have required filling in real contact/pricing/Georgian-name data on Staging Winery's actual test records. The gating logic itself is a single boolean read, verified in code. Not committed to git.

Two items remain open from the original plan (both separate from this task, not required for Max's current manual-onboarding workflow): Supabase login auto-provisioning (Phase 0, needed only for a future self-serve signup flow) and `ReviewStep.tsx`'s own still-hover-only `StatusIcon` (cosmetic, same gap already fixed elsewhere in the wizard).

### Philosophy reversal — comprehensive-upfront wizard, 5 → 7 steps (Max, 2026-08-07)

Same day, testing Phase 3 against real gaps prompted two challenges: the wizard/nudge still didn't cover payment, maps, Menu Items, or Masterclass Items at all, and `FinishDetailsBanner` living only on `/admin/orders` left any tenant without the booking module blind to it. This section supersedes the original "essentials now, defer the rest" framing at the top of this doc — **that principle is retired for this wizard.** Max's own words: *"I want each section to include EVERYTHING it needs to operate. Users can skip it but it must be part of the flow so they understand it's highly recommended."*

**First-principles audit (delegated, independently spot-verified):** confirmed the real module set directly from `prisma/schema.prisma`/`proxy.ts` (`modulesBooking`, `modulesWineOrders`, `modulesPublicSite`, `modulesLegalPages`, `modulesOnlinePayment`, plus the Setting-level `enable_enhanced_company_booking` which behaves like a module for this purpose). Found the highest-impact gap was an actual bug, not just missing scope — logged as [[KnownBugs]] #10: the wizard's Contact step had been writing to the `SiteContent` table (feeds only `/contact`) the entire time, while the store that actually matters — sitewide footer/nav, invoice return address — is a separate `Setting` table with identical field names, never touched by onboarding. No backfill needed: real tenants already have the `Setting` copy populated through ordinary Settings use, which predates the wizard.

**Confirmed decisions:** Flitt credentials move into the wizard (Payment Info step) when `modulesOnlinePayment` is on, but stay non-blocking/skippable — same severity as today's `PaymentSetupBanner`, not escalated. IBAN and the other bank-transfer fields belong in the wizard unconditionally (not gated by `modulesOnlinePayment` — they're used by `sendInvoiceEmail` for any invoice). Maps embed joins Contact & Site Info. Menu Items/Masterclass Items get their own step, gated on `enable_enhanced_company_booking`, structured as two independent yes/no qualifying questions mirroring the Companies step's pattern exactly — before committing to that shape, checked `BookingForm.tsx` directly and confirmed both the Hot Dish and Masterclass sections already guard on `.length > 0` and simply don't render when empty, so "declared yes but added nothing" was worth nudging about but never a guest-facing bug. Payment Info becomes a genuine `readyToLaunch` condition (joining Companies/Individuals/Wine) — gated specifically on IBAN, the one field that actually makes a transfer possible; the other four bank fields matter for post-launch completeness but don't block launch.

**New step order:** Companies → Wine Orders (if module) → **Booking Details** (new) → **Payment Info** (new) → Contact & Site Info (repointed + Maps) → Photos → Review. `getFinishDetailsStatus()` was rebuilt from the old 2-dimension combinatorial body-text model (companies × wines, 13 keys — the shape built for Phase 3 above) into a flat set of independent conditions, with `FinishDetailsBanner` surfacing one priority-ordered condition at a time (payment → companies → wines → booking details → contact → maps → photos). The old combinatorial approach was correctly scoped for 2 dimensions but doesn't extend to 6+.

**Process note, and one real gap in my own delegation caught during review:** a Plan-agent pass turned the confirmed decisions into a concrete file-by-file structure first; a second subagent then built it from a fully-specified prompt. Independently re-verified the actual diff against that spec afterward (standing practice, not a one-off) — everything matched except one thing: the "move `FinishDetailsBanner` into the shared `(panel)/layout.tsx`" decision had only been given to the *planning* pass as context ("treat as already decided"), never actually carried into the *build* prompt as an instruction. The subagent correctly built everything it was asked for and left both banners on `/admin/orders` only, exactly reproducing the module-blindness problem this was meant to fix. Caught by checking real render locations, not by trusting the subagent's "verified live" claim — fixed directly: both `OnboardingBanner` and `FinishDetailsBanner` now render from `app/admin/(panel)/layout.tsx` (confirmed `/admin/onboarding` itself doesn't inherit that layout, so no self-referential banner-while-in-the-wizard issue). Also fixed two hardcoded `/admin/orders` links found during the same review pass (the wizard's "Finish for now" button, and its header "back" link — both now go to `/admin/companies`, always in nav regardless of module config) and removed a stale "this is the first one, more steps coming" footer string left over from when the wizard really was one step.

**Verified live on Staging Winery:** Booking Details loaded 6 real existing Menu Items correctly; added and deleted a real test dish, confirmed as a genuine independently-editable row on `/admin/menu-items`, not just optimistic UI. Payment Info correctly pre-fills real IBAN/recipient/bank/Flitt data. Contact & Site Info now correctly pre-fills real phone/email/address/maps data that would previously have shown blank — direct, concrete proof the store-repoint fix works, not just a code-read inference. Review step shows Payment as required/green (IBAN set) and Booking Details as optional/incomplete (food answered "yes" with a real item; masterclass never answered — correctly independent per-category). `FinishDetailsBanner` confirmed actually rendering on `/admin/menu-items` and `/admin/settings`, proving the shared-layout fix. Georgian + mobile (375px) clean on both new steps and on the Companies-page banner. `tsc --noEmit` clean throughout, re-checked after every follow-up fix. Not committed to git.

### Fresh-tenant inspection surfaces two real bugs (part 12, 2026-08-07)

Set up a genuinely blank test tenant ("Test Onboarding Wizard," all 5 modules on) so Max could inspect the whole wizard from zero — created via the real `/super-admin` tenant-creation flow, then pointed local dev's `DEFAULT_TENANT_ID` at it. **No new Supabase Auth account was created** — `super_admin` can access any tenant regardless of domain lock (`requireAdmin()` bypasses the tenant-lock check for that role), so the existing `super-admin-dev` login already covered it. Kept within the standing rule against creating credentials on Max's behalf.

Max found two real bugs by actually clicking through it:

1. **No way to mark a company booking/wine-order/both.** `createOnboardingCompany()` called `createCompany(name)` with no module flags, so every wizard-created company silently defaulted to `isBookingCompany: true, isWineOrderCompany: false` regardless of the tenant's actual modules — a wine-orders-only tenant would get useless booking-only companies from the wizard. Fixed: `createOnboardingCompany()` now takes explicit `{isBookingCompany, isWineOrderCompany}`; `CompaniesStep.tsx` only asks (a pill selector, matching the real Companies page's Bookings/Wine Orders tab labels) when the tenant has both modules on — with just one, there's nothing to ask.
2. **Real Companies list page had no at-a-glance "needs details" indicator** — the exact thing deferred back in the Phase 3 section above, now that the full scope is known. Fixed: `CompaniesClient.tsx` computes the same trigger logic `getFinishDetailsStatus()` already uses and shows a per-row "⚠ Needs details" badge with a click-reveal `HelpHint` listing specifics, no new server round-trip needed (the page already fetched every field).

**Fixing #1 surfaced a third bug**, caught before shipping rather than after: the pricing condition in `getFinishDetailsStatus()` applied to *every* company regardless of type, including wine-order-only ones — which never use price tiers at all. Would have permanently flagged them as "needs details" with no way to ever satisfy it. Fixed in both the central banner logic and the new per-row badge: pricing only counts against a company when `isBookingCompany` is true. All three bugs logged as [[KnownBugs]] #11–13, with the trigger-rule table above updated to match.

**Separately, Max asked directly whether the public site actually respects all 10+ super-admin theme presets** (not just this wizard — the whole customer-facing site). Delegated a line-by-line audit rather than assuming, independently spot-verified its two highest-severity claims before reporting back. Result: structurally solid everywhere checked (backgrounds, borders, text, brand color all correctly theme-aware) — confirms what Max believed. One real, narrower gap found: the two most recently built customer flows (enhanced company booking, wine catalogue's company/discount UI) hardcode green/red status-badge colors, copy-pasted between `BookingForm.tsx` and `WineCatalogueClient.tsx`, never hooked up to theme tokens — would clash on a dark preset. Not fixed this session (Max hasn't decided whether to fix now or track separately) — logged as [[KnownBugs]] #14. Confirmed this is unrelated to the admin panel's own separate (and much larger, pre-existing, not-this-session's-problem) pattern of only theming the brand accent color and hardcoding everything else — don't conflate the two findings.

Verified live on the fresh test tenant: a company added with both pills selected shows "Both modules" on the real Companies page exactly as manual creation would; the new badge correctly click-reveals "Still missing: ID code, contact info" for a real company. Georgian + mobile (375px) clean on both. `tsc --noEmit` clean throughout. Not committed to git.

### Independent QC pass (subagent), one real bug found and fixed

Asked a fresh subagent to review the build with no prior context, reading every new/changed file plus the real ground-truth files it mirrors (`CompaniesClient.tsx`, `WinesClient.tsx`, `companies.ts`, `prices.ts`, `OnboardingBanner.tsx`). Confirmed clean: RLS/tenant-scoping on every new query (all correctly go through `withTenantDb`, the two `db.tenant` reads are the documented exception), `createOnboardingWine`'s rollback-on-failure shape, the throw-vs-`{error}` handling split between upload actions and the rest, every `onboarding.*` adminT key used-vs-defined in both locales, `OnboardingBanner.tsx` genuinely needing zero changes.

**One real bug, fixed:** `OnboardingWizard.tsx` conditionally rendered the active step (`{currentKey === 'x' && <XStep/>}`), which unmounts a step on navigating away — so a company/wine/contact-field/photo added or edited, then navigated away from and back to, would visually disappear (though genuinely saved in the DB), inviting a confused re-add. Fixed by keeping every *reached* step mounted and toggling visibility via CSS `display: none` instead of unmount/remount — verified live: added a test wine, navigated to Companies and back, wine was still shown; deleted the test wine after.

**Two flagged items judged correct as designed, not fixed:** the Launch button being always-clickable regardless of `readyToLaunch` (only its color changes) — intentional, matches the confirmed "never a new gate" decision. The `?step=` URL override making all steps "reachable" in `StepNav` once landed via deep-link — also intentional (explicit external intent, e.g. from `OnboardingBanner`), and moot anyway since nothing is actually gated behind reachability.

**Two dead-code cleanups:** `ContentPhotosStep.tsx`'s unused `initialLogoAlt` prop removed; a leftover `onboarding.companies.doneTitle` adminT key (EN+KA, unreferenced since an earlier follow-up in part 4) removed. `tsc --noEmit` re-confirmed clean after all fixes.

---

## Companies step: visual redesign pass (deferred, then done) — Max, 2026-08-04

Once the skeleton and Guide Mode (#139) both shipped, Max picked up the deferred visual redesign. Researched real SaaS onboarding UI patterns first (two concrete findings: labeled step indicators outperform icon-only for 5+ step wizards; "confidence before completeness" — a glance should read as trustworthy, not just technically correct). Combined with unresolved items from the original live review (StatusIcon's hover-only `title`, wordy hint copy naming internal page routes, high badge density on short company names).

**Mockup-first, matching this project's established pattern for visual/UX changes that are hard to spec in text** (same approach as the earlier Wines admin panel redesign): built one interactive, annotated HTML mockup (Artifact) using the real app's actual brand tokens, showing 5 concrete changes with click-to-highlight annotations. Max approved the direction on first look — no revision round needed.

**Implemented directly, same session:**
1. `StepNav.tsx` — icons now have a short always-visible label underneath (e.g. "Companies," "Wines"), not just hover/`aria-label`. Connector line repositioned to sit at icon-center via absolute positioning within each step's own column.
2. `StatusIcon`'s hover-only badges replaced with `HelpHint` (the accessible click-reveal component built for #139) — direct reuse, no new component. Company rows collapsed from 3 always-visible badges to 1 (the actionable pricing warning, when present) + 1 `HelpHint` combining code/contact status into one sentence.
3. Pricing summaries (both company rows and Individuals pricing) now show the lowest tier's amount alongside the count — "2 tiers from 45₾/person," not just "2 tiers."
4. Wordy hint copy (`priceHint`, `detailedHint`, `addHint`, `skippedBody`, `doneBody`) trimmed to one clause each, internal page references ("...from the Companies page") removed in favor of outcome language ("...anytime").
5. `shared.tsx`'s `C` token object gained `faint` (already used everywhere else in the admin panel, just missing here) — caught by `tsc`, not a design choice.

**Bug found and fixed live, same session:** the new always-visible StepNav labels crowded into each other in Georgian — flexbox children don't shrink below their content's natural width by default, and Georgian's longer un-hyphenated words overflowed each step's allotted column into its neighbor's space. Fixed with `min-width: 0` on each step column plus `w-full break-words` on the label itself, so long labels wrap within their own column instead of overflowing. Re-verified: no horizontal overflow at 375px in either language.

**Deliberately not touched this pass:** `ReviewStep.tsx` still uses the old hover-only `StatusIcon` for its checklist rows — same accessibility gap, lower priority (the row's own visible label makes the icon supplementary there, not the only source of the information, unlike the Companies list). Flagged as a good next follow-on, not required now. Overall admin-panel visual language (inline hex tokens, card conventions) deliberately untouched — this was a fit-the-existing-panel-better pass, not a re-skin, matching what Max's original review actually asked for.

Verified live on Staging Winery: desktop + mobile (375px) + Georgian, in both languages, on the redesigned Companies step; the original review's specific "x" company (one-letter name buried under 3 badges) now shows cleanly with just the actionable badge. `tsc --noEmit` clean. Not committed.
