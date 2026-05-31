'use server'

// ============================================================================
// Analysis DB helpers — typed wrappers over nextjs-shared db.query
// All new analysis tables only; no existing tables touched
// ============================================================================

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

export async function upsertPosition(
  fen: string,
  color: string,
  depthAvg: number
): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'upsertPosition',
    query: `
      INSERT INTO tpos_positions (pos_fen, pos_color, pos_depth_avg, pos_reached)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (pos_fen) DO UPDATE SET
        pos_reached   = tpos_positions.pos_reached + 1,
        pos_depth_avg = ROUND(
          (tpos_positions.pos_depth_avg * tpos_positions.pos_reached + $3) /
          (tpos_positions.pos_reached + 1), 1
        ),
        pos_updated   = NOW()
    `,
    params: [fen, color, depthAvg],
    functionName: 'upsertPosition'
  })
}

export async function getPositionsToEvaluate(limit: number = 100): Promise<PositionRow[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getPositionsToEvaluate',
    query: `
      SELECT p.pos_id, p.pos_fen, p.pos_reached, p.pos_color, p.pos_depth_avg
      FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE e.eva_id IS NULL
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params: [],
    functionName: 'getPositionsToEvaluate'
  })
  return result.rows as PositionRow[]
}

export async function getPositionCount(): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getPositionCount',
    query: `SELECT COUNT(*) AS cnt FROM tpos_positions`,
    params: [],
    functionName: 'getPositionCount'
  })
  return Number(result.rows[0]?.cnt ?? 0)
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export async function upsertMove(
  posFen: string,
  san: string,
  uci: string,
  result: 'win' | 'loss' | 'draw'
): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const winInc   = result === 'win'  ? 1 : 0
  const lossInc  = result === 'loss' ? 1 : 0
  const drawInc  = result === 'draw' ? 1 : 0
  await db.query({
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
    params: [posFen, san, uci, winInc, lossInc, drawInc],
    functionName: 'upsertMove'
  })
}

export async function getMovesForPosition(posFen: string): Promise<MoveRow[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getMovesForPosition',
    query: `
      SELECT mov_id, mov_pos_fen, mov_san, mov_uci, mov_times, mov_wins, mov_losses, mov_draws
      FROM tmov_moves
      WHERE mov_pos_fen = $1
      ORDER BY mov_times DESC
    `,
    params: [posFen],
    functionName: 'getMovesForPosition'
  })
  return result.rows as MoveRow[]
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------

export async function saveEvaluation(data: {
  posFen: string
  moveSan: string | null
  cp: number | null
  mate: number | null
  bestMove: string | null
  depth?: number
}): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'saveEvaluation',
    query: `
      INSERT INTO teva_evaluations (eva_pos_fen, eva_move_san, eva_cp, eva_mate, eva_best_move, eva_depth, eva_updated)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (eva_pos_fen, eva_move_san) DO UPDATE SET
        eva_cp        = $3,
        eva_mate      = $4,
        eva_best_move = $5,
        eva_depth     = $6,
        eva_updated   = NOW()
    `,
    params: [data.posFen, data.moveSan, data.cp, data.mate, data.bestMove, data.depth ?? 20],
    functionName: 'saveEvaluation'
  })
}

export async function getEvaluationForPosition(posFen: string): Promise<EvaluationRow | null> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getEvaluationForPosition',
    query: `
      SELECT eva_id, eva_pos_fen, eva_move_san, eva_cp, eva_mate, eva_best_move, eva_depth
      FROM teva_evaluations
      WHERE eva_pos_fen = $1 AND eva_move_san IS NULL
    `,
    params: [posFen],
    functionName: 'getEvaluationForPosition'
  })
  return result.rows[0] as EvaluationRow ?? null
}

export async function getEvaluationsForMoves(posFen: string): Promise<EvaluationRow[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getEvaluationsForMoves',
    query: `
      SELECT eva_id, eva_pos_fen, eva_move_san, eva_cp, eva_mate, eva_best_move, eva_depth
      FROM teva_evaluations
      WHERE eva_pos_fen = $1 AND eva_move_san IS NOT NULL
    `,
    params: [posFen],
    functionName: 'getEvaluationsForMoves'
  })
  return result.rows as EvaluationRow[]
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export async function saveInsight(data: {
  posFen: string
  theme: string
  advice: string
  priority: number
}): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'saveInsight',
    query: `
      INSERT INTO tins_insights (ins_pos_fen, ins_theme, ins_advice, ins_priority, ins_updated)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (ins_pos_fen) DO UPDATE SET
        ins_theme    = $2,
        ins_advice   = $3,
        ins_priority = $4,
        ins_updated  = NOW()
    `,
    params: [data.posFen, data.theme, data.advice, data.priority],
    functionName: 'saveInsight'
  })
}

export async function getInsightForPosition(posFen: string): Promise<InsightRow | null> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getInsightForPosition',
    query: `SELECT * FROM tins_insights WHERE ins_pos_fen = $1`,
    params: [posFen],
    functionName: 'getInsightForPosition'
  })
  return result.rows[0] as InsightRow ?? null
}

export async function getPositionsNeedingInsights(limit: number = 20): Promise<Array<{
  pos_fen: string
  pos_reached: number
  moves: Array<{ san: string; times: number; cp_loss: number | null }>
}>> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
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
        ) AS moves
      FROM tpos_positions p
      JOIN tmov_moves m ON m.mov_pos_fen = p.pos_fen
      LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
      WHERE i.ins_id IS NULL
        AND EXISTS (
          SELECT 1 FROM teva_evaluations
          WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL
        )
      GROUP BY p.pos_fen, p.pos_reached
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params: [],
    functionName: 'getPositionsNeedingInsights'
  })
  return result.rows.map((r: any) => ({
    pos_fen: r.pos_fen,
    pos_reached: Number(r.pos_reached),
    moves: r.moves ?? []
  }))
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

export async function saveEnrichmentPartial(data: {
  grid: number
  player: string
  termination: string | null
  phaseLost: string | null
}): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'saveEnrichmentPartial',
    query: `
      INSERT INTO ten_enrichment (en_grid, en_player, en_termination, en_phase_lost, en_enriched)
      VALUES ($1, $2, $3, $4, FALSE)
      ON CONFLICT (en_grid, en_player) DO UPDATE SET
        en_termination = $3,
        en_phase_lost  = $4
    `,
    params: [data.grid, data.player.toLowerCase(), data.termination, data.phaseLost],
    functionName: 'saveEnrichmentPartial'
  })
}

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'saveStockfishEnrichment',
    query: `
      INSERT INTO ten_enrichment (
        en_grid, en_player,
        en_time_loss_flag, en_final_cp, en_volatility, en_lead_changes,
        en_max_advantage, en_max_disadvantage, en_phase_lost,
        en_critical_move, en_critical_cp_drop, en_critical_fen,
        en_avg_cp_loss, en_blunders, en_mistakes, en_accuracy,
        en_enriched
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE)
      ON CONFLICT (en_grid, en_player) DO UPDATE SET
        en_time_loss_flag  = $3,
        en_final_cp        = $4,
        en_volatility      = $5,
        en_lead_changes    = $6,
        en_max_advantage   = $7,
        en_max_disadvantage = $8,
        en_phase_lost      = $9,
        en_critical_move   = $10,
        en_critical_cp_drop = $11,
        en_critical_fen    = $12,
        en_avg_cp_loss     = $13,
        en_blunders        = $14,
        en_mistakes        = $15,
        en_accuracy        = $16,
        en_enriched        = TRUE
    `,
    params: [
      data.grid, data.player.toLowerCase(),
      data.timeLossFlag, data.finalCp, data.volatility, data.leadChanges,
      data.maxAdvantage, data.maxDisadvantage, data.phaseLost,
      data.criticalMove, data.criticalCpDrop, data.criticalFen,
      data.avgCpLoss, data.blunders, data.mistakes, data.accuracy
    ],
    functionName: 'saveStockfishEnrichment'
  })
}

export async function getUnenrichedGames(limit: number = 100): Promise<Array<{
  grid: number
  player: string
  pgn: string
  result: string
  termination: string | null
  chesscom_uuid: string
}>> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'getUnenrichedGames',
    query: `
      SELECT
        r.gr_grid AS grid,
        d.gd_player_username AS player,
        (r.gr_raw_data->>'pgn') AS pgn,
        d.gd_player_result AS result,
        d.gd_termination AS termination,
        r.gr_chesscom_uuid AS chesscom_uuid
      FROM tgr_gamesraw r
      JOIN tgd_gamesdecon d ON d.gd_grid = r.gr_grid
      LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = d.gd_player_username
      WHERE e.en_enid IS NULL
         OR e.en_enriched = FALSE
      ORDER BY r.gr_end_time DESC
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `,
    params: [],
    functionName: 'getUnenrichedGames'
  })
  return result.rows.map((r: any) => ({
    grid: r.grid,
    player: r.player,
    pgn: r.pgn ?? '',
    result: r.result,
    termination: r.termination,
    chesscom_uuid: r.chesscom_uuid
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

export async function getUnenrichedGamesForPlayer(
  player: string,
  limit: number = 0,
  dateFrom?: string,
  dateTo?: string,
  filters?: EnrichFilters
): Promise<UnenrichedGame[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const effectiveLimit = filters?.limit ?? limit
  const params: any[] = [player.toLowerCase()]
  const conditions: string[] = []

  const df = filters?.dateFrom ?? dateFrom
  const dt = filters?.dateTo   ?? dateTo
  if (df) { params.push(Math.floor(new Date(df).getTime() / 1000));              conditions.push(`r.gr_end_time >= $${params.length}`) }
  if (dt) { params.push(Math.floor(new Date(dt + 'T23:59:59').getTime() / 1000)); conditions.push(`r.gr_end_time <= $${params.length}`) }

  const colorFilter  = filters?.color
  const openingFilter = filters?.opening
  const ecoFilter    = filters?.eco

  // color and opening filters applied as HAVING-style after COALESCE — use subquery trick
  const extraWhere = conditions.length ? `AND ${conditions.join(' AND ')}` : ''

  const result = await db.query({
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
    params,
    functionName: 'getUnenrichedGamesForPlayer'
  })
  return result.rows.map((r: any) => ({
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

export async function saveGamePosition(data: {
  gameRef: string
  player: string
  posFen: string
  movePlayed: string
  moveNum: number
  cpLoss?: number
}): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'saveGamePosition',
    query: `
      INSERT INTO tgam_game_positions
        (gam_game_ref, gam_player, gam_pos_fen, gam_move_played, gam_move_num, gam_cp_loss)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    params: [data.gameRef, data.player.toLowerCase(), data.posFen, data.movePlayed, data.moveNum, data.cpLoss ?? null],
    functionName: 'saveGamePosition'
  })
}

export async function gamePositionExists(gameRef: string, posFen: string): Promise<boolean> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'gamePositionExists',
    query: `SELECT gam_id FROM tgam_game_positions WHERE gam_game_ref = $1 AND gam_pos_fen = $2 LIMIT 1`,
    params: [gameRef, posFen],
    functionName: 'gamePositionExists'
  })
  return result.rows.length > 0
}

export async function updateGamePositionFlags(data: {
  gameRef: string
  posFen: string
  isHabit: boolean
  isImproved: boolean
  cpLoss?: number
}): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'updateGamePositionFlags',
    query: `
      UPDATE tgam_game_positions
      SET gam_is_habit    = $3,
          gam_is_improved = $4,
          gam_cp_loss     = COALESCE($5, gam_cp_loss)
      WHERE gam_game_ref = $1 AND gam_pos_fen = $2
    `,
    params: [data.gameRef, data.posFen, data.isHabit, data.isImproved, data.cpLoss ?? null],
    functionName: 'updateGamePositionFlags'
  })
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'saveBriefing',
    query: `
      INSERT INTO tbre_briefings
        (bre_player, bre_type, bre_date_from, bre_date_to, bre_games_ct, bre_mistakes, bre_improved, bre_narrative)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING bre_id
    `,
    params: [data.player.toLowerCase(), data.type, data.dateFrom, data.dateTo, data.gamesCt, data.mistakes, data.improved, data.narrative],
    functionName: 'saveBriefing'
  })
  return result.rows[0].bre_id as number
}

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  for (const row of rows) {
    await db.query({
      caller: 'saveBriefingDetail',
      query: `
        INSERT INTO tbrd_briefing_detail
          (brd_bre_id, brd_pos_fen, brd_move_played, brd_move_num, brd_cp_loss, brd_is_habit, brd_is_improved, brd_game_ref, brd_player)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      params: [briefingId, row.posFen, row.movePlayed, row.moveNum, row.cpLoss, row.isHabit, row.isImproved, row.gameRef, row.player.toLowerCase()],
      functionName: 'saveBriefingDetail'
    })
  }
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export async function saveQuizResult(data: {
  session: string
  posFen: string
  movePlayed: string
  correct: boolean
  cpLoss: number | null
}): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller: 'saveQuizResult',
    query: `
      INSERT INTO tqui_quiz (qui_session, qui_pos_fen, qui_move_played, qui_correct, qui_cp_loss)
      VALUES ($1, $2, $3, $4, $5)
    `,
    params: [data.session, data.posFen, data.movePlayed, data.correct, data.cpLoss],
    functionName: 'saveQuizResult'
  })
}

// ---------------------------------------------------------------------------
// Habits page query
// ---------------------------------------------------------------------------

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const params: any[] = []
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

  const result = await db.query({
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
        LEFT JOIN teva_evaluations ev ON ev.eva_pos_fen = m.mov_pos_fen AND ev.eva_move_san = m.mov_san
        WHERE m.mov_pos_fen = p.pos_fen
        ORDER BY m.mov_times DESC
        LIMIT 1
      ) worst ON TRUE
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderClause}
      ${limitClause}
    `,
    params,
    functionName: 'getHabitsData'
  })
  return result.rows.map((r: any) => ({
    pos_fen: r.pos_fen,
    pos_reached: Number(r.pos_reached),
    pos_color: r.pos_color,
    ins_theme: r.ins_theme,
    ins_advice: r.ins_advice,
    ins_priority: r.ins_priority != null ? Number(r.ins_priority) : null,
    worst_move: r.worst_move,
    worst_move_times: r.worst_move_times != null ? Number(r.worst_move_times) : null,
    worst_move_pct: r.worst_move_pct != null ? Number(r.worst_move_pct) : null,
    avg_cp_loss: r.avg_cp_loss != null ? Number(r.avg_cp_loss) : null
  }))
}

// ---------------------------------------------------------------------------
// Position detail page query
// ---------------------------------------------------------------------------

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const [posRes, movRes, posEvalRes, moveEvalRes, insRes, gamesRes] = await Promise.all([
    db.query({
      caller: 'getPositionDetail_pos',
      query: `SELECT * FROM tpos_positions WHERE pos_fen = $1`,
      params: [posFen],
      functionName: 'getPositionDetail'
    }),
    db.query({
      caller: 'getPositionDetail_moves',
      query: `SELECT * FROM tmov_moves WHERE mov_pos_fen = $1 ORDER BY mov_times DESC`,
      params: [posFen],
      functionName: 'getPositionDetail'
    }),
    db.query({
      caller: 'getPositionDetail_posEval',
      query: `SELECT * FROM teva_evaluations WHERE eva_pos_fen = $1 AND eva_move_san IS NULL`,
      params: [posFen],
      functionName: 'getPositionDetail'
    }),
    db.query({
      caller: 'getPositionDetail_moveEvals',
      query: `SELECT * FROM teva_evaluations WHERE eva_pos_fen = $1 AND eva_move_san IS NOT NULL`,
      params: [posFen],
      functionName: 'getPositionDetail'
    }),
    db.query({
      caller: 'getPositionDetail_insight',
      query: `SELECT * FROM tins_insights WHERE ins_pos_fen = $1`,
      params: [posFen],
      functionName: 'getPositionDetail'
    }),
    db.query({
      caller: 'getPositionDetail_games',
      query: `
        SELECT gam_game_ref AS game_ref, gam_player AS player, gam_move_played AS move_played,
               gam_move_num AS move_num, gam_cp_loss AS cp_loss
        FROM tgam_game_positions
        WHERE gam_pos_fen = $1
        ORDER BY gam_created DESC
        LIMIT 50
      `,
      params: [posFen],
      functionName: 'getPositionDetail'
    })
  ])

  return {
    position: posRes.rows[0] as PositionRow ?? null,
    moves: movRes.rows as MoveRow[],
    posEval: posEvalRes.rows[0] as EvaluationRow ?? null,
    moveEvals: moveEvalRes.rows as EvaluationRow[],
    insight: insRes.rows[0] as InsightRow ?? null,
    games: gamesRes.rows.map((r: any) => ({
      game_ref: r.game_ref,
      player: r.player,
      move_played: r.move_played,
      move_num: r.move_num != null ? Number(r.move_num) : null,
      cp_loss: r.cp_loss != null ? Number(r.cp_loss) : null
    }))
  }
}

// ---------------------------------------------------------------------------
// Quiz queue
// ---------------------------------------------------------------------------

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
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
    params: [],
    functionName: 'getQuizQueue'
  })
  return result.rows.map((r: any) => ({
    pos_fen: r.pos_fen,
    pos_reached: Number(r.pos_reached),
    pos_color: r.pos_color,
    ins_theme: r.ins_theme,
    ins_advice: r.ins_advice,
    ins_priority: r.ins_priority != null ? Number(r.ins_priority) : null,
    best_move: r.best_move,
    habit_move: r.habit_move,
    habit_times: r.habit_times != null ? Number(r.habit_times) : null
  }))
}

// ---------------------------------------------------------------------------
// Briefing aggregation
// ---------------------------------------------------------------------------

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
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const fromTs = Math.floor(new Date(opts.dateFrom).getTime() / 1000)
  const toTs   = Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)

  const [gpRes, enrichRes] = await Promise.all([
    db.query({
      caller: 'getBriefingData_gp',
      query: `
        SELECT gp.*
        FROM tgam_game_positions gp
        JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref
        WHERE gp.gam_player = $1
          AND r.gr_end_time BETWEEN $2 AND $3
        ORDER BY gp.gam_created DESC
      `,
      params: [opts.player.toLowerCase(), fromTs, toTs],
      functionName: 'getBriefingData'
    }),
    db.query({
      caller: 'getBriefingData_enrich',
      query: `
        SELECT e.*
        FROM ten_enrichment e
        JOIN tgr_gamesraw r ON r.gr_grid = e.en_grid
        WHERE e.en_player = $1
          AND r.gr_end_time BETWEEN $2 AND $3
          AND e.en_enriched = TRUE
      `,
      params: [opts.player.toLowerCase(), fromTs, toTs],
      functionName: 'getBriefingData'
    })
  ])

  const gamePositions = gpRes.rows as GamePositionRow[]
  const enrichmentRows = enrichRes.rows as EnrichmentRow[]
  const habitCount   = gamePositions.filter(g => g.gam_is_habit).length
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
