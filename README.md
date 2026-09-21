# NEON DASH // Community Arcade

A full-stack Geometry-Dash-style browser game for Cloudflare Pages + Pages Functions, built around the same broad product shape as the supplied Neon Dash reference: Dash mode, Platformer mode, a browser editor, community publishing and global scores. The gameplay, art and code here are original.

## Included

- Five seeded main levels.
- Dash auto-run physics with jumps, pads, orbs, spikes, saws, speed portals and collectibles.
- Platformer mode with A/D or arrow-key movement, jumping and solid blocks.
- Responsive/mobile gameplay controls.
- Account registration/login with PBKDF2 password hashing and secure HttpOnly session cookies.
- D1-backed levels, scores, reports, sessions, users and moderation actions.
- Server-authoritative replay verification for submitted clears; the server derives the score time from the simulated frame count rather than trusting the browser timer.
- Publish-time verifier bot. It runs deterministic candidate playthroughs against the same server physics and stores a verifier version/proof when it finds a route. This is a heuristic beatability verifier, not a mathematical proof of all possible player inputs.
- Moderator/admin console: feature, promote to main, unpublish, ban/unban, and role management.
- Optional Workers AI endpoint for lightweight title/description moderation. The app still works without an AI binding.
- Local editor drafts via `localStorage`.
- 16 object types in the editor.

## Cloudflare setup — just bind D1 and redeploy

The app is designed so you do **not** need a D1 database ID in this repository and you do **not** need to run `wrangler d1 execute` manually. Cloudflare Pages exposes dashboard bindings to Pages Functions through `context.env`; this project expects the binding name `DB`. citeturn202508search0turn202508search3

1. Deploy this Pages project.
2. In **Workers & Pages → your Pages project → Settings → Bindings**, add **D1 database**.
3. Set **Variable name** to exactly `DB` and select any D1 database.
4. Save the binding and **redeploy** the Pages project so the binding takes effect.

That is the production setup. On the first `/api/*` request, the app automatically creates all tables, indexes and the five starter main levels. Existing data is left in place because the bootstrap uses `CREATE ... IF NOT EXISTS` and `INSERT OR IGNORE`.

No database ID belongs in `wrangler.jsonc`. That file only controls the Pages project itself.

### Optional Workers AI

The AI moderation helper is optional. Add a Workers AI binding named `AI` in the same Pages Settings → Bindings screen if you want it; the rest of the site works without it. Cloudflare documents the same dashboard binding flow for Workers AI. citeturn202508search0

### Local development

Production needs only the Pages dashboard binding. For local D1 development, Wrangler can inject a D1 binding at runtime with `--d1 BINDING_NAME=DATABASE_ID`, so you can run for example:

```bash
npx wrangler pages dev public --d1 DB=YOUR_DATABASE_ID
```

Cloudflare documents this local-development pattern explicitly. citeturn202508search0

## Make yourself admin

Register your account in the site, then run this once against D1:

```sql
UPDATE users SET role = 'admin' WHERE username = 'YOUR_USERNAME';
```

After that, reload the site. The Account page will show the Staff Console. Admins can promote another account to `moderator`.

## Suggested production bindings

- `DB`: required.
- `AI`: optional, only used by `/api/ai/moderate`.

You can add KV/Queues later for stricter rate limiting or asynchronous verification. The current build deliberately keeps the base version on D1 + Workers/Pages so it is easy to deploy and inspect.

## Level format

Levels are JSON objects like:

```json
{
  "version": 1,
  "mode": "dash",
  "speed": 7,
  "length": 220,
  "bg": "neon",
  "objects": [
    {"type":"spike","x":320,"y":424,"w":32,"h":32,"rot":0},
    {"type":"pad","x":640,"y":424,"w":32,"h":32,"rot":0}
  ]
}
```

Supported object types: `block`, `spike`, `spike_down`, `saw`, `pad`, `orb`, `coin`, `speed_up`, `speed_down`, `gravity_flip`, `portal_ship`, `portal_cube`, `portal_platformer`, `finish`, `deco`, `jump_through`.

## Automatic database bootstrap

`functions/_lib/db.js` contains the production schema and starter-level seed data. `functions/_middleware.js` initializes it lazily before API requests. This means a brand-new empty D1 database can be attached from the Pages dashboard and used immediately.

## Architecture

```text
public/
  index.html
  styles.css
  app.js
  game.js
  editor.js
functions/
  api/auth/*
  api/levels/*
  api/leaderboard.js
  api/mod/index.js
  api/report.js
  api/ai/moderate.js
  _lib/auth.js
  _lib/crypto.js
  _lib/http.js
  _lib/level.js
  _lib/verifier.js
schema.sql
data/seed.sql
wrangler.jsonc
```

## Important verifier note

The verifier is intentionally bounded so a malicious level cannot force unbounded CPU work. It validates object count, level length and field ranges before simulating. Community levels that use mechanics outside the verifier's supported physics should be treated as unverified until the verifier is expanded.
