'use server'

import { Chess } from 'chess.js'
import { upsertPosition, upsertMove, saveGamePosition, gamePositionExists } from './db'

const MAX_MOVE = 20

interface GameRecord {
  grid: number
  player: string
  pgn: string
  result: string
  chesscom_uuid: string
}

function pgmResult(result: string): 'win' | 'loss' | 'draw' {
  if (result === 'win') return 'win'
  if (result === 'loss') return 'loss'
  return 'draw'
}

async function processGame(game: GameRecord): Promise<{ positions: number; moves: number }> {
  if (!game.pgn) return { positions: 0, moves: 0 }

  const chess = new Chess()
  try {
    chess.loadPgn(game.pgn)
  } catch {
    return { positions: 0, moves: 0 }
  }

  const history = chess.history({ verbose: true })
  const gameResult = pgmResult(game.result)

  // Replay from start to collect positions
  const replay = new Chess()
  let posCount = 0
  let movCount = 0

  for (let i = 0; i < Math.min(history.length, MAX_MOVE); i++) {
    const fen   = replay.fen()
    const color = replay.turn()
    const move  = history[i]

    const alreadyRecorded = await gamePositionExists(game.chesscom_uuid, fen)
    if (!alreadyRecorded) {
      await upsertPosition(fen, color, i + 1)
      await saveGamePosition({
        gameRef:     game.chesscom_uuid,
        player:      game.player,
        posFen:      fen,
        movePlayed:  move.san,
        moveNum:     Math.ceil((i + 1) / 2)
      })
      posCount++
    }

    await upsertMove(fen, move.san, move.lan ?? (move.from + move.to + (move.promotion ?? '')), gameResult)
    movCount++

    replay.move(move.san)
  }

  return { positions: posCount, moves: movCount }
}

export async function buildPositionTree(opts: {
  limit?: number
  playerUsername?: string
}): Promise<{
  gamesProcessed: number
  positions: number
  moves: number
  errors: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const limit = opts.limit ?? 100
  const params: any[] = []
  let playerFilter = ''
  if (opts.playerUsername) {
    params.push(opts.playerUsername.toLowerCase())
    playerFilter = `AND r.gr_player_username = $${params.length}`
  }
  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''

  // Query tgr_gamesraw directly — no JOIN to tgd_gamesdecon needed.
  // tgd_gamesdecon only contains blitz games; tgr_gamesraw has all time classes.
  // Player result is derived from the raw JSON (same logic as deconstructGames).
  const gamesRes = await db.query({
    caller: 'buildPositionTree_fetch',
    query: `
      SELECT
        r.gr_grid AS grid,
        r.gr_player_username AS player,
        (r.gr_raw_data->>'pgn') AS pgn,
        r.gr_chesscom_uuid AS chesscom_uuid,
        CASE
          WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'white'->>'result' = 'win'  THEN 'win'
          WHEN LOWER(r.gr_raw_data->'black'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'black'->>'result' = 'win'  THEN 'win'
          WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'black'->>'result' = 'win'  THEN 'loss'
          WHEN LOWER(r.gr_raw_data->'black'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'white'->>'result' = 'win'  THEN 'loss'
          ELSE 'draw'
        END AS result
      FROM tgr_gamesraw r
      WHERE (r.gr_raw_data->>'pgn') IS NOT NULL
        ${playerFilter}
      ORDER BY r.gr_end_time DESC
      ${limitClause}
    `,
    params,
    functionName: 'buildPositionTree'
  })

  const games: GameRecord[] = gamesRes.rows.map((r: any) => ({
    grid:           r.grid,
    player:         r.player,
    pgn:            r.pgn ?? '',
    result:         r.result,
    chesscom_uuid:  r.chesscom_uuid
  }))

  let totalPositions = 0
  let totalMoves     = 0
  let errors         = 0

  for (const game of games) {
    try {
      const { positions, moves } = await processGame(game)
      totalPositions += positions
      totalMoves     += moves
    } catch (err) {
      console.error(`buildPositionTree: error on game ${game.chesscom_uuid}`, err)
      errors++
    }
  }

  return {
    gamesProcessed: games.length,
    positions: totalPositions,
    moves:     totalMoves,
    errors
  }
}
