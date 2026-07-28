---
tags: [plan, theming, v3]
---

# Themes — Issue #136

**Status: ✅ Done — v1 (4 presets) built, QA'd, confirmed by Max, and shipped to `master`/production 2026-07-27.** Full technical build-out and Max's confirmation in [[Plan-Themes]]. Following Max's instruction to treat this like client work: agreed the design direction first (presets, look and feel, how many "knobs"), scoped the technical difficulty second, then built and QA'd it — all in one continuous session once Max said "go ahead" on the technical plan. Longer-term open item: check Midnight cellar's contrast against each future tenant's own logo/photos before offering it to them.

**v2, same day (2026-07-27): expanded 4 → 16 presets, added light/dark categorization.** Max asked for 4 more themes; Claude generated 16 candidates across four mood families (warm/earthy, cool/refined, rich/jewel-toned, dark) as a swatch chart, then a full-homepage-mockup comparison (built live against the dev server, not screenshots). Max picked "keep them all" minus near-duplicates — Claude's pairwise review caught two close pairs (Slate & silver ≈ Harbor blue; Pine & frost ≈ Emerald & moss) and dropped the weaker of each, plus Max cut 2 more (Fog & linen, Garnet & ember) himself, landing on 12 new presets. `THEME_PRESETS` entries now carry `category: 'light' | 'dark'`; the super-admin picker groups by it. Shipped to `master`/production same session. Full preset list and hex values: `saas/lib/themePresets.ts`.

**Reusable catalog page**: every live preset (all 16, light + dark) rendered as a real homepage mockup, kept for client presentations / future preset decisions — https://claude.ai/code/artifact/c50e0f46-d708-4879-b9e5-8c5a634b4f1f (private artifact; ask Claude to update it in place next time a preset changes, rather than re-generating from scratch).

Linked from `FeatureLog.md` row #136.

## Why this exists

Superadmin theming today is one color picker (`primaryColor`/`primaryHover`) that only touches buttons/accents — everything else on the public site (background, text, borders, secondary tones) is hardcoded. Max wants real per-tenant visual identities, not "change one color and call it a theme," but is wary of scope — hence doing this in two deliberate phases with room to cut anything not worth the implementation cost.

## Phase 1 — Business side (current)

Goal: agree on what a "theme" actually is before touching any code.

- [x] Dependency review: catalogued every hardcoded color across the public site + admin preview surfaces (12 files, one consistent palette) and the existing brand-color pipeline (`Tenant.theme` → `proxy.ts` headers → `layout.tsx` `<style>` injection). See [[Presets-Proposal]] for the full inventory.
- [x] First round of design decisions made 2026-07-27 (see Decisions log below).
- [x] Show Max concrete preset options at different token-richness levels (3 / 6 / 8 tokens) across a few candidate color families — visual comparison delivered in-chat 2026-07-27. Max's read: 8 tokens (the rich tier) looks best, but wanted to see it on a realistic page rather than small abstract cards before committing.
- [x] Second round, 2026-07-27: rebuilt the comparison as a full mockup of the actual booking homepage (nav, hero, package cards, booking form) with a switcher between the 4 families, all at the 8-token tier — delivered in-chat. Max confirmed he likes them, no changes requested.
- [x] **Locked: 8-token tier, all 4 families ship in v1** — Cream & wine (current default), Sage & stone, Terracotta & clay, Midnight cellar. Exact hex values are in [[Presets-Proposal]].

Phase 1 is done. Moving to Phase 2 (technical scoping) next.

## Phase 2 — Technical scoping

**Scoped 2026-07-27**, before scoping did a second dependency sweep per Max's request ("make sure you don't miss out any dependencies") — found 4 things the first pass missed: a hero-gradient fallback that looks themed but hardcodes its dark end, ~14 rgba() overlay tints that are the text color in disguise, admin operational chrome (modals/dropdowns) reusing the same literals, and — the big one — transactional emails (`bookingConfirmation.ts`/`invoiceEmail.ts`) and print documents (`InvoicePrint.tsx`/`BookingSheetPrint.tsx`) which are a completely separate rendering path (no CSS vars reach email clients) and don't even carry today's existing brand color. Full writeup in [[Presets-Proposal]].

Flagged the emails/print/admin-chrome exclusion back to Max as a default call rather than deciding it unilaterally — **Max confirmed both guest-facing emails should carry the theme** (`bookingConfirmation.ts` and `invoiceEmail.ts`, asked explicitly about the invoice one too and chose "both"). Turned out cheap to add — both send-sites already fetch the tenant row right before sending, so it's a `select: { theme: true }` + literal-hex interpolation, not new plumbing. **Print documents (`InvoicePrint.tsx`/`BookingSheetPrint.tsx`, the PDF/print views — distinct from the invoice email) and admin operational chrome stay out of scope** — no request was made for those.

Full technical plan (token list, JSON shape, proxy/cache changes, step-by-step, key files, including the email work): [[Plan-Themes]].

## Decisions made (2026-07-27)

- **Presets live in code** (`lib/themePresets.ts`), not database-editable. Tenant row stores a preset id (+ optional override), not raw colors. Trade-off accepted: adding a new preset needs a code change + deploy, not a superadmin form — see [[Presets-Proposal]] for the fuller pros/cons Max asked for.
- **Per-tenant override allowed on top of a preset**: tenants can still override just the primary/brand color (reusing the existing `ColorPicker`) for brand-matching; everything else in the chosen preset is fixed. Keeps the brand-matching capability that exists today without turning presets into "pick 8 sliders."
- **Existing tenant data migrates forward, not reset**: today's stored `primaryColor`/`primaryHover` becomes the override on top of a new default preset (the current cream look) — no visual change for existing tenants on deploy.
- **Token tier: 8** (background, surface, header, text, muted, border, secondary, brand) — chosen after Max compared 3/6/8 in the abstract, then confirmed on a full booking-page mockup. Same tier for every preset, no per-preset variation.
- **All 4 proposed families ship in v1**: Cream & wine (current default), Sage & stone, Terracotta & clay, Midnight cellar. Max confirmed on the full-page mockup, no changes requested.
- Admin-only UI (`AdminBar.tsx`, the inline edit-mode toolbar) is explicitly **out of scope** — it's a Claude-editing affordance, not part of the tenant's public brand, and keeps its own fixed reddish palette regardless of theme.

## Open questions (carried into Phase 2)

- [ ] Does the dark preset (Midnight cellar) need extra QA attention (image/logo contrast, admin-uploaded background photos) before it's offered, given every current tenant asset was chosen against a light background? Not blocking Phase 2 scoping, but should be checked per-tenant before switching anyone onto it.
