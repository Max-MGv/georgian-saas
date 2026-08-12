---
tags: [playwright, test, tier1]
---

# 02. Popover / dropdown clipping

**Status:** ✅ Built and passing (2/2) — `saas/tests/tier1-regression/popover-clipping.spec.ts`
**Tier:** 1 — regression suite
**Regression guard for:** `KnownBugs.md` #7 (HelpHint clipped by `overflow-hidden` ancestor) and the earlier #140 (OrdersTable status dropdown clipped by scroll wrapper) — same bug shape, two prior occurrences
**File:** `tests/tier1-regression/popover-clipping.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

Any absolutely-positioned popover/dropdown nested inside a card, scroll container, or anything with `overflow-hidden`/`overflow-auto` is at risk of being silently clipped to a near-invisible sliver. `HelpHint.tsx` fixes this via a `document.body` portal, but this test exists to catch a *future* popover built without reusing that pattern (per the note in `KnownBugs.md` #7: "if you ever build a new popover from scratch... check it renders fully on screen").

## Triggers covered (parametrized)

- `HelpHint` instances on `/admin/companies` (Modules checkboxes, Individuals pricing concept)
- `HelpHint` on `/admin/settings` (Admin Panel Language vs. Site Language)
- `OrdersTable`'s per-row status dropdown on `/admin/orders`
- Any `HelpHint` added since (check current call sites during explore pass — `AdminHintsContext` wiring means new ones may exist beyond what's listed in `SessionLog.md`)

## Steps & assertions

For each trigger:

1. Click the trigger ("?" icon for HelpHint, the status badge for the Orders dropdown).
2. Wait for the popover/dropdown to render.
3. **Check:** `getBoundingClientRect()` of the popover element — `top >= 0`, `left >= 0`, `right <= viewport.width`, `bottom <= viewport.height`. Any violation means it's clipped or overflowing off-screen.
4. **Check:** rendered height `> 20px`. This specifically catches the #7 failure mode — a `1px` visible sliver still passes a plain `toBeVisible()` check (the element technically has non-zero size and is in the DOM), so height alone doesn't prove it rendered correctly; this threshold does.
5. **Check:** `textContent.length > 0` on the popover — confirms real content rendered, not an empty clipped box.
6. Click outside / press Escape. **Check:** popover is dismissed (regression check for `HelpHint`'s documented outside-click and Escape-dismiss behavior from `SessionLog.md` part 7).

## Notes / open questions

- Covers 2 triggers so far: the Orders page's "?" HelpHint (next to Print Sheet) and the per-row status dropdown. Confirmed live: `HelpHint`'s popover has `role="tooltip"`, real height ~104px (not a sliver). The status dropdown's option buttons (`role="button"`, exact status name) are checked individually rather than their wrapping `<div>`.
- **Real finding — measurement technique, not an app bug:** the status dropdown's wrapping `<div>` (`position: absolute` inside a `<td>`) returned an all-zero `getBoundingClientRect()` via raw `page.evaluate`, despite rendering correctly (confirmed via screenshot — fully visible, no clipping). Likely a Chromium quirk with absolutely-positioned elements inside table cells. Playwright's own `locator.boundingBox()` on the individual option buttons did not have this problem and was used instead — worth remembering if a future table-embedded popover test gives a suspicious 0×0 result: check visually before concluding it's a real clipping bug.
- Only 2 of the triggers listed in the original scope (Companies-page and Settings-page `HelpHint`s) are still uncovered — same `HelpHint` component, low marginal risk, could be added later if time allows but not blocking.
- Desktop viewport only so far (1280×800, matching the login session default) — the 375px case is deferred; the original #7 bug wasn't width-specific, so desktop coverage already exercises the core regression.
