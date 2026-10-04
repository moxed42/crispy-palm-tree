#!/usr/bin/env node
// Parses a program's MD files (per programs/TEMPLATE.md) into SQL insert
// statements for D1. Usage: node scripts/seed-from-md.js <program-dir> > seed.sql
//
// program.json declares one entry per category: { id, label, kind, source,
// layout }. `layout` picks which parser below handles that file:
//   - "day-headings": "## Day N (Weekday) — ..." sections, each a markdown
//     table of exercises (Exercise | Sets x Reps | Weight | Equipment — the
//     last column is optional). Used for the training plan. `kind: "sets"`
//     categories store the "Sets x Reps" and "Equipment" columns as
//     structured meta instead of folding them into detail, since the
//     frontend needs them separately.
//   - "simple-table": one flat markdown table, no day sections (e.g. the
//     supplement schedule).
//   - "meal-plan": the specific two-part shape of the original meal plan
//     file — a "## Weekly overview" table (day/lunch/dinner) plus a
//     separate "## Recipes" section keyed by "### <Name> (<Day> <lunch|dinner>)"
//     that supplies ingredients/steps, attached to the matching task as
//     meta.recipe. Superseded by meal-recipes-nutrition below, kept for
//     reference/reuse in a future program.
//   - "meal-recipes-nutrition": a richer single-file meal source with full
//     nutrition facts (calories/protein/fat/carbs/fiber), prep time, and
//     ingredients/instructions inline per recipe (see the parser below for
//     the exact expected shape). This is what week1's FUEL CELLS category
//     actually uses.

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
  let tableHeader = null;
  let sort = 0;
  // Some non-day sections (e.g. "## Daily steps target") are a real daily
  // task described in prose/bullets rather than a table — captured as one
  // recurring (day_key null) task with a "checkbox" kind override, since
  // "log a set" doesn't fit a step count. bullets/intro accumulate here
  // until the next heading, then get joined into that task's detail.
  let bulletCapture = null;

  function flushBullets() {
    if (!bulletCapture) return;
    if (bulletCapture.bullets.length || bulletCapture.intro) {
      const detail = [bulletCapture.intro, ...bulletCapture.bullets].filter(Boolean).join(" · ");
      tasks.push({
        id: makeStableId(categoryId, null, bulletCapture.title, seenIds),
        categoryId,
        dayKey: null,
        label: bulletCapture.title,
        detail,
        meta: { kind: "checkbox" },
        sort: sort++,
      });
    }
    bulletCapture = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      flushBullets();
      const heading = h2[1].trim();
      if (/^day\s+\d/i.test(heading)) {
        dayKey = heading;
      } else if (/steps target/i.test(heading)) {
        dayKey = null;
        bulletCapture = { title: "Daily steps target", bullets: [], intro: null };
      } else {
        dayKey = null;
      }
      tableHeader = null;
      continue;
    }

    if (bulletCapture) {
      const bullet = line.match(/^[-*]\s+(.*)/);
      if (bullet) {
        bulletCapture.bullets.push(bullet[1].replace(/\*\*/g, "").trim());
      } else if (line.trim() && !bulletCapture.intro) {
        bulletCapture.intro = line.replace(/\*\*/g, "").trim();
      }
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
      continue;
    }
    const [label, setsReps, notes, equipment] = cells;
    if (!label) continue;
    const meta = kind === "sets" && setsReps ? { targetText: setsReps, equipment: equipment || null } : null;
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
  flushBullets();
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
  // A non-reference section with no table (e.g. "## Sleep", "## Hydration")
  // still describes one real daily task in prose/bullets — captured as a
  // single task per section instead of being silently dropped. If the
  // section turns out to be table-shaped instead (e.g. the supplement
  // schedule), sectionTitle gets cleared the moment a "|" row appears, so
  // this stays a no-op for those and existing table parsing is untouched.
  let sectionTitle = null;
  let bullets = [];
  let intro = null;

  function flushSection() {
    if (sectionTitle && (bullets.length || intro)) {
      const detail = [intro, ...bullets].filter(Boolean).join(" · ");
      tasks.push({
        id: makeStableId(categoryId, null, sectionTitle, seenIds),
        categoryId,
        dayKey: null,
        label: sectionTitle,
        detail,
        meta: null,
        sort: sort++,
      });
    }
    sectionTitle = null;
    bullets = [];
    intro = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      flushSection();
      inReference = isReferenceHeading(h2[1]);
      sectionTitle = inReference ? null : h2[1].trim();
      tableHeader = null;
      continue;
    }
    if (inReference) continue;

    if (line.trim().startsWith("|")) {
      sectionTitle = null; // table-shaped section — not a bullet task
      bullets = [];
      intro = null;
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
      continue;
    }
    tableHeader = null;

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet && sectionTitle) {
      bullets.push(bullet[1].replace(/\*\*/g, "").trim());
    } else if (sectionTitle && line.trim() && !intro) {
      intro = line.replace(/\*\*/g, "").trim();
    }
  }
  flushSection();
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

// ---------- layout: meal-recipes-nutrition ----------
// A richer, single-file meal source: "## Daily Template" (recurring items,
// no day) followed by "## Monday".."## Sunday" sections, each holding
// "### <Recipe Name> (Lunch|Dinner|Breakfast|Snack)" blocks with prep
// time/servings, a "**Nutrition Facts**" bullet list, one or more
// ingredient lists ("**Ingredients**" or "**Option A: ...**" /
// "**Option B: ...**"), and one or more instruction lists ("**Instructions**",
// "**Pressure Cooker Instructions**", "**Stovetop Instructions**", etc).
// Trailing sections like "## Morning Wellness Shot" or "## Summary
// Nutrition Table" aren't day sections, so they're skipped rather than
// misparsed as one.
const DAY_FULL_TO_ABBR = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function parseMealRecipesNutrition(filePath, categoryId) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const tasks = [];
  const seenIds = new Set();
  let sort = 0;
  let dayKey = null;
  let current = null;
  let mode = null;

  function flush() {
    if (!current) return;
    const ingredientSets = current.ingredientSets.filter((s) => s.items.length);
    const instructionSets = current.instructionSets.filter((s) => s.steps.length);
    const hasNutrition = Object.keys(current.nutrition).length > 0;
    // Guard against pushing a bogus task for a section that got opened
    // (e.g. by the wellness-shot special case) but never actually had
    // recipe content follow it.
    if (!ingredientSets.length && !instructionSets.length && !hasNutrition) {
      current = null;
      return;
    }
    const suffix = current.mealType
      ? ` (${current.mealType[0].toUpperCase()}${current.mealType.slice(1)})`
      : current.frequencyNote ? ` (${current.frequencyNote})` : "";
    const label = `${current.title}${suffix}`;
    const detailParts = [];
    if (current.nutrition.Calories) detailParts.push(`${current.nutrition.Calories} kcal`);
    if (current.nutrition.Protein) detailParts.push(`${current.nutrition.Protein} protein`);
    tasks.push({
      id: makeStableId(categoryId, dayKey, label, seenIds),
      categoryId,
      dayKey,
      label,
      detail: detailParts.join(" · ") || null,
      meta: {
        mealType: current.mealType || null,
        recipe: {
          title: current.title,
          prepTime: current.prepTime,
          metaFields: current.metaFields,
          nutrition: current.nutrition,
          ingredientSets,
          instructionSets,
          note: current.note || null,
        },
      },
      sort: sort++,
    });
    current = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      flush();
      const headingRaw = h2[1].trim();
      const heading = headingRaw.toLowerCase();
      if (heading === "daily template") {
        dayKey = null;
      } else if (DAY_FULL_TO_ABBR[heading]) {
        dayKey = DAY_FULL_TO_ABBR[heading];
      } else if (/wellness shot/i.test(headingRaw)) {
        // A standalone recipe living directly under its own ## heading
        // (no ### sub-block, unlike the day sections) — e.g. "Morning
        // Wellness Shot (Optional — Make Once Per Week)". Open it here
        // instead of waiting for an ### since none follows. Kept in the
        // recurring/daily group (day_key null) since it isn't tied to one
        // weekday, with a label suffix noting it's a weekly-batch item.
        dayKey = null;
        current = {
          title: headingRaw.replace(/\s*\([^)]*\)\s*$/, "").trim(),
          mealType: null,
          frequencyNote: "weekly prep",
          prepTime: null,
          metaFields: [],
          nutrition: {},
          ingredientSets: [],
          instructionSets: [],
          note: null,
        };
      } else {
        dayKey = "__skip__"; // summary table / anything else not otherwise recognized
      }
      mode = null;
      continue;
    }
    if (dayKey === "__skip__") continue;

    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      flush();
      const heading = h3[1].trim();
      const m = heading.match(/^(.*)\((Lunch|Dinner|Breakfast|Snack)\)\s*$/i);
      current = {
        title: (m ? m[1] : heading).trim(),
        mealType: m ? m[2].toLowerCase() : null,
        prepTime: null,
        metaFields: [],
        nutrition: {},
        ingredientSets: [],
        instructionSets: [],
        note: null,
      };
      mode = null;
      continue;
    }
    if (!current) continue;

    // Checked before the generic field-line parser below, since
    // "**Note:**" would otherwise itself match "**Label:**" and clobber
    // whatever metaFields were already captured (assignment there isn't
    // additive — it's one line's fields at a time, and a recipe only has
    // one such metadata line in practice).
    const noteMatch = line.match(/^\*\*Note:?\*\*\s*(.*)/i);
    if (noteMatch) {
      current.note = noteMatch[1].trim();
      continue;
    }

    // Generic "**Label:** value | **Label2:** value2 | ..." line — covers
    // "Prep time / Serves" on day recipes and "Prep time / Makes / Keeps"
    // on the wellness shot alike, without hardcoding which labels appear.
    if (/^\*\*[\w\s]+:\*\*/.test(line)) {
      const fieldRe = /\*\*([\w\s]+):\*\*\s*([^|]+?)(?=\s*\||$)/g;
      const fields = [];
      let fm;
      while ((fm = fieldRe.exec(line))) fields.push({ label: fm[1].trim(), value: fm[2].trim() });
      if (fields.length) {
        current.metaFields = fields;
        const prep = fields.find((f) => /prep/i.test(f.label));
        if (prep) current.prepTime = prep.value;
        continue;
      }
    }

    if (/^\*\*Nutrition Facts/i.test(line.trim())) {
      mode = "nutrition";
      continue;
    }

    const ingredientsHeader = line.match(/^\*\*(Option [A-Z]:[^*]*|Ingredients)\*\*/i);
    if (ingredientsHeader) {
      mode = "ingredients";
      current.ingredientSets.push({
        label: /^option/i.test(ingredientsHeader[1]) ? ingredientsHeader[1].trim() : null,
        items: [],
      });
      continue;
    }

    const instructionsHeader = line.match(/^\*\*(Instructions[^*]*|Pressure Cooker Instructions|Stovetop Instructions)\*\*/i);
    if (instructionsHeader) {
      mode = "instructions";
      const raw2 = instructionsHeader[1].trim();
      current.instructionSets.push({ label: /^instructions$/i.test(raw2) ? null : raw2, steps: [] });
      continue;
    }

    if (mode === "nutrition") {
      const kv = line.match(/^-\s*([A-Za-z][A-Za-z\s]*):\s*(.+)$/);
      if (kv) current.nutrition[kv[1].trim()] = kv[2].trim();
      continue;
    }
    if (mode === "ingredients") {
      const bullet = line.match(/^-\s+(.*)/);
      if (bullet) current.ingredientSets[current.ingredientSets.length - 1].items.push(bullet[1].trim());
      continue;
    }
    if (mode === "instructions") {
      const numbered = line.match(/^\d+\.\s+(.*)/);
      if (numbered) current.instructionSets[current.instructionSets.length - 1].steps.push(numbered[1].trim());
      continue;
    }
  }
  flush();

  // This source has no Saturday section ("repeat any favorite" by design in
  // the original plan) — keep that placeholder so the week stays 7 days
  // wide in the UI instead of showing an empty Saturday.
  if (!tasks.some((t) => t.dayKey === "Sat")) {
    for (const mealType of ["lunch", "dinner"]) {
      const label = `Repeat any favorite (${mealType[0].toUpperCase()}${mealType.slice(1)})`;
      tasks.push({
        id: makeStableId(categoryId, "Sat", label, seenIds),
        categoryId,
        dayKey: "Sat",
        label,
        detail: null,
        meta: { mealType },
        sort: sort++,
      });
    }
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
    else if (cat.layout === "meal-recipes-nutrition") tasks = parseMealRecipesNutrition(filePath, categoryId);
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

    // Task IDs are content-derived (see makeStableId), so renaming or
    // removing a row in the MD produces a *new* id rather than reusing the
    // old one — INSERT OR REPLACE alone would leave the old row (and old
    // label) behind forever. Prune anything in this category that the
    // current MD no longer produces.
    const currentIds = tasks.map((t) => `'${sqlEscape(t.id)}'`);
    statements.push(
      currentIds.length
        ? `DELETE FROM tasks WHERE category_id = '${sqlEscape(categoryId)}' AND id NOT IN (${currentIds.join(", ")});`
        : `DELETE FROM tasks WHERE category_id = '${sqlEscape(categoryId)}';`
    );
  }

  console.log(statements.join("\n"));
}

main();
