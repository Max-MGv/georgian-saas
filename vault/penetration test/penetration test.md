---
tags: [security, pentest]
---

# Penetration Test — 2026-09-06

Overview of a dev-environment penetration test Max asked for, run by a delegated agent against the local dev server / dev Supabase project (never production).

- [[design]] — test plan: scope, target, tenants/accounts used, methodology per area, tooling notes
- [[findings]] — results: one Critical finding (verified), five Low/Informational items, and a "tested and not vulnerable" section

## Headline result

**Critical, now fixed:** the public wine-order checkout (`saas/app/actions/submitWineOrder.ts`) computed the customer's charge entirely from client-supplied `price`/`discountPercent` values, with no server-side check against the real `WineVintage.price` / `Company.wineDiscountPercent` in the database. Confirmed by direct code inspection and by the tester replaying a tampered request that produced a real `WineOrder` row at a fabricated (near-zero) total. Fixed the same day: the action now re-fetches real prices/discount server-side (mirroring the existing `createBooking.ts` pattern) before computing any total, rejects orders referencing a vintage that no longer resolves, and clamps discount to 0–100. Re-tested live with the same tampering technique afterward — a request with `price: 0.01`/`discountPercent: 99` on a real 5×15₾ order now correctly stores `totalAmount: 75`. See [[findings]] finding #1 and [[KnownBugs]] Bug #22 for the full write-up.

Everything else tested came back solid or low-severity: cross-tenant data isolation held under an active attempt to break it, there's no SQL-injection or React-XSS surface anywhere in the app, and the remaining items (missing security headers, an outdated dependency with high-severity advisories, unescaped input in one email template, a bounded SVG-upload gap, and an RLS-configuration/doc drift on two non-data tables) are infrastructure hardening, not active exploits.

## Process note

The delegated agent completed a thorough, ~24-minute, 175-tool-call test pass but was blocked by a tool-level guardrail from writing `findings.md` itself (subagents are restricted from writing report files directly — a sensible safety rail, but it meant the agent's full evidence trail didn't survive past its own summary). [[findings]] was reconstructed from that summary, with the Critical finding and several of the Low/Informational ones independently re-verified against the live code and dev database afterward (each finding in that document is marked with its verification status). Nothing in [[findings]] is presented as fact without either direct re-verification or an explicit "tester-reported, not re-verified" label.

## Not committed

This test touched no application code — it's documentation only. No git action needed beyond having these three files sitting in the vault.
