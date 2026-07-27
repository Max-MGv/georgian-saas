---
tags: [theming, design, proposal]
---

# Theme presets — design proposal

Back to [[Themes]].

## Dependency inventory (2026-07-27)

**Storage:** `Tenant.theme` is already a free-form `Json?` column (`prisma/schema.prisma`) — no migration needed to store a richer preset shape.

**Delivery pipeline (already working, just needs a bigger payload):** `proxy.ts` reads `tenant.theme` → sets request headers → `app/layout.tsx` reads the headers → injects a `<style>:root{...}</style>` block. Today it only carries `--color-brand` / `--color-brand-hover`.

**CSS infra:** `app/globals.css` already defines a full shadcn token set (`--background`, `--card`, `--secondary`, `--muted`, `--accent`, `--border`...) for the admin panel's shadcn components — the public site doesn't use any of it. Decision: keep tenant-brand tokens separate from these (new `--site-*` names) so theming a tenant's public site can never accidentally restyle the admin panel.

**Files that hardcode the current palette (12, all reusing the same ~6 hex values, several as a local `const C = {...}` block):**
- `app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `layout.tsx`, `loading.tsx`, `SiteNav.tsx`, `wines/page.tsx` (loading), `wines/WineCatalogueClient.tsx`
- `components/EditableText.tsx`, `BookingForm.tsx`, `DateInput.tsx`, `LocaleSwitcher.tsx`
- Admin preview surfaces that mimic the public look and would drift if not updated too: `app/admin/(panel)/content/BookingFormVisualPanel.tsx`, `BackgroundsTab.tsx`

**Explicitly out of scope:** `components/AdminBar.tsx` (inline edit-mode toolbar) keeps its own fixed reddish palette — it's a Claude-editing affordance, not part of the tenant's brand.

## Second-pass dependency sweep (2026-07-27, before Phase 2 scoping)

Went back through the whole `saas/` tree (not just the obvious public-site files) looking for anything the first pass would have missed. Found four real ones:

1. **Home hero's no-image gradient fallback is a hidden hybrid.** `app/(site)/page.tsx:67` — `linear-gradient(160deg, var(--color-brand) 0%, #1c1008 100%)`. It *looks* already themed because it uses `var(--color-brand)`, but the dark end of the gradient is hardcoded regardless of preset — a Sage & stone tenant with no hero photo would still fade into wine-brown. Needs a `--site-text` (or dedicated) var on the dark stop.
2. **The hero/about/contact dark overlay tints are the text color in disguise.** `rgba(28,16,8,0.30-0.70)` and `rgba(10,5,2,0.52-0.65)` appear ~14 times across `page.tsx`, `about/page.tsx`, `contact/page.tsx`, and the admin `BackgroundsTab.tsx` preview — these are `#1c1008`/`#0a0502` (near-black text tones) at various opacities, used as photo-darkening scrims. CSS custom properties can't be used inside `rgba()` directly — this needs either the "8-digit hex + alpha suffix" trick (`${textHex}52`) or an exposed `--site-text-rgb: r,g,b` triplet. Decided in Plan below: hex+alpha suffix, simplest.
3. **Admin-panel *operational* chrome also reuses these same literals** — modal scrims in `OrdersTable.tsx` (`rgba(28,16,8,0.3-0.45)`), a dropdown shadow in `SearchableSelect.tsx`, and the edit-mode click overlay `BookingFormEditOverlay.tsx`. These are internal staff-facing UI, not the tenant's public brand — same bucket as `AdminBar.tsx`. **Recommendation: leave these hardcoded, out of scope**, so admin operational UI doesn't silently change every time a preset changes.
4. **Print documents and transactional emails are a separate rendering path entirely.** `InvoicePrint.tsx` and `BookingSheetPrint.tsx` (admin-triggered PDF/print views) are deliberately fixed white-paper documents (`backgroundColor: '#fff'`) that already only pull `var(--color-brand)` for a single accent border — everything else is fixed brown/cream, by design (printing white text on a Midnight-cellar-dark background would be unreadable). `lib/emails/bookingConfirmation.ts` and `lib/emails/invoiceEmail.ts` (guest-facing emails) are **100% hardcoded hex today — they don't even receive the existing single brand-color picker**, since CSS variables don't resolve in email clients; theming these means interpolating literal hex strings server-side into the template, a genuinely different mechanism from the CSS-variable pipeline everything else uses.

   **Decision 2026-07-27 (Max): both guest-facing emails carry the theme.** Confirmed in scope for v1 — both `bookingConfirmation.ts` and `invoiceEmail.ts` (Max's call: "both emails", not just booking confirmation). Turned out to be low incremental effort: both call sites (`app/actions/createBooking.ts:179`, `app/actions/orders.ts:265`) already fetch the tenant row right before sending (`db.tenant.findUnique(...select: {displayName, name})`) — just needs `theme: true` added to that `select` and the result run through the same `resolveTenantTheme()` helper the CSS pipeline uses, then interpolated as literal hex into the email template strings instead of the current hardcoded values. **Print documents (`InvoicePrint.tsx`/`BookingSheetPrint.tsx`) stay out of scope** — no such request was made for those, and they remain deliberately fixed white-paper documents. `notifyNewCompany.ts` (staff-facing internal notification) stays out of scope regardless — it's an internal ops email, not shown to guests.

**Current hardcoded palette** (what every preset needs to be able to replace): background `#fff9f3`/`#f5efe6`/`#fffdf9`, border `#e0d4c0`, text `#1c1008`/`#6b5a47`, accent `#a89070`/`#8b4513`, brand `#7c1d23`/`#9b2429`. Plus a handful of semantic greens/reds for success/error states — these stay fixed, not themed.

## Decision: presets in code (`lib/themePresets.ts`), not database

Max asked for the ups and downs of this specifically:

**Pros**
- Zero extra UI to build — no "preset builder" screen, no contrast validation, no draft/publish flow.
- Type-safe: a preset is a TypeScript object, so a missing token is a build error, not a broken tenant site discovered in production.
- Version-controlled: every preset change is a git diff and a `SessionLog.md` entry, same as any other code change — fits how this project already tracks history.
- Matches the actual ask: "a few curated, meaningfully good" presets, not an open-ended palette editor for every tenant.

**Cons**
- Adding a brand-new preset requires a code change + a deploy through the `staging` → `master` workflow — not something Max (or a future non-technical hire) can do from the superadmin UI directly.
- If a client ever wants a *bespoke* one-off palette that doesn't fit any preset, the current per-tenant brand-color override (kept) covers the primary color only — a fully custom palette would still need a new preset added in code.

Judged worth it: the alternative (DB-editable presets with a builder UI) is a meaningfully bigger project for a need that doesn't exist yet. This can be revisited later if "clients requesting bespoke palettes" becomes a real, recurring ask.

## Candidate preset families

Four color families proposed, each shown to Max at three levels of token richness (visual comparison delivered in-chat 2026-07-27, not reproduced here — see chat or ask Claude to regenerate). The idea: show the *same* aesthetic at increasing complexity so the token-count decision is grounded in an actual side-by-side, not decided in the abstract.

| Tier | Tokens | What it adds |
|---|---|---|
| Minimal | 3 — background, text, brand | Cheapest to author new presets with; brand color does double duty as the only accent. |
| Standard | 6 — + surface, border, secondary accent | Matches the current site's actual structure (nav/card background distinct from page background, a bordered tag/chip element). |
| Rich | 8 — + distinct header background, muted caption text | Enables a header bar that reads as a different tone from the page body, and dimmer secondary copy — needed for a real dark preset to feel intentional rather than flat. |

**Families proposed:**

1. **Cream & wine (current default)** — bg `#F5EFE6`, surface `#FFF9F3`, header `#F5EFE6`, text `#1C1008`, muted `#6B5A47`, border `#E0D4C0`, secondary `#A89070`, brand `#7C1D23`. **Corrected 2026-07-27 during implementation**: the chat comparison used approximated values (`#FBF3EA`/`#FFFDF9`); ground-truthing against the actual live code (`app/(site)/layout.tsx`'s page wrapper, `SiteNav.tsx`, `BookingForm.tsx`'s `C` constant) found the real values are `#F5EFE6` (page bg *and* nav — they're identical today, hence `bg` = `header`) and `#FFF9F3` (card/form surface). Using the approximated values would have been a small but real visual change for the live tenant; corrected before writing any consumer file.
2. **Sage & stone** — cool, botanical, "modern natural wine" feel. bg `#F3F1EA`, surface `#FFFFFF`, header `#EDEBDF`, text `#262A22`, muted `#6E7364`, border `#D8D6C7`, secondary `#8A9478`, brand `#4B5D3A`.
3. **Terracotta & clay** — warm, Mediterranean. bg `#FBF0E6`, surface `#FFF8F0`, header `#F5E4D3`, text `#3A2415`, muted `#8A6A4E`, border `#E8D2BC`, secondary `#C98A55`, brand `#B5502E`.
4. **Midnight cellar** — dark mode, moody wine-cellar register; the one family that's genuinely different in kind, not just hue. bg `#1E1B18`, surface `#262220`, header `#17140F`, text `#F1E9DD`, muted `#A99A87`, border `#3A332C`, secondary `#A88B5C`, brand `#C9A227`.

Note on Midnight cellar: every current tenant asset (logos, uploaded background photos) was chosen against a light background — offering a dark preset may need extra QA per-tenant before it's turned on, flagged as an open question in [[Themes]].

## Status — locked 2026-07-27

Token tier: **8** (rich). Families shipping in v1: **all 4** (Cream & wine, Sage & stone, Terracotta & clay, Midnight cellar), with the exact hex values listed above. Confirmed by Max on a full mockup of the actual booking homepage (nav, hero, package cards, booking form), not just the abstract token-tier cards. Business phase is done — see [[Themes]] for Phase 2 (technical scoping).
