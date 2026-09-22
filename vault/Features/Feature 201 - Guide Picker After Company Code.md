---
tags: [feature, booking, guides]
---

# Feature 201 — Guide picker after a company code

**Built:** 2026-09-19 · **Status:** ✅ built and verified on dev · **Resolves:** [[KnownBugs]] #55

> Not yet on staging or master. Staging verification is still required before any merge, per [[ClaudeInstructions]] Rule 0.

---

## What it does

A company's shared access code works again on the booking form, even when that company has
guides. Entering it now opens a second popup — *"Who is bringing the group?"* — listing the
company's guides. Picking one fills the form with that guide's name and phone and records
`guideId` on the order, exactly as entering that guide's own code would have.

A guide's own code still works as a direct shortcut and skips the picker entirely.

## The problem it solves

Until now, `verifyBookingCode()` accepted the company-level `accessCode` **only when the
company had zero guides**. That was deliberate and documented in two places
([[Plan-CompanyGuidesAndReps]] Chunk 1 and Chunk 5) — the goal was that every booking name a
person, not just a company.

The cost was hidden and severe:

1. A winery gives `MARANI42` to a tour operator.
2. Months later they add one guide to that company.
3. `MARANI42` dies that instant. Every guest holding it is told **"Incorrect code."**
4. `/admin/companies` still displays `MARANI42`, still lets you edit it, still looks live.

Nobody would connect step 2 to step 3. Found 2026-09-19 while seeding guides onto Playwright
fixture companies — which promptly broke four specs at once and is how the interaction
surfaced at all.

## Key design decisions

**Max's design, chosen over the alternative.** The first proposal was to make the admin panel
*admit* the code was dead — grey it out, warn when adding a first guide. Max's is better: keep
the code working and ask who is booking. It removes the trap instead of documenting it, and the
attribution requirement is still met.

**The trade-off, accepted deliberately.** A guide code *proves* identity — only that guide has
it. A picker lets anyone holding the company code select any guide, so attribution becomes
**self-declared rather than authenticated**. Someone could pick a colleague and put that
colleague's phone on the booking sheet. This is acceptable because guide attribution is
operational labelling — the plan's own rationale is "the printed booking sheet can show *that
guide's* phone" — not authentication. **Revisit if guide identity ever gates commissions or
per-guide reporting.**

**Both entry points now agree.** `findBookingCodeByCode()` (direct code entry, no company
chosen first) already accepted a company code unconditionally, while `verifyBookingCode()`
(dropdown first) rejected it for any company with guides. The same code therefore worked or
failed depending on *how it was typed*, while both functions' comments claimed they mirrored
each other. Both now return `guideChoices` and behave identically.

**"I am not on this list" is always offered.** A guide who has joined the agency but has not
been added in the admin panel yet would otherwise be stranded holding a valid code. Choosing it
proceeds on the company's own contact details with `guideId` null — exactly the pre-guides
behaviour.

**The picker exposes every guide's name and phone to anyone holding the company code.** Fine
for a partner agency, which is who holds that code, but it is a real consequence and was decided
knowingly rather than stumbled into.

## Files touched

| File | What changed |
|---|---|
| `saas/app/actions/companies.ts` | `verifyBookingCode()` restructured: guide match → company match → error, instead of an early return that skipped the company check. New exported `GuideChoice` type. `findBookingCodeByCode()` returns `guideChoices` too, and its `BookingCodeMatch` type gained the field. |
| `saas/components/GuidePickerPopupView.tsx` | **New.** Pure render, same contract as `AccessCodePopupView.tsx` (caller owns state; `preview` swaps the overlay for an inline inert card). |
| `saas/components/BookingForm.tsx` | New `guideChoices` state; `handleCodeSubmit` and `handleDirectCodeSubmit` branch into the picker; `handleGuidePicked` / `handleGuideNotListed`; reset alongside every other `matchedGuideId` reset; renders the popup. |
| `saas/app/admin/(panel)/content/MessagesPanel.tsx` | `onsite_guide_picker_title` / `onsite_guide_picker_intro` drafts, edit fields and a live preview, inside the existing Access Code section. |
| `saas/lib/t.ts`, `saas/lib/adminT.ts` | New keys, EN + KA. KA drafted, not natively reviewed — standing caveat. Parity check passes (169/169, 1083/1083). |

## Edge cases handled

- **Company with guides, code typed is neither** → "Incorrect code."
- **Company with guides but no `accessCode`** → "Incorrect code", not "No code set" — the
  company *does* have codes, just not the one typed, and "no code set" is a lie the guest
  cannot act on.
- **Company with no guides** → `guideChoices` is empty, no second step, behaviour identical to
  before this feature.
- **Guide's own code** → matches first, picker skipped.

## 🔴 Known gap, NOT fixed here

`BookingForm.tsx`'s effect (~line 261) skips the code popup entirely when
`!company.accessCode`, auto-filling the company's contact details instead. So a company with
**guides but no shared access code** never shows a popup at all, and its guide codes cannot be
used on the dropdown path. The form only receives `accessCode` in its `companies` prop and has
no idea whether guides exist.

Rare in practice — `createCompany()` auto-generates an `accessCode` — but it is reachable if an
admin clears one. Fixing it properly means passing guide presence down to the form. Out of
scope for this change; worth its own small task.

## What to test

Automated: **`saas/tests/tier2-core-flows/guide-picker.spec.ts`, 4/4 passing (26.6s)** — covers
the company code opening the picker, choosing a guide, the "not on this list" fallback, a guide's
own code skipping the picker, and a wrong code still being rejected. Deliberately stops before
submitting: the subject is code resolution and autofill, and submitting would leave debris on a
tenant whose wine-order rows cannot be deleted.

Verified by hand in the browser on 2026-09-19:

- [x] Company **with** guides + company code → picker appears listing every guide
- [x] Picking a guide → that guide's own name and phone autofill
- [x] "I am not on this list" → company contact details
- [x] Guide's **own** code → no picker, straight through (regression)
- [x] Company **without** guides + company code → no picker (regression, Caucasus Vine Travel)
- [x] Wrong code → "Incorrect code", popup stays open, no picker
- [x] Georgian locale — "ვინ მოჰყავს ჯგუფი?" / "ამ სიაში არ ვარ" render correctly, guide names
      correctly left as proper nouns
- [ ] **Admin → Content → Messages → Access Code section** — both new fields and the preview.
      Not verified: it needs an admin login, and typing a password into a form is off-limits.
      Worth a look next time you are in there.
- [ ] Direct code entry (`hideCompanyDropdown`, Feature 113/114) — the code path is aligned and
      typechecks, but that variant needs a tenant configured for it, so it was not exercised.
- [ ] `guideId` actually persisted on a submitted order — inferred from the autofill, not proven,
      since the spec stops before submitting.

### Two things found while verifying

**The guide buttons had no accessible name.** Name and phone are separate nested spans, so the
computed accessible name came back empty — a screen reader would have announced "button" and
nothing else, and no Playwright spec could target them by role and name. Fixed with an explicit
`aria-label`; the spec now asserts on it, so it cannot regress silently.

**The fixture made the fallback unprovable.** `Silk Road Journeys`'s contact person was also its
first guide, so "I am not on this list" and "pick guide 1" filled the form identically — the
fallback could not be distinguished from the thing it falls back from. The seed now uses a
distinct person, and `scripts/backfill-test-fixtures.ts` gained the ability to reconcile an
existing guide's name and phone (it previously only created or skipped, so a spec correction
could never reach an already-backfilled tenant).

## Follow-ups

- Verify the checklist above once the dev DB recovers.
- Staging verification before any merge, per [[ClaudeInstructions]] Rule 0.
- The seed constraint in `lib/demoSeed.ts` — guides on only one company, because guides used to
  kill the company code — **becomes unnecessary once this ships**. Guides could then be seeded
  on every company for a more realistic demo. The warning comment on `BookingCompanySpec.guides`
  should be updated at the same time.
- [[KnownBugs]] #55 can be closed once this is verified.
