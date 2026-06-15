# Plan — nextjs-chess

## Current task: Update to nextjs-shared v2.0.2
- [x] Fix `.npmrc` — change `save-exact=true` to `save-exact=false` to prevent npm rewriting github: refs to registry versions
- [x] Replace custom `src/app/owner/layout.tsx` with `OwnerLayout` from nextjs-shared
- [ ] Remove-Item -Recurse -Force node_modules\nextjs-shared
- [ ] npm update nextjs-shared
- [ ] Remove-Item -Recurse -Force .next
- [ ] npx tsc --noEmit
- [ ] npm run build
- [ ] Commit all

## Outstanding items
_(none)_

## Completed tasks
### 2026-06-15 — Fix board not updating after react-chessboard v5 upgrade
- [x] Identify root cause: all packages pinned to latest; react-chessboard upgraded from ^4.7.2 to 5.10.0 which changed its API entirely
- [x] Update `<Chessboard>` in `ChessBoardView.tsx` to use the v5 `options` prop
- [x] Rename `arePiecesDraggable` → `allowDragging` inside options
- [x] Rename `customSquareStyles` → `squareStyles` inside options
- [x] Replace `boardWidth={440}` with `boardStyle: { width: '440px', maxWidth: '440px' }` inside options
- [x] Update `onPieceDrop` signature from `(sourceSquare, targetSquare)` to `({ piece, sourceSquare, targetSquare })` with `targetSquare: string | null`
