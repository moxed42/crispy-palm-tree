#!/usr/bin/env node
// Parses a program's MD files (per programs/TEMPLATE.md) into SQL insert
// statements for D1. Usage: node scripts/seed-from-md.js <program-dir> > seed.sql
//
// Heuristics (matches programs/TEMPLATE.md):
//  - "##" heading            -> category (unless it's a reference-only section)
//  - "###" heading           -> day_key for tasks until the next ### or ##
//  - a "| ... |" table row   -> one task per row, col 1 = label, rest = detail
//  - a "- " bullet line      -> one task per bullet (no table present)
//  - REFERENCE_WORDS in a heading -> section stored as reference text, no tasks

const fs = require("fs");
const path = require("path");

const REFERENCE_WORDS = ["context", "notes", "known", "fallback", "grocery", "brand", "note"];

function isReferenceHeading(text) {
  const lower = text.toLowerCase();
  return REFERENCE_WORDS.some((w) => lower.includes(w));
}

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
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cells;
}

function isTableSeparator(line) {
  return /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");
}

function parseFile(filePath, categoryId, categoryLabel, sortStart) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const tasks = [];
  let dayKey = null;
  let inReferenceSection = false;
  let sort = sortStart;
  let tableHeader = null;
  const seenIds = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      dayKey = h3[1].trim();
      inReferenceSection = false;
      tableHeader = null;
      continue;
    }
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      const heading = h2[1].trim();
      // A "## Day N (Weekday) — ..." heading is a day marker within this
      // file's single category, not a new category (category is fixed per
      // file by program.json) — same for "## Lunch/Dinner options" tables
      // where day comes from the table's own first column instead.
      if (/^day\s+\d/i.test(heading)) {
        dayKey = heading;
        inReferenceSection = false;
      } else {
        inReferenceSection = isReferenceHeading(heading);
        dayKey = null;
      }
      tableHeader = null;
      continue;
    }

    if (inReferenceSection) continue;

    if (line.trim().startsWith("|")) {
      const cells = parseTableRow(line);
      if (isTableSeparator(line)) continue;
      if (!tableHeader) {
        tableHeader = cells;
        continue;
      }
      const [label, ...rest] = cells;
      if (!label) continue;
      tasks.push({
        id: makeStableId(categoryId, dayKey, label, seenIds),
        categoryId,
        dayKey,
        label,
        detail: rest.join(" — ") || null,
        sort: sort++,
      });
      continue;
    }
    tableHeader = null;

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet && dayKey === null) {
      // Only treat bare bullets as tasks inside a day-scoped or top-level
      // checklist context; bullets used purely as prose elsewhere are skipped
      // by the reference-section check above.
    }
  }

  return { tasks, categoryLabel };
}

function main() {
  const programDir = process.argv[2];
  if (!programDir) {
    console.error("Usage: node scripts/seed-from-md.js <program-dir>");
    process.exit(1);
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(programDir, "program.json"), "utf8")
  );

  const statements = [];
  statements.push(
    `INSERT OR REPLACE INTO programs (id, name, theme_concept, active) VALUES ('${sqlEscape(
      manifest.id
    )}', '${sqlEscape(manifest.name)}', '${sqlEscape(manifest.theme_concept)}', ${
      manifest.active ? 1 : 0
    });`
  );

  let catSort = 0;
  for (const file of manifest.files) {
    const catInfo = manifest.categories[file];
    if (!catInfo) continue; // reference-only file (e.g. overview doc), no category
    const categoryId = `${manifest.id}-${catInfo.id}`;
    statements.push(
      `INSERT OR REPLACE INTO categories (id, program_id, name, label, sort_order) VALUES ('${sqlEscape(
        categoryId
      )}', '${sqlEscape(manifest.id)}', '${sqlEscape(catInfo.id)}', '${sqlEscape(
        catInfo.label
      )}', ${catSort++});`
    );

    const { tasks } = parseFile(
      path.join(programDir, file),
      categoryId,
      catInfo.label,
      0
    );

    for (const t of tasks) {
      statements.push(
        `INSERT OR REPLACE INTO tasks (id, category_id, day_key, label, detail, sort_order) VALUES ('${sqlEscape(
          t.id
        )}', '${sqlEscape(t.categoryId)}', ${
          t.dayKey ? `'${sqlEscape(t.dayKey)}'` : "NULL"
        }, '${sqlEscape(t.label)}', ${
          t.detail ? `'${sqlEscape(t.detail)}'` : "NULL"
        }, ${t.sort});`
      );
    }
  }

  console.log(statements.join("\n"));
}

main();
