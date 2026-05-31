# nextjs-chess project skill file

## Project
Chess game analyser — Next.js, Vercel, Neon/Vercel Postgres, react-chessboard, chess.js, Stockfish WASM

## Database
- Three environments controlled by env file:
  - `.env.locallocal` → local postgres (`local_chess`) — used by the dev server
  - `.env.localprod`  → Neon cloud DB (production)
  - `.env`            → legacy local config (not used for dev)
- **NEVER run `lib/migrate.ts`** — it contains `DROP TABLE` statements that destroy data
- For new tables use additive SQL only (`CREATE TABLE IF NOT EXISTS`)

## Dev server
- Start: `npm run dev` (uses `.env.locallocal` automatically via nextjs-shared env injector)
- URL: `http://localhost:3000`

## Key routes
- `/` — main dashboard (games list)
- `/maintenance` — sync + deconstruct games (run Cron Sync here to rebuild tgd_gamesdecon)
- `/admin/maint/db-tools` — schema compare + table copy (DatabaseTools from nextjs-shared)
- `/admin/maint/copytable` — copy tables from production to local
- `/analysis/habits` — blunder habits (sub-tab)
- `/analysis/quiz` — quiz mode (sub-tab)
- `/analysis/briefing` — coaching briefing (sub-tab)
- `/analysis/enrich` — Stockfish game enrichment (sub-tab)
- `/analyze` — single-game Stockfish analysis

## Analysis pipeline order
1. `/api/analysis/build-tree?limit=100&player=USERNAME` — build position tree (chess.js only, fast)
2. `/analysis/enrich` — Stockfish enrichment in browser (select games, click Start)
3. `/api/analysis/generate-insights?limit=10` — Claude AI insights per position
4. Habits / Quiz / Briefing pages then have data

## nextjs-shared
- Installed from: `github:richardstuart007/nextjs-shared`
- Re-install fresh: `npm install github:richardstuart007/nextjs-shared --force`
- Provides: `sql()`, `table_fetch`, `table_write`, `table_update`, `table_count`, `fetchFiltered`, `fetchTotalPages`, `MyBox`, `MyButton`, `MyInput`, `MySelect`, `MyLoadingMessage`, `MyHourGlass`, `MyPagination`, `CopyTable`, `DatabaseTools`

## Coding rules
- All new code in new files — never modify existing files to add new features
- No `ALTER TABLE` on existing tables — create new tables instead
- New analysis files live under `src/lib/analysis/`, `src/app/analysis/`, `src/ui/analysis/`
- Admin files live under `src/app/admin/`
- DB queries use `nextjs-shared/db` → `sql()` → `db.query({ caller, query, params, functionName })`
- Stockfish runs client-side only (Web Worker) — never on the server
- Anthropic API calls server-side only — model: `claude-sonnet-4-20250514`
- All boards use `react-chessboard` with correct orientation for side to move
