'use server'

import { Chess } from 'chess.js'
import { upsertPosition, upsertMove, saveGamePosition, gamePositionExists } from './chessdb'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'

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
  dateFrom?: string
  dateTo?: string
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
  const conditions: string[] = ['(r.gr_raw_data->>\'pgn\') IS NOT NULL']

  // Skip games already fully recorded in the position tree
  conditions.push(`NOT EXISTS (
    SELECT 1 FROM tgam_game_positions
    WHERE gam_game_ref = r.gr_chesscom_uuid
      AND gam_player = r.gr_player_username
  )`)

  if (opts.playerUsername) {
    params.push(opts.playerUsername.toLowerCase())
    conditions.push(`r.gr_player_username = $${params.length}`)
  }
  if (opts.dateFrom) {
    params.push(Math.floor(new Date(opts.dateFrom).getTime() / 1000))
    conditions.push(`r.gr_end_time >= $${params.length}`)
  }
  if (opts.dateTo) {
    params.push(Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000))
    conditions.push(`r.gr_end_time <= $${params.length}`)
  }

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const whereClause = conditions.map(c => `(${c})`).join(' AND ')

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
      WHERE ${whereClause}
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

  const fromTs   = opts.dateFrom ? Math.floor(new Date(opts.dateFrom).getTime() / 1000)                   : 0
  const toTs     = opts.dateTo   ? Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)       : 9999999999
  const snapRes  = await db.query({
    caller: 'buildPositionTree_snap',
    query: `SELECT
      (SELECT COUNT(*) FROM (
         SELECT DISTINCT gp.gam_game_ref, gp.gam_player
         FROM tgam_game_positions gp
         JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
         WHERE r.gr_end_time >= $1 AND r.gr_end_time <= $2
       ) t) AS snap_processed,
      (SELECT COUNT(*) FROM tgr_gamesraw r
       WHERE (r.gr_raw_data->>'pgn') IS NOT NULL
         AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         AND NOT EXISTS (
           SELECT 1 FROM tgam_game_positions
           WHERE gam_game_ref = r.gr_chesscom_uuid AND gam_player = r.gr_player_username
         )) AS snap_remaining`,
    params:       [fromTs, toTs],
    functionName: 'buildPositionTree'
  })
  const snapProcessed  = parseInt(snapRes.rows[0].snap_processed  ?? '0')
  const snapRemaining  = parseInt(snapRes.rows[0].snap_remaining  ?? '0')

  let totalPositions = 0
  let totalMoves     = 0
  let errors         = 0
  const t0           = Date.now()
  const logId        = await startPipelineLog(3, 'Build Position Tree', games.length, snapProcessed, snapRemaining, opts.dateFrom, opts.dateTo)

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

  const processed = games.length - errors
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, snapProcessed + processed)
  return {
    gamesProcessed: games.length,
    positions: totalPositions,
    moves:     totalMoves,
    errors
  }
}
