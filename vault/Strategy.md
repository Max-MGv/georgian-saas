---
tags: [strategy]
---

# Strategy

## The Problem

Small Georgian businesses (wineries, cottages, tour operators) either:
- Can't afford enterprise CRM tools
- Use tools that aren't flexible enough for their specific workflows
- Track everything in Excel or WhatsApp

## The Solution

A lightweight, white-label web app that gives a business owner:
1. A public booking form for customers / tour groups
2. An admin panel to manage reservations, partner pricing, and revenue

## Target Market

**Phase 1 — Wineries**
Validated by nikalasmarani.ge. Wineries deal with tour group bookings, per-company pricing tiers, and need to track revenue by partner.

**Phase 2 — Cottages / Guesthouses**
Similar booking flow, different fields (check-in/check-out, room types). Same admin structure.

**Phase 3 — Tourism operators**
Group tour bookings, guide management, itinerary tracking.

## Architecture Decision

Each client = their own deployment (one Vercel project + one Supabase project).

```
Client A ──> Supabase DB A
Client B ──> Supabase DB B
    ↑
Same GitHub repo, deployed twice with different .env
```

**Why not multi-tenant yet:**
- Simpler to build
- No client data mixing (trust matters in small Georgian market)
- Setup per client is ~30 min — acceptable at this scale
- Migrate to multi-tenant when you hit 20+ clients

## Related

- [[Tech Stack]]
- [[Business Model]]
- [[MVP Features]]
