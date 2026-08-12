---
tags: [plan, i18n, testing]
generated: 2026-08-12
status: proposed — awaiting Max's go-ahead
---

# Plan: I18n Integrity — fix known gaps + add a checking mechanism

Two separate asks, both from the 2026-08-12 architecture review's finding #1 (renamed from "two disconnected i18n systems" after correction — see [[ArchitectureReview-2026-08-12]] section 7): fix what's currently broken, and stop new instances of the same bug shape from shipping unnoticed. Written up for Max's review before any code changes — nothing here is built yet.

**Context, briefly:** there are three text mechanisms in this app (`lib/t.ts` static dictionary for public UI chrome, `lib/adminT.ts` static dictionary for admin UI chrome, `SiteContent` DB rows for tenant-editable public content, with `SiteContent` falling back to `lib/t.ts` via a helper like `fc()` when a tenant hasn't customized a field). Two failure shapes have hit production already: a field routed through neither system at all (bug #16, hardcoded English), and a field correctly wired to `SiteContent` but missing its Georgian DB row for a given tenant (bug #131's shape — the fallback silently serves English, which reads as "the Georgian toggle does nothing").

---

## Part A — Fix what's currently broken

1. **Bug #16 — `/wines` Grid/List toggle** (`app/(site)/wines/WineCatalogueClient.tsx` lines ~729/739). Add `wines.view.grid` / `wines.view.list` keys to `lib/t.ts` (EN + KA), replace the literal `title="Grid view"` / `title="List view"` strings with `t()` calls.

2. **Transactional emails have no locale awareness at all** (found 2026-08-12, not in `KnownBugs.md` yet — will be added once fixed). `lib/emails/bookingConfirmation.ts` and `lib/emails/wineOrderReceipt.ts` hardcode English strings directly — a customer who booked in Georgian gets an English confirmation/receipt. This is a bigger scoping question than #16: **first needs a decision**, not just a fix — does the app currently know/store which locale a given order was placed in? If not, that's a small schema addition (a `locale` field on `Order`/`WineOrder`, set at submission time from the site's active locale) before the emails can even know which language to send in. Scope this properly (confirm the schema question) before writing translated email copy.

3. **A first full sweep**, not just the two known cases — run Part B's new scripts (below) once built, against the current codebase and the Staging Winery tenant's `SiteContent` rows, and fix whatever else they surface. Don't assume #16 and the emails are the only two gaps; nobody has looked systematically before.

---

## Part B — Build a repeatable check, so this stops being found by manual QA

Two independent failure shapes need two independent checks — one script wouldn't catch both.

### B1 — Static dictionary parity check (`lib/t.ts` and `lib/adminT.ts`)

A script (`scripts/check-i18n-parity.ts`, following this repo's existing `scripts/check-*.ts` convention) that loads both dictionaries and asserts: every key present under `en` exists under `ka`, and vice versa. Reports any mismatch by key name and which file. This is the cheap, fully-automatable half — a plain object-key diff, no heuristics needed. (The 2026-08-11 session log mentions an "890/890 keys, 0 missing either direction" check for `adminT.ts` during the #148 build — that was a one-off manual check, not a saved script; this formalizes it into something reusable and runnable anytime, on both dictionaries.)

### B2 — `SiteContent` seed-parity check (catches bug #131's shape)

A script that, for a given tenant, reads every key listed in `ContentClient.tsx`'s `FIELDS.*` arrays (the admin-editable field list) and checks the `SiteContent` table for both an `en` and a `ka` row. Flags any key with one locale but not the other. Run against Staging Winery in dev (mirrors how `scripts/test-rls.ts`/`check-rls.ts` already run against dev). This is the check that would have caught #131 months earlier instead of by manual QA.

### B3 — Raw-literal check (catches bug #16's shape) — best-effort, not airtight

Harder to fully automate: bug #16 wasn't a missing translation, it was a field that never called `t()`/`adminT()`/`fc()` at all — a plain string literal. A lightweight ESLint rule (or a grep-based script, simpler to start with) flagging suspicious JSX string-literal attributes (`title=`, `placeholder=`, inline button text) in `app/(site)/` and admin files that aren't wrapped in one of the three helpers. This will have false positives (some literals are genuinely fine — icons' `alt` text that's the same in both languages, etc.) so it's a "review the flagged list," not a hard CI gate, at least initially.

### B4 — Transactional email locale check

Once Part A #2 is scoped and built: a simple assertion (could be a small unit test, once item #3/CI exists — see `ArchitectureReview-2026-08-12.md` finding #3) that both email-sending functions require and branch on a locale parameter, so a future new email template can't ship English-only by omission the same way.

---

## Where these run

Until CI exists (`ArchitectureReview-2026-08-12.md` finding #3, also flagged as a to-do), these are manual scripts run the same way `check-rls.ts` is today — via `npx tsx scripts/check-i18n-parity.ts` etc., part of the pre-push checklist rather than automatic. Once CI is set up, B1–B3 are cheap enough to run on every push with no meaningful time cost; worth wiring in at that point rather than building a separate automation path now.

---

## Suggested order

1. B1 (cheapest, fully mechanical) — build first, run it, see what it finds.
2. Fix #16 directly (small, well-scoped).
3. B2 — build, run against Staging Winery, fix whatever it finds.
4. Scope the transactional-email locale question (Part A #2) — this one needs a decision (the `Order.locale` schema question) before it can be built, not just code.
5. B3 last — lowest signal-to-noise, most worth doing once the cheaper checks are already catching the bulk of the problem.

---

## Related

- [[ArchitectureReview-2026-08-12]] — finding #1 (formerly "two disconnected i18n systems"), the source of this plan
- [[MaintenanceNotes]] §1 — the `fc()` pattern and the seed-ka.ts convention this plan builds on
- [[KnownBugs]] — #16, #131
