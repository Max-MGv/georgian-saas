---
tags: [plan, email, resend, vineworks]
---

# Plan — Email Infrastructure (Resend domain + per-tenant sending)

Started 2026-09-10. Tracks progress chunk by chunk so work can resume across sessions.

---

## Background / decisions made

- Brainstormed in chat 2026-09-10: revisited Resend vs alternatives (Postmark, SES, SendGrid) — staying on Resend, no reason to switch yet.
- Two sending patterns discussed: platform-branded, and "on behalf of businesses." For on-behalf-of, chose **2b: branded shared subdomain** (`"<Winery Name>" <bookings@notify.vineworks.ge>`), not per-winery real domains (2a) or per-winery Resend subdomains — both of those require either winery DNS cooperation (2a) or Resend's paid plan for 2+ domains (2b variant with literal per-tenant subdomains costs $20/mo past the first tenant; confirmed via Resend's public domain limits: free = 1 domain, Pro = 10 domains).
- Chosen sender domain: **`notify.vineworks.ge`** — a subdomain, not the vineworks.ge apex, so it gets its own independent SPF/DKIM and never touches the existing Zoho SPF record on the apex (`v=spf1 include:zohomail.eu ~all`, see [[Domain-and-Email-Setup]]).
- Confirmed with Max: swapping which single shared domain is used later (e.g. `notify.vineworks.ge` → something else) stays free and easy, since the From-address logic will live in one shared helper (Chunk 2) — just re-verify a new domain in Resend and change one constant. The apex (`vineworks.ge` itself) is the one exception — using it directly would require merging into the existing Zoho SPF record instead of getting an independent one.

**Live bug found while investigating:** all 3 existing email senders (`bookingConfirmation.ts`, `wineOrderReceipt.ts`, `invoiceEmail.ts`) are hardcoded to Resend sandbox mode — `from: 'onboarding@resend.dev'` and `toAddress` falls back to Max's own inbox because `isDomainVerified = false` is hardcoded. **Real customers on the live Nikalas Marani tenant are not receiving booking/receipt emails today.** This plan fixes that as part of Chunk 3.

---

## Chunks

- [x] **Chunk 1 — Verify a Resend sending domain (records added 2026-09-10, awaiting DNS propagation)**
  Added `notify.vineworks.ge` in Resend, region **Ireland (eu-west-1)** (matches Supabase `eu-central-1` / Vercel `fra1` pin — chose this over the Tokyo default). Used Manual setup (not Auto configure, which would have granted Resend OAuth access to the Vercel account — skipped without asking first).
  Records added to Vercel's DNS panel for `vineworks.ge` (`https://vercel.com/mg-productions-projects/~/domains/vineworks.ge`):
  - TXT `resend._domainkey.notify` → DKIM public key
  - MX `send.notify` → `feedback-smtp.eu-west-1.amazonses.com` (priority 10)
  - TXT `send.notify` → `v=spf1 include:amazonses.com ~all`
  - "Enable Receiving" left off (we only send, don't need inbound mail on this subdomain).
  - **Skipped:** the optional DMARC record (`_dmarc` → `v=DMARC1; p=none;`). Resend showed the name as bare `_dmarc`, ambiguous whether that's relative to `notify.vineworks.ge` or the `vineworks.ge` apex — entering it wrong could set an unintended DMARC policy on the apex and affect the existing Zoho mail. Needs a deliberate decision, not a guess — see Open questions below.
  **Verified 2026-09-10, within ~2 minutes of adding the records** (checked via Resend API, not dashboard clicking — much faster than the original vineworks.ge/Zoho propagation, which took ~15-30 min). `notify.vineworks.ge` is live and ready to send real email.

- [x] **Chunk 2 — Shared sender helper (done 2026-09-10)**
  Created `saas/lib/emails/sendEmail.ts` — `sendTenantEmail()` builds the Resend client + per-tenant From header (`"<Tenant.name>" <fromLocalPart@notify.vineworks.ge>`) and Reply-To (tenant's `contact_email` setting, falls back to Max's address if a tenant has none on file).

- [x] **Chunk 3a — Wire the 3 customer-facing templates to it, remove sandbox hack (done 2026-09-10)**
  Updated `bookingConfirmation.ts` (from `bookings@`), `wineOrderReceipt.ts` (from `receipts@`), `invoiceEmail.ts` (from `invoices@`) to call `sendTenantEmail()`. Removed the `isDomainVerified` flag and `onboarding@resend.dev` fallback from all three. `invoiceEmail.ts` didn't previously receive `wineryEmail` — added `contact_email` to the settings fetch in `saas/app/actions/orders.ts` (`sendOrderInvoice`) and threaded it through, matching the pattern `createBooking.ts` and `settle.ts` already used for the other two templates. Type-check passes clean.
- [x] **Chunk 3b — Internal notification emails (done 2026-09-10)**
  `bugReports.ts` and `notifyNewCompany.ts` moved to `sendTenantEmail()`, sandbox hack removed. Decided with Max:
  - `bugReports.ts` (bug/feature reports from the widget) — always goes to `max@vineworks.ge` (moved off personal Gmail).
  - `notifyNewCompany.ts` (new company registration request) — now goes to **each tenant's own `contact_email` setting**, falling back to `max@vineworks.ge` only if a tenant has none set. This matches the code's original (previously dead) intent — the winery creates the company in their own admin panel, so they should be the one notified, not Max, for every tenant.
  Both return their original `{error}`/`{success}` shape via try/catch around `sendTenantEmail()` (it throws), since existing callers (`BookingForm.tsx`, `WineCatalogueClient.tsx`) check that return value. Type-check clean.

- [x] **Chunk 4 — Test on staging (done 2026-09-10, verified end-to-end)**
  Pushed the commit to `staging`, confirmed the Vercel deployment went READY (`georgian-saas-b6qizvjq3-...vercel.app`), then tested two ways:
  - Submitted a real booking on the live staging site with a min-4-guest Wine Tasting for 20 Sept 2026. **Caught mid-test:** Staging Winery has online payment enabled, so "Book & Pay" redirected to a real Flitt payment page — backed out immediately without entering any card details (never complete a real charge for a test). The booking itself was already saved server-side as `Awaiting Payment` before the redirect, which was enough to use for the next step.
  - Used that order to send a real invoice via the admin panel (`Send Invoice by Email` — a safe, non-payment action). Resend confirmed **Delivered**. Opened the email in Resend's dashboard and confirmed:
    - **From:** `"Nikalas Marani (Staging)" <invoices@notify.vineworks.ge>` — tenant name in the display, correct local-part
    - **Reply-To:** `nikalasmarani@gmail.com` — Staging Winery's own `contact_email` setting, not Max's personal address
  This proves the shared helper, the verified domain, and the per-tenant Reply-To all work correctly in a real deploy, not just locally.

- [x] **Chunk 5 — Vault updates (done 2026-09-10)**
  `FeatureLog.md` (#157), `Roadmap.md` (checked off the old "verify nikalasmarani.ge in Resend" item + the sandbox-mode note), `SessionLog.md` (full session entry), `MaintenanceNotes.md` §11 (new emails must use `sendTenantEmail()`, don't call Resend directly).

**All chunks complete.** This plan is done — the remaining commit (vault + MaintenanceNotes) still needs pushing to staging.

## Open questions

- **DMARC for notify.vineworks.ge:** worth adding once we're sure of the correct record name (`_dmarc.notify` vs `_dmarc`) — check Resend's docs/support or test in a throwaway DNS entry before committing on the shared `vineworks.ge` zone.
- **wineworks.ge / www.wineworks.ge Vercel status:** noticed while in the Vercel Domains panel 2026-09-10 — both show "Invalid Configuration" (flagged as possibly-still-settling in the original Domain-and-Email-Setup.md, worth a follow-up look, unrelated to this plan).

**Deferred, not part of this build:** true per-winery-domain sending (needs winery DNS cooperation) and a self-serve tenant domain-verification UI — revisit once tenant count is past a handful (~dozens), per discussion 2026-09-10.

---

## Session log

**2026-09-10:** Plan created. Starting Chunk 1. Claude in Chrome wasn't connected (retried after Max restarted Chrome, still not reachable) — did Chunks 2 and 3a (code) in parallel while that gets sorted out. Chunk 1 (Resend domain verification + Vercel DNS) still needs to happen before any of this actually sends real email; until then Resend will reject sends because the domain isn't verified.
