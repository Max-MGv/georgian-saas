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
| 1 | **[[Plan-DemoRedesign]]** | 🔴 **The live task tracker.** Phases 0–4, checkboxes, resume points. This is the working document — keep it current. |
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

**Progress, 2026-09-10 (session 5):** **Phase 0 is done and live.** `demo.vineworks.ge`
now shows a winery that actually trades — 403 bookings, 30,998₾ of future revenue, both
statistics charts drawing a real seasonal curve, a named cast of six tour operators and
four B2B wine buyers, and no "Finish setting up your account" banner ([[FeatureLog]] #160).
Only task **0.6 (scheduled regeneration)** is outstanding, and it blocks nothing.
**Resume at Phase 0 task 0.6, or start Phase 1 — the front door.**

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
