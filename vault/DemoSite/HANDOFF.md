---
tags: [handoff, demo, vineworks]
---

# Handoff — Chunk 4 of the demo flow fixes

**How to use this:** copy the block below into a fresh Claude Code session. It is written to
be self-contained — a session with no memory of Chunks 1–3 can start work from it.

**Supersedes** the Chunk 3 handoff (Chunk 3 is ✅, shipped `e44e519` + `cce867c`, verified on
production 2026-09-11). Written 2026-09-11.

**The shape works for every chunk.** To produce the prompt for Chunk N, swap the task line,
replace the "what you don't need to re-derive" section with that chunk's recorded findings,
and re-check the ship route in the plan's status table — it differs per chunk and is not a
guess.

**⚠️ The ship route inverts again.** Chunk 3 was demo-only → straight to `master`. **Chunk 4
is shared → `staging` pass, with a Staging Winery regression check.** A session that has just
read Chunk 3's notes will have "straight to master" fresh in mind. Getting this one wrong is
not cosmetic: it ships untested changes to admin pages that Nikalas Marani's real staff use.

**⚠️ The framing trap, and it is new.** The plan's own status table calls this chunk "adding
`data-tour` anchors to admin pages." **That is wrong and was verified wrong on 2026-09-11: all
seven anchors already exist in the code.** A session that takes the plan at its word will go
looking for missing attributes, not find the bug, and may add duplicates. The prompt corrects
this explicitly and points at the likelier cause.

**⚠️ This is the biggest chunk.** Seven tasks, two components, and a deliverable table to fill
in. It is a reasonable candidate for splitting across two sessions — the prompt says where the
natural seam is (after 4.2's audit).

---

## The prompt

```
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). Continue the public
sales demo fixes at demo.vineworks.ge. Chunks 1, 2 and 3 are done and shipped to production;
you are starting Chunk 4.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave on this project. Rule 0 (git: staging before master) and Rule 8 (confirm
   before editing) both apply, and Rule 0 is load-bearing on this chunk specifically.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Plan-DemoFlowFixes.md
   — THE TASK TRACKER. Read the status table, the ground rules, "Decisions already made",
   then Chunk 4 in full including the empty per-step audit table (that table is this chunk's
   deliverable). Skim Chunk 3's "Notes / decisions" — it leaves you one free measurement.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md §12 and §4.
   §12 is the map of where every data-tour anchor lives. §4 is the localhost /
   DEFAULT_TENANT_ID trap; this chunk will hit it.

YOUR TASK: Chunk 4 only — "Tour + rail anchoring: make the spotlight actually spotlight."
Max has approved Chunk 4 specifically. Implement it, then STOP and report back. Do not start
Chunk 5; chunks are strictly sequential by Max's instruction.

SHIP ROUTE — IT INVERTS FROM LAST TIME, AND GETTING IT WRONG IS NOT COSMETIC:
Chunk 3 was demo-only and went straight to `master`. CHUNK 4 IS SHARED. Anything you change
in an admin page renders for every tenant, including Nikalas Marani's real staff working real
customer bookings. So: commit to `staging`, verify on the staging preview URL, regression-
check Staging Winery (cmrxb85wo0000vlc0d964nzf8 — no demo chrome should render there at all),
and only merge `staging` → `master` once Max has confirmed. That merge is the one action that
ships to real customers; treat it accordingly and ask first.
There is only ONE deployment. demo.vineworks.ge and nikalasmarani.vercel.app are the same
code and the same production database, distinguished only by which tenant the domain resolves
to.

THE BIGGEST THING THE PLAN GETS WRONG — READ THIS BEFORE YOU OPEN ANYTHING:
The status table describes this chunk as "adding data-tour anchors to admin pages." **All
seven anchors already exist.** Verified 2026-09-11 by grep:
  booking-form    → saas/app/(site)/page.tsx:361
  wine-catalogue  → saas/app/(site)/wines/page.tsx:77
  orders-table    → saas/app/admin/(panel)/orders/page.tsx:163
  orders-filters  → saas/app/admin/(panel)/orders/page.tsx:154
  stats-cards     → saas/app/admin/(panel)/statistics/StatisticsV2.tsx:144
  wine-orders-list→ saas/app/admin/(panel)/wine-orders/page.tsx:28
  content-editor  → saas/app/admin/(panel)/content/page.tsx:45
So this is NOT "the attribute is missing." It is that `measure()` in DemoTour.tsx fails or
returns something unusable. Two specific suspects worth checking before anything else, both
in DemoTour.tsx's measuring effect:
  (a) it runs `measure()` on a single 60ms setTimeout after the route changes — a race
      against the destination painting. Plan-DemoRedesign already lost this exact race once
      with the feature rail and fixed it by POLLING across the first second; DemoTour never
      got that fix. DemoFeatureRail.tsx is the reference implementation, in the same repo.
  (b) `measure()` bails to `setRect(null)` when the element measures 0×0 — which is exactly
      what an element inside a `display:none` subtree reports. See the Chunk 1 lesson below.
Measure first, don't guess. Chunk 2 of this same plan burned three sessions on a bug that a
measurement would have settled, and the plan says so in its own notes.

WHAT YOU DON'T NEED TO RE-DERIVE (already measured and recorded):
- Six of the seven steps draw no ring. The screen dims uniformly and the tooltip falls back to
  the full-bleed mobile bottom dock even at 1440px. **Step 4 is the only one that works** —
  which is what proves the machinery is fine: real cutout, real ring, compact tooltip beside
  the target. Whatever is different about step 4 is the highest-value thing to look at.
- **A reproducible instance, handed to you by Chunk 3.** Step 7's `content-editor` anchor
  RESOLVES in local dev and DOES NOT on production. Same step, same 1440×900 viewport, minutes
  apart: 340px tooltip positioned beside the target locally, 1401px full-width bottom dock on
  production (the `!rect` branch). Most of this chunk's difficulty is that the failure is
  silent — here it is, not silent, with a dev/prod delta to bisect against. Start here.
- The feature rail has the identical bug wearing a second coat: its callouts arrive floating
  in dead space, pinned to nothing. Fix both components together — that is the plan's explicit
  instruction and the reason this chunk is one chunk.
- Task 4.1 (make anchor failure loud with a dev-only console.warn) is FIRST for a reason: it is
  why this shipped, and without it 4.2's work is unverifiable. Do it before any fixing.

ONE DECISION YOU WILL HAVE TO MAKE, AND ONE THAT IS ALREADY MADE:
- To make: step 4's copy is about per-company rate ladders while its ring is on the FILTERS
  row — copy and highlight disagree even on the one step that works. Re-anchor or re-word.
  Your call; record it in the plan's Notes.
- Already made, do not re-litigate: desktop-first (no mobile layout work), "admin landing stays
  on Orders", the tour auto-start, and the "cellar dark" palette (that's Chunk 5). All are in
  the plan's "Decisions already made" section.

THE SHIP-ROUTE NUANCE WORTH NOTICING:
If the fix turns out to live ENTIRELY inside DemoTour.tsx and DemoFeatureRail.tsx (both
demo-only, gated on DEMO_TENANT_ID), the chunk could in principle take the faster route. But
task 4.3 explicitly calls for re-anchoring to smaller elements — "ring the Future Revenue
card, not the whole stats grid" — which means editing admin pages, which is shared. Expect
shared. If you genuinely end up touching no shared file, say so and let Max decide the route
rather than switching it yourself.

WORKING LOCALLY — THE TRAP THAT BITES THIS CHUNK SPECIFICALLY:
localhost resolves to DEFAULT_TENANT_ID in saas/.env, currently Staging Winery
(cmrxb85wo0000vlc0d964nzf8), which renders NO demo components at all — so you will see nothing
you are trying to fix. To preview the demo locally, temporarily point DEFAULT_TENANT_ID at the
DEV demo tenant cmtvgl6e60000vl6w9se65t86, and revert it before committing (ground rule 4 +
MaintenanceNotes §4). Back up the file first and diff it against the backup before you commit;
forgetting the revert is how a local-only env change reaches master.
Also: if every route 404s on a freshly started dev server, it is a stale Turbopack cache —
stop the server, `rm -rf saas/.next`, restart. Cost 20 minutes in the Chunk 3 session.

RULES THAT ACTUALLY BITE ON THIS CHUNK:
- Verify against PRODUCTION after deploy, not just dev — and on this chunk that is not
  boilerplate, because the one bug you have a solid lead on is a bug that ONLY appears on
  production. "Dev passing is not evidence" is ground rule 5 and it has cost this project four
  separate bugs.
- Three methodology lessons from the last three chunks, all earned the hard way:
  (a) Chunk 1 — a component can find its target, style it, and still be invisible because it
      marked the copy nobody is looking at. /admin/orders renders its orders TWICE (a table
      "hidden md:block" and a card list "md:hidden") and Tailwind picks on the PANE's width,
      not the viewer's. Any code reaching into an admin surface must resolve which
      representation is actually RENDERED — and an element in a display:none subtree measures
      0×0, which is precisely the case measure() currently discards.
  (b) Chunk 2 — console buffers persist across same-origin navigations. One error on the first
      page reads as "it fires on every route" if you navigate and re-read without clearing.
      Verify per-load, not per-session.
  (c) Chunk 3 — localStorage persists the same way, so any once-per-browser behaviour passes
      trivially if you test it with a reload instead of a cleared store. The tour's own state
      lives in localStorage under `vineworks-demo-tour`; clear it between runs or you will be
      testing a tour that thinks it already finished.
- Stop the dev server before any prisma command (ClaudeInstructions Rule 10). It fails silently
  when it does bite.

A NATURAL SEAM IF THE SESSION RUNS LONG:
4.1 + 4.2 (make failure loud, then audit all seven anchors and fill in the per-step table) is a
complete, useful unit on its own and the table is this chunk's stated deliverable. If you are
running out of room, stop there, write the table into the plan, and set the Resume point to
4.3. Do not leave a half-applied set of anchor changes with no audit recorded.

WHEN YOU FINISH:
1. Fill in the per-step anchor audit table in Plan-DemoFlowFixes.md — it is the deliverable.
2. Tick the boxes, set Chunk 4's Status, rewrite its Resume point and the Overall resume point.
3. Record the step-4 copy-vs-ring decision, and which rail destinations needed 4.6's
   auto-expand, in Chunk 4's "Notes / decisions".
4. Update SessionLog.md, FeatureLog.md and KnownBugs.md per ClaudeInstructions Rule 1.
   FeatureLog row 163 (the demo spotlight tour) is currently ❌ Broken with its entry half
   already resolved by Chunk 3 and its ANCHORING half still flagged — this chunk is what
   closes that row, so it can finally go ✅ if all seven steps draw a ring. Row 164 (the
   feature rail) is 🚧 In progress for the same reason and closes with it.
   KnownBugs #25 and #27 are this chunk's bugs; #26 was closed by Chunk 3.
5. If MaintenanceNotes §12's anchor table changes, update it — it is the map the next person
   will use.
6. Report to Max, then wait for approval before Chunk 5.

DON'T:
- Don't merge staging → master yourself. Ask Max; it ships to Nikalas Marani's real site.
- Don't redesign the demo chrome palette — decided ("cellar dark"), it belongs to Chunk 5.
- Don't fix the duplicate bug-report button (Chunk 6), the admin landing's readability
  (Chunk 7), or the onboarding path / super-admin reset button (Chunk 8).
- Don't touch the mobile layout. Desktop-first is a recorded decision. (Making the DESKTOP
  tooltip stop using the mobile bottom dock is task 4.4 and is in scope — that is desktop
  work, not mobile work.)
- Don't re-open "Decisions already made".

HOUSEKEEPING, IF STILL PRESENT:
Chunk 1's verification left a real test booking in the live demo data — "Luka Testashvili",
4 guests, 20 Oct 2026. Confirmed still present 2026-09-11; the 03:00 UTC nightly reseed did
NOT clear it, which may itself be worth a look. Ask Max whether to delete it rather than
deleting it yourself; it is a production write. Raised with him at the end of Chunk 3 and not
yet answered.
```
