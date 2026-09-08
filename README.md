# MERIDIAN // OPS

A private, mobile-first glow-up tracker. You are the sole crew member aboard
a long-haul transit vessel; this terminal is how you keep the ship's systems
(training, fuel, life support) from degrading during the haul. PIN-gated,
built on a single Cloudflare Worker (static assets + `/api/*` + D1), designed
for a single iPhone added to the home screen. Everything is served from one
origin on purpose — it keeps the PIN session cookie first-party, which
matters a lot on iOS Safari in home-screen/standalone mode.

## Systems mapping (Transit Cycle 01)
- **PROPULSION** — training plan (`programs/week1/week1-strength-plan.md`). A
  `kind: "sets"` category: tap an exercise to expand it, log actual
  weight/reps per set, and see hypermobility-aware form cues (sourced from
  established hypermobility/EDS physical-therapy guidance, not social media).
  Also carries one plain checkbox task, "Daily steps target" — a task's
  `meta.kind` can override its category's default kind, so a mostly-sets
  category can still hold a single checklist item without needing its own
  category.
- **FUEL CELLS** — meals (`programs/week1/week1-recipes-nutrition.md`). A
  `kind: "checkbox"` category: tap a meal to expand its full nutrition
  facts (calories/protein/fat/carbs/fiber), prep time, ingredients, and
  step-by-step instructions — all parsed straight out of the MD file, no
  external sourcing needed since it's already this detailed. Also includes
  the Morning Wellness Shot (weekly-batch item, shown in the recurring
  daily group since it isn't tied to one weekday).
  (`week1-meal-plan.md` is kept in the repo for its grocery list and
  fallback-option reference content, but is no longer the parse source —
  superseded by the richer nutrition file.)
- **LIFE SUPPORT** — sleep/hydration/supplements (`programs/week1/sleep-hydration-supplements.md`).
  Sleep and Hydration are each their own daily checkbox task (their
  guidance is prose/bullets, not a table, so they're captured as one task
  per section rather than one per line) alongside the supplement schedule.

Every category (Propulsion included) has a date picker at the top, so you
can look back at any past day's tasks and what was actually logged — not
just today.

## Migrating an existing deployment to this schema
If you already ran the original setup (v1: simple checkboxes only), the
live database needs a small migration before this version's API will work
— it adds workout set-logging and recipe/exercise metadata on top of what's
already there:
```
wrangler d1 execute meridian-ops-db --remote --file=worker/migrate-v2.sql
node scripts/seed-from-md.js programs/week1 > worker/seed-week1.sql
wrangler d1 execute meridian-ops-db --remote --file=worker/seed-week1.sql
npm run deploy
```
(New setups can skip this — `worker/schema.sql` already includes everything.)

## One-time setup

1. **Install wrangler** (Cloudflare's CLI), if not already: `npm install -g wrangler`
2. **Log in:** `wrangler login`
3. **Create the D1 database:**
   ```
   wrangler d1 create meridian-ops-db
   ```
   Copy the `database_id` it prints into `wrangler.toml` under `[[d1_databases]]`.
4. **Apply the schema:**
   ```
   wrangler d1 execute meridian-ops-db --remote --file=worker/schema.sql
   ```
5. **Generate and apply the seed data** (from the MD files):
   ```
   node scripts/seed-from-md.js programs/week1 > worker/seed-week1.sql
   wrangler d1 execute meridian-ops-db --remote --file=worker/seed-week1.sql
   ```
6. **Set your PIN** (numeric access code, kept as a secret — never in code):
   ```
   wrangler secret put PIN
   ```
7. **Deploy everything (frontend + API) in one shot:**
   ```
   npm run deploy
   ```
   This uploads both the Worker code and the `public/` static assets
   (configured via `[assets]` in `wrangler.toml`) — one deploy, one origin,
   no separate Pages project and no cross-origin routing to configure.
   The URL it prints (something like `https://meridian-ops.<you>.workers.dev`)
   is the whole app.

   Use `npm run deploy`, not `wrangler deploy` directly, going forward —
   it runs `scripts/gen-version.js` first (an npm `predeploy` hook), which
   stamps `public/version.json` with the current git commit and a build
   timestamp. That's what shows up as the small "v&lt;commit&gt; · updated
   &lt;time&gt;" line at the bottom of the app, so you always have a quick,
   automatic way to confirm a deploy actually shipped your latest changes.

## Adding your iPhone home-screen icon
Add square PNGs at `public/icon-192.png` and `public/icon-512.png` (any dark,
terminal-style mark) before deploying — referenced by `manifest.json`. Then
on the iPhone: open the deployed URL in Safari → Share → **Add to Home
Screen**. It launches full-screen, no browser chrome.

## Updating content going forward

Two ways to get an updated MD file from your Claude.ai chat into the live
site — pick whichever fits the moment, both end the same way (a push to
`main` that the GitHub Action turns into a D1 update within ~30-60 seconds):

**Option A — GitHub's web editor, no tools needed.**
1. Generate/update the MD in your Claude.ai chat, copy the content.
2. On github.com, open this repo → navigate to `programs/week1/<file>.md` →
   pencil icon (Edit) → paste the new content → "Commit changes" (commit
   directly to `main` is fine for a private personal repo).
3. Done — the Action fires automatically. Check the "Actions" tab if you
   want to confirm it went green.
   - New file instead of an edit? Use the "Add file" button in the
     `programs/<program-id>/` folder the same way.

**Option B — hand it to a Claude Code session (like this one).**
1. Paste the updated MD content into the chat and say what changed.
2. Ask it to update the file and push. It'll edit `programs/<program-id>/<file>.md`,
   commit, and push to `main` for you — same trigger as Option A.
   Useful when the change is bigger (a whole new program, restructuring
   `program.json`) since the session can also run the parser locally first
   to sanity-check the output before pushing.

Either path is "the mechanism" — there's no separate sync step to remember;
pushing the MD *is* the update. The Action re-parses every program under
`programs/` on each push (not just the changed one) and re-applies each
program's seed to D1, so it's always safe to re-run even without changes.

**One thing to set up once for this to work:** add `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID` as repo secrets (Settings → Secrets and
variables → Actions) — the token needs D1 edit permission. Without these
the Action will fail at the "Apply each program's seed to D1" step.

To add a whole new program (a different hobby/glow-up track) later:
create `programs/<new-id>/` with its MD files and a `program.json` manifest
(see `programs/TEMPLATE.md`), set `"active": true` on it and `false` on the
old one, push, and the frontend picks it up — no code changes required.

## Local development
```
wrangler dev
```
Runs the Worker + static assets locally for testing the PIN gate and
checklist behavior before deploying.

## Security notes
- The PIN is stored only as a Cloudflare Worker secret, never committed.
- Session cookies are `HttpOnly; Secure; SameSite=Strict`.
- The repo itself can be public or private on GitHub — either way, the live
  site is inaccessible without the PIN, since every `/api/*` route requires
  a valid session.
