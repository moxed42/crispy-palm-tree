# SetLog — context for future sessions

## Primary training goals
Body recomposition — a mix of fat loss and lean muscle gain, with the
practical target being *feeling leaner in clothes*, not a specific scale
number or lift total. Keep this in mind when writing or adjusting any
program: weight/rep progression matters, but so does whatever supports the
recomp side (step count, general activity, not just lifting).

## What's already in this repo
- `programs/hypertrophy/` — 4-day Upper/Lower hypertrophy split. Currently
  `active: false`, parked mid-reset.
- `programs/form-reset/` — active program, a 7-day habit week (5 lighter
  training days + 2 active-recovery/form days) written because early
  sessions on the hypertrophy split exposed shaky form on some lifts
  (bench-pressing in particular). Exit criteria for moving back to
  hypertrophy are in `programs/form-reset/form-reset-guidelines.md`, not a
  fixed week count — check in on actual form quality, not the calendar.
- `programs/week1/` — an older, inactive example program kept for
  reference (different equipment set, not part of the active plan).
- Session length target: workouts should land around ~60 min including
  warmup — checked against this budget when adding exercises to a day.
- See `README.md` for the full mechanism (how program MD files become the
  live app, the D1 update workflow, `scripts/update-predictions.js` for
  weight progression).
