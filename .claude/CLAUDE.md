# nextjs-chess project skill file

## Project
Chess game analyser — Next.js, Vercel, Neon/Vercel Postgres, react-chessboard, chess.js, Stockfish WASM

## Database
- Three environments controlled by env file:
  - `.env.locallocal` → local postgres (`local_chess`) — used by the dev server
  - `.env.localprod`  → Neon cloud DB (production)
  - `.env`            → legacy local config (not used for dev)
- All database changes (CREATE, ALTER, DROP, etc.) are provided as SQL in chat and run manually by the user via pgAdmin4 — see global CLAUDE.md for the full rule

## Dev server
- Start: `npm run dev` (uses `.env.locallocal` automatically via nextjs-shared env injector)
- URL: `http://localhost:3000`

## Key routes
- `/` — main dashboard (games list)
- `/maintenance` — sync + deconstruct games (run Cron Sync here to rebuild tgd_gamesdecon)
- `/admin/maint/db-tools` — schema compare + table copy (DatabaseTools from nextjs-shared)
- `/admin/maint/copytable` — copy tables from production to local
- `/analyze` — single-game Stockfish analysis

## nextjs-shared
- Installed from: `github:richardstuart007/nextjs-shared`
- Re-install fresh: `npm install github:richardstuart007/nextjs-shared --force`
- Provides: `sql()`, `table_fetch`, `table_write`, `table_update`, `table_count`, `fetchFiltered`, `fetchTotalPages`, `MyBox`, `MyButton`, `MyInput`, `MySelect`, `MyLoadingMessage`, `MyHourGlass`, `MyPagination`, `CopyTable`, `DatabaseTools`

## Coding rules
- Table prefix uniqueness: the characters before the first `_` in a table name must be unique across the entire schema. Before creating a new table, verify no existing table uses the same prefix
- Admin files live under `src/app/admin/`
- DB queries use `nextjs-shared/db` → `sql()` → `db.query({ caller, query, params, functionName })`
- Stockfish runs client-side only (Web Worker) — never on the server
- Anthropic API calls server-side only — model: `claude-sonnet-4-20250514`
- All boards use `react-chessboard` with correct orientation for side to move

## Silent file updates — never ask permission

**PLAN.md and CHANGES.md are always updated silently.**  
Never ask before checking off a step in `.claude/PLAN.md` or appending to `.claude/CHANGES.md`. These are mechanical parts of execution — no confirmation needed.
