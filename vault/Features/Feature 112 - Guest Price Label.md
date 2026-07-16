---
tags: [feature, public-site]
---

# Feature 112 — Guest Price Label

**Status:** 🚧 In progress

## What it does

Replaces the "minimum X guests" text on the home page package cards with a small person silhouette SVG in the brand color, followed by "X ან მეტი სტუმარი" (Georgian) or "X or more guests" (English).

## Files changed

- `saas/app/(site)/page.tsx` — line ~294: replace `<p>` with SVG + locale-aware label

## Design decisions

- SVG is inline (no external file) — keeps it simple, picks up `var(--color-brand)` automatically
- Locale-aware: Georgian when `locale === 'ka'`, English otherwise
- X comes from existing `min_tasting_guests` / `min_guests_tasting_lunch` settings already fetched on the page
