# Playwright Testing Ideas

Running list of test cases to add, mostly things that broke in real usage and should be
covered by a regression test so they don't come back silently. Not a spec file itself —
items get written up as real Playwright tests (in the matching `tierN-*` folder) as they're
picked up.

## Open ideas

- Mobile: tapping the booking form's Date field opens the native date picker. Regression
  for the bug where the hidden `<input type="date">` in `DateInput.tsx` had a 0×0 box, so
  tapping the visible field/icon silently did nothing on real phones and left users with
  only the manual DD/MM/YYYY typing path. Should assert the native picker is reachable via
  tap on a mobile viewport/device, not just that the field accepts typed input.
