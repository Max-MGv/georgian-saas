---
tags: [plan, demo, vineworks, ux]
---

# Plan — Demo Flow Fixes (making the demo flow seamless)

> **This is the live task tracker for the flow-fix work.** Update the checkboxes and each
> chunk's Status line as work happens. **Chunks are strictly sequential — do not start
> chunk N+1 until chunk N's Status is ✅.** If a session ends mid-chunk, that chunk's
> "Resume point" line says exactly where to pick up.

**Where this came from:** a hands-on teardown of the live demo on 2026-09-11 (Playwright,
real Chrome, production site, desktop 1440×900 + mobile 360×732, one real booking submitted
and traced). Published report:
https://claude.ai/code/artifact/72a9a58c-7a3b-4ce6-8ad3-4abc08c32026

**The previous plan** ([[Plan-DemoRedesign]]) built all five phases and is complete. This
plan fixes what the build got wrong. Design rationale for the original directions:
[[DemoDirections]].

**The one-sentence finding:** everything was built; the layer that points at it fails
silently. Three separate components — the spotlight tour, the feature rail's callouts, and
the live mirror's landing moment — all find their target and then never show it to you.

---

## Current status

| Chunk | What | Ship route | Status |
|---|---|---|---|
| **1** | The flagship lands — mirror scrolls to the new booking (+ mobile copy) | demo-only → `master` | ✅ Done (2026-09-11, verified on production) |
| **2** | The hydration mismatch (React #418) | shared → `staging` | ✅ Done (2026-09-11, shipped to `master`, verified on production) |
| **3** | Tour entry — no more "Tour paused", auto-start, real ending | demo-only → `master` | ⬜ Not started |
| **4** | Tour + rail anchoring — make the spotlight actually spotlight | shared → `staging` | ⬜ Not started |
| **5** | Demo chrome palette + front door layout | demo-only → `master` | ⬜ Not started |
| **6** | Bug-report widget off the demo tenant | shared → `staging` | ⬜ Not started |
| **7** | Admin landing readability | shared → `staging` | ⬜ Not started |
| **8** | Onboarding path + super-admin "Reset demo" button | shared → `staging` | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** 🔜 **Chunks 1 and 2 are ✅ and both shipped to production. Begin at
Chunk 3.** Chunk 2's notes are worth skimming first for one transferable lesson: the bug was
invisible from Georgia because the server is UTC/en-US and every browser to hand is
en-US/Asia/Tbilisi — when something "can't be reproduced", check whether the *environment* is
what hides it. [[ClaudeInstructions]] Rule 8 applies per chunk and **Max has approved Chunks 1
and 2 only**, so ask before starting Chunk 3.

---

## Ground rules for every chunk

1. **Git workflow** — [[ClaudeInstructions]] Rule 0, with the demo split Max ruled on
   2026-09-10: **demo-only files** (components gated on `DEMO_TENANT_ID`, demo-only routes,
   scripts) go straight to `master`; **shared files** (anything every tenant renders) take
   the `staging` pass first. Each chunk's ship route is in the table above — it is not a
   guess, it was decided per chunk.
2. **Regression-check a real tenant** before shipping anything from a shared file. Staging
   Winery (`cmrxb85wo0000vlc0d964nzf8`) is the check; no demo chrome should render there.
3. **The demo tenant is a real tenant in the real production database.** Anything that
   writes to it is a production write.
4. **Local preview trick** — `localhost` resolves to `DEFAULT_TENANT_ID` in `saas/.env`.
   To preview the demo locally, point it temporarily at the **dev** demo tenant
   `cmtvgl6e60000vl6w9se65t86`, then **revert before committing**. [[MaintenanceNotes]] §4.
5. **Verify against production timings, not dev ones.** The single most repeated mistake in
   [[Plan-DemoRedesign]] was assuming a render had finished — four separate bugs, same
   cause. Dev passing is not evidence.
6. **Update this file as you go.** Tick boxes, move the Status, rewrite the Resume point.
   Then [[SessionLog]], [[FeatureLog]], [[KnownBugs]] per [[ClaudeInstructions]] Rule 1.

---

## Decisions already made (do not re-litigate)

Recorded 2026-09-11 from Max's answers, so a later session doesn't reopen them.

### Desktop-first
**Build for desktop now; mobile support comes later.** Max: *"we can build for desktop right
now, we will add support for mobile in the future."* This drops the mobile *layout* work out
of scope entirely.

**The one exception Max agreed to:** the mobile *copy* is currently wrong, not just
unpolished — `/live` says "Book on the left. Watch it arrive on the right" while the panes
are stacked vertically. If the demo link is ever pasted into WhatsApp that is the first
sentence a winery owner reads. Fixing the string is minutes and is not a mobile project, so
it rides along in Chunk 1.

### The tour auto-starts
Approved. It starts once per visitor on the "I run a winery" path, with a prominent skip.
**Why:** the design review's whole case against the old corner checklist was "nobody reads
the corner box" — and the replacement's *entry point* is still a corner pill, so the
original problem only moved up one level.

### Front-door path 4 → a super-admin reset button
Max's idea, and better than the nightly-reset-only plan: **give Max a "Reset demo" button in
super-admin** so he can reset the demo on demand before a sales call, rather than waiting for
the 03:00 UTC cron. Scoped in Chunk 8 as **both** — the button *and* the onboarding-flag
reset inside the existing nightly reseed, because a visitor who wanders through the wizard
otherwise leaves it half-completed for the next visitor.

### Admin landing stays on Orders
Approved. Keep `/admin/orders` as the landing for "I run a winery" (393 bookings is a real
wow), but compact it: hide the Food and Masterclass columns by default and add a three-number
revenue strip above the table, so money and volume both land in one screen. Chunk 7.

### The hydration bug gets fixed now
Approved, and it is sequenced **second** deliberately: it is the most likely reason the live
mirror's row outline isn't applying, so it may be on the critical path for the flagship
rather than separate cleanup. Chunk 2 is informed by what Chunk 1 finds.

> **Superseded in part, 2026-09-11 — Chunk 1 answered this and the answer was "no".** The
> outline was not being eaten by hydration; it was being applied to a `display:none` copy of
> the orders list (Chunk 1, task 1.3). The highlight now holds on production *while #418 is
> still firing*. The decision to fix the hydration bug stands — it is real and it affects
> real tenants — but **its slot at #2 was justified by a premise that is now disproved**, so
> the ordering is Max's to re-confirm. This is the one item in this section that new evidence
> is allowed to reopen, because it was recorded as a bet on what Chunk 1 would find.

### The demo chrome palette — "cellar dark" (Claude's choice, Max delegated)

The problem being fixed: the front door, tour tooltip, feature rail and top banner are all
built in a saturated indigo-violet (`#4A3FD1` / `#1E1B4B`) that appears **nowhere else** in
VineWorks. The product underneath is cream, ivory and wine red. Four surfaces in a palette
borrowed from another product is what reads as "template bolted on" — this is the main source
of Max's "looks a bit out of date in use."

| Token | Value | Use |
|---|---|---|
| `--demo-ground` | `#1E0E11` | overlay scrim base, front-door ground |
| `--demo-surface` | `#2E171C` | cards, tooltip body, rail body |
| `--demo-raised` | `#3D2026` | hover / selected rows |
| `--demo-border` | `#52302F` | hairlines |
| `--demo-text` | `#F7EDE4` | primary text — warm ivory, same family as the site cream |
| `--demo-muted` | `#C9AAA2` | secondary text |
| `--demo-accent` | `#C9565C` | links, arrows, progress |
| `--demo-accent-solid` | `#8F2229` | filled CTA background, white text |

**A deliberate refinement of the teardown report's own recommendation.** The report said
"rebuild the demo chrome on the tenant's `var(--site-*)` tokens." That is wrong on reflection
and the plan does **not** do it: the demo chrome is the *platform* speaking about the tenant,
and it has to stay legible over all 16 theme presets — inheriting tenant tokens would give
dark-on-dark on any of the 5 dark presets. So the chrome takes a **fixed platform palette**,
derived from the brand wine `#7C1D23` and kept warm and dark so it reads as a distinct layer
over the cream product while still belonging to the same world (a cellar, not a dashboard).

---

## Chunk 1 — The flagship lands

**Status:** ✅ Done — 2026-09-11, shipped to `master` as `9959711`, verified on production.
**Resume point:** Nothing outstanding. Chunk 1 is closed; go to Chunk 2 (but read the Notes
below first — 1.3's finding changes Chunk 2's premise).
**Ship route:** demo-only files → straight to `master`.
**Fixes:** report findings A3 (landing moment) + A4's copy half.

### The problem, measured
A real booking was submitted through the mirror on 2026-09-11. Everything behind the scenes
worked — the guest saw "Booking received! Total 280₾", the admin pane reloaded, the counter
went 393 → 394, the green "Just landed" pill fired. But:

- The new row sits at **y = 4,769px** inside the admin pane — roughly six screens down —
  because the table sorts by **visit date** and the test booking was for 20 October while
  the list opens on 31 December.
- The per-row outline described in [[Plan-DemoRedesign]] Phase 4.3 **was not applied at
  all** (checked computed styles on the row and six ancestors: "no outline found").

So "book on the left and watch it appear on the right" currently resolves to a counter
incrementing by one, which nobody notices. **This is the highest value-per-character fix in
the whole plan.**

### Tasks
- [x] **1.1 — Scroll the matched row into view.** The mirror already locates the row by the
      guest's name in order to style it; it just never scrolls to it. Add
      `scrollIntoView({ block: 'center', behavior: 'smooth' })` — honour
      `prefers-reduced-motion` by dropping to `behavior: 'auto'`. This alone fixes the
      headline problem.
- [x] **1.2 — Make the row land where the eye already is.** Decide and record here: either
      sort the mirror's admin pane newest-created-first, or add a "just added" group pinned
      at the top of that pane, or default the guest form's date to the soonest open date so
      a submitted booking is near the top of "Upcoming" anyway. 1.1 + one of these should be
      belt and braces — the scroll can't be the only mechanism, because it depends on the
      name match succeeding.
- [x] **1.3 — Find out why the outline isn't applying.** Do not guess. Check whether the
      marks are being applied and then discarded (the Phase 4.3 notes say hydration
      reconciliation ate them before, "fixed" by re-asserting every tick for 20s) or never
      applied at all. **Whatever this finds is the input to Chunk 2** — write the answer here.
- [x] **1.4 — Fix the mobile copy** (the agreed desktop-first exception). `/live`'s headline
      and body still say "left" / "right" while the panes stack below 900px. Needs a
      viewport-aware string: "Book here. Watch it arrive below." Copy only — no layout work.
- [x] **1.5 — Verify with a real booking on production at 1440×900.** The new row must be
      visible without the viewer scrolling, and visibly marked. Screenshot for Max.

### Notes / decisions

#### 1.3's finding — the answer, measured on production 2026-09-11

**The pane was showing the card list, and the code was marking the table.**

`/admin/orders` renders its orders twice: a table inside `<div class="hidden md:block">` and
a card list inside `<div class="flex flex-col gap-2 mt-4 md:hidden">`. Tailwind picks between
them on the **pane's** width, not the viewer's — and in the mirror the admin pane is an iframe
**691px wide** on a 1440×900 desktop, i.e. below the 768px `md` breakpoint. So on the demo's
flagship screen the table is `display:none` and the cards are the real list.

Measured directly in the live production frame, before any change:

| Thing | Measurement |
|---|---|
| Admin pane iframe width | 691px (`md` breakpoint is 768px) |
| `tbody tr` count | 394 — all present in the DOM |
| Every one of those rows | `0 × 0`, inside a `display:none` ancestor |
| Visible card list | 394 cards, 643 × 179 each, document `scrollHeight` **74,001px** |

So the Phase 4.3 code was working *exactly as written* and still invisible: it found its row,
set `outline`, and called `scrollIntoView` on it — but on an element in a hidden subtree, where
an outline cannot be seen and **`scrollIntoView` is a no-op**. That is the whole bug. The
teardown's "checked the row and six ancestors, no outline found" was correct: it was reading
the visible card, which nothing had ever touched.

**This is the input Chunk 2 was waiting for, and it is a negative result: it was never
hydration.** Two independent confirmations —
1. the marks were never applied to the visible element in the first place, so there was nothing
   for hydration to discard; and
2. after the fix, the highlight holds steady for the full 20s window on production **while
   React error #418 is still firing on that same page** (re-checked in the console after the
   verification booking).

So **Chunk 2 is no longer on the flagship's critical path**. It is still a real bug worth
fixing — it makes the page do needless work and it is a live hazard for anything that measures
or writes server-rendered DOM — but the reason it was promoted to slot #2 ("it may be why the
outline isn't applying") is now disproved. Worth asking Max whether it keeps that slot or drops
below the visible-polish chunks.

**The generalisable lesson, which is the same one the teardown drew:** three components find a
target and never show it. Add a fourth failure mode to that list — *found the target, showed it,
but showed the copy nobody is looking at.* Any code reaching into the admin pane must resolve
which of the two representations is **rendered**, not assume the table.

#### 1.2's decision — pin the matched order to the top of the pane, identified by a pre-reload snapshot

Of the three options offered, the other two were ruled out on the ship route rather than on
merit:

- *Sort the mirror's admin pane newest-created-first* — the pane is an iframe of the real
  `/admin/orders`, a shared product surface. Changing its sort means either a query parameter
  that exists solely for the demo (explicitly rejected when this component was first built) or
  changing the sort for every real winery. Both leave the demo-only ship route.
- *Default the guest form's date to the soonest open date* — lives in `BookingForm.tsx`, shared
  by every tenant, so it needs the `staging` pass and does not belong in Chunk 1.

**Chosen: the "just added" pin,** done entirely inside `LiveMirrorClient.tsx`, which is
demo-only. When the booking is matched, its card is moved to the head of its own container, so
it lands at the top of a 74,000px list instead of 4,769px down it. The move is a reorder
*within one parent*, which is the form of DOM meddling React tolerates — it never changes which
parent owns the node.

**And the identification no longer depends on the name match.** The mirror now snapshots the
signatures of every order visible in the pane immediately *before* triggering the reload; the
new order is the one that is not in that snapshot. The name is still the primary signal, but
the snapshot is what makes the match safe, and it is a genuine second mechanism — it works with
no name at all. It also fixes a real bug nobody had noticed: **the demo seed data reuses guest
names** (verified: "Nino Beridze" appears on more than one booking), so the old
`.find(name match)` returned the *first* booking under that name, not the new one. Among name
matches the code now prefers the one absent from the snapshot.

**One extra fix taken while in here, not in the task list:** the re-assert loop was calling
`scrollIntoView` on every one of its 100 ticks, which would have yanked the pane back every
200ms for 20 seconds as soon as the scroll started working. The scroll now fires once; only the
styles are re-asserted.

#### What 1.5 verified, on production

A real booking (Luka Testashvili, 4 guests, 20 Oct 2026 — deliberately the same shape as the
teardown's, a visit date far from the top of a list that opens on 31 December), submitted at
1440×900 through the guest pane on `demo.vineworks.ge/live`:

| Check | Before | After |
|---|---|---|
| Position in the visible list | 4,769px down | **index 0** — first card |
| Top of the card, in the pane | off-screen | 251px (pane viewport is 679px tall) |
| Outline | "no outline found" | `2px solid rgb(34,197,94)`, held for the full 20s window |
| "just now" pill | absent | present |
| Booking count | 393 → 394 | 394 → 395 |
| Visible without the viewer scrolling | ❌ | ✅ |

Console after the booking: only the pre-existing React #418, no new errors from the reorder.
1.4 re-checked in both directions — 390px wide gives "Book here. Watch it arrive below.",
1440px gives "Book on the left. Watch it arrive on the right."

### Files expected
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\LiveMirrorClient.tsx`
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\app\live\page.tsx`

---

## Chunk 2 — The hydration mismatch (React #418)

**Status:** ✅ Done — 2026-09-11, shipped to `master` as `e64ccbb`, verified on production.
**Resume point:** Nothing outstanding. Chunk 2 is closed. The one loose thread, deliberately not
pulled: the same unpinned `toLocale*` pattern exists in ~10 other admin and super-admin files
that were out of scope here — a sensible follow-up chunk, not a regression.
**Ship route:** shared file (wherever the culprit lives) → `staging` pass required.
**Fixes:** report finding C1. Already logged in [[KnownBugs]] as an open, undiagnosed note.

### What this bug actually is (plain language, for Max)
The server builds the page's HTML and sends it to the browser so something appears fast. React
then rebuilds the same page in the browser and compares the two. If any piece of **text**
differs between the two versions, React throws away the server's copy and redraws the whole
section from scratch.

Two consequences: the page does more work than it needs to, and **anything we draw onto the
page before React settles gets wiped**.

> **2026-09-11:** that second consequence was assumed to be the live mirror's disappearing row
> highlight. It was not — see Chunk 1's notes. The highlight was being drawn on a hidden copy
> of the list. The hazard is still real for any future code that writes to server-rendered
> DOM; it just was not what bit us.

### What is now known that wasn't before
- It fires on **every** route checked: `/`, `/wines`, `/admin/orders`, `/admin/statistics`,
  `/live`.
- The error arguments are **`args[]=text`** — so it is a *text node* mismatch, not an
  attribute or structural one. That is new information; the [[KnownBugs]] entry only said
  "not yet diagnosed."
- It is **not demo-specific** — already confirmed on Staging Winery, so it affects real
  tenants too.
- Prime suspects: anything formatted at render time from `new Date()` or a locale-dependent
  formatter, where the server (UTC, `fra1`) and the browser disagree. This demo is full of
  candidates — dates, times and ₾ amounts on every screen.

### Tasks
- [x] **2.1 — Reproduce locally in dev mode**, where React prints the exact mismatching text
      side by side. **Do not keep chasing this in production** — that is what made it cost
      three sessions' worth of debugging so far, including real time lost on the live mirror.
- [x] **2.2 — Identify the offending text node** and record it here. **Done — but the honest
      answer is "there are two call sites, not one node, and neither fires from Georgia."**
      See the notes below.
- [x] **2.3 — Fix it** by pinning the timezone/locale (or moving the formatting to a point
      where server and client agree).
- [x] **2.4 — Verify the console is clean** on all five routes above, on **production** after
      deploy, and re-check that Chunk 1's outline now survives. Done on staging *and* production
      (260 dates, 0 one-sided, on 395 live orders). Chunk 1's outline re-checked structurally
      only — no second test booking was made; see the note in the production section.
- [x] **2.5 — Close the [[KnownBugs]] entry** properly, including the "Hydration mismatch on
      public site pages" section, not just a status flip.

### Notes / decisions
#### 2.1/2.2's finding — measured 2026-09-11, second session on this chunk

**#418 does not currently fire anywhere, and the two mechanisms that can cause it are both
invisible from Georgia on an en-US browser — which is Max's setup and Claude's.**

##### What was checked, and came back clean

| Environment | Routes | Result |
|---|---|---|
| Local dev (`next dev`, Staging Winery via `DEFAULT_TENANT_ID`) | `/`, `/wines`, `/admin/orders`, `/admin/statistics` | no hydration error — and dev mode is where React prints the full side-by-side diff |
| Production, in-app browser | `/`, `/wines`, `/live`, `/admin/orders`, `/admin/statistics` | console clean |
| Production, Max's real Chrome (Grammarly installed) | `/wines` | console clean |

Console capture was **proved working** first (an injected `console.error` was captured), so
"clean" means clean, not unmonitored.

Beyond the console, a **direct SSR-vs-DOM text diff** was run: fetch the page's server HTML,
parse it, walk both trees' text nodes and compare. React repairs a text mismatch by keeping the
*client* value, so any mismatch shows up as an SSR-only/DOM-only pair. Results:

- `/admin/orders` on production — **12,582 text nodes, zero differences**
- `/wines` on production — 85 nodes, zero differences (in both browsers)

The only DOM-only strings anywhere were `🍷 Show me what this does` and `✦ What can it do?` —
the demo tour/rail pills, which mount in `useEffect` after hydration. Expected, not a mismatch.

##### Why it didn't reproduce — the environment actually matters

The server renders in **UTC** with a Node default locale of **en-US** (`fra1`). Both browsers
available here resolve to **en-US / Asia/Tbilisi**. That combination hides both mechanisms:

- **Numbers:** `ka-GE` and `en-GB` group digits *identically* to `en-US` (`1,234,567.5`).
  Only `de-DE` (`1.234.567,5`) or `ru-RU` (`1 234 567,5`) diverge.
- **Dates:** Tbilisi is **UTC+4**, a *positive* offset, so a midnight-UTC date value never
  crosses back over midnight. `20 Oct 2026` in UTC is still `20 Oct 2026` in Tbilisi.

This is very likely why three sessions failed: the bug was being hunted from the one timezone
and locale that cannot see it.

##### The two offending call sites — named, with the mechanism demonstrated

Neither is "the" single node, because there isn't one. Both are real, both are latent, and both
are **`toLocale*` called at render time in a client component without pinning**:

1. `saas/app/admin/(panel)/orders/OrdersTable.tsx:94`
   `new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })`
   — locale is pinned, **`timeZone` is not**, so it uses the runtime's zone: UTC on the server,
   the viewer's in the browser.
2. `saas/app/admin/(panel)/statistics/StatisticsV2.tsx:152, 216, 221, 242, 247`
   `Number(v).toLocaleString()` — **no locale argument at all**, so it uses the runtime's
   default locale: en-US on the server, the viewer's in the browser.

Demonstrated deterministically (same formatter, forced timezones):

| Value | Server (UTC) | Tbilisi (+4) | New York (−4) |
|---|---|---|---|
| `2026-10-20T00:00:00Z` (a visit date) | 20 Oct 2026 | 20 Oct 2026 | **19 Oct 2026** |
| `2026-09-10T21:30:00Z` (a `createdAt`) | 10 Sept 2026 | **11 Sept 2026** | 10 Sept 2026 |

So it breaks for **any viewer in the Americas** on ordinary visit dates, and it breaks **from
Georgia** for any displayed timestamp falling in the **20:00–24:00 UTC** window. `Order.date` is
a bare `DateTime` in the schema (`prisma/schema.prisma:91`), not `@db.Date`, so it can carry a
time component and land in that window.

That last row is the likely explanation for the teardown seeing #418 on `/admin/orders` and this
session not: **which rows fall in the 20:00–24:00 UTC window changes with the data**, and the
demo tenant is reseeded nightly at 03:00 UTC.

##### The "fires on every route" claim is probably an artifact — treat it as unproven

Two independent reasons to doubt it:

1. **Console buffers persist across same-origin navigations.** Observed directly this session: an
   injected `console.error` was still in the buffer after three full navigations within
   `demo.vineworks.ge`. A single #418 from the first page read as five routes' worth.
2. **`/`, `/wines` and `/live` contain no date or locale formatting at all** — verified by grep.
   The mechanism in the bug's own description cannot apply on three of the five routes.

This does not mean nothing was seen; it means "every route" should not be carried forward as
established fact. The bug is real but **intermittent and data-dependent**, not universal.

##### Recommended fix (NOT yet applied — needs Max's decision, and it is a shared file)

Pin both. The product question Max needs to answer is *which* timezone is authoritative: the
right answer is almost certainly **the winery's own zone (`Asia/Tbilisi`)**, so a booking for
20 Oct reads "20 Oct" to everyone — including the owner checking bookings from abroad, and any
future non-Georgian tenant's staff. That makes the fix:

- `OrdersTable.tsx:94` — add `timeZone: 'Asia/Tbilisi'` (or a per-tenant setting) to the options.
- `StatisticsV2.tsx` — give every `toLocaleString()` an explicit locale (`'en-US'`, matching what
  it renders today, so no visible change for anyone).

Both are one-line changes, both are **shared files** → `staging` pass + Staging Winery
regression check before `master`, per ground rule 2.

##### The fix, and what staging proved (2026-09-11)

Max chose **pin to `Asia/Tbilisi`** and **fix both now**. Shipped to `staging` as `30bbcc7`
(code) + `98180c4` (vault), deployed `fra1`, verified on **Staging Winery** — a real tenant,
per ground rule 2.

- `OrdersTable.tsx` — `timeZone: 'Asia/Tbilisi'` added to `formatDate`'s options.
- `StatisticsV2.tsx` — all five `toLocaleString()` calls given an explicit `'en-US'`, which is
  what they already rendered here, so nothing changes visually.

Both carry a comment explaining why the pin is there, so nobody "tidies" it away later.

**The verification that actually matters**, because it crosses the boundary the bug lives on:
staging's server renders in **UTC** (`fra1`) and the browser ran **Asia/Tbilisi**. Compared the
server HTML against the hydrated DOM on `/admin/orders` — **all 10 distinct dates present on both
sides, none appearing on only one side.** And those strings are *identical* to what the local dev
server produced rendering the same dev database from **Asia/Tbilisi**. A UTC server and a Tbilisi
server now agree, which is precisely the dependence the pin removes.

| Check, on staging (Staging Winery) | Result |
|---|---|
| `/admin/orders` console | clean; 17 rows render |
| `/admin/orders` SSR-vs-DOM dates | 10/10 match, 0 one-sided |
| `/admin/statistics` console | clean; server-rendered `1,800₾` matches DOM, grouping preserved |
| `/` and `/wines` console | clean |
| Demo chrome on Staging Winery | absent, as required |
| `tsc --noEmit` | clean |

**Shipped to production 2026-09-11 — see below.** Originally held here because [[ClaudeInstructions]] Rule 0 — the `staging` → `master` merge is
Max's call, and it ships to Nikalas Marani's live site. Task 2.4's production half is done once
that merge happens.

##### Production verification (2026-09-11, after Max approved the merge)

Merged `staging` → `master` (fast-forward, `e64ccbb`) on Max's explicit go-ahead and pushed.
Vercel production build `dpl_6t6Uuja4AMaykhnmKHy4WFrN4p9i`, region `fra1`, aliased to
`demo.vineworks.ge`, `nikalasmarani.vercel.app`, `vineworks.ge` and the rest. Switched back to
`staging` afterwards per Rule 0's guardrail.

The production check is a much stronger sample than staging's, because the demo tenant carries
395 orders against Staging Winery's 17:

| Check, on production | Result |
|---|---|
| `demo.vineworks.ge/admin/orders` — SSR vs hydrated DOM | **260 distinct dates, 0 one-sided**, 395 rows, UTC server vs Asia/Tbilisi browser |
| `demo.vineworks.ge` — `/`, `/wines`, `/admin/orders`, `/admin/statistics`, `/live` | consoles clean across the whole sequence (the buffer accumulates, so a single #418 anywhere would have surfaced) |
| `nikalasmarani.vercel.app` — `/`, `/wines` | clean, renders correctly, **no demo chrome** — the real-tenant regression check |
| `/live` | both panes mount (`/` and `/admin/orders`), desktop headline correct, console clean |

**One honest gap:** 2.4's "re-check that Chunk 1's outline survives" was verified structurally
(the mirror assembles and both panes load) but **not** by submitting another booking. That is a
production write, and there is already one un-cleared test row in the demo data. The change does
not touch `LiveMirrorClient.tsx`, and Chunk 1's own verification established the outline holds
while #418 was still firing — so the risk is low, but it is not the same as having watched it
again. Worth one real booking next time someone is in there anyway.

---

## Chunk 3 — Tour entry: no more "Tour paused"

**Status:** ⬜ Not started
**Resume point:** Do not start until Chunk 2 is ✅.
**Ship route:** demo-only → straight to `master`.
**Fixes:** report findings A2 (paused dead end), the approved auto-start, and B8 (dead ending).

### The problem
Take the most likely path a winery owner takes — the **first** front-door card, "I run a
winery" — and you land on `/admin/orders`. The only guidance on screen is the "Show me what
this does" pill. Click it and you get **"Tour paused · step 1 of 7 · Resume →"**. The visitor
has asked for the tour and been told the tour is paused.

The cause is a good rule misfiring. Step 1 declares the guest-site route, and the tour
correctly refuses to dim a screen the visitor navigated to themselves ([[Plan-DemoRedesign]]
Phase 2 made this a load-bearing constraint, and it is the right constraint). It just should
not apply to an explicit press of the start button.

Separately, the tour **ends in a cul-de-sac**: step 7 finishes on the Site Content editor
with a "Done" button and no suggested next move — the one moment where someone has just been
given seven reasons to care and nothing is asked of them. The demo has no conversion surface
at all.

### Tasks
- [ ] **3.1 — Explicit start navigates, never pauses.** When the visitor starts the tour,
      go to step 1's declared route and begin there. Keep the pause behaviour **only** for a
      tour already in progress whose visitor has wandered off — that constraint stays.
- [ ] **3.2 — Auto-start on the winery path**, once per browser (`localStorage`, same pattern
      as the front door), with the skip prominent. Only on the "I run a winery" path — do not
      auto-start on top of someone who chose the guest view or the live mirror.
- [ ] **3.3 — Give step 7 a hand-off.** Replace the bare "Done" with a real next step —
      "Now try it yourself: make a booking and watch it arrive" (into `/live`) plus a way to
      start a conversation with Max. Decide the second CTA with Max before building.
- [ ] **3.4 — Verify the full path end to end:** front door → "I run a winery" → tour
      auto-starts on the right screen → 7 steps → hand-off lands somewhere useful.

### Notes / decisions
_(3.3's second CTA needs Max's input — ask before building)_

### Files expected
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\DemoTour.tsx`
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\DemoFrontDoor.tsx`

---

## Chunk 4 — Tour + rail anchoring: make the spotlight actually spotlight

**Status:** ⬜ Not started
**Resume point:** Do not start until Chunk 3 is ✅.
**Ship route:** **shared** — adding `data-tour` anchors touches admin pages every tenant
renders → `staging` pass required, with a Staging Winery regression check.
**Fixes:** report findings A1 (no spotlight) + B7 (rail callout pinned to nothing).
**This is the biggest chunk. It is one bug wearing two coats — fix both components together.**

### The problem, measured
**Six of the seven tour steps draw no ring on anything.** The whole screen dims uniformly and
the tooltip falls back to a full-bleed bar docked across the bottom — the *mobile* treatment
— even at 1440px. **Step 4 is the only one that works**, and it proves the machinery is
fine: real cutout, real ring, compact tooltip beside the target.

So this is an anchor-resolution failure, not a rendering one. [[Plan-DemoRedesign]] Phase 2
records that a missing `data-tour` anchor "degrades to a centred tooltip with no ring" — that
silent degradation is firing on six steps out of seven, and **because failure is invisible,
it shipped.**

The cost is the entire premise. Direction 03 argued for dim → highlight → explain because
"the visitor can't be looking at the wrong thing while you make the point." On step 5 the
copy says *"Around ₾31,000 is already committed"* while the Future Revenue card holding that
number is dimmed to the same grey as everything else.

**The feature rail has the identical bug.** Its "Per-company price ladders" deep link lands on
`/admin/companies` and the callout floats in empty space at the bottom of the page, pinned to
nothing — and the ladders it promised are six instances of "2 tiers" in grey microtext,
because every company row is **collapsed**.

### Tasks
- [ ] **4.1 — Make anchor failure loud.** Before fixing anything: `console.warn` in dev when
      a step or callout can't resolve its anchor. This is why the bug shipped, and without it
      the next one ships too. Do this first so 4.2's work is verifiable.
- [ ] **4.2 — Audit all seven tour anchors against the live DOM** on each declared route, and
      fix them. Record the per-step findings in the table below.
- [ ] **4.3 — Anchor to small, specific elements**, not whole pages. Step 5 should ring the
      Future Revenue card, not `/admin/statistics`. Step 1 should ring the booking form —
      and must **scroll it into view**, since the copy says "this form" while the hero is on
      screen.
- [ ] **4.4 — Stop the desktop tooltip falling back to the mobile bottom dock.** A tall
      target should still get a ring (the 62% viewport cap from Phase 2 exists for this) and
      a tooltip placed beside it. The full-width dock at 1440px is a large part of the dated
      feel.
- [ ] **4.5 — Fix the rail's callout anchoring** — same root cause, same fix.
- [ ] **4.6 — Auto-expand the proof on rail deep links.** "Per-company price ladders" should
      arrive with a company row already expanded so the ladder is on screen without a click.
      Check the other 15 destinations for the same "lands on a list, not on proof" problem
      and record which ones need it.
- [ ] **4.7 — Regression-check Staging Winery** (shared files) and verify all 7 steps + a
      sample of rail links on **production**.

### Per-step anchor audit
_(fill in during 4.2 — this table is the deliverable of this chunk)_

| Step | Route | Intended target | Anchor resolves? | Fix |
|---|---|---|---|---|
| 1 | `/` | booking form | ❌ no ring | |
| 2 | `/wines` | wine list | ❌ no ring | |
| 3 | `/admin/orders` | bookings table | ❌ no ring | |
| 4 | `/admin/orders` | filters row | ✅ works | — (reference implementation) |
| 5 | `/admin/statistics` | Future Revenue card | ❌ no ring | |
| 6 | `/admin/wine-orders` | packing view | ❌ no ring | |
| 7 | `/admin/content` | inline editor | ❌ no ring | |

**Also noted during the teardown:** step 4's copy is about per-company rate ladders while its
ring is on the *filters* row — copy and highlight disagree even on the one step that works.
Decide whether to re-anchor it or re-word it.

### Files expected
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\DemoTour.tsx`
- `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\DemoFeatureRail.tsx`
- `data-tour` attributes across `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\app\admin\(panel)\**` and `saas\app\(site)\**`

---

## Chunk 5 — Demo chrome palette + front door layout

**Status:** ⬜ Not started
**Resume point:** Do not start until Chunk 4 is ✅.
**Ship route:** demo-only → straight to `master`.
**Fixes:** report findings B1 (off-brand palette), B2 (emoji icons), B3 (lopsided grid).
**Palette is already decided** — see "cellar dark" in Decisions above. Do not redesign it.

### Tasks
- [ ] **5.1 — Define the eight `--demo-*` tokens once**, in one place, and restyle
      `DemoFrontDoor`, `DemoTour`, `DemoFeatureRail` and `DemoModeBanner` onto them. No
      component should carry its own literal hex — that is the mistake [[KnownBugs]] #20/#21
      already had to be cleaned up once.
- [ ] **5.2 — Replace the emoji card icons** (📋 ⧉ 🍷 ⚡) with one consistent line-icon set,
      or drop icons entirely and let the labels carry it. They currently render as flat OS
      emoji next to serif display type and mix metaphors.
- [ ] **5.3 — Fix the front-door grid.** Four cards in a three-up grid leaves the fourth
      orphaned beside two empty slots — an accident of the live mirror being added as a
      fourth card after the layout was built for three. Go 2×2, and **give the live mirror
      the primary position** (larger cell, or promoted above the grid). It is the one thing
      no competitor has and it currently looks identical to the other three.
- [ ] **5.4 — Verify over a dark tenant preset**, to confirm the fixed platform palette is
      legible over any of the 16 themes (the reason it is fixed rather than inherited).

---

## Chunk 6 — Bug-report widget off the demo tenant

**Status:** ⬜ Not started
**Resume point:** Do not start until Chunk 5 is ✅.
**Ship route:** **shared file** → `staging` pass required.
**Fixes:** report finding B4. Max approved removal: *"it's really a nice to have."*

### Why, and the exact change
Three floating overlays currently compete — tour pill bottom-left, rotated rail tab on the
right edge, red bug button bottom-right. The bug button sits **on top of** the tour's "Next"
button on every step, on top of the feature rail's list, and over the mobile front door. On
`/live` there are **two** of them, one per pane, because `isEmbeddedPane()` suppression
covers the other demo components but not this widget.

`BugReportWidget` is mounted in exactly three places, and both tenant-facing mounts already
pass `tenantId`:

- `saas\app\(site)\layout.tsx:56` — `surface="PUBLIC_SITE"`, has `tenantId`
- `saas\app\admin\(panel)\layout.tsx:38` — `surface="ADMIN"`, has `tenantId`
- `saas\app\super-admin\layout.tsx:19` — `surface="SUPER_ADMIN"`, **no** `tenantId`

So one guard inside the component covers everything:

```tsx
import { DEMO_TENANT_ID } from '@/lib/demoTenant'
// ...after the hooks, before the JSX return — same position DemoModeBanner uses, so the
// react-hooks lint rule stays satisfied:
if (tenantId === DEMO_TENANT_ID) return null
```

Three reasons this is the right spot: it is the same **chokepoint** reasoning already used for
demo email suppression (a future mount cannot forget to opt out); the super-admin mount passes
no `tenantId`, so Max's own reporting is untouched; and because both `/live` panes are the
demo tenant, it kills the duplicate FAB as a side effect — one line fixes the double button
*and* all three collisions.

`DEMO_TENANT_ID` reads `NEXT_PUBLIC_DEMO_TENANT_ID`, which is exactly why that var carries the
`NEXT_PUBLIC_` prefix — so it works in this client component. No new env work needed.

### Tasks
- [ ] **6.1 — Add the guard** in
      `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\components\BugReportWidget.tsx`.
- [ ] **6.2 — Regression-check** that the widget still renders on Staging Winery (public +
      admin) and in super-admin. This is a shared file; that check is the point of the
      staging pass.
- [ ] **6.3 — Verify on production** that no bug button appears anywhere on the demo,
      including both `/live` panes.

### Trade-off Max accepted
Bug reports from the demo were **deliberately exempted** from the demo's outbound-email
suppression ([[Plan-DemoRedesign]], abuse guardrails) — they go to the super-admin inbox, so
they currently work. Removing the widget gives up a functioning channel for hearing about demo
breakage. Middle option if Max changes his mind: hide it on the demo's **public** side only
and keep it in the demo admin.

---

## Chunk 7 — Admin landing readability

**Status:** ⬜ Not started
**Resume point:** Do not start until Chunk 6 is ✅.
**Ship route:** **shared** (`/admin/orders` is every tenant's page) → `staging` pass required.
**Fixes:** report finding B5. Decision already made: **stay on Orders**, make it readable.

### The problem
"I run a winery" lands on `/admin/orders`: thirteen columns, and rows up to ~150px tall
because the Food column wraps "Veg: Pkhali platter / Meat: Mtsvadi (pork skewers)" onto six
lines. Only about five bookings fit on a 900px screen. The first impression of the back office
is data entry, not a business — while ₾30,785 of committed future revenue, the seasonal curve
and the six-operator ranking sit two clicks away on Statistics.

### Tasks
- [ ] **7.1 — Hide Food and Masterclass by default** using the Columns control that already
      exists on the page. Check whether the default is per-tenant persisted or per-browser —
      if it is a real tenant setting, do **not** change it globally; gate the default to the
      demo tenant instead.
- [ ] **7.2 — Truncate long cells to one line** with the full value still reachable (the row
      already expands to a detail view).
- [ ] **7.3 — Add a three-number revenue strip** above the table — upcoming bookings, future
      revenue, next order — reusing the figures Statistics already computes. Decide with Max
      whether this is demo-only or a genuine improvement for every winery; if the latter, it
      needs its own small design pass rather than riding along here.
- [ ] **7.4 — Regression-check Staging Winery** and verify row height and visible-row count
      on production.

---

## Chunk 8 — Onboarding path + super-admin "Reset demo" button

**Status:** ⬜ Not started
**Resume point:** Do not start until Chunk 7 is ✅.
**Ship route:** **shared** → `staging` pass required.
**Fixes:** report finding A5, via Max's reset-button idea.

### The problem
The front door's fourth card promises: *"How fast is setup? Run the setup wizard on a live
account and see what standing up your own winery site actually takes."* Two things go wrong:

1. **The wizard is already four-sevenths complete** — Wines, Payment info, Contact & site
   info and Photos all carry green ticks. Someone who came to find out how much work setup is
   gets shown a setup someone else already did.
2. **The page renders outside the admin panel layout**, so none of the demo chrome mounts — no
   demo banner, no "Customer View" switch, no tour pill, no feature rail. The only way back is
   a small "← Back to admin" link. **One of four front-door paths quietly drops the visitor
   out of the guided demo entirely.**

### Tasks
- [ ] **8.1 — Reset the onboarding flags in the nightly reseed** so the wizard presents fresh
      each morning. The reseed already exists (`saas\lib\demoSeed.ts`, driven by
      `/api/cron/reseed-demo`) — extend it rather than adding a second job. Note that
      `getFinishDetailsStatus` recomputes live, which is why [[Plan-DemoRedesign]] task 0.4
      gated the banners rather than completing the steps; check that resetting flags does not
      bring the "Finish setting up your account" banner back on the demo.
- [ ] **8.2 — Build the super-admin "Reset demo now" button** (Max's request). Calls the same
      `demoSeed` logic the cron does, so there is one implementation, not two. Needs a
      confirm step — it deletes and rebuilds rows — and should report what it did.
- [ ] **8.3 — Mount the demo chrome on `/admin/onboarding`** so path 4 no longer exits the
      demo, or give that route its own "← back to the demo" affordance that returns to the
      guided flow rather than to a bare admin page.
- [ ] **8.4 — Verify** path 4 end to end: front door → "How fast is setup?" → a fresh wizard
      → a way back into the demo. Then press the reset button and confirm the demo returns to
      its seeded state.

### Still unresolved behind this
[[Plan-DemoRedesign]] carries an open item — **disposable tenant per visitor vs. one shared
sandbox** — and this chunk does not settle it. It makes the shared sandbox honest, which is
what [[Plan-DemoSite]] recommended starting with. If two visitors ever run the wizard at once
they will still collide.

---

## Deferred — agreed as out of scope for this plan

- **Theme-preset catalogue in the demo** (Max's request, 2026-09-11): *"later I want to have
  part of the demo — that they see the catalogue of how colours CAN be changed."* A browsable
  gallery of the 16 theme presets, ideally previewing live on the demo tenant. The feature
  rail already has a "Branding and theme presets" row that deep-links to a screen; this would
  replace that with a real catalogue. **Worth its own plan** — it needs a decision about
  whether a visitor can actually apply a preset to the shared sandbox, which is the same
  collision problem as Chunk 8's open item.
- **Mobile layout** — desktop-first, per Max. Only the wrong-copy fix rides along in Chunk 1.
- **Merging the tour pill and rail tab into one "Explore" control** — recommended in the
  teardown (two entry points to two guided experiences is one too many) but it is a design
  change rather than a fix, and Chunk 5 may make it unnecessary.
- **Analytics on the demo** — still nothing is instrumented, so the conversion figures in
  [[DemoDirections]] remain industry benchmarks rather than measurements of this site. Carried
  from [[Plan-DemoRedesign]].
- **Two bugs from the original plan's carried-over list**, both affecting the real product not
  just the demo: the wine-order address field silently required for individuals, and
  Rkatsiteli mislabelled "RED DRY" (it is a white grape).

---

## Reference

| Thing | Value |
|---|---|
| Live demo URL | `https://demo.vineworks.ge` |
| Demo tenant slug | `vineworks-demo` |
| Demo tenant ID — dev DB | `cmtvgl6e60000vl6w9se65t86` |
| Demo tenant ID — prod DB | `cmtvi582n0000vl7kjq44ir5p` |
| Env var driving the gate | `NEXT_PUBLIC_DEMO_TENANT_ID` |
| Staging Winery (regression check) | `cmrxb85wo0000vlc0d964nzf8` |
| Demo admin | `demo-admin@vineworks.ge` (password in `credentials.txt`) |
| Teardown report | https://claude.ai/code/artifact/72a9a58c-7a3b-4ce6-8ad3-4abc08c32026 |
| Earlier audit (superseded on 2 points) | https://claude.ai/code/artifact/179194f5-9907-4346-abe6-8008c9db4adb |

### Corrections to the 2026-09-10 audit, for the record
1. **The feature rail and the spotlight tour do both open.** The earlier audit could not
   click them and marked them "unverified" — that was broken tooling in that session, not
   broken code. Their failure is anchoring, not mounting.
2. The nightly reseed **is** running: the booking count moved 403 → 393 → 394 across
   sessions, consistent with the relative-month reseed having fired.
