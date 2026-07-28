---
tags: [plan, feature-128, draft]
---

# Plan: Legal Pages (#128)

**Problem:** No tenant site carries the legal pages Georgian consumer sites are expected to have — Terms & Conditions, Confidentiality/Privacy Policy, Return Conditions. Need to add them, and check whether doing so touches the Site Content editor or anything else. See [[FeatureLog]] #128.

**Scope decision (Max, 2026-07-28):** Georgia-only — no multi-jurisdiction legal variants needed. Keep a reasonable amount of per-tenant customizability anyway (so a client's actual return/cancellation terms can differ from the template), just not full structural flexibility.

**Scope decision 2 (Max, 2026-07-28):** New tenants get default legal content out of the box (not blank). This is its own per-tenant module — `modulesLegalPages` — toggleable from super-admin, same pattern as `modulesBooking`/`modulesWineOrders`/`modulesPublicSite` (Feature #120, see [[Plan-TenantModules]]). Default text is derived from NM's actual live pages (see review below), not neutral placeholder copy — this is the one content type where "close to a real Georgian business's real legal text" beats "generic," since accuracy is the point.

**Reference:** old pre-migration NM site (nikalasmarani.ge/ka/text/*) — very basic template: title → breadcrumb (`Home / Page Title`) → single content card → back-to-contact CTA. Terms is long numbered-clause text; Returns is a short pricing/cancellation table. Shape only, not copied verbatim into the UI design — but the actual legal *wording* is being used as the seed source per the scope decision above.

---

## Source review — NM's live legal pages (2026-07-28)

Pulled all three docs directly (`nikalasmarani.ge/text/5`, `/text/4`, `/text/2` — note: not under `/ka/` as the FeatureLog links suggest; those redirect but the real per-language paths are `/text/N` and `/en/text/N`). Findings, since Max asked to flag anything not worth carrying forward:

- **Terms and conditions (`/text/5`)** — mostly generic e-commerce boilerplate (general terms, user guarantees, security/liability). Two sections don't match how this platform actually works and should be dropped or rewritten rather than seeded verbatim: **§3 "Purchasing products"** and part of **§4 "Security"** assume a customer account/registration system and on-site bank-card checkout — this SaaS has neither (bookings are name/phone/email through a form, no login, no on-site payment processing). Seeding these as-is would make false claims about the tenant's site. Keep the general obligations/liability language, cut or genericize the account/payment-specific clauses.
- **Confidentiality (`/text/4`)** — the most substantial and genuinely useful of the three: proper Georgian-law citations ("Law of Georgia on Personal Data Protection"), a full data-subject-rights list (access, correction, deletion, object-to-marketing), retention period (10 years), cookie/analytics disclosure. Worth keeping as the backbone of the default privacy policy. Two problems found:
  1. **Leftover artifact**: the live NM document references **`bagi.ge`** — an unrelated third-party site — four separate times (§1.8, §1.16, §1.20, §1.27), including "minors are prohibited from using bagi.ge." This confirms NM's own text was copy-pasted from another company's boilerplate and never fully cleaned up. Must not carry `bagi.ge` into the seed — needs a full find-replace pass plus a read-through, not a blind copy.
  2. Several clauses describe things this platform doesn't do and that would be misleading if seeded by default: account registration (§1.10.1), web forums/comments (§1.10.5), contests/surveys (§1.10.4), job applications (§1.10.7), third-party promotional sign-ups (§1.10.8), storing credit card data (§1.11 — actually says they *don't* store it, but the framing assumes a checkout flow that doesn't exist here). Trim these; keep the core data-collection (name/phone/email at booking), purpose, retention, and rights sections.
- **Return conditions (`/text/2`)** — shortest, and actually the most directly reusable: it's really their booking cancellation policy (48-hour cancellation window) dressed up as "return conditions," tied to their specific tasting packages and prices. Translates well to a generic seed if the package/price specifics are swapped for placeholder language (each tenant's actual packages differ) and the 48-hour cancellation window is kept as the default (matches the existing static `footer.cancel` sentence already in the codebase — see [[MultiTenantSiteContent]]).

**Net:** none of the three pages are pointless enough to skip entirely — all three map to a real, sensible legal page — but none should be seeded as a straight copy. Terms and Confidentiality both need the accounts/payment assumptions stripped out; Confidentiality needs the `bagi.ge` leftovers removed; Return Conditions needs its numbers genericized.

---

## Why this doesn't fit the existing Site Content pattern

Investigated `app/admin/(panel)/content/ContentClient.tsx` (see [[MaintenanceNotes]] for the coupling rules around this file). Every current field is a `FieldDef` rendered as `EditableText` — a `contentEditable` span, good for a label or one paragraph, edited live via an iframe preview of the real page. That's the right shape for "Home hero subtitle" or "About story paragraph 2." It is the wrong shape for a full legal document: forcing Terms & Conditions into it would mean dozens of per-paragraph `SiteContent` keys per document, per locale — unmaintainable, and nothing like it exists anywhere in the codebase today (confirmed: no `[slug]` route, no markdown/rich-text renderer, no long-form content pattern in `app/(site)` at all).

`SiteContent.value` itself is an unbounded Postgres `text` column — the DB has no problem holding a whole document as one string. The constraint is entirely the admin UI, not the schema. So: new field *type*, not new schema.

---

## Design

1. **New field type** — extend `FieldDef` (or add a parallel structure) with `type: 'longtext'`. New `EditableLongText` admin component: a plain `<textarea>` (not `contentEditable`), Save/Cancel same as existing `EditableText` chrome (see [[MaintenanceNotes]] — Settings page inline edit/save UX, Feature #107, for the interaction pattern to reuse: pencil → edit → ↵ save → "Saved" flash).
2. **Storage** — one `SiteContent` row per (key, locale, tenantId) exactly as today: `legal_terms_body`, `legal_privacy_body`, `legal_returns_body`, section `'legal'`. Rendered on the public page with paragraph-splitting on blank lines (no HTML injection — plain text in, `\n\n`-separated `<p>` tags out).
3. **Customizability** — full free-text edit per tenant per page, same as any other content field. No structural/clause-level editor (no rich text, no per-clause toggles) — that would be over-building for a Georgia-only, low-frequency-edit feature. If a tenant needs different Return Conditions wording, they edit the block.
4. **Routes** — `app/(site)/terms/page.tsx`, `app/(site)/privacy/page.tsx`, `app/(site)/returns/page.tsx`. Shared `LegalPageLayout` component: title + breadcrumb + single card, matching the reference site's shape but in this app's own visual language (brand color, existing type scale), not NM's old styling.
5. **Nav + footer** — `SiteNav.tsx` `navLinks` array gets entries (covers desktop + mobile in one edit — see [[MultiTenantSiteContent]] for how `navContent`/`getContentMap('nav', locale)` feeds labels). Footer in `app/(site)/layout.tsx` currently has **no link list at all** (just contact info + one static sentence) — this is new: add an actual footer link row for the 3 pages.
6. **Gating** — new `modulesLegalPages Boolean @default(true)` on `Tenant`, alongside the existing 3 module booleans (see [[MaintenanceNotes]] / Feature #120 for the pattern). Default **on** (it's a legal expectation, not an opt-in feature) but switchable per tenant from `/super-admin/tenants/[id]` for edge cases. `proxy.ts` forwards `x-tenant-modules-legal`; when off, the 3 routes 404/redirect and nav+footer links are hidden — same shape as the existing wine-orders module gate, not the public-site-wide kill switch.
7. **i18n** — EN + KA `SiteContent` rows per page, same locale-toggle pattern as everything else. Seed neutral Georgia-appropriate boilerplate for both locales so a tenant that never edits still ships something reasonable — follow the [[Plan-NeutralFallbacks]] precedent (seed real tenant content first if any exists, then neutral fallback in code) rather than hardcoding one tenant's real legal text as the fallback for everyone.

---

## Steps

- [x] **1. Schema** — `modulesLegalPages Boolean @default(true)` added to `Tenant`. Ran `prisma migrate dev` (no local dev server was running, confirmed first — see [[MaintenanceNotes]] §3).
- [x] **2. Proxy** — `proxy.ts` fetches the flag alongside the other 3 module booleans, forwards `x-tenant-modules-legal` header.
- [x] **3. Field type** — `EditableLongText` (`components/EditableLongText.tsx`) built as a textarea-based sibling to `EditableText`, reusing the same `saveContent`/`deleteContent` actions.
- [x] **4. Seed content** — round-2 approved EN+KA text lives in `lib/legalContent.ts` (single source of truth). Seeded automatically for new tenants inside `createTenant()`; `scripts/seed-legal-content.ts` backfills existing tenants (create-only). Run against dev DB: 6 rows created for Staging Winery. **Still needs to run against production** when this ships to `master`.
- [x] **5. Routes** — `LegalPageLayout` + `app/(site)/{terms,privacy,returns}/page.tsx`, each redirects to `/` when `x-tenant-modules-legal !== 'true'`.
- [x] **6. Nav** — reconsidered mid-build: the approved mockup and NM's reference site both keep legal links footer-only, not top nav. Added to `SiteNav.tsx`, then reverted, and removed the now-unused `FIELDS.nav`/`adminT` entries that would have gone with it.
- [x] **7. Footer** — first-ever footer link list added to `app/(site)/layout.tsx`, conditional on the module flag.
- [x] **8. Admin editor** — new "Legal" tab in `ContentClient.tsx`, 3 `EditableLongText` fields, EN/KA toggle.
- [x] **9. Super-admin** — "Legal pages" checkbox added to `TenantFormClient.tsx`'s Modules section; `getTenant`/`createTenant`/`updateTenant` read/write it.
- [x] **10. Verify** — `tsc --noEmit` clean. Browser-verified on Staging Winery (dev DB): both locales render on all 3 routes, footer links show/hide correctly, admin Legal tab edits/saves/resets, super-admin toggle persists and the public site respects it (dev server restart needed between toggle and check — `proxy.ts`'s 5-min in-memory tenant cache, same as the #136 theming gotcha).
- [x] **11. Vault** — this file, [[FeatureLog]] #128, [[SessionLog]] all updated.

## Known follow-ups (not blocking, logged for later)
- Native Georgian / legal review of the seeded text (flagged in the round-2 draft notes — GDPR-shaped rights list, a few idiomatic passages).
- Run `scripts/seed-legal-content.ts` against **production** as its own deliberate step when this merges `staging` → `master` (dev and prod are separate Supabase projects — this session only touched dev).
- Return Conditions still only speaks of "your visit" (inherited from the source) — now that scope includes wine orders/delivery, a follow-up pass should say "visit or scheduled delivery" consistently.
- No effective-date stamp on any of the 3 documents.
- Legal page `<title>` metadata not yet customized (still shows the site-wide default title).

## Open question for Max before implementation
Should "Legal" get its own admin nav grouping, or live inside the existing Site Content page as a 4th mode alongside Text/Visual/Backgrounds? (Mockup so far assumes the latter.)

---

## Round 2 — seed text review decisions (Max, 2026-07-28)

A draft seed (derived from NM's live pages, cleaned of `bagi.ge` leftovers and account/payment assumptions) was compared clause-by-clause against the NM original. Max reviewed the removed sections and corrected several assumptions:

- **Online payment is real, just not built yet.** [Roadmap.md:246](Roadmap.md) lists "Online payments (Georgian bank integration or Stripe)" as unscheduled backlog. Decision: legal text uses **conditional wording** ("if online payment is offered for your booking or order, you'll be redirected to our banking partner's secure page...") so it stays accurate both before and after the feature ships, rather than firmly claiming a payment flow that doesn't exist yet for any current tenant, or firmly denying one that's coming.
- **Operator identity (Terms §1.2) needs no new field** — [[FeatureLog]] #31 already has `payment_recipient_name` / `payment_personal_number` Setting fields (used on invoices today). Terms should point to the same source of truth (Payment Details / Contact) rather than inventing parallel storage.
- **The "soft account" is the existing Company access-code system** (#98–101) — scoped to **both** the booking form and the wine-order form (wherever a company with a code is selected), not individual visitors filling either form directly. Terms/Privacy "account" language should describe this specifically instead of either denying any persistence or overclaiming a full account system.
- **Restored, largely as NM had them** (lightly reworded to drop pure-account framing where the code system doesn't fully match it): unilateral termination for breach (Terms §2.2), indemnity for user breach (Terms §4.3), accuracy-of-information duty (Terms §4.4), card data capture disclosure (Privacy §1.11), the original site-scope claim including online purchase + delivery (Terms §1.1 — consistent with the existing Wine Orders feature).
- **Return Conditions §3.1 kept vague** ("a refund is possible") rather than the earlier draft's firm "entitled to a full refund" — matches NM's original and doesn't commit every tenant to a specific refund policy.
- **Still removed, unchallenged**: all `bagi.ge` references (source data-quality bug, not a real feature), Terms §4.1 (account security/third-party access — no full account exists), Privacy §1.24 (consequences of withholding data), Return Conditions' pricing table and "order via link" note (genuinely tenant-specific/misplaced).

Full section-by-section reasoning lives in the conversation; a redraft incorporating all of this is in progress.
