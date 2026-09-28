#!/usr/bin/env node
// Recomputes predicted weights for the *next unlogged* occurrence of each
// exercise in a training MD file, from the most recent session's actual
// logged sets — per the progression rule in
// programs/hypertrophy/hypertrophy-guidelines.md: hit the top of the rep
// range on every set → bump the smallest available increment; otherwise
// repeat the same weight. It does NOT touch dates further out than that
// next occurrence — those stay as whatever they already show until they
// become the "next occurrence" themselves and get their own real update.
//
// Usage:
//   node scripts/update-predictions.js <trainingMdPath> <setLogsJsonPath>
//
// setLogsJsonPath is the output of a D1 query against the live database,
// e.g.:
//   npx wrangler d1 execute meridian-ops-db --remote --json --command \
//     "SELECT t.id as task_id, t.label, t.day_key, t.detail, t.meta, \
//             s.date, s.set_number, s.weight, s.reps \
//      FROM set_logs s JOIN tasks t ON s.task_id = t.id \
//      WHERE t.category_id = 'hypertrophy-training' \
//      ORDER BY s.date DESC" > /tmp/set-logs.json
//
// This only edits the MD file on disk — review the diff, then run
// `node scripts/seed-from-md.js programs/hypertrophy > worker/seed-hypertrophy.sql`
// and apply/push as usual (see README's "Updating your program" section).

const fs = require("fs");

function extractTopRep(targetText) {
  // "3x10" -> 10, "3x8/leg" -> 8, "2x30-60 sec/direction" -> null (not a
  // rep-range lift, e.g. holds/timed work — skip progression for these).
  const m = /x(\d+)(?:-(\d+))?/i.exec(targetText || "");
  if (!m) return null;
  return Number(m[2] || m[1]);
}

// Parses a weight cell into a comparable numeric form plus the pieces
// needed to bump it. Handles "40 lb", "30-35 lb/hand", "15-17.5 lb".
// Returns null for non-numeric cells (e.g. "bodyweight", "bodyweight/DB").
function parseWeight(text) {
  const m = /^([\d.]+)(?:-([\d.]+))?\s*(lb\/hand|lb)?/i.exec((text || "").trim());
  if (!m) return null;
  const low = Number(m[1]);
  const high = m[2] ? Number(m[2]) : low;
  const suffix = (text.match(/lb\/hand|lb/i) || [""])[0];
  return { low, high, suffix, isRange: Boolean(m[2]) };
}

function bumpWeight(parsed, equipment) {
  if (!parsed) return null;
  // Smallest available jump: barbell lifts move in 2.5-5 lb (fractional
  // plates); dumbbell/kettlebell work moves to the next practical
  // increment, approximated here as +2.5 lb/hand unless already at a
  // round 5, in which case +5 — a human should sanity-check this against
  // what your actual DB/Powerblock increments allow before trusting it
  // blindly for anything other than a barbell lift.
  const step = /barbell/i.test(equipment) ? 2.5 : 2.5;
  const low = parsed.low + step;
  const high = parsed.isRange ? parsed.high + step : low;
  const suffix = parsed.suffix ? ` ${parsed.suffix}` : "";
  return parsed.isRange ? `${low}-${high}${suffix}` : `${low}${suffix}`;
}

function main() {
  const [, , mdPath, logsPath] = process.argv;
  if (!mdPath || !logsPath) {
    console.error("Usage: node scripts/update-predictions.js <trainingMdPath> <setLogsJsonPath>");
    process.exit(1);
  }

  const rawLogs = JSON.parse(fs.readFileSync(logsPath, "utf8"));
  // wrangler --json wraps results as [{ results: [...] }] — unwrap either shape.
  const rows = Array.isArray(rawLogs) && rawLogs[0] && rawLogs[0].results ? rawLogs[0].results : rawLogs;

  // Group logged sets by task_id + date, keep only the most recent date per task_id.
  const byTask = new Map();
  for (const r of rows) {
    if (!byTask.has(r.task_id)) byTask.set(r.task_id, []);
    byTask.get(r.task_id).push(r);
  }

  let mdText = fs.readFileSync(mdPath, "utf8");
  const lines = mdText.split("\n");
  let changed = 0;

  for (const [taskId, entries] of byTask) {
    const mostRecentDate = entries.map((e) => e.date).sort().at(-1);
    const lastSets = entries.filter((e) => e.date === mostRecentDate);
    const sample = lastSets[0];
    const meta = sample.meta ? JSON.parse(sample.meta) : null;
    const topRep = extractTopRep(meta && meta.targetText);
    if (topRep == null) continue; // timed/hold work, not a rep-range lift

    const allHitTop = lastSets.every((s) => Number(s.reps) >= topRep);
    // Use the weight that was actually *predicted* for that date (task.detail,
    // seeded from the MD's Weight column), not the freeform per-set weight
    // text logged in the app — that keeps units/formatting consistent and
    // matches the guideline's "hit the top of the rep range at that weight"
    // framing rather than trying to re-parse an arbitrary logged string.
    const lastWeightText = sample.detail;
    const parsed = parseWeight(lastWeightText);
    if (!parsed) continue; // bodyweight or unparseable — leave as-is

    const nextWeightText = allHitTop ? bumpWeight(parsed, meta && meta.equipment) : lastWeightText;

    // Find the next occurrence of this exact exercise, on the same
    // day-type (e.g. "Upper A" — the part after the em dash in day_key),
    // strictly after mostRecentDate, so a "DB Shoulder Press" logged on an
    // Upper A day only updates its next Upper A occurrence, not Upper B's
    // separate weight track.
    const label = sample.label;
    const dayTypeMatch = /—\s*(.+)$/.exec(sample.day_key || "");
    const dayType = dayTypeMatch ? dayTypeMatch[1].trim() : null;
    const loggedDates = new Set(entries.map((e) => e.date));

    let currentDayHeadingDate = null;
    let currentDayType = null;
    let targetLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const h2 = lines[i].match(/^##\s+Day\s+\d+\s+\(([\d-]{10})[^)]*\)\s*—\s*(.+)/);
      if (h2) {
        currentDayHeadingDate = h2[1];
        currentDayType = h2[2].trim();
        continue;
      }
      if (!currentDayHeadingDate) continue;
      if (currentDayHeadingDate <= mostRecentDate) continue; // must be after last logged date
      if (loggedDates.has(currentDayHeadingDate)) continue; // already logged, not a prediction target
      if (dayType && currentDayType !== dayType) continue; // stay on this exercise's own weight track
      if (!lines[i].trim().startsWith("|")) continue;
      const cells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
      if (cells[0] === label) {
        targetLineIndex = i;
        break;
      }
    }

    if (targetLineIndex === -1) continue;
    const cells = lines[targetLineIndex].split("|").map((c) => c.trim());
    // cells: ["", Exercise, SetsReps, Weight, Equipment, ""] from splitting on "|"
    if (cells[3] === nextWeightText) continue; // no change needed
    cells[3] = nextWeightText;
    lines[targetLineIndex] = cells.map((c, i) => (i === 0 || i === cells.length - 1 ? c : ` ${c} `)).join("|");
    changed++;
    console.log(`${label} (${dayType}): ${lastWeightText} -> ${nextWeightText} (hit top of range: ${allHitTop})`);
  }

  if (changed) {
    fs.writeFileSync(mdPath, lines.join("\n"));
    console.log(`\nUpdated ${changed} exercise(s) in ${mdPath}. Review the diff, then re-run seed-from-md.js and push.`);
  } else {
    console.log("No predictions to update — either no logged sets yet or every upcoming cell already matches.");
  }
}

main();
