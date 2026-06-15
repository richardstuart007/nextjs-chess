# Changes — 2026-06-15

## .npmrc
- Changed `save-exact=true` → `save-exact=false` to prevent npm rewriting `github:richardstuart007/nextjs-shared` to `1.0.0` after install

## src/app/owner/layout.tsx
- Replaced custom client layout with `OwnerLayout` from nextjs-shared — standard `px-6 py-4 bg-green-100` container and sessionStorage back-link

## package-lock.json
- Updated nextjs-shared resolved commit to v2.0.2 via npm update nextjs-shared

## src/ui/board/ChessBoardView.tsx
- Migrated `<Chessboard>` usage from react-chessboard v4 API (direct props) to v5 API (single `options` object) — v5 silently ignores props not under `options`, which caused the board to stop updating when navigating through moves
- Renamed `arePiecesDraggable` → `allowDragging` (inside options)
- Renamed `customSquareStyles` → `squareStyles` (inside options)
- Replaced `boardWidth={440}` with `boardStyle: { width: '440px', maxWidth: '440px' }` (inside options)
- Updated `onPieceDrop` handler signature from `(sourceSquare: string, targetSquare: string)` to `({ piece, sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null })` to match v5's destructured-arg contract; added `!targetSquare` early return
