# Program content format

This documents the structure `scripts/seed-from-md.js` expects when parsing a
program's MD files into the database. Keep new programs (generated via your
Claude chat) close to this shape so they parse cleanly.

## File layout
Put each program's files under `programs/<program-id>/`, e.g. `programs/week1/`.
One file = roughly one category, though the parser groups by `##` heading
within each file too.

## Parsing rules
- A top-level `#` heading in the first file processed becomes the **program name**.
- Each `##` heading becomes a **category** (its text is used as both `name` and
  display `label`).
- Within a category, a markdown **table** becomes one task per row — the first
  column is the task `label`, any other columns are joined into `detail`.
- A `###` heading under a category (e.g. "Day 1 (Tuesday)") is used as the
  `day_key` for tasks that follow, until the next `###` or `##`.
- A bullet list under a category (no table) becomes one task per bullet, no
  `detail`.
- Anything before the first `##`, or explicitly under a heading containing the
  word "context", "notes", "known", or "fallback", is treated as reference
  text (stored but not turned into checkable tasks).

## Manifest
Each program also needs a one-line `programs/<program-id>/program.json`:
```json
{ "id": "week1", "theme_concept": "MERIDIAN // OPS — long-haul transit vessel systems terminal", "active": true }
```
Only one program should have `"active": true` at a time (today's frontend
renders whichever is active).
