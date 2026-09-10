---
tags: [design, demo, vineworks, marketing]
---

# Vineworks Demo Directions — design review, 2026-09-10

The design rationale behind [[Plan-DemoRedesign]]. Max reviewed this and approved **all
four directions**, with the seeding prerequisite first.

> **The visual version** — with mockups drawn on top of the real production UI — is the
> published artifact. Source is kept next to this file as `demo-directions.html`, so it
> can be re-published or edited without rebuilding it. Live link is in the
> [[DemoSite-README|README]].

---

## The brief

Max's own read, which triggered this review:

> "the current demo.vineworks.ge seems stale, out of date and not guided, not very
> attention grabbing. no display of features or anything."

Correct diagnosis. The demo is technically live and working — real tenant, real booking
engine, real back office — but a cold visitor lands on what looks like a small winery's
website in Kakheti, with nothing telling them it's a product.

---

## What a visitor actually sees today

Captured live from production, 2026-09-10, signed in as `demo-admin@vineworks.ge`.

### 1. The nag banner says "unfinished"
A **"Finish setting up your account"** banner sits on top of every admin page. To a
prospect deciding whether this product is real, it reads as a half-built tool — the exact
opposite of the intended message.

### 2. Empty state exactly where the value lives
- `/admin/orders` → **"No orders found"**, `0 bookings`
- `/admin/statistics` → **`0`** upcoming orders, **`0₾`** future revenue, "No data for
  this period" on both charts

This is the punchline of the entire demo journey. A prospect clicks "Winery Admin View"
expecting to see a business being run, and gets a blank table. Industry benchmarks: hollow
or generic demos convert around **18%**, demos with believable situation-specific data run
**25%+**, and interactive demos the prospect drives reach **~38%**.

### 3. No frame, no product story
Nothing explains what Vineworks *is*, who it's for, or what it costs. The depth actually
built — masterclasses, per-company price tiers, packing sheets, Georgian/English, card
payments, theme presets — is invisible unless you already know to look for it.

### 4. A dead end behind the admin link
Opening `/admin` directly (a shared link, a reload, an expired session) lands on a bare
email + password form with no credentials and no way back to the demo. That visitor is
simply gone.

---

## Direction 01 — The front door
**Effort: Low · one new page, no changes to the product itself**
→ [[Plan-DemoRedesign]] Phase 1

An interstitial at the root that frames the product and lets the visitor pick what they
came to see, before dropping them into the live site. Three path cards:

- **I run a winery** → the back office: bookings, revenue, packing lists
- **Show me the guest view** → book a tasting or order wine as a customer would
- **How fast is setup?** → run the onboarding wizard on a live tenant

Plus a prominent "skip — just let me explore."

**Why it works.** It answers the three questions a stranger has — what is this, is it
real, what's in it for me — in one screen, then gets out of the way. This is the standard
"demo hub" shape used by Navattic and Storylane customers, and it exists because
self-directed demos get engagement from roughly a quarter of visitors versus the 2–5% who
will book a sales call.

**Fixes:** framing · audience segmentation · the `/admin` dead end (the admin path can
carry its own sign-in).

**Watch out for:** an interstitial is a door in front of the thing. One screen only, make
"skip" genuinely prominent, never show it twice to the same browser.

---

## Direction 02 — The live mirror ⭐ most distinctive
**Effort: High · a new two-pane route plus a refresh signal between the panes**
→ [[Plan-DemoRedesign]] Phase 4

Guest site and back office **side by side in one view**. The visitor books on the left and
watches the booking land on the right — highlighted, timestamped "just now" — with no
switching and no remembering.

**Why it works.** The actual differentiator of this product is that the guest-facing site
and the back office are *one system*. Today a visitor has to book, then remember to
switch, then trust that what they're seeing is connected. Both panes on screen at once
removes the memory step and the trust gap — the causal link is just visible.

**None of the researched booking platforms do this** — not Bookeo, BookingPress,
Cloudbeds or Toast. It's the one idea here that nobody else is running.

**Fixes:** the core story told in one screen instead of four steps · gives you the
screenshot for the landing page, a pitch deck, or a WhatsApp message to a winery owner.

**Watch out for:** narrow screens can't hold two panes (stack + auto-scroll on mobile),
and the right pane genuinely has to refresh when the left submits.

---

## Direction 03 — The spotlight tour
**Effort: Medium · mostly one component, replacing the checklist already built**
→ [[Plan-DemoRedesign]] Phase 2

Replace the small corner checklist ([[FeatureLog]] #159) with a real guided walkthrough:
dimmed backdrop, spotlight ring on the actual element, tooltip explaining why it matters.

**Why it works.** Today's checklist tells someone *what to click*. It never tells them
*why they should care*. Dim → highlight → explain is the standard walkthrough shape
precisely because it controls attention: the visitor can't be looking at the wrong thing
while you make the point.

**The real upgrade is the copy.** "See it land in Orders" is a UI instruction. *"A ₾600
booking that arrived at 23:40 on a Saturday — no phone call, no back-and-forth on
Facebook, no one writing it in a notebook"* is a sales argument.

**Fixes:** nobody reads the corner box, a dimmed screen is unmissable · feature → benefit
on every step · gives you somewhere to **name the money**, which nothing on the demo
currently does.

**Watch out for:** seven steps is the ceiling, always-visible skip, and it must never dim
a screen the visitor navigated to themselves — a tour that fights you is worse than no
tour.

---

## Direction 04 — The feature rail
**Effort: Medium · a rail component plus one annotation per destination screen**
→ [[Plan-DemoRedesign]] Phase 3

A persistent menu of everything the platform does, grouped Guest-facing / Back office /
Platform. Click any capability, land on the exact screen that proves it, with a callout
attached.

**Why it works.** A deep product has been built and almost none of it is discoverable. A
visitor would have to *guess* that packing sheets, per-company price tiers, masterclass
add-ons, theme presets and a Georgian translation layer exist. The rail turns that
invisible surface area into a menu — the "choose your own journey" pattern — letting a
prospect self-qualify on the feature they personally care about instead of sitting through
a fixed ordering.

**Fixes:** invisible depth (the strongest argument, currently unfindable) · no forced
sequence · doubles as the feature list for `vineworks.ge` when that gets built.

**Watch out for:** a rail competes with the admin's existing nav row. Probably wants to be
collapsible, or to live only on the public side.

---

## The prerequisite — fill the demo with a winery that's actually trading
→ [[Plan-DemoRedesign]] Phase 0

Every direction above still ends on `No orders found` unless the tenant has data. This is
the highest-value work and the least glamorous: roughly **18 months of plausible history**
— bookings behind and ahead, a revenue curve with a real summer peak, wine orders spread
across pending / paid / delivered, tour companies on different price tiers.

It should regenerate on a schedule so it never drifts (this is the same machinery as the
"nightly reset" item already carried in [[Plan-DemoSite]] — one job, not two), and the
**"Finish setting up your account" banner must be suppressed** for this tenant. A demo
winery is not a winery mid-setup.

---

## Recommended sequencing

| When | What | Why |
|---|---|---|
| **First** | Seed the winery (Phase 0) | Nothing else pays off without it. Highest value, lowest risk. |
| **Then** | 01 · Front door (Phase 1) | A day's work, big legibility gain, closes the `/admin` dead end. |
| **Then** | 03 · Spotlight tour (Phase 2) | Replaces rather than adds. Reuses what already shipped. |
| **Flagship** | 02 · Live mirror (Phase 4) | The thing nobody else has. Worth doing properly, not early. |

Direction 04 (feature rail) folds naturally into `vineworks.ge` itself when that gets
built — same list, each row deep-linking into the live demo.

---

**Caveat carried from the artifact:** the conversion figures quoted throughout are
industry benchmarks from the sources in [[Research-DemoPatterns]], **not** measurements of
this site. Nothing on `demo.vineworks.ge` is currently instrumented for analytics — worth
considering as its own task if these numbers are going to drive decisions.
