---
tags: [research, demo, marketing]
---

# Research — how good SaaS companies run live product demos

Gathered 2026-09-10 to back [[DemoDirections]]. Web research, not measurements of our own
site — see the caveat at the bottom.

---

## The formats that exist

| Format | What it is | Who uses it |
|---|---|---|
| **Guided product tour** | A fixed path through key features, usually spotlight + tooltip | Most common; Navattic/Storylane's core product |
| **Sandbox** | Free-form environment mirroring the live product | Reprise (enterprise POCs), Cloudbeds |
| **Choose-your-own-journey** | Visitor picks a path by use case or persona | Voucherify |
| **Demo hub / menu** | A landing surface offering several tours to pick from | Flagsmith, Storylane "Hubs" |

Our current demo is a **sandbox with no framing**. [[DemoDirections]] Direction 01 adds the
hub, 03 adds the guided tour, 04 adds choose-your-own-journey.

---

## Numbers worth remembering

- **~25%** of website visitors engage with an interactive demo, versus **2–5%** who book a
  sales call and **4–6%** who start a free trial.
- **Generic demos convert ~18%; demos using the prospect's own terminology and situation
  convert 25%+.** Interactive demos where the prospect drives: **~38%**.
- Deals that include an automated demo close **19 days faster** with a **6% higher win
  rate**.
- Product-qualified leads from demos convert at **20–30%** vs **6%** for traditional MQLs.
- **Flagsmith** added a single interactive tour to their home page: **1.7× more sign-ups,
  1.5× higher activation.**
- **Cloudbeds** provisions a personal sandbox within **60 seconds** of a demo request.

**Why this mattered for our decision:** the empty back office on `demo.vineworks.ge` puts
us in (or below) the 18% "generic" bucket, despite having a genuinely differentiated
product. Seeding realistic data is the single cheapest move up that scale — hence Phase 0.

---

## Design patterns referenced

- **Spotlight** — dim the background, highlight one element. Draws attention without
  feeling intrusive. Basis of [[DemoDirections]] Direction 03.
- **Tooltip walkthrough** — chained tooltips form an interactive walkthrough; can carry
  buttons, links, media.
- **Persona / path selection** — giving users a choice of walkthrough "gives a sense of
  willing participation and freedom." Basis of Direction 01's three cards.

---

## Competitive read (from the original 2026-09-10 research in [[Plan-DemoSite]])

Two patterns dominate the booking/hospitality space:

- **Self-serve live sandbox** — Shopify B2B Demo Store, Bookeo (customer/admin toggle),
  BookingPress
- **Gated "book a call"** — FareHarbor, Toast, Checkfront

We chose self-serve because Vineworks has no brand trust yet — nobody will wait for a
sales call before seeing an unknown Georgian product. That decision still holds.

**The gap nobody fills:** none of Bookeo, BookingPress, Cloudbeds or Toast shows the
customer-facing site and the back office *simultaneously*. Bookeo has a toggle — you see
one or the other. That gap is the whole argument for [[DemoDirections]] Direction 02.

Also notable: **none of the researched competitors demo their onboarding/setup flow
publicly** — it's always behind a sales call. Ours is already built (`/admin/onboarding`),
which makes it a genuine differentiator worth showing.

---

## Sources

- [navattic.com — interactive demo platforms & best practices](https://www.navattic.com/blog/interactive-demos)
- [storylane.io — interactive demo examples](https://www.storylane.io/blog/awesome-interactive-demo-examples)
- [userpilot.com — interactive product demos: what actually converts](https://userpilot.com/blog/interactive-product-demo/)
- [fungies.io — SaaS demo best practices 2026](https://fungies.io/saas-demo-best-practices-2026/)
- [reprise.com — building scalable demo environments](https://www.reprise.com/resources/blog/demo-environments-guide)
- [supademo.com — dummy data best practices](https://supademo.com/blog/dummy-data)
- [optif.ai — demo-to-close conversion benchmarks](https://optif.ai/learn/questions/demo-to-close-conversion-rate/)
- [chameleon.io — highlighting elements UI patterns](https://www.chameleon.io/blog/new-design-patterns-highlighting-elements)

---

## Caveat

Every figure here is an **industry benchmark from a vendor or analyst blog**, not a
measurement of `demo.vineworks.ge`. Vendors selling demo software have an obvious interest
in demo-conversion numbers looking good — treat the direction of these figures as reliable
and the precise values as marketing.

~~**We currently have no analytics on the demo at all.**~~ **Instrumented 2026-09-12** — the
demo now records what visitors actually do (`DemoEvent`, see [[MaintenanceNotes]] §19). Read it
with `npx tsx scripts/demo-funnel.ts` from `saas/`.

### What is now measured, and what is still a benchmark

**Measured, on our own traffic:** which of the front door's five exits a visitor takes; whether
the tour is started, completed, or abandoned — and on which step; whether the automatic start on
the "I run a winery" path or a deliberate press; whether anyone reaches `/live`; which
capability rows get picked; both step-7 CTAs, the email one being the only unambiguous lead; and
whether a booking actually gets placed.

**Still a benchmark, and must keep being labelled as one:** every percentage above and in
[[DemoDirections]] — demo-to-close rates, "interactive demos convert N× better", the seven-step
ceiling. Those came from vendors selling demo software and none of them describes this site.

**The honest caveat, for now:** the table exists but the traffic does not yet. A conversion rate
over a handful of visits is noise, and the first weeks of data will mostly be Max and Claude
testing. Treat the numbers as a way to see *shape* — where people stop — long before treating
any single percentage as real. Nothing in this file should be rewritten from a rate that rests
on fewer than a few dozen genuine visits.
