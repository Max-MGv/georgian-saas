---
tags: [handoff, demo, vineworks]
---

# Handoff — starting the demo flow fixes

**How to use this:** copy the block below into a fresh Claude Code session. It is written to
be self-contained — a session with no memory of the teardown can start work from it.

**Supersedes** the previous handoff (for [[Plan-DemoRedesign]], now complete). Written
2026-09-11.

**When Chunk 1 is done**, the prompt for Chunk 2 is the same block with two edits: change
"Chunk 1" to "Chunk 2" in the task line, and drop the "the measurements you don't need to
re-derive" section (it is Chunk-1 specific). Every chunk in the plan carries its own resume
point and verification criteria, so the shape of this prompt works for all eight.

---

## The prompt

```
This is the Vineworks project (multi-tenant SaaS for Georgian wineries). I want you to start
implementing fixes to the public sales demo at demo.vineworks.ge.

READ FIRST, IN THIS ORDER:
1. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\ClaudeInstructions.md
   — how to behave on this project. Rule 0 (git) and Rule 8 (confirm before editing) both
   apply to this work.
2. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\DemoSite\Plan-DemoFlowFixes.md
   — THE TASK TRACKER. Read the status table, the ground rules, the "Decisions already made"
   section, and then Chunk 1 in full.
3. C:\Users\Max\Desktop\claude-projects\georgian-saas\vault\MaintenanceNotes.md §4
   — the localhost / DEFAULT_TENANT_ID trap you will hit when previewing the demo locally.

BACKGROUND, SO YOU DON'T RE-DERIVE IT:
The demo was fully built across five phases (Plan-DemoRedesign, all complete). A hands-on
teardown on 2026-09-11 found that three separate components locate their target element and
then never show it to the viewer — silently, which is why they all passed review. The fixes
are broken into 8 sequential chunks in Plan-DemoFlowFixes.md. Do not re-run the teardown;
its findings are already written down with measurements.

YOUR TASK: Chunk 1 only — "The flagship lands".
Max has approved Chunk 1 specifically. Implement it, then STOP and report back. Do not start
Chunk 2; chunks are strictly sequential by Max's instruction, and Chunk 2's approach depends
on what Chunk 1's task 1.3 finds.

THE MEASUREMENTS YOU DON'T NEED TO RE-DERIVE (all taken on production, 2026-09-11):
- A real booking through /live works end to end: guest saw "Booking received! 280₾", the admin
  pane reloaded, the header count went 393 → 394, and the green "Just landed" pill fired.
- But the new row rendered at y = 4,769px inside the admin pane — about six screens down —
  because the orders table sorts by VISIT date, not creation date, and the test booking was
  for 20 October while the list opens on 31 December.
- And no outline was applied: checked computed styles on the matched row plus six ancestors,
  result "no outline found", ~6 seconds after submit (well inside the 20s re-assert window
  that Plan-DemoRedesign Phase 4.3 describes).
So the feature's whole promise currently resolves to a counter incrementing by one.

WHAT GOOD LOOKS LIKE WHEN YOU'RE DONE:
A booking submitted in the guest pane on a 1440x900 desktop is visible in the admin pane
WITHOUT the viewer scrolling, and is visibly marked as new. Verified on production with a
real booking, with a screenshot for Max.

RULES THAT ACTUALLY BITE ON THIS CHUNK:
- Chunk 1 touches demo-only files (LiveMirrorClient.tsx, app/live/), so per Max's standing
  decision it goes STRAIGHT TO master rather than through staging. Confirm the file list is
  genuinely demo-only before you rely on that. Anything shared takes the staging pass.
- Verify against PRODUCTION timings, not dev. Four separate bugs in the previous plan came
  from assuming a render had finished; dev passing is not evidence.
- prefers-reduced-motion must be respected on the scroll (drop to behavior:'auto').
- Task 1.2 is a real decision, not a formality: the scroll alone depends on the name-match
  succeeding, so pick a second mechanism (sort newest-created-first in the mirror pane, or a
  pinned "just added" group, or defaulting the guest form's date to the soonest open date).
  Record which you chose and why in the plan file.
- Task 1.4 is the one agreed mobile exception: /live's copy still says "left"/"right" while
  the panes stack below 900px. Fix the STRING only — no mobile layout work, Max is
  desktop-first for now.

WHEN YOU FINISH:
1. Tick the boxes in Plan-DemoFlowFixes.md, set Chunk 1's Status to Done, and rewrite both
   its Resume point and the Overall resume point.
2. Record task 1.2's decision and task 1.3's finding in that file's "Notes / decisions"
   section — 1.3's finding is the input to Chunk 2, so it must be written down.
3. Update SessionLog.md, FeatureLog.md (#165 is currently marked Broken — update it honestly)
   and KnownBugs.md (#24, and #29 if the duplicate bug button is gone as a side effect), per
   ClaudeInstructions Rule 1.
4. Report to Max with a screenshot, then wait for approval before Chunk 2.

DON'T:
- Don't redesign the demo chrome palette — it's already decided ("cellar dark", in the plan's
  Decisions section) and it belongs to Chunk 5.
- Don't fix the tour or the feature rail. Chunks 3 and 4.
- Don't touch the mobile layout.
- Don't re-open decisions recorded in the plan's "Decisions already made" section.
```

---

## Quick reference for whoever picks this up

| Thing | Value |
|---|---|
| Live demo URL | `https://demo.vineworks.ge` |
| Demo tenant slug | `vineworks-demo` |
| Demo tenant ID — dev DB | `cmtvgl6e60000vl6w9se65t86` |
| Demo tenant ID — prod DB | `cmtvi582n0000vl7kjq44ir5p` |
| Env var driving the gate | `NEXT_PUBLIC_DEMO_TENANT_ID` |
| Staging Winery (regression check) | `cmrxb85wo0000vlc0d964nzf8` |
| Demo admin | `demo-admin@vineworks.ge` (password in `credentials.txt`) |
| Vercel project | `georgian-saas` · team `mg-productions-projects` |

**Tooling note worth knowing:** the Browser pane's screenshots were unusable in the
2026-09-10 session (rendered at a fraction of the requested viewport, clicks timing out) and
that caused a real false finding — two features were reported as "could not confirm" when
they were fine. The 2026-09-11 session used `playwright-cli` against real Chrome instead and
everything worked, including frame-level access into `/live`'s iframes and computed-style
measurement. **Use `playwright-cli` for anything visual on this project.** Its skill is
available in-session; `playwright-cli open`, `resize 1440 900`, `screenshot --filename=x.png`,
then read the PNG.
