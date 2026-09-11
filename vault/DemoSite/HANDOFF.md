---
tags: [handoff, demo, vineworks]
---

# Handoff — Chunk 3 of the demo flow fixes

**How to use this:** copy the block below into a fresh Claude Code session. It is written to
be self-contained — a session with no memory of Chunks 1 and 2 can start work from it.

**Supersedes** the Chunk 2 handoff (Chunk 2 is ✅, shipped `e64ccbb`, verified on production
2026-09-11). Written 2026-09-11.

**The shape works for every chunk.** To produce the prompt for Chunk N, swap the task line,
replace the "what you don't need to re-derive" section with that chunk's recorded findings,
and re-check the ship route in the plan's status table — it differs per chunk and is not a
guess.

**⚠️ The ship route inverts again.** Chunk 1 was demo-only → `master`. Chunk 2 was shared →
`staging` pass. **Chunk 3 is demo-only → straight to `master`.** A session that has just read
Chunk 2's notes will have "staging pass" fresh in mind and may apply it from habit; that is
not harmful, just unnecessary. The prompt states the route explicitly either way.

**⚠️ The scope trap for this chunk.** The loudest known complaint about the tour is that it
*does not actually spotlight anything on 6 of its 7 steps* (the `data-tour` anchors fail to
resolve). **That is Chunk 4, not Chunk 3.** Chunk 3 is only about the tour's *entry* and its
*ending*. A session that opens `DemoTour.tsx` and sees the anchoring bug will be very tempted
to fix it, and doing so would merge two chunks with different ship routes into one commit.
The prompt warns about this twice, deliberately.

**⚠️ Chunk 3 is blocked partway through** on task 3.3's second CTA, which needs Max's input.
3.1 and 3.2 can be built without him.

---

## The prompt

```
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). Continue the public
sales demo fixes at demo.vineworks.ge. Chunks 1 and 2 are done and shipped to production; you
are starting Chunk 3.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave on this project. Rule 0 (git) and Rule 8 (confirm before editing) both
   apply.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Plan-DemoFlowFixes.md
   — THE TASK TRACKER. Read the status table, the ground rules, "Decisions already made"
   (the tour auto-start is decided there — do not re-litigate it), then Chunk 3 in full.
   Skim Chunks 1 and 2's "Notes / decisions" for the two lessons carried forward below.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md §4
   — the localhost / DEFAULT_TENANT_ID trap. This chunk WILL hit it; see "working locally".

YOUR TASK: Chunk 3 only — "Tour entry: no more 'Tour paused'".
Max has approved Chunk 3 specifically. Implement it, then STOP and report back. Do not start
Chunk 4; chunks are strictly sequential by Max's instruction.

SHIP ROUTE — IT INVERTS FROM LAST TIME:
Chunk 2 touched shared files and needed the full staging pass. CHUNK 3 DOES NOT. Both files
are demo-only (gated on DEMO_TENANT_ID, rendering for no other tenant), so per ground rule 1
this goes straight to `master` once you have verified it. No staging pass required.
Still true and still worth knowing: there is only ONE deployment. demo.vineworks.ge and
nikalasmarani.vercel.app are the same code and the same production database, distinguished
only by which tenant the domain resolves to. So even a demo-only change ships alongside
Nikalas Marani's real site — confirm the gating actually holds before you push.

SCOPE — READ THIS TWICE, IT IS THE EASIEST MISTAKE TO MAKE HERE:
When you open DemoTour.tsx you will find a much more visible bug than the one you are fixing:
the tour does not draw its spotlight ring on 6 of its 7 steps, because the data-tour anchors
fail to resolve and it degrades silently to a centred tooltip. DO NOT FIX THAT. It is Chunk 4,
it is shared (it means adding anchors to admin pages every tenant renders, so it needs the
staging pass), and it is deliberately sequenced after this one. Chunk 3 is ONLY the tour's
entry (3.1, 3.2) and its ending (3.3).

WHAT YOU DON'T NEED TO RE-DERIVE (already measured and recorded):
- The "Tour paused" dead end is a GOOD RULE MISFIRING, not a broken tour. Step 1 declares the
  guest-site route, and the tour deliberately refuses to dim a screen the visitor navigated to
  themselves. That constraint is load-bearing (Plan-DemoRedesign Phase 2) and it STAYS. The
  only change is that it must not apply to an explicit press of the start button.
- The path that exposes it: front door -> first card, "I run a winery" -> lands on
  /admin/orders -> press "Show me what this does" -> "Tour paused - step 1 of 7 - Resume".
  The visitor asked for the tour and was told the tour is paused.
- The auto-start is APPROVED and its terms are already set: once per browser (localStorage,
  same pattern as the front door), prominent skip, and ONLY on the "I run a winery" path —
  never on top of someone who chose the guest view or the live mirror.
- Step 7 ends on the Site Content editor with a bare "Done" and no next move. The demo has no
  conversion surface at all; 3.3 is where that gets fixed.

BLOCKED PARTWAY — ASK MAX BEFORE BUILDING 3.3:
Task 3.3 needs a second CTA alongside "Now try it yourself: make a booking and watch it
arrive" (which deep-links into /live). The plan says to decide the second CTA with Max before
building, and that decision has NOT been made. Build 3.1 and 3.2 first, then ask him. Do not
invent a CTA — it is the demo's only conversion surface and what it does is his call (email,
WhatsApp, a calendar link, a form).

WORKING LOCALLY — THE TRAP THAT BITES THIS CHUNK SPECIFICALLY:
localhost resolves to DEFAULT_TENANT_ID in saas/.env, which is currently Staging Winery
(cmrxb85wo0000vlc0d964nzf8). Staging Winery renders NO demo components at all, so you will
see nothing you are trying to fix. To preview the demo locally, temporarily point
DEFAULT_TENANT_ID at the DEV demo tenant cmtvgl6e60000vl6w9se65t86, and revert it before
committing (ground rule 4 + MaintenanceNotes section 4). Forgetting the revert is how a
local-only env change reaches master.

RULES THAT ACTUALLY BITE ON THIS CHUNK:
- Verify against PRODUCTION after deploy, not just dev. "Dev passing is not evidence" is
  ground rule 5 and it has cost this project four separate bugs.
- Two methodology lessons from the last two chunks, both earned the hard way:
  (a) Chunk 1 — a component can find its target, style it, and still be invisible because it
      marked the copy nobody is looking at. /admin/orders renders its orders TWICE (a table
      "hidden md:block" and a card list "md:hidden") and Tailwind picks on the PANE's width,
      not the viewer's. Any code reaching into an admin surface must resolve which
      representation is actually RENDERED. The tour anchors into admin pages, so this applies.
  (b) Chunk 2 — console buffers persist across same-origin navigations. One error on the first
      page reads as "it fires on every route" if you navigate and re-read without clearing.
      Verify per-load, not per-session, or you will draw the wrong conclusion.
- Stop the dev server before any prisma command (ClaudeInstructions Rule 10). Unlikely here,
  but it fails silently when it does.

WHEN YOU FINISH:
1. Tick the boxes in Plan-DemoFlowFixes.md, set Chunk 3's Status to Done, rewrite its Resume
   point and the Overall resume point.
2. Record 3.3's agreed CTA in Chunk 3's "Notes / decisions" — it is a product decision that
   the marketing site and later chunks will need to match.
3. Update SessionLog.md, FeatureLog.md and KnownBugs.md per ClaudeInstructions Rule 1.
   FeatureLog row 163 (the demo spotlight tour) is currently marked Broken and cites BOTH the
   entry bug and the anchoring bug — resolve only the entry half of that row and leave the
   anchoring half flagged for Chunk 4. Do NOT flip it to Done while 6 of 7 steps draw no ring.
4. Report to Max, then wait for approval before Chunk 4.

DON'T:
- Don't fix the tour's anchoring / spotlight ring. Chunk 4, shared, staging pass.
- Don't fix the feature rail or the duplicate bug-report button. Chunks 4 and 6.
- Don't redesign the demo chrome palette — decided ("cellar dark"), it belongs to Chunk 5.
- Don't touch the mobile layout. Desktop-first is a recorded decision.
- Don't re-open the "Decisions already made" section, in particular the tour auto-start and
  "admin landing stays on Orders" — both are settled.

HOUSEKEEPING, IF STILL PRESENT:
Chunk 1's verification left a real test booking in the live demo data — "Luka Testashvili",
4 guests, 20 Oct 2026. Confirmed still present 2026-09-11 (395 rows against a 394 seed
baseline); the 03:00 UTC nightly reseed did NOT clear it, which may itself be worth a look.
Ask Max whether to delete it rather than deleting it yourself; it is a production write.
```
