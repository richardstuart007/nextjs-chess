# Plan — nextjs-chess, "version": "1.0.3"

## Current task
_No active task._

## Outstanding items
_(none)_

## Completed tasks
### 2026-06-15 — Remove unused clsx dependency
- [x] Remove `clsx` from `package.json` — not imported anywhere in src/

### 2026-06-15 — Package upgrades, postcss override fix, react-chessboard v5 migration
- [x] Fix `.npmrc` — change `save-exact=true` to `save-exact=false`
- [x] Replace custom `src/app/owner/layout.tsx` with `OwnerLayout` from nextjs-shared
- [x] Remove eslint from package.json
- [x] Remove postcss from direct dependencies (was conflicting with overrides)
- [x] Set `overrides: { postcss: "8.5.10" }` in nextjs-chess and nextjs-shared
- [x] Migrate `<Chessboard>` to react-chessboard v5 `options` API

### 2026-06-15 — Fix board not updating after react-chessboard v5 upgrade
- [x] Identify root cause: all packages pinned to latest; react-chessboard upgraded from ^4.7.2 to 5.10.0 which changed its API entirely
- [x] Update `<Chessboard>` in `ChessBoardView.tsx` to use the v5 `options` prop
- [x] Rename `arePiecesDraggable` → `allowDragging` inside options
- [x] Rename `customSquareStyles` → `squareStyles` inside options
- [x] Replace `boardWidth={440}` with `boardStyle: { width: '440px', maxWidth: '440px' }` inside options
- [x] Update `onPieceDrop` signature from `(sourceSquare, targetSquare)` to `({ piece, sourceSquare, targetSquare })` with `targetSquare: string | null`
