'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { table_delete } from 'nextjs-shared/table_delete'
import { gameExists, insertRawGame, getLatestGameEndTime } from './games'
import { updatePlayerLastSynced } from './players'

const SYNC_TABLE = 'tsl_synclog'
const GAMES_TABLE = 'tgr_gamesraw'

// -----------------------------------------------------------------------
// Sync log operations
// -----------------------------------------------------------------------

export async function createSyncLog(playerUsername: string, syncType: 'full_replace' | 'refresh') {
  const rows = await table_write({
    caller: 'createSyncLog',
    table: SYNC_TABLE,
    columnValuePairs: [
      { column: 'sl_player_username', value: playerUsername.toLowerCase() },
      { column: 'sl_sync_type', value: syncType },
      { column: 'sl_status', value: 'running' },
      { column: 'sl_started_at', value: new Date().toISOString() }
    ]
  })
  return rows[0]
}

export async function updateSyncLog(syncId: number, data: Partial<{
  status: string
  archives_total: number
  archives_done: number
  games_total: number
  games_inserted: number
  games_skipped: number
  error_message: string
  completed_at: string
}>) {
  const columnMap: Record<string, string> = {
    status: 'sl_status',
    archives_total: 'sl_archives_total',
    archives_done: 'sl_archives_done',
    games_total: 'sl_games_total',
    games_inserted: 'sl_games_inserted',
    games_skipped: 'sl_games_skipped',
    error_message: 'sl_error_message',
    completed_at: 'sl_completed_at'
  }

  const pairs = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({ column: columnMap[key] ?? key, value: value as string | number }))

  if (pairs.length === 0) return

  await table_update({
    caller: 'updateSyncLog',
    table: SYNC_TABLE,
    columnValuePairs: pairs,
    whereColumnValuePairs: [{ column: 'sl_slid', value: syncId }]
  })
}

export async function getSyncLog(syncId: number) {
  const rows = await table_fetch({
    caller: 'getSyncLog',
    table: SYNC_TABLE,
    whereColumnValuePairs: [{ column: 'sl_slid', value: syncId }]
  })
  return rows[0] ?? null
}

export async function getLatestSync(playerUsername: string) {
  const rows = await table_fetch({
    caller: 'getLatestSync',
    table: SYNC_TABLE,
    whereColumnValuePairs: [{ column: 'sl_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'sl_created_at DESC',
    limit: 1
  })
  return rows[0] ?? null
}

// -----------------------------------------------------------------------
// Sync execution
// -----------------------------------------------------------------------

export async function syncGames(
  playerUsername: string,
  syncType: 'full_replace' | 'refresh'
): Promise<{ syncId: number }> {
  const username = playerUsername.toLowerCase()
  const primaryUsername = (process.env.NEXT_PUBLIC_PRIMARY_USERNAME ?? 'stricade').toLowerCase()
  const isPrimary = username === primaryUsername
  const defaultLimit = parseInt(process.env.NEXT_PUBLIC_DEFAULT_SYNC_LIMIT ?? '100', 10)
  const maxGames = isPrimary ? 0 : defaultLimit // 0 = no limit

  // Create sync log entry
  const syncLog = await createSyncLog(username, syncType)
  const syncId = syncLog.sl_slid

  try {
    // For full replace, delete ALL existing games and reset sequence
    if (syncType === 'full_replace') {
      await table_delete({
        table: GAMES_TABLE,
        whereColumnValuePairs: [{ column: 'gr_player_username', value: username }],
        caller: 'syncGames_fullReplace'
      })
      // Reset the sequence so gr_grid starts at 1
      const { sql } = await import('nextjs-shared/db')
      const db = await sql()
      await db.query({
        caller: 'syncGames_resetSeq',
        query: "SELECT setval(pg_get_serial_sequence('tgr_gamesraw', 'gr_grid'), 1, false)",
        functionName: 'syncGames'
      })
    }

    // Get latest game time for refresh mode
    const latestEndTime = syncType === 'refresh'
      ? await getLatestGameEndTime(username)
      : null

    // Fetch archives from chess.com
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`)
    if (!archivesRes.ok) throw new Error(`Failed to fetch archives for ${username}`)
    const { archives } = await archivesRes.json() as { archives: string[] }

    await updateSyncLog(syncId, { archives_total: archives.length })

    let totalInserted = 0
    let totalSkipped = 0
    let totalGames = 0

    // Full replace: oldest first (gr_grid = 1 is the oldest game)
    // Refresh: newest first (new games get next sequential IDs)
    const isOldestFirst = syncType === 'full_replace'
    const startIdx = isOldestFirst ? 0 : archives.length - 1
    const endCondition = (i: number) => isOldestFirst ? i < archives.length : i >= 0
    const step = isOldestFirst ? 1 : -1

    for (let i = startIdx; endCondition(i) && (maxGames === 0 || totalInserted < maxGames); i += step) {
      const archiveUrl = archives[i]

      // For refresh: skip archives older than the latest known game
      if (syncType === 'refresh' && latestEndTime) {
        const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/)
        if (match) {
          const archiveDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
          const latestDate = new Date(latestEndTime * 1000)
          if (archiveDate < new Date(latestDate.getFullYear(), latestDate.getMonth())) {
            await updateSyncLog(syncId, {
              archives_done: isOldestFirst ? i + 1 : archives.length - i
            })
            continue
          }
        }
      }

      // Fetch games for this month
      const monthRes = await fetch(archiveUrl)
      if (!monthRes.ok) {
        await updateSyncLog(syncId, {
          archives_done: isOldestFirst ? i + 1 : archives.length - i
        })
        continue
      }

      const { games } = await monthRes.json() as { games: any[] }
      totalGames += games.length

      // Filter to standard chess only, sort by end_time ascending within each month
      const standardGames = games
        .filter((g: any) => g.rules === 'chess' && g.pgn)
        .sort((a: any, b: any) => a.end_time - b.end_time)

      for (const game of standardGames) {
        if (maxGames > 0 && totalInserted >= maxGames) break

        const uuid = game.uuid || game.url
        if (!uuid) continue

        // For refresh: skip games older than latest known
        if (syncType === 'refresh' && latestEndTime && game.end_time <= latestEndTime) {
          totalSkipped++
          continue
        }

        // Check if game already exists
        const exists = await gameExists(uuid)
        if (exists) {
          totalSkipped++
          continue
        }

        // Insert raw game
        await insertRawGame({
          player_username: username,
          chesscom_uuid: uuid,
          raw_data: game,
          end_time: game.end_time,
          time_class: game.time_class || ''
        })
        totalInserted++

        // Update progress every 50 games
        if (totalInserted % 50 === 0) {
          await updateSyncLog(syncId, {
            games_total: totalGames,
            games_inserted: totalInserted,
            games_skipped: totalSkipped
          })
        }
      }

      await updateSyncLog(syncId, {
        archives_done: isOldestFirst ? i + 1 : archives.length - i,
        games_total: totalGames,
        games_inserted: totalInserted,
        games_skipped: totalSkipped
      })
    }

    // Mark complete
    await updateSyncLog(syncId, {
      status: 'completed',
      games_total: totalGames,
      games_inserted: totalInserted,
      games_skipped: totalSkipped,
      completed_at: new Date().toISOString()
    })

    await updatePlayerLastSynced(username)

    return { syncId }
  } catch (error) {
    await updateSyncLog(syncId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString()
    })
    return { syncId }
  }
}
