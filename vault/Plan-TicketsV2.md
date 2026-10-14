---
tags: [plan, super-admin, tickets]
---

# Plan — Tickets v2: make the ticket tool intuitive, and make it hold our thinking

**Status: 🚧 APPROVED 2026-10-14 — all three tiers.**
- **Tier 1 ✅ built + verified on `staging` 2026-10-14** (FeatureLog #229, T-84 review card). Not on production.
- Tier 2 — next. Tier 3 + the production→staging forwarding — after Max OKs Decision 0 (revised).
- Still open with Max: Decision 0 (revised) below; MyToDo question (re-asked in plain words).

## Max's decisions (2026-10-14)
1. **Two boards, kept separate** — "all tickets [on staging] are created by me, so they are valid". Client reports from
   production should reach the staging board, ideally automatically, with their own prefix. → see **Decision 0 (revised)** below.
2. **All three tiers.**
3. **Client replies: on the page only.** An email to the client only when Max presses a "send confirmation" button.
4. (MyToDo question was unclear — re-asked in plain words.) **2026-10-15: yes** — test steps stay on tickets, MyToDo keeps
   non-ticket chores only (done: MyToDo header + ClaudeInstructions Rule 11). "In the future we may connect the ticket tool to Obsidian."
5. **2026-10-15: forwarding approved in principle** ("yes you can") — Max asked which route, given staging and production are
   deliberately separate. Answer + proposed route: see "Forwarding route" below (awaiting his OK on the details).

### Decision 0 (revised) — my recommendation for the two boards (awaiting Max's OK)
- **Production board = client reports only.** That's where the client-facing side lives: their status, your reply, the
  "send confirmation" button. Small, and nothing on it is yours or mine.
- **Every new production report is forwarded automatically to the staging board as `P-<number>`** (P = production; the number is
  the production ticket's own number, so P-12 is the same thing on both boards). Your own tickets stay `T-`. P-tickets carry a
  👤 Client mark and have their own one-tap view, so the "everything T- is mine" rule holds.
- **One-way, production → staging, pushed by production** right after the report is saved (fire-and-forget, a few seconds' timeout).
  If staging is down the client never notices; the production ticket shows "not forwarded" and a catch-up (`tix sync-prod` / a
  "Forward" button) sends it again. Production holds only a token that can *create tickets on staging*; staging holds no key to
  production — safer than staging reading production.
- **Back to the client is a deliberate act on production**: when the fix is merged, you (or Claude with your go) mark the
  production ticket resolved / write the reply there. The P-ticket on staging links to it. This matches 3.2 (client sees Resolved
  only when it's really live) without any automatic staging → production writes.
- Data: no new table — staging stores the production number in the existing `externalRef` (`prod:12`), plus a `CLIENT` source.

### Forwarding route (proposed 2026-10-15, awaiting Max's OK on the details)
Why the split exists: production holds real customers' data and must never depend on, or be reachable from, the test
side; the dev DB is the place where Claude, scripts and tests work freely. So the route must keep three properties:
**(a)** production never waits on staging, **(b)** staging holds no key to production, **(c)** customer personal data stays in production.
- **Route: production pushes to staging's ticket API over HTTPS** (the same `/api/tickets` Claude uses), right after the report is saved,
  fire-and-forget with a 3-second timeout. Direction of trust = from the protected side to the less-protected side, never back.
- **Its own narrow token**: can only *create a P-ticket* — cannot list, read, edit or close anything. Stored as a production env var
  (needs Max's go, part of the production runbook). If leaked, the worst case is junk tickets on the test board; revoke it in one step.
- **Minimum data crosses**: production number, title, the report text, type, tenant name, page path, and a link to the ticket on
  production. **Not** forwarded: submitter email / user id, browser, click trail, screenshots (they can show customer orders) — the
  P-ticket says "📎 1 screenshot — view on production".
- **If staging is down**: the client never notices; the production ticket shows "not forwarded" and a **Forward** button (and
  `tix sync-prod`) sends it again. Forwarding the same report twice is harmless (`externalRef = prod:<n>` is unique).
- Rejected: staging *pulling* from production (gives staging a key to production); Claude syncing by hand at session start
  (needs a production token on this machine and isn't automatic).

---

(Original analysis below, unchanged.)

**Status at writing: 📋 ANALYSIS — waiting for Max to agree on scope. No code changed.** (2026-10-14)
Builds on [[Plan-Tickets]] / [[Feature 222 - Internal ticket tool]] (v1, on `staging` + dev DB only; not on production).

Max's brief: everything opens a new page so you can't "click out"; images open in a new tab; it should be super intuitive,
icons instead of text, no duplication; it has few fields — it should also hold **our analysis and our solutions**.
"I don't want to build things for the sake of building them."

---

## 1. What I looked at

- All v1 code: board/list (`app/super-admin/tickets/TicketsClient.tsx`), ticket page (`[number]/TicketDetailClient.tsx`),
  service + API + CLI, the widget and the client-facing `/admin/my-reports` page.
- **How the board is really used** (dev DB, read-only, 83 tickets, 2026-10-14):

| Fact | Number | What it tells us |
|---|---|---|
| Ready to test | **13**, oldest 7 days | Testing is the bottleneck, not building |
| Verified → Done by Max (real ones) | **0** | The verify step is too heavy, or happens elsewhere (chat / MyToDo) |
| Comments written by Claude / by Max | **26 / ~0** (Claude's avg 207 chars, up to 636) | Max never writes in the tool; decisions happen in chat and Claude pastes them in |
| Comments that are really questions / decisions ("BLOCKED – question for Max", "Decisions so far…") | **≥ 9** | No proper place for questions, answers, decisions |
| Tickets with an empty description | **28 / 83** | The one free-text field isn't where the understanding lives |
| Labels used | only `test` (Playwright) | Labels as a feature: unused |
| `vault/MyToDo.md` | **1,602 lines**, repeating the review cards' "how to test" | Duplication: the same test steps live in two places |

Example of the problem — **T-12**: the real content is spread over 5 comments (decisions so far → a blocked question →
Max's answer pasted in → the review card with two more questions hidden in "left over" → a later behaviour change).
To know "what did we decide and what's left?" you have to read the whole timeline.

---

## 2. Findings

### A. Navigation and "clicking out" (your points 1 + 2)
1. **Every ticket is a separate page.** You lose the board, and because **filters are not kept in the URL, pressing Back resets
   them** (only Board/List is remembered). Checking 5 tickets = 5 page loads + re-filtering.
2. **Images are links to a new tab** (`<a target="_blank">`). Same problem as 1. The image links also **expire after 1 hour**
   (signed URLs), so a page left open shows broken images.
3. You can't **paste** a screenshot (Ctrl+V) or drag one in; Quick add can't take an image at all (v1 plan promised it).

### B. Duplication and clutter
4. **Status shown twice** on the ticket page (a coloured chip *and* a dropdown with the same value) and **on every board card**
   (column + a full-width dropdown under each card).
5. **Review card stored twice** ("what changed" is saved as the event text *and* in the card) — `tix show` prints it twice.
6. Title and description are **always open text boxes** — the ticket looks like a form, not a readable page. Plain text only:
   commit hashes, file paths, links and lists are not clickable / formatted.
7. **Field-change noise in the timeline** ("title changed: <whole old title> → <whole new title>"); 35 such entries.
8. The old **`/super-admin/bug-reports` pages still exist** next to Tickets (not in the menu, but live code doing the same job).
9. **Test steps live in two places**: review cards and `vault/MyToDo.md`.
10. Env banner is a full sentence repeated on every screen.

### C. Text instead of icons
11. Type, priority, source, status are words in chips; **7 dropdown filters in a row**. Priority is a dot with no legend.
    `lucide-react` is already installed — icons cost nothing.

### D. The ticket can't hold our thinking (your "write back our analysis / solutions")
12. A ticket has: title, one description, a timeline. There is **no place for**: what's really going on (analysis), the agreed
    solution, the decisions taken, the **open question waiting for you**, and links (plan doc, commits, KnownBugs #, related tickets).
    All of it ends up as long comments, in date order, mixed with status noise.
13. **Questions for you are invisible** — "BLOCKED – question for Max" is just another comment. Nothing on the board says
    "this one is waiting for your answer".

### E. Workflow
14. **"Ready to test" piles up** (13). The "how to test" is a paragraph; on a phone you test step by step and there's no way to
    tick steps or say *which* step failed.
15. **Staging vs production isn't tracked.** Rule 0 means a ticket can be "done on staging" for weeks before it ships.
    Nothing says *where a fix is live*, and there's no "what goes out in the next production merge" list — today that list is
    hand-written in each plan's runbook.
16. **Duplicates**: closing as Duplicate doesn't link to the original, and the reporter sees "Won't fix".

### F. Real clients (production)
17. On **My Reports** a client sees only their own text + a status word. **No reply from us, no "what we did"**, never told when
    it's fixed. That's the one place the tool talks to paying customers.
18. **"Resolved" would show too early**: the client's status follows the ticket, so marking Done after testing on *staging* would
    tell the client "Resolved" while the fix is not on production yet.
19. "Closed · Obsolete/Duplicate" shows the client **"Won't fix"**. My Reports dates still use `ka-GE` (KnownBugs #81).

### G. The structural question — two boards
20. When v1 ships, there will be **two separate boards with clashing numbers**: production (real clients' reports land there) and
    staging/dev (where all our work is tracked: T-1…T-83). "T-12" would mean two different things. A client report would have to be
    copied by hand to the work board, and its status copied back. **This needs deciding before anything goes to production.**

---

## 3. Proposal

Grouped so each part stands on its own. **Tier 1 changes no data — it's the UI you asked about.** Tiers 2–3 add a few fields.

### Decision 0 (yours) — one board or two
- **Recommended: one board, on production.** Tickets are operational data, not customer bookings. The production board is the
  real one; staging's board becomes a test sandbox. Claude reaches it through the same token API (scoped to tickets only, audited,
  cannot touch orders/bookings, cannot mark Done). **This needs a standing "yes" from you for one narrow thing — Claude writing
  tickets/comments/review cards on the production board** — an exception to Rule 0 that we'd write into ClaudeInstructions. The
  existing staging tickets are copied over once, keeping their T-numbers (production's old reports get numbers after them).
- Alternative: two boards, production reports mirrored into the staging board automatically (more code, two places to look,
  status sync both ways — the thing v1 deliberately avoided with Obsidian).

### Tier 1 — Intuitive UI, no data changes  *(your points 1 + 2, de-duplication, icons)*
| # | Change | Fixes |
|---|---|---|
| 1.1 | **Ticket opens in a side panel over the board** (full height on desktop, full screen sheet on a phone). Click outside / Esc / ✕ closes it and you're exactly where you were. URL becomes `?t=12` so Back closes it and links still work; ↑/↓ (or J/K) steps to the next ticket in the column. The full page stays for shared links, using the same component. | A1 |
| 1.2 | **Image viewer (lightbox)**: click a thumbnail → opens over the page, ← → between images, Esc / click out closes, pinch/scroll zoom. **Paste (Ctrl+V) and drag-and-drop** to attach, also in Quick add. Thumbnails on cards. Image links refreshed when they expire. | A2, A3 |
| 1.3 | **Filters live in the URL** + a few one-tap views instead of 7 dropdowns: **⏳ Waiting for me** (ready to test + questions), **👤 Client reports**, **🐞 Open bugs**, **All**. Rare filters (area, source, tenant) move into one "Filter" popover. | A1, C11 |
| 1.4 | **Icons, not words**: type (bug / sparkles / check / lightbulb), priority (signal bars, tooltip), source (person = client, sparkle = Claude, pen = you), env as a small coloured pill. Text remains in tooltips and for screen readers. | C11, B10 |
| 1.5 | **Show everything once**: status = one coloured control (no chip + dropdown); board cards lose the dropdown (drag on desktop, long-press / ⋯ menu on phone); review card shown once; title and description are **read mode until you click** (pencil), description rendered as light Markdown — links, lists, `code`, commit hashes clickable. | B4–B6 |
| 1.6 | **Quiet timeline**: field changes collapse into one grey line ("Claude changed area, title"), expandable. Comments and decisions stand out. | B7 |
| 1.7 | **Delete the old `/super-admin/bug-reports` pages** (everything they show is on the ticket). | B8 |
| 1.8 | Keyboard on desktop: `C` new ticket, `/` search, `Esc` close. | — |

### Tier 2 — The ticket holds our thinking  *(small schema change: 2 text fields + 2 dates; the rest uses the existing timeline)*
| # | Change | Fixes |
|---|---|---|
| 2.1 | **Ticket = a short document with fixed sections**: **Request** (the reporter's original words, read-only for client tickets) · **Analysis** (what's really going on, root cause, options considered) · **Solution** (what we agreed to do / did). Each section collapses when empty; Claude fills them via `tix` (`tix analysis T-12 …`, `tix solution T-12 …`) instead of writing long comments. The board card shows a ✓ when a ticket has an agreed solution. | D12 |
| 2.2 | **Questions for you are first-class**: Claude posts a *question* (optionally with answer buttons, e.g. "Exceptions only" / "Full copy"). The ticket gets a **❓ badge**, appears in **Waiting for me**, and you answer with one tap on your phone. The answer is recorded as a **decision** (who, when) and listed at the top of the ticket — "Decisions: per-vintage prices ✓, exceptions-only storage ✓". | D12, D13 |
| 2.3 | **Links** row on the ticket, with icons: plan doc (vault path), commits (clickable), KnownBugs #, **related tickets** (T-8 ↔ T-13 …). Claude adds them via `tix link`. | D12 |
| 2.4 | **"How to test" becomes a checklist** with tick boxes, an **Open on staging** button, and "Send back" pre-filled with the step that failed. You can test on the phone step by step. | E14 |
| 2.5 | **Where is it live** — a small marker on every ticket: *not shipped* → 🟡 *on staging* → 🟢 *on production* (Claude sets it when committing to `staging` / when you approve a merge). A **"Next release"** view = tested on staging, not on production yet → that's the production merge checklist. | E15 |
| 2.6 | **Retire the testing half of `MyToDo.md`**: "Waiting for me" *is* the test list. MyToDo keeps only non-ticket chores (e.g. "re-activate Rkatsiteli"). | B9 |

### Tier 3 — Clients (production)  *(small; depends on Decision 0)*
| # | Change | Fixes |
|---|---|---|
| 3.1 | **Reply to the reporter**: a "message to client" box on client tickets; shown on their My Reports page under their report (EN/KA as you write it). Optional email to them when it's resolved — you tick it per ticket, never automatic. | F17 |
| 3.2 | Client sees **Resolved only when the fix is live on production** (2.5), not when you verified it on staging. | F18 |
| 3.3 | **Merge duplicates**: "Duplicate of T-n" moves the report onto the original; the client follows the original's status (no false "Won't fix"). Obsolete shows the client "Closed", not "Won't fix". | E16, F19 |
| 3.4 | My Reports: fix the Georgian dates (#81), show their screenshot thumbnail. | F19 |

### Deliberately NOT proposed
Assignees, sprints, story points, due dates/SLAs, custom fields, a rich-text editor (light Markdown rendering is enough), client
reply threads (they'd be public untrusted input both ways — 3.1 is one-way on purpose), notifications to you beyond today's email,
two-way Obsidian sync. Labels stay but get no new UI (unused).

---

## 4. Suggested order and size

| Step | What | Data change? | Size |
|---|---|---|---|
| 0 | Max decides: one board (production) or two | — | — |
| 1 | Tier 1 (1.1–1.8) | none | medium — mostly the two client components |
| 2 | Tier 2 (2.1–2.6) + `tix` commands | 1 small additive migration (dev first) | medium |
| 3 | Tier 3 | maybe 1 small field | small |
| 4 | Production, per the v1 runbook ([[Plan-VerifyBeforeProduction]]) + the copy of staging tickets | **each step on Max's explicit go** | — |

Each step: built and checked on `staging` (desktop + phone screenshots, Playwright `tickets.spec.ts` updated), then a review card.

## 5. Questions for Max
1. **One board on production (recommended) or two?** If one: OK to give Claude a standing "yes" for ticket writes on production only?
2. Which tiers — all three, or Tier 1 first and decide the rest after using it?
3. Client replies (3.1): do you want the optional "it's fixed" email, or on-page only?
4. OK to retire the testing half of `MyToDo.md` once 2.4/2.6 exist?
