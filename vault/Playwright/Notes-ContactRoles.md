---
tags: [playwright, testing, contacts]
---

# Notes for the Playwright rewrite — contact roles

Written 2026-09-22 while driving all four contact forms by hand after Chunks 7–9 and the audit
fixes. **This is not a spec.** It is the set of things that cost time, or that would have made a
test pass while proving nothing, recorded while they were still fresh.

Related: [[Plan-ContactRoles]] (the feature), [[Plan-PlaywrightTesting]] (the suite's own plan).

---

## The traps, in the order they bit

### 1. Setting an input's `.value` does not change React's state

React keeps its own record of an input's value. Assigning `el.value = 'X'` updates the DOM and
**React never hears about it**, so the form submits the old value — or, worse, the next legitimate
change is swallowed because React's tracker already holds `'X'` and sees no difference.

This cost two confused runs where a typed code silently became an empty string. Playwright's
`fill()` does the right thing natively; only raw DOM scripting has the problem. If a spec ever
reaches for `page.evaluate(el => el.value = …)`, that is the bug waiting to happen. Use the
native setter plus an `input` event:

```js
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
el.dispatchEvent(new Event('input', { bubbles: true }))
```

### 2. The picker buttons carry the person's phone in their text

`ContactPickerPopupView` renders name and phone as sibling spans inside one button, so
`textContent` is `"Keti Dolidze+995 591 76 20 56"`. An exact-match selector finds nothing.

**Use the `aria-label`, which is exactly the person's name** and exists for this reason
(hurdle H14 — the computed accessible name was empty before it was added). So
`getByRole('button', { name: 'Keti Dolidze' })` works and is the intended handle. A text
selector is the fragile one.

### 3. The contact picker sits *above* the wine page's checkout drawer

Both are fixed overlays. On `/wines` the picker renders at `z-[60]` deliberately, over the
drawer's `z-50`. A spec that assumes one modal at a time will mis-click.

Related and worth knowing: **an arbitrary Tailwind z-class that has never been used elsewhere
may not exist in the generated CSS.** `z-[70]` silently computed to `zIndex: auto` and left the
picker behind the drawer with no error anywhere. If a layering assertion matters, assert the
**computed** `zIndex`, not the class name.

### 4. Seeded orders are dated in the future, so "newest" is not yours

`Order.createdAt` on the demo/staging seed runs into December 2026. Sorting by `createdAt desc`
after submitting a booking returns a seeded row, not the one just made. Find the order by
something you chose — a distinctive name — or capture the id from the redirect.

`scripts/inspect-order-contacts.ts` takes a name fragment for this reason.

### 5. The public wine order redirects to a real payment gateway

With `payment_enabled_wine_orders` on and credentials set, submitting the public wine form goes
straight to **pay.flitt.com**. The `WineOrder` row and its `OrderContact` rows are written
*before* the redirect, so the data is checkable — but a spec that waits for an on-page success
message will hang on a third-party domain.

Either assert on the redirect and stop, or turn payment off for the test tenant. Never let a
spec type card details.

### 6. `/admin/orders` is down, and it takes `updateOrder` with it

Chunk 10 owns `app/admin/(panel)/orders/page.tsx`, which still joins the dropped
`CompanyRepresentative`. Until it is fixed, `OrdersTable` — the **only** caller of
`updateOrder()` — cannot be reached, so the "edit an order's contact and check the snapshot
follows" journey has no UI to drive. It is covered in `scripts/test-order-contacts.ts` instead.

### 7. A login is needed for two of the four forms, and Claude will not type a password

The admin manual booking and admin manual wine order both sit behind `/admin/login`. The
existing helpers (`tests/helpers/credentials.ts` + `auth.ts`) read `credentials.txt` directly,
which is the right shape: the credential never passes through a model. Keep it that way.

---

## The eight journeys worth a spec

Drawn from what actually exercised different code, not from what was easy to click. Each one
below was run by hand on 2026-09-22 and its result verified **in the database**, not on screen.

| # | Journey | The assertion that matters |
|---|---|---|
| 1 | Public booking, coded company, **wrong** code | Refused, popup stays, and **no person's name appears anywhere in the page** |
| 2 | Public booking, correct code, pick Contact Person then Guide | Two showings in role order; two `OrderContact` rows, both `personId` set |
| 3 | Public booking, switch company mid-flow | All four contact fields **and** the guide block clear |
| 4 | Public booking, "I am not on this list" both roles, type details | Rows written with `personId` **null** and the typed facts intact |
| 5 | Admin manual booking (no picker on that screen yet) | A `contact_person` row exists, `personId` null, from what the admin typed |
| 6 | Public wine order, coded company, pick | Discount applied, picker above the drawer, one linked row |
| 7 | Admin manual wine order | Inline dropdown **auto-selects** when the company has exactly one person |
| 8 | Person codes ON | **No picker opens at all**, and no colleague's name is in the page |

### Fixtures that can tell outcomes apart

Hurdle H13 in the plan: *a fixture that cannot distinguish two outcomes proves neither*. On
`Staging Winery`:

- **Silk Road Journeys** — 2 Contact Persons *and* 2 Guides. The only company that exercises
  "two pickers fire, in role order". Code `SILKROAD55`.
- **Alazani Valley Tours** — Contact Persons, **no** Guides. The contrast: one picker fires, and
  the Guide block still renders (it is driven by the tenant's role list, not by this company's
  people) with **no** "Choose from list" control.
- **Restaurant Kakhuri / Vinoteka Batumi / Marani Import GmbH** — wine-order companies with
  exactly one contact person each, which is what makes the admin auto-select testable.
- Guide person codes `SRJGUIDE1` / `SRJGUIDE2` exercise the person-code shortcut, but **only
  while `person_codes_enabled` is on**.

### Two assertions that would have caught real bugs

Both of these are cheap and both correspond to defects that actually shipped to `staging`:

1. **After switching company, assert the contact fields are empty.** A booking otherwise goes
   out for company B attributed to company A's employee. This was fixed in the booking form and
   then *not carried across* to the wine form — the same bug twice.
2. **Type into a role's phone box before its name box.** The entry used to be discarded on every
   keystroke because it was keyed on the name alone. Nothing on screen said name-first.

### One assertion to write carefully

Do **not** assert "resolving a company by id returns its people". That was a real test in
`test-contact-resolution.ts` and it encoded a security hole: naming a company with no code
returned the whole staff directory from an unauthenticated action. The test agreed with the
code, so the suite could never have caught it.

The correct assertions are the refusals: **a company with a code, given no code, is refused**,
and **the refusal contains nobody's name**.
