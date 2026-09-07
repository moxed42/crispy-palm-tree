#!/usr/bin/env node
// Stamps public/version.json with the current commit and build time.
// Run automatically before `wrangler deploy` via the "predeploy" npm
// script, so every deploy is self-labeling — no manual version bump.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function safeGit(cmd, fallback) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

const commit = safeGit("git rev-parse --short HEAD", "unknown");
const dirty = safeGit("git status --porcelain", "") !== "";
const builtAt = new Date().toISOString();

const version = { commit: dirty ? `${commit}-dirty` : commit, builtAt };

fs.writeFileSync(
  path.join(__dirname, "..", "public", "version.json"),
  JSON.stringify(version, null, 2) + "\n"
);

console.log(`Stamped version.json: ${version.commit} @ ${builtAt}`);
