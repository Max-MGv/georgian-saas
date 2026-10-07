---
tags: [feature, super-admin, tickets]
---

# Feature 222 — Internal ticket tool (Super Admin → Tickets)

Design + reasoning: [[Plan-Tickets]] (reviewed by three independent blind sub-agents before building).
**Status: built on `staging` + the dev database. NOT on `master`, NOT on the production database — the production steps need Max's explicit go ([[ClaudeInstructions]] Rule 0).**

## What it is

One place for every bug, feature, task and idea, for Max *and* Claude — replacing the flat bug-report inbox and most of the hand-kept
checklists in Obsidian. Widget reports are just one **source**; tickets can also be added by hand, by Claude, or imported.

- **Board / List** (`/super-admin/tickets`): columns `Inbox · Backlog · In progress · Ready to test · Done · Closed`. Done/Closed collapse.
  Move a card by dragging (desktop) or the status dropdown on every card (phone). List view: sort, **group by** tenant / type / priority / area / status.
- **Filters:** tenant (all combined by default — tenant is a filter, never a separate board), type, priority, area, source, text search,
  and a one-click **Ready to test** queue = *your* review list. An env banner (LOCAL / STAGING / PRODUCTION) is on every ticket screen.
- **Ticket page:** title, status/priority/type/area/tenant, labels, description, screenshots (add more), the original widget report's
  technical context, and a **timeline** (comments, status changes, edits, review cards). **Review flow:** the doer posts a *review card*
  (what changed / how to test / left over / commit) → ticket moves to **Ready to test** → Max presses **Verified → Done** or **Not fixed →
  send back** (a note is required). Closing needs a reason (Won't fix / Duplicate / Not reproducible / Obsolete).
- **Quick add** (title + Enter, phone-friendly) and **bulk add** (one ticket per line).
- **Widget reports → tickets automatically** (status Inbox, source Widget, screenshot attached). The tenant-visible status on
  `/admin/my-reports` follows the ticket through a fixed mapping, so that page is unchanged.
- **Claude's access:** `/api/tickets` (bearer token, hashed in the DB, per environment) + the CLI `saas/scripts/tix.ts`
  (`list · show · add · comment · move · review · export`). The token **cannot set Done** (only Max verifies) and the CLI refuses
  production writes without `--yes-prod`. `tix export` writes the read-only snapshot `vault/Tickets.md` so Obsidian can read the board.

## Files

`prisma/schema.prisma` + migrations `20261007120000_lock_bug_report_from_rest_api`, `20261007143059_add_tickets` · `lib/tickets.ts`
(constants, labels, status mapping, helpers) · `lib/ticketService.ts` (the ONLY writer) · `lib/ticketApiAuth.ts` · `app/actions/tickets.ts` ·
`app/actions/bugReports.ts` (hardened submit + ticket creation) · `app/api/tickets/**` · `app/super-admin/tickets/**` ·
`app/super-admin/layout.tsx` (nav wraps on phones; "Tickets" link; wider content) · `proxy.ts` (exempts `/api/tickets`) ·
`scripts/tix.ts`, `ticket-token.ts`, `backfill-tickets.ts` · `tests/tier3-admin-smoke/tickets.spec.ts`.

## Decisions worth keeping

- **Separate `Ticket` table; `BugReport` stays the raw intake** (public untrusted input; tenants see its status; many reports can point at one ticket via `BugReport.ticketId`).
- **Claude uses the HTTP API, not the database** (all three reviewers: no production credentials in the assistant's context, every call audited as the token's name).
- **Done = Max verified.** The token API refuses `DONE`; the doer hands over with a review card.
- **No assignee, sprints, points, manual ranking, notifications** — priority then recency orders a column. One-way export, not two-way sync, to Obsidian.
- **Every new server-only table gets RLS-on-no-policy + revoke anon/authenticated in its own migration** (the `BugReport` hole, KnownBugs #73).

## Verification (2026-10-07)

Everything on staging was scrutinised before any production step: see [[Plan-VerifyBeforeProduction]] (layers 0–8, all passed; findings fixed, including a React hydration mismatch #418 that only showed in a production build — timezone pinned to Asia/Tbilisi, ages marked client-only, re-checked live on staging). Playwright: `playwright/notes/19-tickets.md`. Also see [[Plan-Tickets]].

## Production steps still to do (each needs Max's explicit go)

**Order matters — the full runbook is in [[Plan-VerifyBeforeProduction]]; bucket + migration come BEFORE the code merge.**

1. `prisma migrate deploy` on production (the `add_tickets` migration is the one still pending; the BugReport lock is already applied).
2. Create the private bucket `ticket-attachments` in the **production** Supabase project (lesson of KnownBugs #71).
3. Backfill existing production reports into tickets + write proper titles (`scripts/backfill-tickets.ts`, then a titles pass).
4. Create the production API token (`scripts/ticket-token.ts create claude`) and store it in `credentials.txt`.
5. Merge `staging` → `master`.

## What to test (on staging, on your phone too)

Board loads with your 15 real tickets; drag a card / use the dropdown on a phone; open T-10 → Verified or Send back; Quick add; Bulk add;
filter by tenant; List → group by type; add an image to a ticket; Closed asks for a reason; send a report with the bug widget on a
public page → it appears as a Widget ticket.
