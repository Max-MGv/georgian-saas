---
tags: [handoff, demo, vineworks]
---

# Handoff — finishing Chunk 4, then Chunk 5

**How to use this:** copy the block below into a fresh Claude Code session. It is written to be
self-contained — a session with no memory of Chunks 1–4 can start work from it.

**Supersedes** the Chunk 4 handoff (Chunk 4 is built; 4.1–4.6 are done and on `staging` as
`9d3a2b2`, vault as `c7bc1d5`). Written 2026-09-11, session 11.

**The shape works for every chunk.** To produce the prompt for Chunk N, swap the task line,
replace the "what you don't need to re-derive" section with that chunk's recorded findings, and
re-check the ship route in the plan's status table — it differs per chunk and is not a guess.

**⚠️ The state is unusual: a chunk is half-shipped.** Chunk 4's code is written, typechecked,
verified locally and on the staging preview, and **committed to `staging` but not merged to
`master`**. So the demo site in production still has the old broken behaviour. Do not re-fix it
— read the diff first.

**⚠️ Two things block the merge, and both need Max, not Claude.** They are listed in the prompt.
Neither is a coding task.

---

## The prompt

~~~
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). Continue the public
sales demo fixes at demo.vineworks.ge.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave on this project. Rule 0 (git: staging before master) and Rule 8 (confirm
   before editing) both apply.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Plan-DemoFlowFixes.md
   — THE TASK TRACKER. Read the status table, the ground rules, "Decisions already made", then
   Chunk 4 in full. Its per-step audit table and its "Notes / decisions" are the record of what
   was actually found, and they contradict what the chunk was originally scoped as.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md §12 and §4.
   §12 is the map of where every data-tour anchor lives and now carries the two traps this
   dependency has actually fallen into. §4 is the localhost / DEFAULT_TENANT_ID trap.

WHERE THINGS STAND — READ THIS BEFORE TOUCHING ANY CODE:
Chunks 1, 2 and 3 are done and shipped to production. **Chunk 4 is BUILT but only half
shipped**: tasks 4.1-4.6 are complete, committed to `staging` as 9d3a2b2 (vault updates in
c7bc1d5), verified locally and on the staging preview. It is NOT on `master`, so
demo.vineworks.ge still shows the OLD broken behaviour. Do not "fix" the tour again — run
`git log staging` and `git diff master..staging` first.

Only task 4.7 remains, and most of it is blocked on Max:
  (a) Max must eyeball /admin/statistics and /admin/companies on the staging preview
      (georgian-saas-git-staging-mg-productions-projects.vercel.app). Those are the two shared
      surfaces Claude could not check, because they sit behind the admin login and Claude may
      not type a password into a login form. That is a standing safety rule — do not try to
      work around it, just ask Max.
  (b) Max must approve the `staging` -> `master` merge. DO NOT RUN IT YOURSELF. That merge is
      the one action that ships to Nikalas Marani's real staff working real bookings.
  (c) AFTER the merge lands: walk all seven tour steps and the feature rail's "Per-company
      price ladders" link on demo.vineworks.ge from a CLEARED localStorage (the tour's state
      lives under `vineworks-demo-tour`; clear it or you are testing a tour that thinks it has
      already finished). Then tick 4.7 and set Chunk 4's Status to done.

Then STOP and ask before starting Chunk 5 — chunks are strictly sequential by Max's
instruction, and he has approved Chunks 1-4 only.

WHAT CHUNK 4 ACTUALLY FOUND (do not re-derive — it is measured and recorded):
The plan's status table described Chunk 4 as "adding data-tour anchors to admin pages". That
was wrong. **All seven anchors already existed and always had.** The real cause was that
DemoTour measured its target ONCE, on a 60ms setTimeout after the route changed — a race
against the destination painting. setRect(null) then latched and nothing retried.

That one line explains everything the teardown saw:
  - Why exactly 6 of 7 steps failed: step 4 is the only step reached WITHOUT a navigation
    (steps 3 and 4 share /admin/orders). It was the control in the experiment all along.
  - Why step 7 resolved in local dev and not on production: the RSC fetch returns well under
    60ms from localhost and does not over the network. Same code, different latency.
  - Why it shipped: a missing anchor degrades silently by design, and a LATE anchor was
    indistinguishable from a missing one.

The fix is a shared `useAnchorRect()` hook in saas/lib/demoAnchor.ts, used by BOTH DemoTour and
DemoFeatureRail. It polls AND runs a MutationObserver with no deadline. **Do not replace that
observer with a longer timeout** — a timeout is a guess about someone else's latency, and that
guess is the original bug. It also logs a dev-only console.warn when an anchor genuinely cannot
be resolved; that warning is the early-warning system for MaintenanceNotes §12, and it caught a
real problem on its first run.

IF YOU ARE STARTING CHUNK 5 (only after Max approves):
Chunk 5 is "Demo chrome palette + front door layout" — demo-only files, so it goes STRAIGHT TO
`master`, no staging pass. Note this INVERTS from Chunk 4. The palette decision is already made
and is not open for re-litigation: "cellar dark". See the plan's "Decisions already made".

RULES THAT ACTUALLY BITE HERE:
- Verify against PRODUCTION after deploy, not just dev. "Dev passing is not evidence" is ground
  rule 5 and it has cost this project four separate bugs — one of which was Chunk 4's.
- localhost resolves to DEFAULT_TENANT_ID in saas/.env, currently Staging Winery
  (cmrxb85wo0000vlc0d964nzf8), which renders NO demo components at all. To preview the demo
  locally, temporarily point it at the DEV demo tenant cmtvgl6e60000vl6w9se65t86, and REVERT
  before committing. Back the file up first and diff it against the backup.
- If every route 404s on a freshly started dev server, it is a stale Turbopack cache — stop the
  server, remove saas/.next, restart.
- Console buffers and localStorage both persist across same-origin navigations. Verify
  per-load, not per-session, and from a cleared store.
- Stop the dev server before any prisma command (ClaudeInstructions Rule 10).
- When editing vault markdown with a script, build the new content and only then replace the
  original. A Python script that opened Plan-DemoFlowFixes.md for writing and then hit an
  encoding error truncated it to 0 bytes in session 11. It was recovered from git, but only
  because it happened to be committed.

HOUSEKEEPING, IF STILL PRESENT:
Chunk 1's verification left a real test booking in the live demo data — "Luka Testashvili",
4 guests, 20 Oct 2026. Confirmed still present 2026-09-11; the 03:00 UTC nightly reseed did NOT
clear it, which may itself be worth a look. Ask Max whether to delete it rather than deleting it
yourself; it is a production write. Raised at the end of Chunks 3 and 4, still unanswered.
~~~

---

## Why this handoff is shaped the way it is

**It leads with "the code already exists."** The single most expensive failure mode for the next
session is re-solving Chunk 4 from the plan's original (wrong) premise — because the production
site still exhibits the bug, while the fix sits on `staging`. A session that opens
demo.vineworks.ge, sees no ring, and starts debugging will burn its whole context re-deriving a
solved problem.

**It names the blocked items as Max's, explicitly.** Task 4.7 reads like a coding task and is
mostly not one. Two of its three parts need a human: one because of a login Claude may not pass,
one because it ships to real customers.

**It carries the anti-pattern, not just the pattern.** "Do not replace the observer with a
longer timeout" matters more than any description of what the observer does — the timeout is the
mistake this codebase has now made twice on the same feature.
