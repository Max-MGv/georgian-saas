---
tags: [handoff, demo, prompt]
---

# Two ready-to-paste prompts — merge the tour/rail entry points, and demo analytics

Two separate, unrelated pieces of work, deferred out of [[Plan-DemoFlowFixes]] as "agreed as out
of scope for this plan." Give them to two different sessions (or one after the other) — they
don't share files in any way that makes doing them together useful.

---

## Prompt 1 — Merge the tour pill and rail tab into one "Explore" control

~~~
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). demo.vineworks.ge is a
public sales demo. Two separate floating controls currently invite a visitor into two separate
guided experiences, and the task is to reduce that to one.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md — Rule 0 (git:
   staging vs master), Rule 8 (confirm the plan before editing).
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md — §12 (data-tour
   anchors), §13 ("every demo-only component must hide itself inside a /live pane" — both
   components you're touching already follow this pattern, keep it), §15 (the demo palette
   module — don't hardcode colours, pull from lib/demoTheme.ts), §16 (/admin/onboarding mounts
   demo chrome from a *second* layout file — "both files, or neither" applies to this merge too).
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\DemoTour.tsx — read the
   whole file, especially the "Not touring" pill (~line 311) and the "Tour paused" pill
   (~line 340).
4. C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\DemoFeatureRail.tsx — read
   the whole file, especially the edge tab (~line 248) and the slide-out panel.

WHERE THIS CAME FROM:
A hands-on Playwright teardown of the live demo (2026-09-11, see
vault\DemoSite\Plan-DemoFlowFixes.md) flagged that a visitor sees two separate floating
invitations at once — the tour's bottom-left pill ("Show me what this does" / "Tour paused ·
step N of 7") and the feature rail's right-edge vertical tab ("✦ What can it do?") — offering two
different guided experiences with no relationship to each other. The recommendation was one
"Explore" control instead of two. It was deferred because it's a design change, not a bug fix,
and needed its own pass rather than being folded into the flow-fix chunks.

THE CURRENT SHAPE, PRECISELY (do not assume — read the files, this is a summary):
- DemoTour's pill has THREE states: hidden (mid-tour, spotlight showing), a small rounded pill
  bottom-left when idle ("Show me what this does" / "Replay the tour" after finishing), and a
  wider pill bottom-left when a tour is in progress but the visitor navigated off-script
  ("Tour paused · step N of 7" + Resume + ✕).
- DemoFeatureRail's tab is a single always-present vertical tab on the right edge, which opens a
  right-side slide-out `<aside>` listing 16+ capabilities grouped under headings, each deep-
  linking to a real screen.
- Both are mounted in three places, always together: app/(site)/layout.tsx,
  app/admin/(panel)/layout.tsx, app/admin/onboarding/layout.tsx (MaintenanceNotes §16 explains
  why onboarding needs its own copy).
- Both use useAnchorRect / isEmbeddedPane / DEMO_TENANT_ID gating — copy that shape exactly for
  whatever you build, per MaintenanceNotes §13.

THE DESIGN QUESTION THIS TASK ACTUALLY IS:
Merging two floating entry points into one is not "pick one and delete the other" — the tour is
a linear guided narrative (7 steps, each naming a dollar figure, auto-starts once on the winery
path) and the rail is a menu for self-directed exploration (16 capabilities, no order). They are
different *shapes* of help, not two ways to reach the same thing. Plausible approaches, roughly
in order of how much they change:
  (a) One entry point (a single "Explore" pill/tab) that opens a small chooser: "Take the guided
      tour" vs. "Browse what it can do" — cheapest, keeps both experiences unchanged inside.
  (b) Fold the rail's capability list into the tour as an optional detour, so there's only ever
      one mental model ("the tour") and the rail becomes a side door out of it.
  (c) Something else Max prefers once he sees the tradeoff.
Do NOT just pick one and build it. Lay out the options with what each costs and what breaks
(mobile hit-area rules from the 2026-09-12 mobile pass, z-index collisions with the bug-report
widget and cart bar — search the codebase for `z-index` values near 140-150 before adding
another one), and get Max's sign-off on which shape before writing code (Rule 8).

RULES THAT ACTUALLY BITE HERE:
- Demo-only files (gated on DEMO_TENANT_ID) go straight to `master` per the established route for
  this kind of change — but confirm this is still current practice by checking recent commits
  (`git log --oneline -20`) rather than assuming the rule hasn't shifted.
- The auto-start behavior (tour auto-begins once per browser on the "I run a winery" path,
  localStorage-gated) must survive whatever the merged control becomes. Don't lose it silently.
- `data-tour` anchors (MaintenanceNotes §12) are fragile to route/component changes — grep
  `data-tour` before and after, and walk the tour on the demo tenant with the console open
  looking for `[demo] DemoTour: no element matching...` warnings.
- Test the mobile hit areas of whatever new control you build against the 40px rule established
  2026-09-12 (see vault\MaintenanceNotes.md §17 for the pattern of invisible-hit-area vs.
  visual-size, if that helps here).
- Screenshots: use Playwright directly (see any recent session's use of chromium.launch() +
  devices['iPhone 13']) — the Browser pane and Chrome both fail on this machine. Delete scratch
  scripts afterward.

DEFINITION OF DONE:
Design options presented and one approved by Max BEFORE code changes. Then: the merged control
built, data-tour anchors verified intact, mobile hit-area checked, walked end-to-end on the demo
tenant (front door → tour or rail → back), vault updated (SessionLog, FeatureLog, and
Plan-DemoFlowFixes' "Deferred" section marking this item done) per ClaudeInstructions Rule 1.
~~~

---

## Prompt 2 — Instrument the demo with basic analytics

~~~
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). demo.vineworks.ge is a
public sales demo, and it currently has ZERO analytics — no page views, no click tracking,
nothing. The task is to add the minimum instrumentation needed to answer real questions about
what visitors actually do.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md — Rule 0 (git
   workflow), Rule 8 (confirm plan before editing).
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Research-DemoPatterns.md —
   the "Caveat" section at the bottom: every conversion figure used to justify the demo's design
   (tour copy, feature rail, front door) is an INDUSTRY BENCHMARK, not a measurement of this
   site. This task is what turns those guesses into real numbers.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Plan-DemoFlowFixes.md —
   search for "conversion surface" (~line 546): the tour's step 7 hand-off has exactly two
   conversion actions today — a deep-link to /live, and a mailto: to max@vineworks.ge with a
   pre-filled subject (app/actions/bugReports.ts shows the pattern for that address). Those two
   actions, plus the front door's path choices, are probably the highest-value things to track
   first.
4. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md — §11
   (sendTenantEmail suppresses all outbound mail for the demo tenant — analytics must NOT
   accidentally break or route around that suppression; this is instrumentation, not email).

WHAT EXISTS TO INSTRUMENT (read these before designing events — don't guess at the UX):
- components/DemoFrontDoor.tsx — the entry dialog, 4 path choices + Skip
- components/DemoTour.tsx — 7-step guided tour, auto-starts once per browser on the winery path,
  ends with two CTAs (see above)
- components/DemoFeatureRail.tsx — the capability menu, 16+ deep-linking rows
- components/DemoThemeCatalogue.tsx — the theme-preset picker (shipped 2026-09-12)
- app/live/ — the side-by-side guest/admin mirror, the flagship screen
- The booking form and wine order flow themselves (shared with the real product — do NOT add
  tracking code to shared components in a way that fires for real tenants; gate everything on
  DEMO_TENANT_ID exactly like every other demo-only feature does, see MaintenanceNotes §13's
  isEmbeddedPane() pattern for the shape to copy)

THE ACTUAL DECISION THIS TASK STARTS WITH:
"Analytics" is not one thing — decide the scope with Max before building:
  (a) Page views only — which routes get visited, in what order, bounce vs. multi-page. Cheapest,
      answers "does anyone get past the front door."
  (b) Page views + a handful of named events (front-door path chosen, tour started/completed/
      skipped-at-step-N, rail opened, a specific capability row clicked, the two step-7 CTAs
      clicked, a real booking placed on the demo tenant). Answers "where do people actually drop
      off and what do they care about."
  (c) Full session replay / heatmaps via a third-party tool. Most powerful, but it's the biggest
      privacy and vendor question (see below) and probably overkill for a first pass.
Given the caveat in Research-DemoPatterns.md is specifically about conversion-rate figures, (b)
is very likely the right scope for a first version — but confirm with Max rather than assuming.

TECHNICAL OPTIONS TO PRESENT, NOT PICK UNILATERALLY:
- Self-hosted / privacy-first (Plausible, Umami, PostHog self-hosted) vs. a third-party SaaS
  (PostHog cloud, Google Analytics, Mixpanel) vs. hand-rolled (a `DemoEvent` Prisma table +
  server actions, zero external dependency). Each has a different cost, setup time, and data-
  residency question — demo.vineworks.ge sees the public internet, so check what the tool's own
  privacy/cookie implications are before picking one; a cookie-consent banner appearing only on
  the demo tenant would itself be a UX problem worth flagging to Max.
- If a Prisma table is the answer, this is a new tenanted-ish table — read
  vault\RLS-Architecture.md's "checklist for adding new tables" even though the demo tenant's
  data isn't really subject to the same multi-tenant threat model (a fixed known tenant ID,
  publicly writable pages) — decide explicitly whether RLS applies here and say why in the code
  comment, don't skip it silently.

WHAT NOT TO DO:
- Don't add tracking to app/(site) or app/admin components in a way that could ever fire for a
  real winery's tenant. Every event must be gated on DEMO_TENANT_ID, checked the same way
  DemoTour/DemoFeatureRail/DemoModeBanner already do it (isEmbeddedPane() pattern,
  MaintenanceNotes §13).
- Don't let this become a second email-suppression bug: if any analytics event path calls
  sendTenantEmail or similar, MaintenanceNotes §11's suppression must still apply.
- Don't build a full custom dashboard as part of this task unless Max explicitly wants one — a
  first version answering "how many people reach /live, how many complete the tour, how many hit
  a step-7 CTA" is more useful shipped in a day than a polished dashboard shipped in a week.

DEFINITION OF DONE:
Scope ((a)/(b)/(c) above) and tool choice confirmed with Max BEFORE writing code (Rule 8). Then:
instrumentation live and gated to the demo tenant only, verified by generating some visitor
traffic yourself and confirming events actually appear in whatever the analytics destination is,
and the real product's pages checked to confirm zero code paths changed for non-demo tenants.
Vault updated (SessionLog, FeatureLog, Research-DemoPatterns.md's caveat updated to say what is
now actually measured vs. still a benchmark) per ClaudeInstructions Rule 1.
~~~
