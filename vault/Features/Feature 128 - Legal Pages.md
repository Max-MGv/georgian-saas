---
tags: [feature, public-site, admin, platform]
---

# Feature 128 — Legal Pages: Terms, Confidentiality, Return Conditions

Built 2026-07-28. Three legal pages seeded by default for every tenant, editable per-tenant, toggleable via a new super-admin module. Full design/review history (mockups, two content-draft rounds, the section-by-section comparison against the source, Max's corrections) lives in [[Plan-LegalPages]] — this note is the "what it does and how it works" reference, not the decision log.

## What it does (user-facing)

- **Public `/terms`, `/privacy`, `/returns`** — plain title + breadcrumb + single content card, matching the app's cream/wine styling (or whatever preset the tenant is on, since it reads `--site-*` tokens like every other public page). Bilingual, same locale-cookie pattern as the rest of the site.
- **Admin → Site Content → Legal tab** — the three documents as large textareas (not the usual click-to-edit inline span), with the same Save/Cancel/Reset-to-default chrome as everywhere else in that editor.
- **Super-admin → tenant form → Modules → "Legal pages"** — on by default (it's a legal expectation, not an opt-in feature); turning it off hides the 3 routes (redirect to `/`) and the footer link row.
- **Footer** — first-ever link list on the public site footer (previously just contact info + a static sentence); shows Terms/Privacy/Returns when the module is on.
- New tenants get the content seeded automatically at creation time (both locales) — no "Georgian toggle does nothing" gap like the one fixed in #131.

## Key design decisions

- **New field type, not a forced fit.** The existing `EditableText`/`FieldsPanel` pattern is `contentEditable`-based, built for short labels — wrong tool for a multi-paragraph legal document. New `EditableLongText` component (`components/EditableLongText.tsx`) is a textarea-based sibling, same server actions (`saveContent`/`deleteContent`), same visual chrome, different input control.
- **Single source of truth for content.** `lib/legalContent.ts` exports `LEGAL_CONTENT_EN`/`LEGAL_CONTENT_KA`/`LEGAL_LABELS`, consumed by three call sites: the admin editor's English fallback (`FIELDS.legal` in `ContentClient.tsx`), `createTenant()` (seeds both locales for new tenants), and `scripts/seed-legal-content.ts` (backfill for existing tenants). **Editing this file does not retroactively change already-seeded tenants** — see MaintenanceNotes.
- **Footer-only links, not top nav.** The plan and an early pass both had nav links too; reverted mid-build once it was clear the actually-approved mockup and the NM reference site both kept legal links footer-only. Top nav was getting crowded (4 links + Book button + locale + socials already).
- **Content is Georgia-only, not neutral-fallback-templated.** Unlike #125's neutral fallbacks (deliberately generic so no tenant's real identity leaks into another's default), the legal text is *derived from a real winery's real pages* on purpose — accuracy mattered more than genericness here. Two review rounds fixed source-quality bugs in the original (an unrelated company's name baked in, a self-contradicting cookie clause, a duplicated paragraph) and corrected assumptions about what this platform actually does (no traditional accounts — the company access-code system from #98–101 covers both bookings and wine orders; online payment via bank redirect is a real but unbuilt Roadmap item, so payment clauses use **conditional wording** — "if online payment is offered for your booking or order..." — that stays accurate whether or not a given tenant has it live).
- **Operator identity (Terms §1.2) reuses existing data.** Rather than a new field, it points to the `payment_recipient_name`/`payment_personal_number` Settings fields (Feature #31, already shown on invoices) via prose ("operated by the business named in our payment and contact details... available on our Contact page"), not literal template interpolation.
- **Module gating mirrors the existing pattern.** `x-tenant-modules-legal` header, same shape as `x-tenant-modules-wine-orders`; each of the 3 routes does its own inline `redirect('/')` check (matching how `/wines` gates itself, not the shared `requireModule.ts` helper, since the redirect target and context differ from the admin-page guards that helper serves).

## Files touched

- `saas/prisma/schema.prisma` + `prisma/migrations/20260728094729_add_modules_legal_pages/` — `modulesLegalPages Boolean @default(true)` on `Tenant`
- `saas/proxy.ts` — resolves + forwards `x-tenant-modules-legal`
- `saas/lib/legalContent.ts` — NEW, single source of truth for EN+KA content, all 3 documents
- `saas/components/EditableLongText.tsx` — NEW, textarea-based long-form editor
- `saas/app/(site)/LegalPageLayout.tsx` — NEW, shared title/breadcrumb/card shell
- `saas/app/(site)/terms/page.tsx`, `privacy/page.tsx`, `returns/page.tsx` — NEW, thin route wrappers
- `saas/app/(site)/layout.tsx` — footer link list (new), `legalOn` flag read from headers
- `saas/app/admin/(panel)/content/ContentClient.tsx` — `FIELDS.legal`, `LegalPanel`, "Legal" tab
- `saas/app/actions/superAdmin.ts` — `getTenant`/`createTenant`/`updateTenant` read/write `modulesLegalPages`; `createTenant()` also seeds the 6 SiteContent rows for a new tenant
- `saas/app/super-admin/tenants/TenantFormClient.tsx` — "Legal pages" checkbox in the Modules section
- `saas/lib/t.ts` — `legal.*` static strings (breadcrumb, titles), `footer.terms`/`footer.privacy`/`footer.returns`
- `saas/lib/adminT.ts` — `content.section.legal`, `content.field.legal_*` admin labels
- `saas/scripts/seed-legal-content.ts` — NEW, create-only backfill for existing tenants (run once against dev; still needs a production run — see [[Plan-LegalPages]])

## Edge cases handled

- Tenant with the module off → all 3 routes redirect to `/`, footer link row doesn't render, admin "Legal" tab still exists (editing stays possible even while hidden from the public site — same as other module toggles never hiding their own admin surface)
- Tenant with no seeded rows at all (shouldn't happen going forward, but covers pre-migration edge cases) → falls back to the English `LEGAL_CONTENT_EN` fallback baked into `ContentClient.tsx`, same pattern as every other content field
- `proxy.ts`'s 5-minute in-memory tenant cache means a super-admin module toggle doesn't take effect on already-warm serverless instances until the cache expires (or the dev server restarts) — same known limitation as every other module flag, not new to this feature

## What to test (also in MyToDo.md)

Both locales on all 3 routes; footer link presence/absence tied to the module toggle; admin Legal tab edit/save/cancel/reset; super-admin checkbox persists and the public site actually respects it after a cache-clearing restart. Claude verified all of the above end-to-end in the browser against the dev DB (Staging Winery, the only tenant there) — see [[SessionLog]] 2026-07-28 for the full verification trail. **Not yet verified against production** — pending the master merge + prod migration/backfill described in [[Plan-LegalPages]].
