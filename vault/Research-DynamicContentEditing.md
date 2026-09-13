---
tags: [research, emails, site-content, super-admin]
---

# Research: extending SiteContent-style editing to emails & in-app messages

**Date:** 2026-09-13
**Ask:** Max wants (1) previews of every automatic email in the admin panel / demo site, and (2) the existing site-content editor pattern (tenant override → code fallback) extended to cover emails and "action result" messages (e.g. "you booked successfully"), plus a new third tier: super-admin edits the platform DEFAULT, tenant admin edits their own override. Research only — no code written.

---

## 1. Every automated email today

| Email | Trigger | Content source | File |
|---|---|---|---|
| Booking confirmation (paid / pending-new-company / plain-unpaid variants) | `createBooking.ts`, `lib/payments/settle.ts` | Hardcoded TS template literal, ternary copy branches | `saas/lib/emails/bookingConfirmation.ts` |
| Wine order receipt | `lib/payments/settle.ts` (paid only) | Hardcoded template literal | `saas/lib/emails/wineOrderReceipt.ts` |
| Invoice email (Georgian only) | `app/actions/orders.ts` → `sendOrderInvoice` (admin-triggered) | Hardcoded template literal + admin free-text `customMessage` | `saas/lib/emails/invoiceEmail.ts` |
| New booking notification (to winery) | `createBooking.ts`, `settle.ts` | Hardcoded template literal | `saas/lib/emails/newBookingNotification.ts` |
| New company registration request | `app/actions/notifyNewCompany.ts` | Hardcoded template literal | same file |
| Bug/feature report (to Max) | `app/actions/bugReports.ts` | Hardcoded template literal | same file |

All six route through `sendTenantEmail()` (`saas/lib/emails/sendEmail.ts`) — the shared From/Reply-To/demo-suppression chokepoint (see `MaintenanceNotes.md` §11). **None currently read from `SiteContent`, `Setting`, or `lib/t.ts`** — every subject/body is a TS template literal with `${}` interpolation. No preview-without-sending mode exists on any of them today.

## 2. In-app "dynamic" messages

- `form_success_heading` / `form_success_body` on the booking form's success screen **already** go through the full 3-part SiteContent pattern (`fc()` helper → `getContentMap('form', locale)` → `lib/t.ts` fallback → editable in `/admin/content` `FIELDS.form`). This is the one existing precedent to copy.
- Validation errors (`form.err_contact`, `err_blocked`, `err_day_closed`, `err_lead_time`, `err_min_guests`) and the payment result page (`payment.success_*`, `payment.failed_*`, `payment.pending_*`) are locale-only via `t()` — not tenant-editable, not in FIELDS.
- No toast library anywhere in the app — every "toast" is local component state driving conditional JSX (e.g. `WineCatalogueClient`'s `newCoStatus`).
- Admin-panel chrome strings (Save/Cancel/Reset confirmations) use a separate flat dictionary, `lib/adminT.ts`, same shape as `lib/t.ts`, no DB backing.

## 3. `lib/t.ts` shape

Flat `Record<string,string>` per locale (`en`/`ka`), dot-separated keys, `{varName}` token replacement via `replaceAll`. `t(locale, key, vars?)` falls back EN → raw key. This is the existing "hardcoded default" tier that `EditableText`'s reset-to-default snaps back to.

## 4. SiteContent 2-tier pattern, exact mechanics

- **Schema**: `SiteContent { id, key, value, section, label, locale @default("en"), tenantId String?, updatedAt }`, unique on `(key, locale, tenantId)`. `tenantId` is nullable in the schema but **every** current read/write path supplies a concrete tenant id — no code anywhere reads/writes `tenantId: null`. The nullable column is unused headroom, not an active third tier.
- **Actions** (`app/actions/siteContent.ts`, RLS-scoped via `withTenantDb`): `getContent`, `getContentSection`/`getContentMap`, `getAllContent` (one query, all sections), `saveContent` (admin-gated upsert), `saveContentSection` (bulk), `deleteContent` (admin-gated — this *is* "reset to default": remove the row, component falls back to its hardcoded default prop).
- **Components**: `EditableText.tsx` (contentEditable) and `EditableLongText.tsx` (textarea, legal pages only — a parallel implementation, not shared, per `MaintenanceNotes.md` §7) both call `saveContent`/`deleteContent` directly.
- **Admin page**: `app/admin/(panel)/content/ContentClient.tsx`'s `FIELDS: Record<SectionKey, FieldDef[]>` is the hand-maintained source of truth for what's editable — must be kept in sync with `lib/t.ts` fallbacks by hand (an existing coupling risk, not new).
- **Locale**: rows are per-locale; EN and KA are separate rows under the same key.

## 5. Does a super-admin-editable "platform default" tier already exist?

**No — confirmed absent.** No code path reads/writes a `SiteContent` row with `tenantId: null`, no super-admin UI touches `SiteContent`. The only DB-backed super-admin content today is `PlatformSettingsClient.tsx` (`app/super-admin/settings/`) — login-page logo image + alt text only, via `app/actions/platform.ts`. `requireSuperAdmin()` (`lib/requireSuperAdmin.ts`) is a real, consistently-used one-line role gate across `app/super-admin/**` (tenants, users, orders, bug-report inbox, platform settings), so the access-control primitive exists — a generalized "super-admin edits the DB default" content tier does not, and would be new work. The nullable `tenantId` column is a plausible foundation for it (`tenantId: null` = platform default), **but** the SiteContent RLS policy needs checking first to confirm it doesn't implicitly exclude/block null-tenant rows (see `RLS-Architecture.md`).

## 6. Existing plans checked — nothing already rules this out or covers it

- `Plan-EmailInfrastructure.md` (2026-09-10, complete) — only the sending-domain/deliverability side (`sendTenantEmail`, `notify.vineworks.ge`, demo suppression). Silent on content editability or previews.
- `Plan-MultiTenantEmail.md` (2026-07-17) — the original sending-domain decision doc (rejected tenant-supplied SMTP). Also silent on content.
- No plan doc addresses a super-admin default-content tier or an email preview feature. **Genuinely open, unplanned territory** — safe to design fresh.

## 7. Architectural obstacles to flag before designing a plan

1. **No token system in emails** — vars are raw JS `${}` template-literal interpolation, not `lib/t.ts`-style `{varName}` tokens. A "tenant edits a text field" model needs every email's variable set extracted into named placeholders first, or tenant text can't reference `{customerName}`/`{date}`/`{totalPrice}` at all.
2. **Conditional copy branches per email, not one template** — e.g. `bookingConfirmation.ts` has 3 subject/body variants (paid/pending-company/unpaid) selected by booleans; `invoiceEmail.ts` conditionally renders masterclass lines, discount rows, guest-count splits. A flat "one key = one editable string" model (as SiteContent does today) doesn't map cleanly onto "N conditional variants of one email" — needs either one key per variant (schema/maintenance bloat) or a template language that understands conditionals (bigger lift).
3. **Structural HTML, not prose** — invoice/receipt bodies are built from table-row helper functions assembling structured data (IBAN, line items), not paragraphs. Only a handful of sentences (`customMessage`, the booking-confirmation intro line) are realistic "admin would want to edit this" prose; exposing the *whole* HTML body as one editable field is a much bigger tenant-inflicted-breakage surface than `EditableText`'s current contentEditable span. Argues for narrow "editable slots" per email, not whole-body editing.
4. **Theme colors are computed at send time**, not stored content — `resolveTenantTheme()` inlines literal hex (CSS vars don't work in email clients) — unrelated to and untouched by any content-editing feature.
5. **No preview-without-sending mode exists anywhere** — every `send*()` function sends immediately. Building the requested preview feature requires first factoring each into a pure `renderXHtml(data): string` + a thin send wrapper, across all six files — needed regardless of whether tenant-editable content is added on top. This is probably the right **first, independently shippable step**.
6. **Not all six are tenant-brand-voice candidates** — bug-report and new-company notifications are internal/platform-facing (always to Max), not customer-facing brand content. Worth deciding explicitly which of the six get tenant-editable content vs. stay platform-fixed, rather than treating all six identically.

## Suggested shape of next step (not yet a plan — for discussion)

A natural phasing, given the obstacles above:
1. **Preview infrastructure first** (independently useful, unblocks everything else): refactor each `send*()` into `renderXHtml(sampleData)` + `sendX()`, add an admin (and maybe super-admin) page that lists all emails and renders each with realistic sample data in an iframe.
2. **Extend the existing 2-tier pattern to editable slots** for the customer-facing subset only (booking confirmation, wine receipt, invoice intro line, form success message, payment result copy) — one SiteContent-style key per *slot* (not whole-body), each with a `{token}` set, reusing `lib/t.ts`'s token convention.
3. **Add the third tier** (`tenantId: null` = super-admin default) — needs an RLS check first, a `requireSuperAdmin()`-gated editor mirroring `/admin/content`, and a fallback chain of tenant row → platform-default row → hardcoded `lib/t.ts`/email-file default.

Happy to turn this into a proper `Plan-*.md` with file-by-file steps once Max confirms direction/scope (especially: which emails need tenant customization vs. stay fixed, and whether whole-body vs. slot-based editing is the right call).
