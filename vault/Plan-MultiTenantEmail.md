---
tags: [plan, email, multi-tenant]
---

# Plan: Multi-Tenant Email Sending

**Status:** Decided, blocked on Max acquiring a platform domain — not started

## Context

Discussed 2026-07-17. See [[Decisions]] for the one-line decision record. This file has the full reasoning.

## Current state (as of this decision)

- Single Resend account, one `RESEND_API_KEY` for the whole platform (no per-tenant credentials anywhere).
- All three email sources hardcode `from: 'onboarding@resend.dev'` (Resend's sandbox sender):
  - `saas/lib/emails/invoiceEmail.ts`
  - `saas/lib/emails/bookingConfirmation.ts`
  - `saas/app/actions/notifyNewCompany.ts`
- All three also hardcode `isDomainVerified = false`, which redirects every email — for every tenant — to `max.mghvdliashvili@gmail.com`. This is Resend sandbox-mode behavior (can't send to arbitrary recipients until a sending domain is verified).
- Related open item already tracked: `MyToDo.md` — "Verify nikalasmarani.ge in Resend" (unblocks delivery for the one real tenant, independent of everything below).

## Options considered

**A — Shared platform sending domain (chosen, do this first)**
One domain verified once (SPF/DKIM/DMARC), all tenants send through it: `From: "{Tenant Display Name} <bookings@mail.yourplatform.ge>"`, `Reply-To` set to the tenant's own contact email (already stored in `Setting`). Zero setup per client. Standard pattern (Notion, Typeform, etc. do this for workspaces). Downside: shared domain reputation — one abusive tenant's bounce/complaint rate can affect deliverability for everyone. Not a concern at current scale (1–2 tenants); worth monitoring if the platform grows.

**B — Per-tenant custom domain (later, opt-in)**
For a tenant that owns its own domain (Nikalas Marani does), verify that domain in Resend individually and store a per-tenant `fromAddress` / `replyTo` on `Tenant` (same shape as existing `logoUrl`/`theme` fields). Falls back to Option A's shared domain when unset. This is the "maybe later do email.subtenant" direction Max raised — a per-tenant subdomain of the platform's verified root domain (e.g. `bookings@winery-slug.mail.yourplatform.ge`) is also possible under Option B without each tenant owning a real domain, and gives partial reputation isolation between tenants. Worth revisiting once there are enough tenants that shared-domain reputation risk (Option A's downside) becomes real.

**C — Tenant-supplied SMTP/API credentials (rejected as default)**
Let each tenant paste their own SMTP password or mail-provider API key; send through their own account. Rejected for these reasons:
- Credential custody risk — storing third-party secrets per tenant is a new class of liability (encryption at rest, breach = someone can send phishing mail as the client).
- Gmail/Outlook SMTP specifically throttles hard (~500/day) and blocks typical server auth without app-password workarounds — bad fit for non-technical winery/company owners.
- Deliverability becomes tenant-dependent and unmonitored by us.
- Support burden multiplies — every tenant's failures are a different provider's problem to debug.
Kept in back pocket only as a possible advanced/enterprise option for a specific larger client who already runs their own mail infra — never the default onboarding path.

## Decision

Build Option A (shared platform domain + per-tenant display name + reply-to) as the default. Add Option B (per-tenant custom domain, opt-in) later for tenants who own a domain — Nikalas Marani is the first candidate since the domain is already owned. Explicitly do not build Option C.

## Blocker

Max does not currently own a domain to use as the platform's shared sending domain. **Nothing in Option A can be built until a domain is acquired.** The independent "verify nikalasmarani.ge in Resend" item (unblocks that one tenant's own emails) does not depend on this and can proceed separately whenever Max wants.

## Rough shape of the work (not yet scoped into steps — do this once a domain exists)

- Verify chosen platform domain in Resend (SPF/DKIM/DMARC DNS records).
- Add `fromAddress String?` / `replyTo String?` (or similar) to `Tenant`, following the same pattern as `logoUrl`/`theme` — resolved in `proxy.ts`, defaults to the shared domain when unset.
- Replace the hardcoded `from` / `isDomainVerified` logic in all three email files with the resolved per-tenant values.
- Decide the shared-domain local part convention (e.g. `bookings@`, `invoices@`) and whether it differs by email type.

## Related
- [[Decisions]] — one-line record of this choice
- [[MaintenanceNotes]] — Tenant-scoping patterns this should follow
- [[RLS-Architecture]] — note on email reputation not being isolated the same way tenant data is
