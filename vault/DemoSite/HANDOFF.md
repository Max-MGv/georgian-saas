---
tags: [handoff, demo, vineworks]
---

# Handoff — the introduction work is built and tested, and waiting on `master`

**How to use this:** copy the block below into a fresh Claude Code session. It is written to be
self-contained.

**Supersedes** the 2026-09-11 "flow-fix plan is finished" handoff. Written 2026-09-13.

> **⚠️ This version has to re-open a warning the last one was able to drop.** The previous handoff
> led with "there is nothing parked, `staging` and `master` are at the same commit." **That is no
> longer true.** Five commits sit on `staging` and have not been merged to `master`, deliberately
> — they are waiting on Max looking at them, not on more work.

---

## The prompt

~~~
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). Two things were built on
2026-09-13: a real marketing site at vineworks.ge, and orientation for the demo's guided tour.
Both are on `staging` and NOT on `master`.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave here. Rule 0 (git: staging before master) and Rule 8 (confirm before editing).
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\SessionLog.md — the two 2026-09-13
   entries at the top are what just happened.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MyToDo.md — what is waiting on Max.
   If he has not done these, remind him rather than trying to do them yourself.
4. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md — §12, §13, §15,
   §16 before touching anything demo-related, and **§20 and §21, which are new and will save you
   an hour each** (see below).

WHERE THINGS STAND:
`staging` is five commits ahead of `master`: 0fc0d75, 25d49d3, 48f78d2, b26f2f3, e8e0b10.
`next build` is clean and every one has been tested. Nothing is half-finished.

  - **vineworks.ge is a real site now** (FeatureLog #174). It served a 67-line placeholder with
    THREE cards, a mailto, and no link to the demo at all. It is now a full landing page,
    Georgian by default with an EN toggle, with four routes into demo.vineworks.ge.
    app/welcome/page.tsx, components/WelcomeLanding.tsx, lib/welcomeCopy.ts.
  - **The tour says where you are** (FeatureLog #175). A named clickable progress rail, a
    "BACK OFFICE · ORDERS" breadcrumb, a one-time note on step 3 where the visitor crosses from
    the guest site into the admin panel, and "Next · <title>" naming the destination screen.
  - **A QA pass fixed six bugs** (FeatureLog #176), three of them introduced by the tour work
    itself. Read #176 before assuming any of that area is fragile — it is now well covered.

THE LOAD-BEARING DECISION, DO NOT UNDO IT:
**vineworks.ge explains and sells; demo.vineworks.ge shows.** DemoFrontDoor stays a *path
chooser* and is allowed to assume the visitor already knows what Vineworks is. Do NOT move the
feature list into it — the pitch would be read twice and the front door becomes a speed bump.
This also retires the old note in DemoExplore.tsx that expected CAPABILITY_GROUPS to become the
marketing feature list; sixteen capabilities for someone already inside is the wrong granularity
for six benefits aimed at someone deciding whether to come in.

ALSO DECIDED, REVISIT ONLY WITH DATA:
Click-to-advance for the tour was considered and rejected. For a cold sales visitor it trades a
known drop-off (people who stop pressing Next) for a worse one (people who cannot find the thing
to click), and it would add per-step click targets and stuck-state fallbacks to a tour Chunk 4
already had to rescue from an anchor race. Max accepted the reasoning. The demo has recorded
events since 2026-09-12 — `npx tsx scripts/demo-funnel.ts 30` says which step actually loses
people. Argue from that, not from instinct.

STILL OPEN, AND THEY ARE MAX'S — DO NOT TRY TO DO THEM:
  (a) Look at the new vineworks.ge and the tour's orientation on the staging preview, and say
      whether to merge to `master`. Nothing ships until he has.
  (b) The Georgian copy on vineworks.ge. **Backlogged at Max's explicit request on 2026-09-13**
      — parked in Roadmap.md under "Backlog — deferred, not dropped". It was written by Claude
      and Claude is the wrong judge of whether it reads native. Every string is a {ka,en} pair in
      lib/welcomeCopy.ts, so it is a copy pass over one file. Do it before a prospect sees the
      page; do not do it unprompted.
  (c) Carried over from 2026-09-11 and possibly still undone — check MyToDo before repeating
      them: pressing the "Reset demo now" button once in /super-admin/tenants, and a human look
      at Staging Winery's /admin/orders, /admin/statistics and /admin/companies.
  (d) One product decision, not urgent: the demo's bookings page carries a three-number revenue
      strip, demo-only on purpose. Max has not said whether every winery should get it. If he
      says yes it needs its own design pass — do not just widen the `if`.

FOUR FINDINGS THAT SHOULD OUTLIVE THIS WORK:
1. **A timeout is a guess about someone else's latency.** The tour's missing rings (6 of 7 steps,
   shipped and invisible for weeks) were one 60ms setTimeout racing the route paint. The fix is
   saas/lib/demoAnchor.ts: a MutationObserver with NO deadline, plus a poll whose budget decides
   only when to *warn*. **Do not replace that observer with a longer timeout.**
2. **Measure the before-state first.** Chunk 7 was scoped as "hide two columns"; measuring showed
   the truncation did the work and the hiding was cosmetic. This has now cost the project five
   bugs — six, counting the one below.
3. **A blank screenshot is not evidence of a bug (MaintenanceNotes §20).** About an hour went
   into an infinite render loop that did not exist. Screenshots came back blank in two
   independent browsers and one call reported "the renderer may be frozen". The real cause:
   `document.hidden === true` and requestAnimationFrame firing ONCE in four seconds, because the
   Browser pane was hidden and Chrome was behind another window. Nothing was painting. §20 has
   the rAF check to run before believing a blank screenshot, and the argument for using
   getBoundingClientRect instead — for this component it is *better* evidence than a picture,
   because card-vs-ring overlap is exact rather than a judgement call.
4. **The tour crosses two React trees (MaintenanceNotes §21).** Step 2 → 3 moves DemoTour from
   the (site) layout to admin/(panel): it unmounts and a fresh one mounts, so every useRef resets
   at exactly that point. §21 has the table of the three channels that do survive it. Also from
   the same fix: never identify an element with a conditional object ref
   (`ref={i === active ? r : undefined}`) inside a list — detach/attach order is not yours to
   rely on. Query the attribute the component itself renders.

RULES THAT ACTUALLY BITE HERE:
- Demo-only files (gated on DEMO_TENANT_ID) go straight to `master`. Shared files take the
  `staging` pass first, with a Staging Winery regression check. Decided per change, not per
  session. NOTE: the vineworks.ge work is neither — it is a new route on the platform domain, so
  it took the staging pass.
- localhost resolves to DEFAULT_TENANT_ID in saas/.env, currently Staging Winery
  (cmrxb85wo0000vlc0d964nzf8), which renders NO demo components. To preview the demo locally,
  temporarily point it at the DEV demo tenant cmtvgl6e60000vl6w9se65t86, and REVERT before
  committing. Back the file up first and diff it against the backup.
- **To preview /welcome locally, do NOT touch .env** — any host that resolves to no tenant hits
  proxy.ts's /welcome rule, so `http://hq.localhost:3000/welcome` just works.
- Console buffers and localStorage persist across same-origin navigations — and the Browser
  pane's console buffer survives a dev-server restart too, which made a stale hot-reload error
  look live through three rounds of chasing it. Chrome's read_console_messages takes
  `clear: true`. Anything once-per-browser must be re-tested from a CLEARED store.
  Keys: `vineworks-demo-tour`, `vineworks-demo-frontdoor`, `vineworks-lang`, `orders-columns`.
- Stop the dev server before any prisma command (ClaudeInstructions Rule 10).
- When editing vault markdown with a script, build the new content in full and only then replace
  the original. A script that opened Plan-DemoFlowFixes.md for writing and then hit an encoding
  error truncated it to 0 bytes in session 11. Write the file whole; do not pipe Georgian or em
  dashes through a shell heredoc on this machine.

WHAT A NEXT SESSION WOULD ACTUALLY PICK UP:
- Nothing, until Max has looked at (a). Ask first.
- The demo funnel, once there is more than a few days of data — it is the only thing that can
  settle whether the tour's new orientation changed the abandon step.
- The disposable-tenant-per-visitor question, still open in Plan-DemoRedesign.md. Two visitors
  running the setup wizard at once still collide.
- Mobile layout for the demo beyond the tap-target passes. Max ruled "desktop now, mobile later"
  for the whole flow-fix plan.
- KnownBugs.md #22 (wine-order total computed from client-supplied prices) is a real security
  issue and is still open. It has nothing to do with the demo.
- **One five-minute UNVERIFIED item, needs a browser that is actually painting.** measure() in
  lib/demoAnchor.ts calls setRect with a new object every time even when nothing moved, and the
  MutationObserver above it watches document.body — which contains the tour's own portal. So a
  measurement can mutate the subtree that triggers the next measurement. It is bounded by the
  poll's disconnect, so it is probably just redundant renders in the first half-second of each
  step, but nobody has counted them. MaintenanceNotes §20 has the one-line fix and the reason not
  to apply it before measuring.
~~~

---

## Why this handoff is shaped the way it is

**It re-opens with a warning, and that is a regression in the state, not in the writing.** The
previous version got to say nothing was parked. Five commits now sit on `staging`, and a session
that assumes `master` is current will draw wrong conclusions from the deployed site. That has to
be the first thing read.

**It separates "left to do" from "left for Max".** Every open item needs a human with a login or
an opinion. A session that treats them as tasks will either try to get past a login it must not,
or make a product decision that is not its own. The Georgian copy is the sharpest case: it is
genuinely worth doing, it is genuinely one file, and Max has explicitly said not yet.

**It carries the anti-patterns, not the features.** What the tour does is in the code. What this
project keeps getting wrong is not, and the list has grown to four. Two of the four are now about
*how the work was verified* rather than how it was built — which is the real lesson of the QA
pass, where three of six bugs were in code that had already passed a type-check and a review and
were found only by driving the keyboard.
