# MERIDIAN // OPS

A private, mobile-first glow-up tracker. You are the sole crew member aboard
a long-haul transit vessel; this terminal is how you keep the ship's systems
(training, fuel, life support) from degrading during the haul. PIN-gated,
built on Cloudflare (Pages + Workers + D1), designed for a single iPhone
added to the home screen.

## Systems mapping (Transit Cycle 01)
- **PROPULSION** — training plan (`programs/week1/week1-strength-plan.md`)
- **FUEL CELLS** — meals (`programs/week1/week1-meal-plan.md`)
- **LIFE SUPPORT** — sleep/hydration/supplements (`programs/week1/sleep-hydration-supplements.md`)

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
   node scripts/seed-from-md.js programs/week1 > worker/seed.sql
   wrangler d1 execute meridian-ops-db --remote --file=worker/seed.sql
   ```
6. **Set your PIN** (numeric access code, kept as a secret — never in code):
   ```
   wrangler secret put PIN
   ```
7. **Deploy the Worker:**
   ```
   wrangler deploy
   ```
8. **Deploy the static frontend to Cloudflare Pages:** either connect this repo
   to Pages in the Cloudflare dashboard (build output directory: `public`), or:
   ```
   wrangler pages deploy public
   ```
   Point Pages' `/api/*` routes at the deployed Worker (via a Pages Function
   route or a custom domain routing rule) so the frontend's `fetch("/api/...")`
   calls reach it.

## Adding your iPhone home-screen icon
Add square PNGs at `public/icon-192.png` and `public/icon-512.png` (any dark,
terminal-style mark) before deploying — referenced by `manifest.json`. Then
on the iPhone: open the deployed URL in Safari → Share → **Add to Home
Screen**. It launches full-screen, no browser chrome.

## Updating content going forward
1. Generate/update an MD file in your Claude.ai chat.
2. Save it into `programs/<program-id>/` in this repo (paste it to a Claude
   Code session and ask it to commit + push, or commit it yourself).
3. Push to `main`. The GitHub Action (`.github/workflows/update-content.yml`)
   re-parses the program's MD files and re-applies the D1 seed automatically.

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
