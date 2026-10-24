---
tags: [handoff, production, T-215]
---

# Handoff — T-215 (order page editing) to production

> **UPDATE 2026-10-24 (late): SHIPPED.** `master` = `1a34c4e`, live on production, live-checked read-only, `tix ship T-215`
> done. Only thing left: Max publishes the hidden 2026-10-24 release-note draft (production board). Details: SessionLog
> 2026-10-24 (late). The text below is the original pre-release handoff, kept for history.

Written 2026-10-24 for a fresh agent with no context. **Nothing in this file is on production yet.** Rule 0:
every production step needs Max's explicit "go" for that step, in chat.

## 1. Read first (in this order)

1. `vault/ClaudeInstructions.md` — Rule 0 (prod needs explicit go per step), Rule 0b (DB safety, backups before
   every write), Rule 1 (keep the vault updated), **Rule 12** (new this session — review + mockup before building
   a UI change, edge-case QA before handover, test-harness hygiene, screenshots on every release-note entry).
2. `C:\Users\Max\.claude\projects\C--Users-Max\memory\MEMORY.md` and the feedback files it links.
3. **`vault/Max-Exploring-Workflows.md`** — the full blow-by-blow of this session: the rest of the T-152 release,
   the release-note screenshot saga, and the entire T-215 build (3 rounds — the first two were the wrong shape;
   read it so you don't repeat the mistake of skipping the sibling-screen review before building). Max asked for
   this file explicitly because he felt kept in the dark about a temporary git worktree used mid-session — read
   its "temporary folder" section if he asks about that again.
4. `vault/Plan-OrderPageMirror.md` — the design doc: the gap table (what the order page couldn't edit vs. the
   booking forms), Max's decisions (click-to-edit everywhere, red pencil icon, one Name box, company changes
   re-price and lock once paid), and the QA section (5 real bugs found + fixed, listed with their fixes).
5. `vault/Plan-PricingModel.md` Chunk 12 — T-152's already-closed production runbook, for the exact command
   patterns (backup, `migrate deploy` with the right config, read-only verification) this release will reuse.

## 2. What is shipping

**T-215** (Feature/ticket on the staging board): the admin order page (`/admin/orders/[id]`) now mirrors the
public booking form and New Order. Every card — Booking Info, Contacts, Guest Breakdown, Masterclass, Extras — is
read-only until its red pencil icon is clicked (one card at a time, Save/Cancel). Specifically:
- **Booking Info**: day-first date (`DateInput`), time, company (or switch to Individual — re-prices from the new
  price table, refused once paid), nationality tags, internal notes.
- **Contacts**: every contact type (Contact Person, Guide, …) with a "Choose the …" picker of the company's saved
  people (autofills name/phone/email), same as New Order; one Name box. Empty types show "—", not nothing.
- **Guest Breakdown / Masterclass / Extras**: edited in place; locked once the order is paid.
- Side panel (`OrdersTable.tsx` Edit Order) and New Order both switched to one Name box + the shared `DateInput`
  for consistency.

**No database migration.** This is a pure code change — 19 files, server actions + client UI + two shared bug
fixes (`lib/isoDate.ts` catches impossible calendar dates like 31/02 that `new Date()` silently rolls over;
`lib/contactResolution.ts` now gives admin screens the "Choose the Guide" list even when personal access codes are
switched on, which it had been silently withholding).

## 3. Current state (2026-10-24, end of session)

- `staging` branch = deployed on staging.vineworks.ge (dev database), latest commit `159ad77`.
- `master` / production: **untouched since the T-152 release** (which finished earlier this session — see
  Max-Exploring-Workflows.md Part 2). Still at `497bdc7`.
- Tests: `tests/_qa/t215-mirror.spec.ts` 3/3 (DB-checked); `tests/_qa/t215-qa-edge.spec.ts` (31 hand-written
  edge cases through the real UI) 31/31 after fixing 5 real bugs; `test-contact-resolution.ts` 27/27; the full
  local regression suite (tiers 1–4, 77 specs) is green — the 6 failures found on the first run were investigated
  one by one and were **not** T-215 regressions (2 stale tests from the already-shipped T-152 pricing-rule change
  and date-format change, 1 test-timing bug, the rest environmental/process — full breakdown in
  Max-Exploring-Workflows.md Part 9).
- **Update (later 2026-10-24, second session):** items 1 and 2 below are now DONE — tier 5 = **7/7** on staging after two
  test fixes (commit `812dc56`: Flitt typing retry + extras spec Save click; see SessionLog 2026-10-24 (late) and
  `playwright/KNOWN-ISSUES.md`), and 5 real before/after pairs are in `C:\Users\Max\Downloads\T215-release-shots\` (see the
  SessionLog). They are **not uploaded anywhere yet** — uploading + drafting the release note is a production write that needs
  Max's go. Only item 3 (Max's own staging check) and the production steps remain.
- **Not yet done (items 1–2 now done, see above):**
  1. **Tier 5 (real Flitt payments) full re-run on staging** — only the one touched spec
     (`payment-post-payment-extras`) was re-run after the QA fixes landed; the other tier-5 specs predate them.
  2. **Release-note screenshots redone properly.** The last release note (for T-152) used 20-Oct dev screenshots
     as a stand-in because a DB migration made a true before/after impossible at the time. T-215 has no migration,
     so a real before/after is possible now — do this before drafting T-215's own release note.
  3. **Max's own staging check of T-215** — the ticket has a `tix review` card with 9 steps + a follow-up comment
     with 3 more edge-case checks (remove a guide and Save, add+remove a masterclass line then Cancel, type 31/02).
- Tickets (staging board): T-215 is "Ready to test" with Max's test steps and the QA-round comment.

## 4. Due process (non-negotiable — same as every production release here)

- Ask Max for an explicit go **before each production step**, one at a time; report each step's result before
  asking for the next.
- **Backups:** the hook backs up automatically before DB-writing commands and before `git push` to `master`/
  `master` merges — let it run. T-215 ships no migration, so the only prod DB write is whatever the hook does
  automatically around the `master` merge itself (a safety net, not a step you need to script).
- **Safety hooks** block destructive DB commands — never retry around a block, tell Max.
- Production commands use `saas/.env.prod.backup` loaded into the shell for that one command only; `saas/.env` is
  dev.
- Never commit `saas/scripts/_qa/`, `saas/tests/_qa/`, or any `t215-debug-*.spec.ts` — all untracked by design.

## 5. The production steps (draft — Max has not approved this runbook yet)

Unlike T-152, this release has **no migration**, so the runbook is much shorter:
1. Max's go to merge `staging` → `master` (after his own staging check of T-215 above, and after tier 5 + real
   release-note screenshots are done).
2. Merge + push `master` (the hook backs up prod automatically because it's a push to `master`). Wait for the
   Vercel production deployment to report READY.
3. Read-only live checks: open a real order on `nikalasmarani.vineworks.ge/admin/orders`, confirm the red pencils
   render, confirm a card opens and the Save/Cancel buttons are present — **do not actually save a change** to a
   real customer's order without Max's separate go for that specific click, since this is a live database.
4. `tix ship T-215 --yes-prod` once Max confirms the live check is good.
5. Draft/publish the release note for T-215 on the **production** board
   (`nikalasmarani.vineworks.ge/super-admin/releases`) with real before/after screenshots per Rule 12.

**Window note:** none — this release is just code, so there's no multi-step migration window to worry about,
unlike T-152's expand/contract sequence.

## 6. Things to know

- Max switched models mid-session (`/model`) — Opus 5.5 → Sonnet 5.5 → Sonnet 5. Not relevant to the work, just
  explains if tone/style shifts partway through `Max-Exploring-Workflows.md`.
- Max is actively testing your process, not just the code — he asked "did you QA test this like a tester?" and
  "where did you save that?" mid-session. Over-communicate what you tested and where things are recorded; don't
  assume he'll take "it's done" on trust.
- The project's temp/debug files convention: one-off debug specs and QA scripts go in `saas/tests/_qa/` /
  `saas/scripts/_qa/`, untracked, never committed, left on disk for the next session to find or delete. A
  temporary `git worktree` (a second checkout of another branch) is fine to use for comparisons but **tell Max
  before or as you create one** — this session learned that the hard way.
