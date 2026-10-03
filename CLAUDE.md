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
- `programs/form-reset/` — 7-day habit week (5 lighter training days + 2
  active-recovery/form days), written after early hypertrophy sessions
  exposed shaky form on some lifts. Currently `active: false` — its one
  week (Sep 29 - Oct 5) is done. Exit criteria for moving back to
  hypertrophy are in `programs/form-reset/form-reset-guidelines.md` if
  picked back up, not a fixed week count.
- `programs/chinup/` — active program, an 8-week Mon/Wed/Fri progression
  (negatives -> band-assisted reps -> holds, 3 phases) to a first
  unassisted chin-up, running Oct 5 - test day Dec 2. Sourced from a doc
  the user brought in, not generated fresh — see
  `programs/chinup/chinup-guidelines.md` for its progression rules,
  hypermobility form cues, and cited evidence.
- `programs/week1/` — an older, inactive example program kept for
  reference (different equipment set, not part of the active plan).
- Session length target: workouts should land around ~60 min including
  warmup — checked against this budget when adding exercises to a day.
- Cardio equipment: jump rope, treadmill, stationary bike — pick from this
  mix when writing a cardio slot, not outdoor-only options.
- See `README.md` for the full mechanism (how program MD files become the
  live app, the D1 update workflow, `scripts/update-predictions.js` for
  weight progression).
