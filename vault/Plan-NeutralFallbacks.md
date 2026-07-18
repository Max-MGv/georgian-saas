---
tags: [plan, feature-125]
---

# Plan: Neutral Fallbacks (#125)

**Problem:** Every hardcoded fallback in the public site is Nikalas Marani's real content — hero text, about story, logo file, winery photos, 50₾/100₾ prices. A blank tenant (discovered via Test Winery on `testwinery.vercel.app`) renders as a half-branded NM clone. Discovered 2026-07-18.

**Decisions (Max, 2026-07-18):**
- Logo fallback → tenant display name as styled text (no fake logo mark)
- Hero background fallback → brand-color CSS gradient (no photo)
- Price fallback → hide the price line entirely when no display tier is set
- NM keeps its identity via its own DB rows; fallbacks become neutral for everyone

**Critical constraint:** NM has ZERO English SiteContent rows — its EN site renders entirely from the fallbacks being changed. Phase order is safety-critical: seed NM's DB first, verbatim, then neutralize code.

## Phase 1 — Seed NM's EN content (verbatim, byte-for-byte)

`scripts/seed-nm-content-en.ts` (kept in repo like `seed-ka.ts`). Seeds for tenant `cmqou94er0000vl1sl9v0yv54`, locale `en`:

| key | section | value (verbatim from current code fallback) |
|---|---|---|
| home_hero_subtitle | home | Family winery in the heart of Kakheti. Wine tastings, traditional meals, and the stories behind every bottle. |
| home_location_eyebrow | home | Kakheti, Georgia *(also seeded for `ka` — NM has no ka row for this key, so KA site currently shows this English fallback; preserved verbatim)* |
| home_package1_desc | home | 2 red wines, 1 white, chacha — guided by the winemaker |
| home_package2_desc | home | 3 wines, chacha brandy, and a full traditional Georgian meal |
| about_story_p1 | about | A family winery producing traditional Georgian wine. |
| about_story_p2 | about | For generations, our family has grown Rkatsiteli and Saperavi grapes… (full paragraph) |
| about_story_p3 | about | We welcome visitors to experience Georgian wine culture firsthand… |
| about_expect1_label/text | about | Wine Tasting / Guided tasting of 2–3 house wines and chacha… |
| about_expect2_label/text | about | Traditional Meal / Optional lunch with classic Kakhetian dishes — mtsvadi, lobiani… |
| about_expect3_label/text | about | Vineyard Walk / A short walk through the vineyard and a look at our qvevri… |
| contact_phone / contact_email / contact_address | contact | copied from NM's existing ka rows — **bonus fix**: NM's EN contact page currently shows empty values (only ka rows exist; fallback is '') |

Not seeded (fallback already neutral): package titles, booking intro, all `t.ts` keys, contact labels/notes.

## Phase 2 — Neutralize code fallbacks

- `app/(site)/page.tsx` — hero subtitle → "Wine tastings and visits at our family winery."; eyebrow → "Georgia"; package descs → generic; price row hidden when no display tier (`displayTier?.pricePerPerson ?? null`)
- `app/(site)/about/page.tsx` — story + expect card texts → generic winery copy
- Logo: `SiteNav` / home hero / wines page — when no `x-tenant-logo`, render tenant display name (`x-tenant-name`) as styled serif text instead of `/icons/logo-dark.svg`
- Hero backgrounds (home/about/contact): when no `*_hero_bg_path` setting → brand-color gradient div, no photo, no preload
- `SiteNav` SocialIcons: hide icons whose value is empty; footer: only render non-empty contact parts
- `/icons/logo-dark.svg` and `/images/winery*.jpg` stay in repo — NM's own DB rows point at them

## Phase 3 — Verify + docs

- NM EN + KA pages before/after — text must be identical
- Test Winery: neutral everything, zero NM traces
- Vault: FeatureLog #125, SessionLog, MigrationNotes onboarding checklist (content entry is now a real onboarding step)

## Later cleanup (logged, not in scope)
- Move NM's logo from shared `/icons/` into Supabase Storage like uploaded logos
- Neutral KA translations for the new neutral EN fallback strings (currently EN-only fallbacks serve both locales when a tenant lacks rows)
