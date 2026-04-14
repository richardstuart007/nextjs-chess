'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_count } from 'nextjs-shared/table_count'

const GAMES_TABLE = 'tgr_gamesraw'
const DECON_TABLE = 'tgd_gamesdecon'
const SAVED_TABLE = 'tsa_savedanalyses'

// -----------------------------------------------------------------------
// Games
// -----------------------------------------------------------------------

export async function getGameCount(playerUsername: string): Promise<number> {
  return table_count({
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player_username', value: playerUsername.toLowerCase() }],
    caller: 'getGameCount'
  })
}

export async function getRecentGames(playerUsername: string, limit: number = 100) {
  return table_fetch({
    caller: 'getRecentGames',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit
  })
}

export async function getGameById(gameId: number) {
  const rows = await table_fetch({
    caller: 'getGameById',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_grid', value: gameId }]
  })
  return rows[0] ?? null
}

export async function getLatestGameEndTime(playerUsername: string): Promise<number | null> {
  const rows = await table_fetch({
    caller: 'getLatestGameEndTime',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit: 1,
    columns: ['gr_end_time']
  })
  return rows[0]?.gr_end_time ?? null
}

export async function gameExists(chesscomUuid: string): Promise<boolean> {
  const rows = await table_fetch({
    caller: 'gameExists',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_chesscom_uuid', value: chesscomUuid }],
    limit: 1,
    columns: ['gr_grid']
  })
  return rows.length > 0
}

export async function insertRawGame(data: {
  player_username: string
  chesscom_uuid: string
  raw_data: object
  end_time: number
  time_class: string
}) {
  return table_write({
    caller: 'insertRawGame',
    table: GAMES_TABLE,
    columnValuePairs: [
      { column: 'gr_player_username', value: data.player_username.toLowerCase() },
      { column: 'gr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'gr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'gr_end_time', value: data.end_time },
      { column: 'gr_time_class', value: data.time_class }
    ]
  })
}

export async function saveGameEvaluations(gameId: number, evaluations: object[]) {
  return table_update({
    caller: 'saveGameEvaluations',
    table: GAMES_TABLE,
    columnValuePairs: [
      { column: 'gr_evaluations', value: JSON.stringify(evaluations) },
      { column: 'gr_is_analyzed', value: true }
    ],
    whereColumnValuePairs: [{ column: 'gr_grid', value: gameId }]
  })
}

// -----------------------------------------------------------------------
// Saved Analyses
// -----------------------------------------------------------------------

export async function saveAnalysisLine(data: {
  game_id?: number
  title: string
  notes?: string
  line_pgn: string
  line_moves: object[]
  starting_fen: string
  starting_ply: number
  eco_code?: string
  opening_name?: string
}) {
  return table_write({
    caller: 'saveAnalysisLine',
    table: SAVED_TABLE,
    columnValuePairs: [
      { column: 'sa_grid', value: data.game_id ?? 0 },
      { column: 'sa_save_type', value: 'line' },
      { column: 'sa_title', value: data.title },
      { column: 'sa_notes', value: data.notes ?? '' },
      { column: 'sa_line_pgn', value: data.line_pgn },
      { column: 'sa_line_moves', value: JSON.stringify(data.line_moves) },
      { column: 'sa_starting_fen', value: data.starting_fen },
      { column: 'sa_starting_ply', value: data.starting_ply },
      { column: 'sa_eco_code', value: data.eco_code ?? '' },
      { column: 'sa_opening_name', value: data.opening_name ?? '' }
    ]
  })
}

export async function saveAnalysisTree(data: {
  game_id?: number
  title: string
  notes?: string
  tree_data: object
}) {
  return table_write({
    caller: 'saveAnalysisTree',
    table: SAVED_TABLE,
    columnValuePairs: [
      { column: 'sa_grid', value: data.game_id ?? 0 },
      { column: 'sa_save_type', value: 'full_tree' },
      { column: 'sa_title', value: data.title },
      { column: 'sa_notes', value: data.notes ?? '' },
      { column: 'sa_tree_data', value: JSON.stringify(data.tree_data) }
    ]
  })
}

export async function getSavedAnalyses(gameId: number) {
  return table_fetch({
    caller: 'getSavedAnalyses',
    table: SAVED_TABLE,
    whereColumnValuePairs: [{ column: 'sa_grid', value: gameId }],
    orderBy: 'sa_created_at DESC'
  })
}

// -----------------------------------------------------------------------
// Deconstructed Games
// -----------------------------------------------------------------------

export async function getDeconGames(playerUsername: string, limit: number = 100) {
  return table_fetch({
    caller: 'getDeconGames',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'gd_end_time DESC',
    limit
  })
}

export async function getDeconGameCount(playerUsername: string): Promise<number> {
  return table_count({
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player_username', value: playerUsername.toLowerCase() }],
    caller: 'getDeconGameCount'
  })
}

// -----------------------------------------------------------------------
// Filtered + Paginated Deconstructed Games
// -----------------------------------------------------------------------

import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import { Filter } from 'nextjs-shared/tableFetchUtils'

const ITEMS_PER_PAGE = 25

export type GameFilters = {
  opponent?: string
  opponentRatingMin?: number
  opponentRatingMax?: number
  result?: string
  color?: string
  timeClass?: string
  opening?: string
  eco?: string
  dateFrom?: string
  dateTo?: string
}

function buildFilters(username: string, filters: GameFilters): Filter[] {
  const result: Filter[] = [
    { column: 'gd_player_username', operator: '=', value: username.toLowerCase() }
  ]

  if (filters.opponent) {
    result.push({ column: 'gd_opponent_username', operator: 'LIKE', value: filters.opponent })
  }
  if (filters.opponentRatingMin) {
    result.push({ column: 'gd_opponent_rating', operator: '>=', value: filters.opponentRatingMin })
  }
  if (filters.opponentRatingMax) {
    result.push({ column: 'gd_opponent_rating', operator: '<=', value: filters.opponentRatingMax })
  }
  if (filters.result) {
    result.push({ column: 'gd_player_result', operator: '=', value: filters.result })
  }
  if (filters.color) {
    result.push({ column: 'gd_player_color', operator: '=', value: filters.color })
  }
  if (filters.timeClass) {
    result.push({ column: 'gd_time_class', operator: '=', value: filters.timeClass })
  }
  if (filters.opening) {
    result.push({ column: 'gd_opening_name', operator: 'LIKE', value: filters.opening })
  }
  if (filters.eco) {
    result.push({ column: 'gd_eco_code', operator: 'LIKE', value: filters.eco })
  }
  if (filters.dateFrom) {
    const unixFrom = Math.floor(new Date(filters.dateFrom).getTime() / 1000)
    result.push({ column: 'gd_end_time', operator: '>=', value: unixFrom })
  }
  if (filters.dateTo) {
    const unixTo = Math.floor(new Date(filters.dateTo + 'T23:59:59').getTime() / 1000)
    result.push({ column: 'gd_end_time', operator: '<=', value: unixTo })
  }

  return result
}

export async function fetchFilteredGames(
  username: string,
  filters: GameFilters,
  page: number,
  itemsPerPage: number = ITEMS_PER_PAGE
) {
  const filterArray = buildFilters(username, filters)
  const offset = (page - 1) * itemsPerPage

  return fetchFiltered({
    table: DECON_TABLE,
    filters: filterArray,
    orderBy: 'gd_end_time DESC',
    limit: itemsPerPage,
    offset,
    caller: 'fetchFilteredGames'
  })
}

export async function fetchFilteredGamePages(
  username: string,
  filters: GameFilters,
  itemsPerPage: number = ITEMS_PER_PAGE
): Promise<number> {
  const filterArray = buildFilters(username, filters)

  return fetchTotalPages({
    table: DECON_TABLE,
    filters: filterArray,
    items_per_page: itemsPerPage,
    caller: 'fetchFilteredGamePages'
  })
}
