---
tags: [index, demo, vineworks]
---

# Demo Site — start here

Everything about `demo.vineworks.ge`, the public self-serve sales demo for the Vineworks
platform. **If you are a new session picking this work up, read in this order.**

---

## The files

| # | File | What it's for |
|---|---|---|
| 0 | **[[Plan-DemoFlowFixes]]** | 🔴 **The live task tracker (current work).** Chunks 1–8, strictly sequential, checkboxes, per-chunk resume points. Fixes what the redesign build got wrong. **Start here.** |
| 1 | [[Plan-DemoRedesign]] | The previous tracker — Phases 0–4, all ✅ complete. History now, but read it for why each piece exists and for the load-bearing constraints. |
| 2 | [[DemoDirections]] | The design review that produced the plan. Why each direction exists, what it fixes, what to watch out for. |
| 3 | [[Research-DemoPatterns]] | Industry research behind the decisions, with sources and a caveat about the numbers. |
| 4 | [[Plan-DemoSite]] | The original build log — how the demo tenant, rebranding, role-switcher and prod cutover were done (2026-09-10). History, not current work. |
| 5 | `demo-directions.html` | Source of the published design-review artifact, with mockups drawn on the real UI. Re-publish or edit this rather than rebuilding it. |

**Published artifact (the visual version of [[DemoDirections]]):**
https://claude.ai/code/artifact/8775d152-5e9a-44d4-9380-e334b305cc7f

---

## State of play, 2026-09-10

**Live and working:** `demo.vineworks.ge` serves a rebranded "VineWorks Estate" tenant
cloned from Nikalas Marani, with a role-switcher banner (Customer View ↔ Winery Admin
View) and a small guided checklist overlay ([[FeatureLog]] #158, #159). The full
book-as-customer → see-it-in-admin loop works in production.

**The problem:** it doesn't sell. A cold visitor sees an unexplained winery site, and the
admin panel they're meant to be impressed by is **completely empty** (`No orders found`,
`0₾` revenue) with a "Finish setting up your account" banner on top. Max flagged this
directly; [[DemoDirections]] is the response.

**Agreed plan:** all four directions approved, seeding first.

**Status, 2026-09-10 — the redesign is finished.** All five phases of
[[Plan-DemoRedesign]] are built, verified and live:

- **Phase 0** — the winery trades: 403 bookings, 30,998₾ of future revenue, both charts
  drawing a seasonal curve, a named cast of tour operators and B2B buyers, no setup
  banner. Regenerates nightly. ([[FeatureLog]] #160, #161)
- **Phase 1** — a front door that says what Vineworks is, and no more `/admin` dead end. (#162)
- **Phase 2** — a spotlight tour whose seven steps name money, not buttons. (#163)
- **Phase 3** — a feature rail surfacing sixteen capabilities that were invisible. (#164)
- **Phase 4** — `demo.vineworks.ge/live`: the guest site and the back office side by side. (#165)

**⚠️ One action for Max:** add `CRON_SECRET` to the Vercel production environment, or the
nightly regeneration returns 503 and the demo never resets.

**Safe to share.** The abuse guardrails are done ([[FeatureLog]] #166): the demo tenant
sends **no** outbound email at all, and public writes are capped at 5 per IP per 10
minutes. Both are demo-only and leave real wineries untouched.

---

## State of play, 2026-09-11 — the flow was torn down and it doesn't hold up

Max: *"there are some bugs and quirks and some features that look just a bit out of date in
use even though the idea behind it is strong."* Correct again. A hands-on teardown (Playwright,
real Chrome, production, one real booking traced) found **5 flow-breaking issues and 8 polish
issues**. Report: https://claude.ai/code/artifact/72a9a58c-7a3b-4ce6-8ad3-4abc08c32026

**The finding in one sentence:** everything was built; the layer that points at it fails
silently. Three components — the tour, the rail's callouts, the mirror's landing moment — all
find their target and then never show it to you.

The three that matter most:
- **The live mirror's payoff is 4,769px below the fold.** A real booking saves, the counter
  ticks, the "Just landed" pill fires — and the row is six screens down with no outline applied.
- **Six of seven tour steps draw no spotlight at all.** Step 4 works, which proves the
  machinery is fine — the anchors aren't resolving, and failure is silent, which is why it shipped.
- **Starting the tour from the admin panel says "Tour paused."** The first front-door card's
  most likely path hits a dead end.

**Plus:** the demo chrome is in an indigo-violet that appears nowhere else in VineWorks — the
main source of the "out of date" feeling.

**All of it is chunked and prioritised in [[Plan-DemoFlowFixes]].** Max approved the plan and
the order on 2026-09-11; **no code has been written yet.**

---

## Quick reference

| Thing | Value |
|---|---|
| Live URL | `https://demo.vineworks.ge` |
| Tenant slug | `vineworks-demo` |
| Tenant ID — dev DB | `cmtvgl6e60000vl6w9se65t86` |
| Tenant ID — prod DB | `cmtvi582n0000vl7kjq44ir5p` |
| Gate env var | `NEXT_PUBLIC_DEMO_TENANT_ID` |
| Demo admin | `demo-admin@vineworks.ge` (password in `credentials.txt`) |

**Before touching code:** [[ClaudeInstructions]] Rule 0 (staging → master git workflow)
and [[MaintenanceNotes]] §4 (the `localhost` / `DEFAULT_TENANT_ID` trap).
