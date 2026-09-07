#!/usr/bin/env node
// Parses a program's MD files (per programs/TEMPLATE.md) into SQL insert
// statements for D1. Usage: node scripts/seed-from-md.js <program-dir> > seed.sql
//
// program.json declares one entry per category: { id, label, kind, source,
// layout }. `layout` picks which parser below handles that file:
//   - "day-headings": "## Day N (Weekday) — ..." sections, each a markdown
//     table of exercises. Used for the training plan. `kind: "sets"`
//     categories store the "Sets x Reps" column as structured meta instead
//     of folding it into detail, since the frontend needs it separately.
//   - "simple-table": one flat markdown table, no day sections (e.g. the
//     supplement schedule).
//   - "meal-plan": the specific two-part shape of the meal plan file — a
//     "## Weekly overview" table (day/lunch/dinner) plus a separate
//     "## Recipes" section keyed by "### <Name> (<Day> <lunch|dinner>)"
//     that supplies ingredients/steps, attached to the matching task as
//     meta.recipe.

const fs = require("fs");
const path = require("path");

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Task IDs are derived from content (category + day + label), not row
// position, so editing/reordering/inserting rows in an MD file doesn't
// shift IDs for unrelated tasks and silently orphan their completion
// history. Only true label collisions within the same day/category fall
// back to a numeric suffix.
function makeStableId(categoryId, dayKey, label, seen) {
  const base = `${categoryId}-${slug(dayKey || "daily")}-${slug(label)}`;
  let id = base;
  let n = 2;
  while (seen.has(id)) {
    id = `${base}-${n++}`;
  }
  seen.add(id);
  return id;
}

function parseTableRow(line) {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function isTableSeparator(line) {
  return /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");
}

// ---------- layout: day-headings ----------
// "## Day N (Weekday) — ..." sections, each holding one markdown table of
// exercises (Exercise | Sets x Reps | Weight/Notes).
function parseDayHeadings(filePath, categoryId, kind) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const tasks = [];
  const seenIds = new Set();
  let dayKey = null;
  let inTable = false;
  let tableHeader = null;
  let sort = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      const heading = h2[1].trim();
      dayKey = /^day\s+\d/i.test(heading) ? heading : null;
      inTable = false;
      tableHeader = null;
      continue;
    }
    if (!dayKey) continue;
    if (!line.trim().startsWith("|")) {
      tableHeader = null;
      continue;
    }
    if (isTableSeparator(line)) continue;
    const cells = parseTableRow(line);
    if (!tableHeader) {
      tableHeader = cells;
      inTable = true;
      continue;
    }
    const [label, setsReps, notes] = cells;
    if (!label) continue;
    const meta = kind === "sets" && setsReps ? { targetText: setsReps } : null;
    tasks.push({
      id: makeStableId(categoryId, dayKey, label, seenIds),
      categoryId,
      dayKey,
      label,
      detail: notes || null,
      meta,
      sort: sort++,
    });
  }
  return tasks;
}

// ---------- layout: simple-table ----------
// One flat table (or several under non-day headings), no day sections —
// used for the supplement schedule. Headings containing reference-only
// words are skipped rather than parsed as tasks.
const REFERENCE_WORDS = ["context", "notes", "known", "fallback", "grocery", "brand", "note", "wellness"];
function isReferenceHeading(text) {
  const lower = text.toLowerCase();
  return REFERENCE_WORDS.some((w) => lower.includes(w));
}

function parseSimpleTable(filePath, categoryId) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const tasks = [];
  const seenIds = new Set();
  let inReference = false;
  let tableHeader = null;
  let sort = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      inReference = isReferenceHeading(h2[1]);
      tableHeader = null;
      continue;
    }
    if (inReference) continue;
    if (!line.trim().startsWith("|")) {
      tableHeader = null;
      continue;
    }
    if (isTableSeparator(line)) continue;
    const cells = parseTableRow(line);
    if (!tableHeader) {
      tableHeader = cells;
      continue;
    }
    const [label, ...rest] = cells;
    if (!label) continue;
    tasks.push({
      id: makeStableId(categoryId, null, label, seenIds),
      categoryId,
      dayKey: null,
      label,
      detail: rest.join(" — ") || null,
      meta: null,
      sort: sort++,
    });
  }
  return tasks;
}

// ---------- layout: meal-plan ----------
const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function parseMealPlan(filePath, categoryId) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const seenIds = new Set();

  // --- Part 1: "## Weekly overview" table -> lunch/dinner tasks ---
  const overviewStart = lines.findIndex((l) => /^##\s+weekly overview/i.test(l.trim()));
  const tasks = [];
  let sort = 0;
  if (overviewStart !== -1) {
    let tableHeader = null;
    for (let i = overviewStart + 1; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (/^##\s+/.test(line)) break; // next section
      if (!line.trim().startsWith("|")) continue;
      if (isTableSeparator(line)) continue;
      const cells = parseTableRow(line);
      if (!tableHeader) {
        tableHeader = cells;
        continue;
      }
      const [day, lunchCell, dinnerCell] = cells;
      if (!day) continue;
      for (const [mealType, cell] of [["lunch", lunchCell], ["dinner", dinnerCell]]) {
        if (!cell) continue;
        const [namePart, ...detailParts] = cell.split(" — ");
        const label = namePart.replace(/\*\*/g, "").trim();
        tasks.push({
          id: makeStableId(categoryId, day, `${mealType}-${label}`, seenIds),
          categoryId,
          dayKey: day,
          label: `${label} (${mealType})`,
          detail: detailParts.join(" — ") || null,
          meta: { mealType, day },
          sort: sort++,
        });
      }
    }
  }

  // --- Part 2: "## Recipes" section -> ingredients/steps per recipe ---
  const recipesStart = lines.findIndex((l) => /^##\s+recipes/i.test(l.trim()));
  const recipesEnd = recipesStart === -1
    ? -1
    : lines.findIndex((l, i) => i > recipesStart && /^##\s+/.test(l.trim()));
  const recipeMap = new Map(); // key: "mon-lunch" -> {title, ingredients, steps}

  if (recipesStart !== -1) {
    const end = recipesEnd === -1 ? lines.length : recipesEnd;
    let current = null;
    let mode = null; // "ingredients" | "steps" | null
    for (let i = recipesStart + 1; i < end; i++) {
      const line = lines[i].trimEnd();
      const h3 = line.match(/^###\s+(.*)/);
      if (h3) {
        const m = h3[1].match(/^(.*)\((\w+)\s+(lunch|dinner)\)\s*$/i);
        if (current) recipeMap.set(current.key, current);
        if (m) {
          const dayAbbrev = DAY_NAMES[m[2].toLowerCase().slice(0, 3)] || m[2];
          current = {
            key: `${dayAbbrev.toLowerCase()}-${m[3].toLowerCase()}`,
            title: m[1].trim(),
            ingredients: [],
            steps: [],
          };
        } else {
          current = null;
        }
        mode = null;
        continue;
      }
      if (!current) continue;
      if (/^\*\*ingredients\*\*/i.test(line.trim())) {
        mode = "ingredients";
        continue;
      }
      if (/^\*\*steps/i.test(line.trim())) {
        mode = "steps";
        continue;
      }
      const bullet = line.match(/^-\s+(.*)/);
      if (bullet && mode === "ingredients") {
        current.ingredients.push(bullet[1].trim());
        continue;
      }
      const numbered = line.match(/^\d+\.\s+(.*)/);
      if (numbered && mode === "steps") {
        current.steps.push(numbered[1].trim());
        continue;
      }
    }
    if (current) recipeMap.set(current.key, current);
  }

  for (const t of tasks) {
    const key = `${t.dayKey.toLowerCase()}-${t.meta.mealType}`;
    const recipe = recipeMap.get(key);
    if (recipe) t.meta.recipe = recipe;
  }

  return tasks;
}

function main() {
  const programDir = process.argv[2];
  if (!programDir) {
    console.error("Usage: node scripts/seed-from-md.js <program-dir>");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(programDir, "program.json"), "utf8"));
  const statements = [];
  statements.push(
    `INSERT OR REPLACE INTO programs (id, name, theme_concept, active) VALUES ('${sqlEscape(
      manifest.id
    )}', '${sqlEscape(manifest.name)}', '${sqlEscape(manifest.theme_concept)}', ${manifest.active ? 1 : 0});`
  );

  let catSort = 0;
  for (const cat of manifest.categories) {
    const categoryId = `${manifest.id}-${cat.id}`;
    statements.push(
      `INSERT OR REPLACE INTO categories (id, program_id, name, label, kind, sort_order) VALUES ('${sqlEscape(
        categoryId
      )}', '${sqlEscape(manifest.id)}', '${sqlEscape(cat.id)}', '${sqlEscape(cat.label)}', '${sqlEscape(
        cat.kind
      )}', ${catSort++});`
    );

    const filePath = path.join(programDir, cat.source);
    let tasks;
    if (cat.layout === "day-headings") tasks = parseDayHeadings(filePath, categoryId, cat.kind);
    else if (cat.layout === "meal-plan") tasks = parseMealPlan(filePath, categoryId);
    else tasks = parseSimpleTable(filePath, categoryId);

    for (const t of tasks) {
      const metaJson = t.meta ? sqlEscape(JSON.stringify(t.meta)) : null;
      statements.push(
        `INSERT OR REPLACE INTO tasks (id, category_id, day_key, label, detail, meta, sort_order) VALUES ('${sqlEscape(
          t.id
        )}', '${sqlEscape(t.categoryId)}', ${t.dayKey ? `'${sqlEscape(t.dayKey)}'` : "NULL"}, '${sqlEscape(
          t.label
        )}', ${t.detail ? `'${sqlEscape(t.detail)}'` : "NULL"}, ${metaJson ? `'${metaJson}'` : "NULL"}, ${t.sort});`
      );
    }
  }

  console.log(statements.join("\n"));
}

main();
