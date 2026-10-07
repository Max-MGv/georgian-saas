---
tags: [plan, super-admin, tickets]
---

# Plan — Internal ticket tool ("Tickets") for super-admin

**Status: 🚧 APPROVED 2026-10-07 (Max: "just build whatever you think will be most useful as an internal tool… take second and third
opinions from sub agents"). Supersedes [[Plan-BugBoard]] (the proposal Max answered with a broader mission).**

**Mission (Max):** an internal tool to manage tickets. One *source* of tickets is the registered bug/feature reports from the widget;
the rest is Max's and Claude's own work. "We have outgrown Obsidian for small features and tasks" → the tool becomes the working
record, and Obsidian can *read from it* (export), not the other way round.

## How the design was reviewed (per [[feedback_blind_reviews]])

I wrote my own design first (kept in the session scratchpad), then asked **three fresh sub-agents with only Max's words + the code**
(vault, git history, credentials fenced off) to design independently from different lenses: data model & migration safety,
product/workflow, security & operations. (A fourth attempt on a different model failed on a usage limit and was re-run.)
Then I verified their factual claims against the source and with live tests before relying on any of them.

| Question | My v1 | Agent opinions | **Decision** |
|---|---|---|---|
| Tickets = new table, or turn `BugReport` into the ticket? | New `Ticket`, intake kept separate | Data model: separate table, 4 reasons (public-input vs trusted work item; tenants see `BugReport.status`; duplicates; submit path untouched). Product: rename/generalise `BugReport`. | **Separate `Ticket`** (2 of 3 + me). |
| Report → ticket link | `Ticket.bugReportId` (1:1) | Data model: `BugReport.ticketId` so several reports can point at one ticket (duplicates) | **`BugReport.ticketId`** — theirs is better. |
| New reports | auto-create a ticket in Inbox | Data model: inbox = reports without a ticket, triage creates the ticket. Product: everything lands in Inbox | **Auto-create a ticket (status Inbox) on submit** — Max wants a title on each; simplest. |
| How Claude reaches the tool | local script with direct DB access | **All three: not direct DB** — authenticated HTTP API with a revocable token (bypasses audit, production credentials in the assistant's context, cascade hazards) | **Token API** + a thin CLI. I was wrong. |
| Review state | "Ready to test" column | Product: same, plus a *structured* review card (what changed / how to test / left over) and Verify / Send-back actions | **Adopted incl. structured card.** |
| Priority/labels/assignee | priority, area, labels | Skip assignee, points, sprints; priority + age order, not manual ranking | **No assignee, no manual rank** (priority then age). |
| Status enum | 6 | Product: Inbox/Todo/In progress/Review/Done/Closed; Data: fixed enum, keep it short | **Inbox · Backlog · In progress · Review · Done · Closed** |
| Tenant relation | plain id | Data model: real FK | **Plain `tenantId`** (project convention; avoids the cascade hazards in `DataModel/Dependencies`) — I keep my position here. |
| Security of the public submit path | — | Security: **found real holes**, see below | **Fix the cheap ones in this build.** |

### Security findings from the review (verified before acting)
- ✅ **CONFIRMED & FIXED separately, same day:** `BugReport` was readable/writable by anyone with the public anon key (KnownBugs #73).
- ✅ Confirmed by reading `bugReports.ts`: the public form **trusts `tenantId`, `submitterEmail`, `submitterUserId` from the client**
  (anyone can file as any tenant/admin, planted rows then show in `my-reports`); `tenantId` and the file extension go **unsanitised
  into the storage path**; **no rate limit**; the **comment is put unescaped into the notification email HTML**; `pageUrl` is any
  non-empty string rendered as an `href`; `image/*` accepts SVG. → all fixed in chunk 2.
- Noted, not built now: a durable (DB-backed) rate limiter; a retention policy for screenshots; prompt-injection stance for the
  assistant (ticket text is *data*, documented in `ClaudeInstructions`).

## Final design

**Tables (all additive; RLS on, no policy, anon/authenticated revoked — in the same migration):**
- `Ticket`: `number` (autoincrement, shown **T-42**, used in commits), `title`, `description` (plain text/markdown, rendered as text),
  `type` (Bug · Feature · Task · Idea), `status`, `priority` (Urgent · High · Normal · Low), `area` (fixed list), `labels[]`, `tenantId?`,
  `source` (Widget · Manual · Assistant · Import), `externalRef?` (unique, makes imports re-runnable), `closeReason?`
  (Won't fix · Duplicate · Not reproducible · Obsolete), `closedAt?`, timestamps.
- `TicketEvent`: append-only timeline — kind (Created · Comment · Status · Field · Review · Verified · Sent back), `body`, from/to,
  `actor` (max · claude · system · reporter), `meta` JSON (the structured review card: what changed / how to test / left over / commit).
- `TicketAttachment`: private bucket `ticket-attachments` (**must be created in BOTH Supabase projects** — lesson of KnownBugs #71).
- `TicketApiToken`: name, SHA-256 hash only, created/last-used/revoked. Plaintext shown once.
- `BugReport` gains `ticketId?`.
- Tenant-facing status stays on `BugReport.status`, **synced from the ticket by a fixed mapping** (Inbox/Backlog→New, In progress/Review→
  In progress, Done→Resolved, Closed→Won't fix) so `/admin/my-reports` is unchanged.

**Screens** (`/super-admin/tickets`): **Board** (columns by status; Done/Closed collapsed), **List** (dense, sortable, the daily
driver), **Review queue** (= status filter with a count badge — *your* queue). Filters: tenant, type, priority, area, source, text.
**Group by** tenant / type / priority / area. **Default = all tenants, everywhere** (tenant is a filter, never a separate board);
an environment banner (STAGING / PRODUCTION) so the two boards are never confused; last view remembered per browser.
**Ticket page:** editable title, field chips, description, screenshots, the **timeline** (comments, status changes, review cards),
and the **Review actions** — *Verified → Done* / *Not fixed → send back* (comment required). **Quick add** (title + optional text +
paste/choose photo; works on a phone in two taps) and **bulk add** (one ticket per line). Drag-and-drop between columns on desktop
(native, no new dependency) plus a status dropdown everywhere.

**API** (`/api/tickets…`, Bearer token, super-admin-equivalent, every call audited as the token's name): list/filter, read, create,
patch fields/status, comment, post review card. No delete, no raw SQL. Separate token per environment; Claude defaults to staging.
**CLI** `saas/scripts/tix.ts` (calls the API; reads its token from `credentials.txt`): `list`, `show`, `add`, `comment`, `move`,
`review`, `export`. **`tix export` writes `vault/Tickets.md`** — an auto-generated, read-only snapshot so Obsidian reads from the tool.

**Hardening of the public submit path** (chunk 2): tenant from the request host (`x-tenant-id` set by `proxy.ts`), submitter from the
session, never from the form; sanitise storage path + extension; image allow-list (PNG/JPEG/WebP/GIF, no SVG); escape the email HTML;
validate `pageUrl` as http(s) on write and render; rate limit via the existing limiter; link base from config, not the `Host` header.

**Deliberately NOT built:** sprints, epics, points, assignees, custom fields/workflows, notifications, per-user accounts, ongoing
Obsidian sync (two sources of truth is how trackers die — one-off import + one-way export only).

## Build order (each chunk verified before the next; staging before production)

| # | Chunk | Notes |
|---|---|---|
| 1 | Schema + migration (dev) + RLS lock + `ticket-attachments` bucket (dev) | stop dev server first (Rule 10) |
| 2 | Core logic: ticket service, status mapping, events; submit path hardened + creates a ticket; backfill + **titles for every existing report** | production writes only after staging verified |
| 3 | UI: list, board, filters/group-by, ticket page + timeline + review actions | match dark super-admin style; phone-friendly |
| 4 | Quick add, bulk add, attachments, drag-and-drop | |
| 5 | API + token + `tix` CLI + export; one-time import of open vault items | |
| 6 | Tests (Playwright + API script), mobile + desktop screenshots, fresh-eyes code review by a blind sub-agent | |
| 7 | Production: migration, bucket, backfill, token → merge to `master` | **🛑 ONLY AFTER MAX'S EXPLICIT "GO" FOR THIS STEP** (2026-10-07: Max asked to be sure nothing reaches `master` unasked). Everything in chunks 1–6 lives on `staging` + the dev DB only. Additive; deliberate separate steps (Rule 0) |

## Open for Max later (not blocking)
Area list wording; whether `Idea` should be a type or just a label; whether a weekly "Review items older than 3 days" digest is wanted.

## Independent code review of the finished build (2026-10-07) — what it found and what was done

A fresh blind sub-agent (vault fenced off, no hints) reviewed the whole build. Claims were verified against the source before acting.

**Fixed:** (1) **proxy header forgery** (KnownBugs #75 — existing code, not just the new tool); (2) **crafted breadcrumbs could crash a ticket page** — now sanitised on submit;
(3) **token could create inconsistent tickets** (create as Closed with no reason, put a ticket in Ready to test without a card, reopen what Max verified, close a reporter's ticket, change tenant) —
now: tickets start only in Inbox/Backlog/In progress, the token cannot do Done/Ready to test/touch finished tickets/close reporter tickets/change tenant, tenant must exist;
(4) **PATCH was not atomic** — everything validated before anything is written; **status changes now use optimistic concurrency** (a concurrent change fails with a clear message instead of both "succeeding");
changing a Closed ticket's reason is honoured; (5) **page could write back an older title/description/labels** — fields now re-sync from the server unless you were typing in them;
(6) old four-value dropdown can no longer drag a ticket backwards; `run()` can no longer leave controls locked; clean 400s for huge/odd ticket numbers and `null` bodies; 409 on duplicate `externalRef`;
attachments no longer count as comments; dialogs get role/Escape/labels; group-by-tenant sorts by name; API list reports `total`/`truncated`, `tix export` warns when incomplete;
**prompt-injection hygiene:** Widget ticket text is marked untrusted in the API (`untrustedText`), in `tix show/list/export`, and control characters are stripped; local dev no longer emails Max on every widget report.

**Deliberately not done (noted for later):** re-pointing a duplicate ticket's reports to the original (a ticket closed as *Duplicate* still shows the reporter "Won't fix");
the board loads every ticket (fine at today's ~25; add "last N days" for Done/Closed past ~1,000); orphan files if a DB write fails after an upload; a durable (DB-backed) rate limiter.
