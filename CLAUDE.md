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
- `programs/chinup/` — active program, a 12-week Mon/Wed/Fri progression
  (negatives -> band-assisted reps -> holds, 4 phases) to a first
  unassisted chin-up, running Oct 5 - test day Jan 1. Sourced from a doc
  the user brought in and kept in sync with it as it's revised (currently
  synced through doc rev 24) — see `programs/chinup/chinup-guidelines.md`
  for its progression rules, the weeks 1-2 exercise adjustment, hypermobility
  form cues, and cited evidence.
- `programs/week1/` — an older, inactive example program kept for
  reference (different equipment set, not part of the active plan).
- Session length target: workouts should land around ~60 min including
  warmup — checked against this budget when adding exercises to a day.
- Cardio equipment: jump rope, treadmill, stationary bike — pick from this
  mix when writing a cardio slot, not outdoor-only options.
- Travel/hotel constraint: no door anchoring of any kind, including the
  entry door (hotel policy) — band substitutes for travel days must be
  foot-anchored (stand on the band) or bodyweight/bed-prone only. See
  `programs/chinup/chinup-guidelines.md`'s Travel section for the current
  swap list built around this.
- See `README.md` for the full mechanism (how program MD files become the
  live app, the D1 update workflow, `scripts/update-predictions.js` for
  weight progression).
