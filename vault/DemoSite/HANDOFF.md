---
tags: [handoff, demo, vineworks]
---

# Handoff — the demo flow-fix plan is finished

**How to use this:** copy the block below into a fresh Claude Code session. It is written to be
self-contained.

**Supersedes** the "finishing Chunk 4" handoff. Written 2026-09-11, session 12.

**The state is simple now, which is a change.** Every previous version of this file had to open
with a warning about half-shipped work. There is none. All eight chunks of
`Plan-DemoFlowFixes.md` are on `master` and verified on `demo.vineworks.ge`; `staging` and
`master` are at the same commit (`0919a6a`).

**What is left is Max's, not a session's.** Two items, both behind logins Claude may not pass.
Neither is a coding task, and a session should not try to work around them.

---

## The prompt

~~~
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). The public sales demo
at demo.vineworks.ge has just had a full round of flow fixes finished and shipped.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave on this project. Rule 0 (git: staging before master for SHARED files) and
   Rule 8 (confirm before editing) both apply.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\SessionLog.md — the session 12 entry
   at the top is what just happened.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MyToDo.md — the two things waiting
   on Max. If he has not done them, remind him rather than trying to do them yourself.
4. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md §12, §13, §15
   and §16 before touching anything demo-related. §15 is the palette module (no demo component
   may carry its own hex); §16 is the second place demo chrome mounts, which is easy to miss.

WHERE THINGS STAND:
All eight chunks of vault/DemoSite/Plan-DemoFlowFixes.md are ✅ Done, shipped to `master`, and
verified against the deployed site. `staging` and `master` are both at 0919a6a. There is no
half-shipped work and nothing parked. The plan file is now a record, not a to-do list — but read
its per-chunk "Notes / decisions", because they carry every measurement and every anti-pattern.

STILL OPEN, AND THEY ARE MAX'S:
  (a) The new "Reset demo now" button in super-admin (/super-admin/tenants) has never been
      pressed. Its underlying function IS verified — the real reseed was run against the dev
      database and watched to clear the onboarding wizard, 4 settings → 0 — but the button
      itself sits behind the super-admin login, which Claude may not pass. Ask Max to press it
      once. Do not try to log in.
  (b) Staging Winery's ADMIN pages have still not been looked at by a human: /admin/orders under
      the new one-line cell truncation (the one change in this batch that affects every tenant,
      not just the demo), plus /admin/statistics and /admin/companies outstanding since Chunk 4.
      Its PUBLIC pages were checked on the staging preview at every step and are clean.
  (c) One decision, not urgent: the demo's bookings page now carries a three-number revenue
      strip (upcoming / future revenue / next order). It is demo-only on purpose. Max has not
      said whether every winery should get it. If he says yes, it needs its own small design
      pass — do not just widen the `if`.

HOUSEKEEPING, IF STILL PRESENT:
Chunk 1's verification left a real test booking in the live demo — "Luka Testashvili", 4 guests,
20 Oct 2026. It has survived several nightly reseeds, which is itself suspicious: the 03:00 UTC
job wipes and rebuilds trading data, so a booking that persists through it is a reseed bug worth
its own look, not just a stray row. Ask Max before deleting anything — it is a production write.

TWO FINDINGS THAT SHOULD OUTLIVE THIS PLAN:
1. **A timeout is a guess about someone else's latency.** The tour's missing rings (6 of 7 steps,
   shipped and invisible for weeks) were one 60ms setTimeout racing the route paint. All seven
   `data-tour` anchors existed the whole time — the plan's premise that they were missing was
   simply wrong, and ten minutes of asking the live DOM replaced it. The fix is
   saas/lib/demoAnchor.ts: a MutationObserver with NO deadline, plus a poll whose budget decides
   only when to *warn*. **Do not replace that observer with a longer timeout.** That guess is the
   original bug, and this codebase has now made it twice on the same feature.
2. **Measure the before-state first.** Chunk 7 was scoped as "hide two columns"; measuring showed
   the one-line truncation did the work (tallest row 147px → 80px, and 85px even with the columns
   switched back on) and the hiding was cosmetic on top. Ground rule 5 — "dev passing is not
   evidence" — has now cost this project five bugs.

RULES THAT ACTUALLY BITE HERE:
- Demo-only files (gated on DEMO_TENANT_ID) go straight to `master`. Shared files take the
  `staging` pass first, with a Staging Winery regression check. The route is decided per change,
  not per session, and it has inverted between chunks more than once.
- localhost resolves to DEFAULT_TENANT_ID in saas/.env, currently Staging Winery
  (cmrxb85wo0000vlc0d964nzf8), which renders NO demo components at all. To preview the demo
  locally, temporarily point it at the DEV demo tenant cmtvgl6e60000vl6w9se65t86, and REVERT
  before committing. Back the file up first and diff it against the backup.
- Console buffers and localStorage both persist across same-origin navigations. Anything
  once-per-browser must be re-tested from a CLEARED store, not from a reload. The tour's state
  lives under `vineworks-demo-tour`; the front door's under `vineworks-demo-frontdoor`; the
  orders table's column prefs under `orders-columns`.
- Stop the dev server before any prisma command (ClaudeInstructions Rule 10).
- When editing vault markdown with a script, build the new content in full and only then replace
  the original. A script that opened Plan-DemoFlowFixes.md for writing and then hit an encoding
  error truncated it to 0 bytes in session 11. Write the script to a UTF-8 file rather than
  piping it through a heredoc — the shell mangles em dashes on this machine.

WHAT A NEXT SESSION WOULD ACTUALLY PICK UP:
Nothing in this plan. Candidates, in no particular order:
- The deferred items at the bottom of Plan-DemoFlowFixes.md, including Max's theme-preset
  catalogue request.
- The disposable-tenant-per-visitor question, still open in Plan-DemoRedesign.md. Chunk 8 made
  the shared sandbox honest but did not settle it; two visitors running the setup wizard at once
  still collide.
- Mobile layout for the demo. Explicitly out of scope for the whole flow-fix plan — Max ruled
  "desktop now, mobile later" — so it is untouched and will look it.
- Anything in KnownBugs.md that is not demo-related. #22 (wine-order total computed from
  client-supplied prices) is a real security issue and is still open.
~~~

---

## Why this handoff is shaped the way it is

**It opens by saying there is nothing parked.** Every previous version had to lead with a warning
about half-shipped work, and a session that expects one will go looking. Saying plainly that
`staging` and `master` are at the same commit is the fastest way to stop that.

**It separates "left to do" from "left for Max".** All three open items need a human with a
login or an opinion. A session that treats them as tasks will either try to get past a login it
must not, or make a product decision that is not its own.

**It carries the two anti-patterns, not the two features.** What the tour does is in the code.
What this project keeps getting wrong — guessing at latency, and building before measuring — is
not, and it has cost five bugs so far.
