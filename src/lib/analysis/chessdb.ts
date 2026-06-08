'use server'

// ============================================================================
// Analysis DB helpers
//
// Simple single-table ops use nextjs-shared generic functions:
//   table_fetch  — SELECT (cached)
//   table_write  — INSERT
//   table_update — UPDATE
//   table_upsert — INSERT … ON CONFLICT DO UPDATE SET col = EXCLUDED.col
//   table_count  — SELECT COUNT(*)
//   table_check  — existence check
//
// Complex queries (multi-join, LATERAL, json_agg, arithmetic upserts,
// COALESCE in SET) use table_query — raw SQL, no caching, with logging.
// ============================================================================

import { table_fetch }  from 'nextjs-shared/table_fetch'
import { table_write }  from 'nextjs-shared/table_write'
import { table_upsert } from 'nextjs-shared/table_upsert'
import { table_count }  from 'nextjs-shared/table_count'
import { table_check }  from 'nextjs-shared/table_check'
import { table_query }  from 'nextjs-shared/table_query'

export interface PositionRow {
  pos_id: number
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  pos_depth_avg: number | null
}

export interface MoveRow {
  mov_id: number
  mov_pos_fen: string
  mov_san: string
  mov_uci: string
  mov_times: number
  mov_wins: number
  mov_losses: number
  mov_draws: number
}

export interface EvaluationRow {
  eva_id: number
  eva_pos_fen: string
  eva_move_san: string | null
  eva_cp: number | null
  eva_mate: number | null
  eva_best_move: string | null
  eva_depth: number
}

export interface InsightRow {
  ins_id: number
  ins_pos_fen: string
  ins_theme: string | null
  ins_advice: string | null
  ins_priority: number | null
}

export interface EnrichmentRow {
  en_enid: number
  en_grid: number
  en_player: string
  en_termination: string | null
  en_time_loss_flag: string | null
  en_final_cp: number | null
  en_volatility: number | null
  en_lead_changes: number | null
  en_max_advantage: number | null
  en_max_disadvantage: number | null
  en_phase_lost: string | null
  en_critical_move: number | null
  en_critical_cp_drop: number | null
  en_critical_fen: string | null
  en_avg_cp_loss: number | null
  en_blunders: number | null
  en_mistakes: number | null
  en_accuracy: number | null
  en_enriched: boolean
}

export interface GamePositionRow {
  gam_id: number
  gam_game_ref: string
  gam_player: string
  gam_pos_fen: string
  gam_move_played: string
  gam_move_num: number | null
  gam_cp_loss: number | null
  gam_is_habit: boolean | null
  gam_is_improved: boolean | null
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  upsertPosition — insert or increment pos_reached + recalculate pos_depth_avg
//  Arithmetic on existing column values requires table_query.
//----------------------------------------------------------------------------------
export async function upsertPosition(
  fen: string,
  color: string,
  depthAvg: number
): Promise<void> {
  await table_query({
    caller: 'upsertPosition',
    query: `
      INSERT INTO tpos_positions (pos_fen, pos_color, pos_depth_avg, pos_reached)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (pos_fen) DO UPDATE SET
        pos_reached   = tpos_positions.pos_reached + 1,
        pos_depth_avg = ROUND(
          (tpos_positions.pos_depth_avg * tpos_positions.pos_reached + $3) /
          (tpos_positions.pos_reached + 1), 1
        )
    `,
    params: [fen, color, depthAvg]
  })
}

//----------------------------------------------------------------------------------
//  getPositionsToEvaluate — positions with no position-level evaluation yet
//  LEFT JOIN + NULL check on joined table requires table_query.
//----------------------------------------------------------------------------------
export async function getPositionsToEvaluate(
  limit:     number  = 100,
  dateFrom?: string,
  dateTo?:   string
): Promise<PositionRow[]> {
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const params: (string | number)[] = [fromTs, toTs]
    if (limit > 0) params.push(limit)
    return await table_query({
      caller: 'getPositionsToEvaluate',
      query: `
        SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color, p.pos_depth_avg
        FROM tpos_positions p
        LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
        WHERE e.eva_id IS NULL
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
            WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
          )
        ORDER BY p.pos_reached DESC
        ${limit > 0 ? `LIMIT $3` : ''}
      `,
      params
    }) as PositionRow[]
  }
  return await table_query({
    caller: 'getPositionsToEvaluate',
    query: `
      SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color, p.pos_depth_avg
      FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE e.eva_id IS NULL
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params: []
  }) as PositionRow[]
}

//----------------------------------------------------------------------------------
//  getPositionCount — total number of positions
//----------------------------------------------------------------------------------
export async function getPositionCount(): Promise<number> {
  return await table_count({ table: 'tpos_positions', caller: 'getPositionCount' })
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  upsertMove — insert or increment win/loss/draw counters
//  Arithmetic on existing column values requires table_query.
//----------------------------------------------------------------------------------
export async function upsertMove(
  posFen: string,
  san: string,
  uci: string,
  result: 'win' | 'loss' | 'draw'
): Promise<void> {
  const winInc  = result === 'win'  ? 1 : 0
  const lossInc = result === 'loss' ? 1 : 0
  const drawInc = result === 'draw' ? 1 : 0
  await table_query({
    caller: 'upsertMove',
    query: `
      INSERT INTO tmov_moves (mov_pos_fen, mov_san, mov_uci, mov_times, mov_wins, mov_losses, mov_draws)
      VALUES ($1, $2, $3, 1, $4, $5, $6)
      ON CONFLICT (mov_pos_fen, mov_san) DO UPDATE SET
        mov_times  = tmov_moves.mov_times  + 1,
        mov_wins   = tmov_moves.mov_wins   + $4,
        mov_losses = tmov_moves.mov_losses + $5,
        mov_draws  = tmov_moves.mov_draws  + $6
    `,
    params: [posFen, san, uci, winInc, lossInc, drawInc]
  })
}

//----------------------------------------------------------------------------------
//  getMovesForPosition — all moves played from a given position (cached)
//----------------------------------------------------------------------------------
export async function getMovesForPosition(posFen: string): Promise<MoveRow[]> {
  return await table_fetch({
    caller: 'getMovesForPosition',
    table: 'tmov_moves',
    whereColumnValuePairs: [{ column: 'mov_pos_fen', value: posFen }],
    orderBy: 'mov_times DESC'
  }) as MoveRow[]
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveEvaluation — upsert a Stockfish evaluation for a position or move
//  Passes current timestamp for eva_updated so EXCLUDED.eva_updated ≈ NOW().
//----------------------------------------------------------------------------------
export async function saveEvaluation(data: {
  posFen: string
  moveSan: string | null
  cp: number | null
  mate: number | null
  bestMove: string | null
  depth?: number
}): Promise<void> {
  await table_upsert({
    caller: 'saveEvaluation',
    table: 'teva_evaluations',
    columnValuePairs: [
      { column: 'eva_pos_fen',   value: data.posFen },
      { column: 'eva_move_san',  value: data.moveSan },
      { column: 'eva_cp',        value: data.cp },
      { column: 'eva_mate',      value: data.mate },
      { column: 'eva_best_move', value: data.bestMove },
      { column: 'eva_depth',     value: data.depth ?? 20 }
    ],
    conflictColumns: ['eva_pos_fen', 'eva_move_san']
  })
}

//----------------------------------------------------------------------------------
//  getEvaluationForPosition — position-level evaluation (eva_move_san IS NULL)
//----------------------------------------------------------------------------------
export async function getEvaluationForPosition(posFen: string): Promise<EvaluationRow | null> {
  const rows = await table_fetch({
    caller: 'getEvaluationForPosition',
    table: 'teva_evaluations',
    whereColumnValuePairs: [
      { column: 'eva_pos_fen',  value: posFen },
      { column: 'eva_move_san', value: 0, operator: 'IS NULL' }
    ]
  })
  return rows[0] as EvaluationRow ?? null
}

//----------------------------------------------------------------------------------
//  getEvaluationsForMoves — move-level evaluations (eva_move_san IS NOT NULL)
//----------------------------------------------------------------------------------
export async function getEvaluationsForMoves(posFen: string): Promise<EvaluationRow[]> {
  return await table_fetch({
    caller: 'getEvaluationsForMoves',
    table: 'teva_evaluations',
    whereColumnValuePairs: [
      { column: 'eva_pos_fen',  value: posFen },
      { column: 'eva_move_san', value: 0, operator: 'IS NOT NULL' }
    ]
  }) as EvaluationRow[]
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveInsight — upsert an AI-generated insight for a position
//----------------------------------------------------------------------------------
export async function saveInsight(data: {
  posFen: string
  theme: string
  advice: string
  priority: number
}): Promise<void> {
  await table_upsert({
    caller: 'saveInsight',
    table: 'tins_insights',
    columnValuePairs: [
      { column: 'ins_pos_fen',  value: data.posFen },
      { column: 'ins_theme',    value: data.theme },
      { column: 'ins_advice',   value: data.advice },
      { column: 'ins_priority', value: data.priority }
    ],
    conflictColumns: ['ins_pos_fen']
  })
}

//----------------------------------------------------------------------------------
//  getInsightForPosition — fetch the AI insight for a position (cached)
//----------------------------------------------------------------------------------
export async function getInsightForPosition(posFen: string): Promise<InsightRow | null> {
  const rows = await table_fetch({
    caller: 'getInsightForPosition',
    table: 'tins_insights',
    whereColumnValuePairs: [{ column: 'ins_pos_fen', value: posFen }]
  })
  return rows[0] as InsightRow ?? null
}

//----------------------------------------------------------------------------------
//  getPositionsNeedingInsights — positions with evaluations but no insight yet,
//  ordered by most recent game date. Optional date range filters to positions
//  that appear in games within the window.
//----------------------------------------------------------------------------------
export async function getPositionsNeedingInsights(
  limit:     number  = 20,
  dateFrom?: string,
  dateTo?:   string
): Promise<Array<{
  pos_fen: string
  pos_reached: number
  moves: Array<{ san: string; times: number; cp_loss: number | null }>
}>> {
  const params: (string | number)[] = []
  let dateFilter   = ''
  let latestTsSub  = `(SELECT MAX(r.gr_end_time) FROM tgam_game_positions gp
       JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
       WHERE gp.gam_pos_fen = p.pos_fen)`

  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    params.push(fromTs, toTs)
    dateFilter  = `AND EXISTS (
        SELECT 1 FROM tgam_game_positions gp
        JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
        WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
      )`
    latestTsSub = `(SELECT MAX(r.gr_end_time) FROM tgam_game_positions gp
       JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
       WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2)`
  }

  const limitIdx = params.length + 1
  if (limit > 0) params.push(limit)

  const rows = await table_query({
    caller: 'getPositionsNeedingInsights',
    query: `
      SELECT
        p.pos_fen,
        p.pos_reached,
        json_agg(
          json_build_object(
            'san', m.mov_san,
            'times', m.mov_times,
            'cp_loss', (
              SELECT eva_cp FROM teva_evaluations
              WHERE eva_pos_fen = p.pos_fen AND eva_move_san = m.mov_san
            )
          )
          ORDER BY m.mov_times DESC
        ) AS moves,
        ${latestTsSub} AS latest_ts
      FROM tpos_positions p
      JOIN tmov_moves m ON m.mov_pos_fen = p.pos_fen
      LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
      WHERE i.ins_id IS NULL
        AND EXISTS (
          SELECT 1 FROM teva_evaluations
          WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL
        )
        ${dateFilter}
      GROUP BY p.pos_fen, p.pos_reached
      ORDER BY latest_ts DESC NULLS LAST
      ${limit > 0 ? `LIMIT $${limitIdx}` : ''}
    `,
    params
  })
  return rows.map((r: any) => ({
    pos_fen:     r.pos_fen,
    pos_reached: Number(r.pos_reached),
    moves:       r.moves ?? []
  }))
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveEnrichmentPartial — insert/update phase and termination only
//  updateColumns restricts the ON CONFLICT update so en_enriched is never reset.
//----------------------------------------------------------------------------------
export async function saveEnrichmentPartial(data: {
  grid: number
  player: string
  termination: string | null
  phaseLost: string | null
}): Promise<void> {
  await table_upsert({
    caller: 'saveEnrichmentPartial',
    table: 'ten_enrichment',
    columnValuePairs: [
      { column: 'en_grid',        value: data.grid },
      { column: 'en_player',      value: data.player.toLowerCase() },
      { column: 'en_termination', value: data.termination },
      { column: 'en_phase_lost',  value: data.phaseLost },
      { column: 'en_enriched',    value: false }
    ],
    conflictColumns: ['en_grid', 'en_player'],
    updateColumns:   ['en_termination', 'en_phase_lost']
  })
}

//----------------------------------------------------------------------------------
//  saveStockfishEnrichment — write full Stockfish results for a game
//----------------------------------------------------------------------------------
export async function saveStockfishEnrichment(data: {
  grid: number
  player: string
  timeLossFlag: string | null
  finalCp: number | null
  volatility: number
  leadChanges: number
  maxAdvantage: number
  maxDisadvantage: number
  phaseLost: string | null
  criticalMove: number | null
  criticalCpDrop: number | null
  criticalFen: string | null
  avgCpLoss: number
  blunders: number
  mistakes: number
  accuracy: number
}): Promise<void> {
  await table_upsert({
    caller: 'saveStockfishEnrichment',
    table: 'ten_enrichment',
    columnValuePairs: [
      { column: 'en_grid',              value: data.grid },
      { column: 'en_player',            value: data.player.toLowerCase() },
      { column: 'en_time_loss_flag',    value: data.timeLossFlag },
      { column: 'en_final_cp',          value: data.finalCp },
      { column: 'en_volatility',        value: data.volatility },
      { column: 'en_lead_changes',      value: data.leadChanges },
      { column: 'en_max_advantage',     value: data.maxAdvantage },
      { column: 'en_max_disadvantage',  value: data.maxDisadvantage },
      { column: 'en_phase_lost',        value: data.phaseLost },
      { column: 'en_critical_move',     value: data.criticalMove },
      { column: 'en_critical_cp_drop',  value: data.criticalCpDrop },
      { column: 'en_critical_fen',      value: data.criticalFen },
      { column: 'en_avg_cp_loss',       value: data.avgCpLoss },
      { column: 'en_blunders',          value: data.blunders },
      { column: 'en_mistakes',          value: data.mistakes },
      { column: 'en_accuracy',          value: data.accuracy },
      { column: 'en_enriched',          value: true }
    ],
    conflictColumns: ['en_grid', 'en_player']
  })
}

//----------------------------------------------------------------------------------
//  getUnenrichedGames — games without a completed enrichment row
//  Multi-table JOIN requires table_query.
//----------------------------------------------------------------------------------
//  getUnenrichedGames — all unenriched games across all players, global limit
//----------------------------------------------------------------------------------
export async function getUnenrichedGames(limit: number = 100, filters?: EnrichFilters): Promise<UnenrichedGame[]> {
  const params: (string | number | null | boolean)[] = []
  const conditions: string[] = ['(r.gr_raw_data->>\'pgn\') IS NOT NULL', '(e.en_enid IS NULL OR e.en_enriched = FALSE)']

  const df = filters?.dateFrom
  const dt = filters?.dateTo
  if (df) { params.push(Math.floor(new Date(df).getTime() / 1000));               conditions.push(`r.gr_end_time >= $${params.length}`) }
  if (dt) { params.push(Math.floor(new Date(dt + 'T23:59:59').getTime() / 1000)); conditions.push(`r.gr_end_time <= $${params.length}`) }

  const whereClause = conditions.join(' AND ')
  const rows = await table_query({
    caller: 'getUnenrichedGames',
    query: `
      SELECT
        r.gr_grid AS grid,
        r.gr_player_username AS player,
        (r.gr_raw_data->>'pgn') AS pgn,
        r.gr_chesscom_uuid AS chesscom_uuid,
        TO_CHAR(TO_TIMESTAMP(r.gr_end_time), 'YYYY-MM-DD') AS end_date,
        COALESCE(d.gd_player_result,
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
          END
        ) AS result,
        COALESCE(d.gd_termination, '') AS termination,
        COALESCE(d.gd_opponent_username,
          CASE
            WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username
                 THEN LOWER(r.gr_raw_data->'black'->>'username')
            ELSE LOWER(r.gr_raw_data->'white'->>'username')
          END
        ) AS opponent,
        COALESCE(d.gd_player_color,
          CASE
            WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username THEN 'white'
            ELSE 'black'
          END
        ) AS color,
        COALESCE(d.gd_opening_name, '') AS opening_name,
        COALESCE(d.gd_eco_code, '') AS eco_code
      FROM tgr_gamesraw r
      LEFT JOIN tgd_gamesdecon d ON d.gd_grid = r.gr_grid
      LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
      WHERE ${whereClause}
      ORDER BY r.gr_end_time DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params
  })
  return rows.map((r: any) => ({
    grid:          r.grid,
    player:        r.player,
    pgn:           r.pgn ?? '',
    result:        r.result,
    termination:   r.termination,
    chesscom_uuid: r.chesscom_uuid,
    opponent:      r.opponent ?? '',
    color:         r.color ?? '',
    end_date:      r.end_date ?? '',
    opening_name:  r.opening_name ?? '',
    eco_code:      r.eco_code ?? ''
  }))
}

export interface UnenrichedGame {
  grid: number
  player: string
  pgn: string
  result: string
  termination: string | null
  chesscom_uuid: string
  opponent: string
  color: string          // 'white' | 'black' — which side the player played
  end_date: string       // YYYY-MM-DD
  opening_name: string
  eco_code: string
}

export interface EnrichFilters {
  dateFrom?: string      // YYYY-MM-DD
  dateTo?: string        // YYYY-MM-DD
  color?: 'white' | 'black'
  opening?: string       // partial match on opening name
  eco?: string           // partial match on eco code
  limit?: number
}

//----------------------------------------------------------------------------------
//  getUnenrichedGamesForPlayer — filtered list for the Enrich page
//  Dynamic WHERE, COALESCE across tables, subquery — requires table_query.
//----------------------------------------------------------------------------------
export async function getUnenrichedGamesForPlayer(
  player: string,
  limit: number = 0,
  dateFrom?: string,
  dateTo?: string,
  filters?: EnrichFilters
): Promise<UnenrichedGame[]> {
  const effectiveLimit = filters?.limit ?? limit
  const params: (string | number | null | boolean)[] = [player.toLowerCase()]
  const conditions: string[] = []

  const df = filters?.dateFrom ?? dateFrom
  const dt = filters?.dateTo   ?? dateTo
  if (df) { params.push(Math.floor(new Date(df).getTime() / 1000));               conditions.push(`r.gr_end_time >= $${params.length}`) }
  if (dt) { params.push(Math.floor(new Date(dt + 'T23:59:59').getTime() / 1000)); conditions.push(`r.gr_end_time <= $${params.length}`) }

  const colorFilter   = filters?.color
  const openingFilter = filters?.opening
  const ecoFilter     = filters?.eco
  const extraWhere    = conditions.length ? `AND ${conditions.join(' AND ')}` : ''

  const rows = await table_query({
    caller: 'getUnenrichedGamesForPlayer',
    query: `
      SELECT *
      FROM (
        SELECT
          r.gr_grid AS grid,
          r.gr_player_username AS player,
          (r.gr_raw_data->>'pgn') AS pgn,
          r.gr_chesscom_uuid AS chesscom_uuid,
          TO_CHAR(TO_TIMESTAMP(r.gr_end_time), 'YYYY-MM-DD') AS end_date,
          COALESCE(d.gd_player_result,
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
            END
          ) AS result,
          COALESCE(d.gd_termination, '') AS termination,
          COALESCE(d.gd_opponent_username,
            CASE
              WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username
                   THEN LOWER(r.gr_raw_data->'black'->>'username')
              ELSE LOWER(r.gr_raw_data->'white'->>'username')
            END
          ) AS opponent,
          COALESCE(d.gd_player_color,
            CASE
              WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username THEN 'white'
              ELSE 'black'
            END
          ) AS color,
          COALESCE(d.gd_opening_name, '') AS opening_name,
          COALESCE(d.gd_eco_code, '') AS eco_code
        FROM tgr_gamesraw r
        LEFT JOIN tgd_gamesdecon d ON d.gd_grid = r.gr_grid
        LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
        WHERE r.gr_player_username = $1
          AND (r.gr_raw_data->>'pgn') IS NOT NULL
          AND (e.en_enid IS NULL OR e.en_enriched = FALSE)
          ${extraWhere}
      ) q
      WHERE 1=1
        ${colorFilter   ? `AND q.color ILIKE '${colorFilter}'` : ''}
        ${openingFilter ? `AND q.opening_name ILIKE '%${openingFilter.replace(/'/g, "''")}%'` : ''}
        ${ecoFilter     ? `AND q.eco_code ILIKE '%${ecoFilter.replace(/'/g, "''")}%'` : ''}
      ORDER BY q.end_date DESC
      ${effectiveLimit > 0 ? `LIMIT ${effectiveLimit}` : ''}
    `,
    params
  })
  return rows.map((r: any) => ({
    grid:          r.grid,
    player:        r.player,
    pgn:           r.pgn ?? '',
    result:        r.result,
    termination:   r.termination,
    chesscom_uuid: r.chesscom_uuid,
    opponent:      r.opponent ?? '',
    color:         r.color ?? '',
    end_date:      r.end_date ?? '',
    opening_name:  r.opening_name ?? '',
    eco_code:      r.eco_code ?? ''
  }))
}

// ---------------------------------------------------------------------------
// Game Positions
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveGamePosition — record a position occurrence in a game
//----------------------------------------------------------------------------------
export async function saveGamePosition(data: {
  gameRef: string
  player: string
  posFen: string
  movePlayed: string
  moveNum: number
  cpLoss?: number
}): Promise<void> {
  await table_write({
    caller: 'saveGamePosition',
    table: 'tgam_game_positions',
    columnValuePairs: [
      { column: 'gam_game_ref',    value: data.gameRef },
      { column: 'gam_player',      value: data.player.toLowerCase() },
      { column: 'gam_pos_fen',     value: data.posFen },
      { column: 'gam_move_played', value: data.movePlayed },
      { column: 'gam_move_num',    value: data.moveNum },
      { column: 'gam_cp_loss',     value: data.cpLoss ?? null }
    ]
  })
}

//----------------------------------------------------------------------------------
//  gamePositionExists — check whether a game position has already been recorded
//----------------------------------------------------------------------------------
export async function gamePositionExists(gameRef: string, posFen: string): Promise<boolean> {
  const { found } = await table_check([{
    table: 'tgam_game_positions',
    whereColumnValuePairs: [
      { column: 'gam_game_ref', value: gameRef },
      { column: 'gam_pos_fen',  value: posFen }
    ]
  }], 'gamePositionExists')
  return found
}

//----------------------------------------------------------------------------------
//  updateGamePositionFlags — mark a position as habit or improvement
//  COALESCE in SET clause requires table_query.
//----------------------------------------------------------------------------------
export async function updateGamePositionFlags(data: {
  gameRef: string
  posFen: string
  isHabit: boolean
  isImproved: boolean
  cpLoss?: number
}): Promise<void> {
  await table_query({
    caller: 'updateGamePositionFlags',
    query: `
      UPDATE tgam_game_positions
      SET gam_is_habit    = $3,
          gam_is_improved = $4,
          gam_cp_loss     = COALESCE($5, gam_cp_loss)
      WHERE gam_game_ref = $1 AND gam_pos_fen = $2
    `,
    params: [data.gameRef, data.posFen, data.isHabit, data.isImproved, data.cpLoss ?? null]
  })
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveBriefing — write a new briefing header row, returns the new bre_id
//----------------------------------------------------------------------------------
export async function saveBriefing(data: {
  player: string
  type: 'D' | 'W'
  dateFrom: string
  dateTo: string
  gamesCt: number
  mistakes: number
  improved: number
  narrative: string
}): Promise<number> {
  const rows = await table_write({
    caller: 'saveBriefing',
    table: 'tbre_briefings',
    columnValuePairs: [
      { column: 'bre_player',    value: data.player.toLowerCase() },
      { column: 'bre_type',      value: data.type },
      { column: 'bre_date_from', value: data.dateFrom },
      { column: 'bre_date_to',   value: data.dateTo },
      { column: 'bre_games_ct',  value: data.gamesCt },
      { column: 'bre_mistakes',  value: data.mistakes },
      { column: 'bre_improved',  value: data.improved },
      { column: 'bre_narrative', value: data.narrative }
    ]
  })
  return rows[0].bre_id as number
}

//----------------------------------------------------------------------------------
//  saveBriefingDetail — write position detail rows for a briefing
//----------------------------------------------------------------------------------
export async function saveBriefingDetail(briefingId: number, rows: Array<{
  posFen: string
  movePlayed: string
  moveNum: number | null
  cpLoss: number | null
  isHabit: boolean | null
  isImproved: boolean | null
  gameRef: string
  player: string
}>): Promise<void> {
  if (rows.length === 0) return
  for (const row of rows) {
    await table_write({
      caller: 'saveBriefingDetail',
      table: 'tbrd_briefing_detail',
      columnValuePairs: [
        { column: 'brd_bre_id',      value: briefingId },
        { column: 'brd_pos_fen',     value: row.posFen },
        { column: 'brd_move_played', value: row.movePlayed },
        { column: 'brd_move_num',    value: row.moveNum },
        { column: 'brd_cp_loss',     value: row.cpLoss },
        { column: 'brd_is_habit',    value: row.isHabit },
        { column: 'brd_is_improved', value: row.isImproved },
        { column: 'brd_game_ref',    value: row.gameRef },
        { column: 'brd_player',      value: row.player.toLowerCase() }
      ]
    })
  }
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  saveQuizResult — record one quiz attempt
//----------------------------------------------------------------------------------
export async function saveQuizResult(data: {
  session: string
  posFen: string
  movePlayed: string
  correct: boolean
  cpLoss: number | null
}): Promise<void> {
  await table_write({
    caller: 'saveQuizResult',
    table: 'tqui_quiz',
    columnValuePairs: [
      { column: 'qui_session',     value: data.session },
      { column: 'qui_pos_fen',     value: data.posFen },
      { column: 'qui_move_played', value: data.movePlayed },
      { column: 'qui_correct',     value: data.correct },
      { column: 'qui_cp_loss',     value: data.cpLoss }
    ]
  })
}

// ---------------------------------------------------------------------------
// Habits page query
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getHabitsData — positions with insights, worst move, and average CP loss
//  LATERAL join requires table_query.
//----------------------------------------------------------------------------------
export async function getHabitsData(opts: {
  color?: 'w' | 'b'
  sortBy?: 'priority' | 'reached' | 'cpLoss'
  search?: string
  limit?: number
}): Promise<Array<{
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  ins_theme: string | null
  ins_advice: string | null
  ins_priority: number | null
  worst_move: string | null
  worst_move_times: number | null
  worst_move_pct: number | null
  avg_cp_loss: number | null
}>> {
  const params: (string | number | null | boolean)[] = []
  const conditions: string[] = ['i.ins_id IS NOT NULL']

  if (opts.color) {
    params.push(opts.color)
    conditions.push(`p.pos_color = $${params.length}`)
  }
  if (opts.search) {
    params.push(`%${opts.search}%`)
    conditions.push(`i.ins_theme ILIKE $${params.length}`)
  }

  const orderMap: Record<string, string> = {
    priority: 'i.ins_priority DESC NULLS LAST',
    reached:  'p.pos_reached DESC',
    cpLoss:   'avg_cp_loss DESC NULLS LAST'
  }
  const orderClause = orderMap[opts.sortBy ?? 'priority']
  const limitClause = (opts.limit ?? 0) > 0 ? `LIMIT ${opts.limit}` : ''

  const rows = await table_query({
    caller: 'getHabitsData',
    query: `
      SELECT
        p.pos_fen,
        p.pos_reached,
        p.pos_color,
        i.ins_theme,
        i.ins_advice,
        i.ins_priority,
        worst.mov_san    AS worst_move,
        worst.mov_times  AS worst_move_times,
        ROUND(worst.mov_times::numeric / NULLIF(p.pos_reached, 0) * 100) AS worst_move_pct,
        e.eva_cp         AS avg_cp_loss
      FROM tpos_positions p
      LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
      LEFT JOIN LATERAL (
        SELECT m.mov_san, m.mov_times
        FROM tmov_moves m
        WHERE m.mov_pos_fen = p.pos_fen
        ORDER BY m.mov_times DESC
        LIMIT 1
      ) worst ON TRUE
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderClause}
      ${limitClause}
    `,
    params
  })
  return rows.map((r: any) => ({
    pos_fen:           r.pos_fen,
    pos_reached:       Number(r.pos_reached),
    pos_color:         r.pos_color,
    ins_theme:         r.ins_theme,
    ins_advice:        r.ins_advice,
    ins_priority:      r.ins_priority    != null ? Number(r.ins_priority)    : null,
    worst_move:        r.worst_move,
    worst_move_times:  r.worst_move_times != null ? Number(r.worst_move_times) : null,
    worst_move_pct:    r.worst_move_pct   != null ? Number(r.worst_move_pct)   : null,
    avg_cp_loss:       r.avg_cp_loss      != null ? Number(r.avg_cp_loss)      : null
  }))
}

// ---------------------------------------------------------------------------
// Position detail page query
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getPositionDetail — all data for the position detail page (6 parallel fetches)
//----------------------------------------------------------------------------------
export async function getPositionDetail(posFen: string): Promise<{
  position: PositionRow | null
  moves: MoveRow[]
  posEval: EvaluationRow | null
  moveEvals: EvaluationRow[]
  insight: InsightRow | null
  games: Array<{
    game_ref: string
    player: string
    move_played: string
    move_num: number | null
    cp_loss: number | null
  }>
}> {
  const [posRows, movRows, posEvalRows, moveEvalRows, insRows, gamesRows] = await Promise.all([
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tpos_positions',
      whereColumnValuePairs: [{ column: 'pos_fen', value: posFen }]
    }),
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tmov_moves',
      whereColumnValuePairs: [{ column: 'mov_pos_fen', value: posFen }],
      orderBy: 'mov_times DESC'
    }),
    table_fetch({
      caller: 'getPositionDetail',
      table: 'teva_evaluations',
      whereColumnValuePairs: [
        { column: 'eva_pos_fen',  value: posFen },
        { column: 'eva_move_san', value: 0, operator: 'IS NULL' }
      ]
    }),
    table_fetch({
      caller: 'getPositionDetail',
      table: 'teva_evaluations',
      whereColumnValuePairs: [
        { column: 'eva_pos_fen',  value: posFen },
        { column: 'eva_move_san', value: 0, operator: 'IS NOT NULL' }
      ]
    }),
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tins_insights',
      whereColumnValuePairs: [{ column: 'ins_pos_fen', value: posFen }]
    }),
    table_fetch({
      caller: 'getPositionDetail',
      table: 'tgam_game_positions',
      whereColumnValuePairs: [{ column: 'gam_pos_fen', value: posFen }],
      orderBy: 'gam_id DESC',
      limit: 50
    })
  ])

  return {
    position:  posRows[0]     as PositionRow  ?? null,
    moves:     movRows        as MoveRow[],
    posEval:   posEvalRows[0] as EvaluationRow ?? null,
    moveEvals: moveEvalRows   as EvaluationRow[],
    insight:   insRows[0]     as InsightRow   ?? null,
    games: gamesRows.map((r: any) => ({
      game_ref:    r.gam_game_ref,
      player:      r.gam_player,
      move_played: r.gam_move_played,
      move_num:    r.gam_move_num  != null ? Number(r.gam_move_num)  : null,
      cp_loss:     r.gam_cp_loss   != null ? Number(r.gam_cp_loss)   : null
    }))
  }
}

// ---------------------------------------------------------------------------
// Quiz queue
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getQuizQueue — top positions by priority with best and habit move
//  LATERAL join requires table_query.
//----------------------------------------------------------------------------------
export async function getQuizQueue(limit: number = 20): Promise<Array<{
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  ins_theme: string | null
  ins_advice: string | null
  ins_priority: number | null
  best_move: string | null
  habit_move: string | null
  habit_times: number | null
}>> {
  const rows = await table_query({
    caller: 'getQuizQueue',
    query: `
      SELECT
        p.pos_fen,
        p.pos_reached,
        p.pos_color,
        i.ins_theme,
        i.ins_advice,
        i.ins_priority,
        e.eva_best_move AS best_move,
        habit.mov_san   AS habit_move,
        habit.mov_times AS habit_times
      FROM tpos_positions p
      JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      LEFT JOIN LATERAL (
        SELECT mov_san, mov_times FROM tmov_moves
        WHERE mov_pos_fen = p.pos_fen
        ORDER BY mov_times DESC LIMIT 1
      ) habit ON TRUE
      ORDER BY i.ins_priority DESC NULLS LAST
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params: []
  })
  return rows.map((r: any) => ({
    pos_fen:      r.pos_fen,
    pos_reached:  Number(r.pos_reached),
    pos_color:    r.pos_color,
    ins_theme:    r.ins_theme,
    ins_advice:   r.ins_advice,
    ins_priority: r.ins_priority != null ? Number(r.ins_priority) : null,
    best_move:    r.best_move,
    habit_move:   r.habit_move,
    habit_times:  r.habit_times != null ? Number(r.habit_times) : null
  }))
}

// ---------------------------------------------------------------------------
// Briefing aggregation
// ---------------------------------------------------------------------------

//----------------------------------------------------------------------------------
//  getBriefingData — game positions and enrichment rows for a date range
//  Multi-table JOINs with timestamp range require table_query.
//----------------------------------------------------------------------------------
export async function getBriefingData(opts: {
  player: string
  dateFrom: string
  dateTo: string
}): Promise<{
  gamePositions: GamePositionRow[]
  habitCount: number
  improvedCount: number
  phaseStats: Array<{ phase: string; count: number }>
  enrichmentRows: EnrichmentRow[]
}> {
  const fromTs = Math.floor(new Date(opts.dateFrom).getTime() / 1000)
  const toTs   = Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)

  const [gpRows, enrichRows] = await Promise.all([
    table_query({
      caller: 'getBriefingData_gp',
      query: `
        SELECT gp.*
        FROM tgam_game_positions gp
        JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref
        WHERE gp.gam_player = $1
          AND r.gr_end_time BETWEEN $2 AND $3
        ORDER BY gp.gam_id DESC
      `,
      params: [opts.player.toLowerCase(), fromTs, toTs]
    }),
    table_query({
      caller: 'getBriefingData_enrich',
      query: `
        SELECT e.*
        FROM ten_enrichment e
        JOIN tgr_gamesraw r ON r.gr_grid = e.en_grid
        WHERE e.en_player = $1
          AND r.gr_end_time BETWEEN $2 AND $3
          AND e.en_enriched = TRUE
      `,
      params: [opts.player.toLowerCase(), fromTs, toTs]
    })
  ])

  const gamePositions  = gpRows    as GamePositionRow[]
  const enrichmentRows = enrichRows as EnrichmentRow[]
  const habitCount    = gamePositions.filter(g => g.gam_is_habit).length
  const improvedCount = gamePositions.filter(g => g.gam_is_improved).length

  const phaseMap: Record<string, number> = {}
  for (const e of enrichmentRows) {
    if (e.en_phase_lost) {
      phaseMap[e.en_phase_lost] = (phaseMap[e.en_phase_lost] ?? 0) + 1
    }
  }
  const phaseStats = Object.entries(phaseMap).map(([phase, count]) => ({ phase, count }))

  return { gamePositions, habitCount, improvedCount, phaseStats, enrichmentRows }
}
