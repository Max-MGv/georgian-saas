---
tags: [plan, super-admin, bug-reports]
---

# Plan — Internal Jira-style board for bugs & feature requests (super-admin)

**Status: 📋 PROPOSED 2026-10-07 — nothing built. Waiting for Max's answers to the questions at the bottom (ClaudeInstructions Rule 8).**

**Trigger (Max, 2026-10-07):** "an internal Jira-board-style thing for superadmin to manage all bug/feature requests — for
example today I added a bunch of stuff I needed to review."

## What exists today (so we build on it, not beside it)

The bug/feature **widget → inbox** pipeline already works end to end ([[Plan-BugReportWidget]], Feature 155; fixed on production
2026-10-07, KnownBugs #71/#72):

| Piece | Where | Does |
|---|---|---|
| Floating widget (public site, tenant admin, super-admin) | `components/BugReportWidget.tsx` | Bug / Feature, comment, one screenshot, click breadcrumbs |
| Save + email | `app/actions/bugReports.ts` `submitBugReport` | Row in `BugReport`, screenshot in a private bucket, email to max@ |
| Inbox | `/super-admin/bug-reports` | **A flat list** with 3 filters (type, status, tenant) |
| Detail | `/super-admin/bug-reports/[id]` | Full comment, signed screenshot, breadcrumb timeline, **status dropdown** (New / In Progress / Resolved / Won't Fix) |
| Tenant view | `/admin/my-reports` | Each tenant admin sees only the status of reports *they* sent |

`BugReport` columns today: type, status (4 values), surface, comment, one screenshot, breadcrumbs, pageUrl, userAgent, tenantId,
submitter. **Missing for a real board:** a title, priority, labels/area, an owner, a "needs Max's review" state, several
screenshots, comments/history on a card, a way to create a card by hand, ordering inside a column, and any link to the work done.

## Why (the problem it solves)

You test constantly (phone screenshots, ideas while using the site) and the work happens across three places: the widget inbox,
my vault notes (`KnownBugs.md`, `MyToDo.md`), and chat. Nothing answers "what is waiting on me?" or "what did Claude fix that I
haven't checked yet?" in one glance. Today's session is the example: 9 phone screenshots → 7 fixes → a test checklist in
`MyToDo.md` — the *state of each item* lived only in my notes.

## Proposed shape

### 1. Board view (the Jira part)
`/super-admin/bug-reports` gets a **Board | List** toggle (List = today's inbox, kept). Board = columns by status, cards show
title, type tag (Bug/Feature), priority dot, tenant, screenshot thumbnail, age. Filters: type, tenant, priority, area, "mine".
Move a card by **dropdown** (works on a phone) and by **drag-and-drop on desktop**. Same dark super-admin styling.

**Proposed columns** (replaces the 4 statuses):
`Inbox` → `Backlog` → `Doing` → **`Ready to test`** → `Done` ; plus `Won't fix`.
*"Ready to test"* is the important one: it is **your review queue** — whatever Claude (or a developer) has finished but you
haven't confirmed yet. It replaces the hand-maintained checklist in `MyToDo.md`.

### 2. Real cards
Short **title** (auto-filled from the first line of the comment for widget reports), **priority** (e.g. Critical / High / Normal /
Low), **area** label (Orders, Wine orders, Settings, Booking form, Payments, Super-admin, …), **several screenshots** (paste or
upload, phone-friendly), a **comment thread / activity log** ("moved to Ready to test", "Claude: fixed in commit abc, how to
test: …"), optional **link to commit / vault note**.

### 3. Quick add
A "+ Add" box at the top of the board: type a line, paste a screenshot, pick Bug/Feature — card created in `Inbox`. **Bulk
add:** paste several lines, one card per line (the "I added a bunch of stuff" case). Widget reports keep landing in `Inbox`
automatically, as now.

### 4. Claude can work the board (needs your decision — Q2)
Today Claude can't see the inbox. Proposal: a small script (`saas/scripts/board.ts`, run locally) that can **list** cards, **read** one
with its screenshots, **add a comment** and **move a card** — so a session can start with "work the Backlog items tagged for
Claude", and finish by moving each card to `Ready to test` with *what changed and how to test it*. Reads are free; **writes to
production would ask you first** (same rule as everything else on production).

### 5. Tenants keep a simple view
`/admin/my-reports` stays, with the new statuses mapped to words a winery understands (Received → In progress → Fixed /
Not planned); `Ready to test` and `Backlog` just show as "In progress". Internal fields (priority, labels, comments) are never
shown to tenants.

## How (build order — each chunk shippable on its own, staging first)

| # | Chunk | Contents | Size |
|---|---|---|---|
| 1 | **Schema** | One migration: add `title`, `priority`, `area`, `rank`, new status values; new `BugReportComment` and `BugReportAttachment` tables. All **additive** — existing rows keep working. | S–M |
| 2 | **Board + List toggle** | Columns, cards, filters, move by dropdown, tenant-view status mapping | M |
| 3 | **Card detail upgrade** | Title/priority/area editing, comment thread + activity log, several screenshots | M |
| 4 | **Quick add + bulk add** | Create by hand, paste image, one-card-per-line; phone-friendly | S–M |
| 5 | **Drag-and-drop** (desktop) | Reorder inside a column + move between columns | S |
| 6 | **Claude script** | `board.ts` list / show / comment / move; documented in `ClaudeInstructions.md` | S |
| 7 | **Import** | One-time import of the *open* items in `KnownBugs.md` / `MyToDo.md` so the board starts with real content | S |

## Risks & things to get right

- **Production database change.** Chunk 1 is a migration → `prisma migrate dev` on dev (dev server stopped first, Rule 10),
  verified on staging, then `migrate deploy` on production as its own deliberate step (Rule 0). Additive only, so it can't
  break live reports in between.
- **Status words are used in several places** (inbox filters, detail dropdown, `my-reports`, the notification email). All must move
  together — I'll list them in `MaintenanceNotes` when built.
- **No tenant RLS on these tables, on purpose** (like `BugReport` today, see `RLS-Architecture.md`) — which means *every* read
  path must stay behind `requireSuperAdmin()`; the new comment/attachment tables get the same treatment and an explicit check.
- **Two databases, two boards.** Production reports live in the production DB; staging has its own noise. The real board is the
  **production** one; staging's is for testing the board itself. (A board you edit on staging would never reach production.)
- **Don't over-build.** It's a one-person tool today. Sprints, epics, story points, assignees-per-person, notifications are
  deliberately **out** unless you ask.

## Questions for Max (answers change what gets built)

1. **Columns:** is `Inbox → Backlog → Doing → Ready to test → Done` (+ `Won't fix`) right? Especially: do you want **"Ready to test"
   as your review queue**?
2. **Claude + the board:** should I be able to read/move/comment on cards from a session (chunk 6)? Recommended: yes — reads
   anytime, production writes only after you say so.
3. **Priority scale:** Critical / High / Normal / Low — fine, or do you prefer P1–P3, or none?
4. **Areas:** start with Orders, Wine orders, Companies, Settings, Booking form, Payments, Public site, Super-admin, Demo, Other —
   anything to add or drop?
5. **Drag-and-drop** on desktop in addition to the dropdown — want it, or is the dropdown enough for v1?
6. **Bulk add** — one idea per line, one card each — useful to you, or too fiddly?
7. **Import** the currently-open items from `KnownBugs.md` / `MyToDo.md` as the board's first cards (chunk 7)?
8. **Who else uses it?** Only you, or should another person (a developer, a tenant owner such as Nikalas) ever see/comment? This
   decides whether we need real users/roles — recommended for now: **just you.**

## What I'd do first, once approved

Chunk 1 + 2 on dev → staging, so you can look at the board with your real reports in it, then iterate on the look before
chunks 3–7. I'd show a screenshot of the board before wiring the next chunk.
