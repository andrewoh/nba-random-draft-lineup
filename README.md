# NBA Random Draft Lineup (MVP)

Production-style MVP built with Next.js App Router + TypeScript + Tailwind + Prisma (SQLite).

## What this app does

- Plays one round of 5 draws.
- Draws NBA teams uniformly at random without replacement.
- On each draw, user picks exactly one player from that team roster.
- Team logos are shown from official NBA CDN assets.
- Players are restricted to realistic position eligibility.
- Each draw has a 24-second shot clock. If it expires, a random open slot is auto-filled with a 0-point penalty.
- User assigns that player to one open lineup slot: `PG`, `SG`, `SF`, `PF`, `C`.
- Filled slots lock for the rest of the round.
- After 5 picks, app computes normalized `Team Score` (0-100) from projected 3-season advanced metrics, stores run, and generates a share code.
- Shared results are read-only via `/results/[shareCode]`.
- Friend leaderboard supports filtering by `groupCode` and displays the run owner name.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma + SQLite
- Vitest (unit tests)
- Playwright (smoke e2e)

## Local development

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

1. Install dependencies:

```bash
npm install
```

2. Environment:

A local `.env` is already included for convenience:

```env
DATABASE_URL="file:./dev.db"
```

If you want to recreate it manually:

```bash
cp .env.example .env
```

3. Start dev server:

```bash
npm run dev
```

`predev` runs `prisma migrate deploy`, so a fresh local SQLite DB is initialized automatically.

## Sync latest NBA data

Default target is the latest season: `2025-26`.  
The sync script pulls rosters from live ESPN team roster endpoints (NBA endpoint fallback) and pulls three seasons of advanced stats by default (`2025-26`, `2024-25`, `2023-24`) for 3-season projections.
If a Basketball-Reference season page is temporarily unavailable, sync falls back to nearest available season stats instead of failing the whole run.

```bash
npm run data:sync
```

Quick validation (expects every team to have at least 12 players):

```bash
node -e "const r=require('./data/rosters.json');console.log(Object.entries(r).map(([t,p])=>`${t}:${p.length}`).join('\n'))"
```

Optional overrides:

```bash
TARGET_SEASON=2025-26 SYNC_SEASONS=2025-26,2024-25,2023-24 npm run data:sync
```

## Seed demo runs (optional)

```bash
npm run db:seed
```

This adds sample leaderboard runs with share codes:

- `DEMO01`
- `DEMO02`

## Run tests

Unit tests:

```bash
npm run test:unit
```

Playwright smoke test:

```bash
npx playwright install
npm run test:e2e
```

## Game/data implementation notes

- Teams: `data/teams.json` (all 30 teams)
- Rosters: `data/rosters.json` (updated via `npm run data:sync`; sync backfills from prior season if a team has <12 players)
- Position eligibility: `data/player_positions.json`
- Advanced stats: `data/stats.json` keyed by `"Player Name|Season"`
- Scoring uses a 3-season lookback average (projected from available seasons for rookies/young players).
- If no historical stats are available, baseline projected stats are used and flagged in results UI.
- Shot clock penalties are saved as `Shot Clock Violation` picks with 0 contribution.

## Deterministic randomness

- Users can provide an optional `seed` when starting a game.
- Same seed => same 5-team draw sequence.
- Seed is persisted and displayed in results.

## Scoring configuration

Scoring logic lives in:

- `src/lib/scoring.ts`

It includes:

- metric weights
- metric normalization ranges
- 0-100 team score normalization

To tune balance, edit `METRIC_WEIGHTS` and `METRIC_RANGES` in that file.

## Prisma

Schema:

- `prisma/schema.prisma`

Migration:

- `prisma/migrations/20260220000000_init/migration.sql`
- `prisma/migrations/20260220100000_shot_clock_penalties/migration.sql`
- `prisma/migrations/20260221131000_add_user_name/migration.sql`

Main models:

- `DraftSession` (persisted in-progress game state)
- `Run` (completed round metadata + share code)
- `RunPick` (slot/player stats/contribution breakdown)

## Routes

- `/` Home (start game, name, group code, seed, rules)
- `/draft` Draft board
- `/results/[shareCode]` Read-only run results
- `/leaderboard` Friend leaderboard with group filter and run owner name

## Deploy for a shareable link (Render)

This repo includes `render.yaml` + `Dockerfile` for one-click deploy on Render.

1. Push `/Users/andrew.oh/nba-random-draft-lineup` to GitHub.
2. In Render, choose `New +` -> `Blueprint`.
3. Select your repo; Render will read `/Users/andrew.oh/nba-random-draft-lineup/render.yaml`.
4. Deploy.

After deploy, Render gives you a public URL your friends can open.

Notes:
- Current `render.yaml` is Free-tier compatible and stores SQLite at `/tmp/dev.db` (ephemeral; data can reset on restart/redeploy).
- `npm start` runs Prisma migrations on boot via `prestart`.
- For persistent data, switch Render plan from `free` to `starter` and add a mounted disk, or move to Postgres.
