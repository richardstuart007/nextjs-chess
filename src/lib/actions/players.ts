'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'
import { DEFAULT_PLAYER } from '../constants'

const TABLE = 'tpl_players'

export async function getPlayer(username: string) {
  const rows = await table_fetch({
    caller: 'getPlayer',
    table: TABLE,
    whereColumnValuePairs: [{ column: 'pl_username', value: username.toLowerCase() }]
  })
  return rows[0] ?? null
}

export async function upsertPlayer(data: {
  username: string
  avatar?: string
  display_name?: string
  rating_blitz?: number
}) {
  const existing = await getPlayer(data.username)

  const columnMap: Record<string, string> = {
    username:     'pl_username',
    avatar:       'pl_avatar',
    display_name: 'pl_display_name',
    rating_blitz: 'pl_rating_blitz'
  }

  const pairs = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      column: columnMap[key] ?? key,
      value: key === 'username' ? (value as string).toLowerCase() : value as string | number | boolean
    }))

  if (existing) {
    await table_update({
      caller: 'upsertPlayer',
      table: TABLE,
      columnValuePairs: pairs,
      whereColumnValuePairs: [{ column: 'pl_plid', value: existing.pl_plid }]
    })
    return { ...existing, ...data }
  }

  const rows = await table_write({
    caller: 'upsertPlayer',
    table: TABLE,
    columnValuePairs: pairs
  })
  return rows[0] ?? null
}

export async function updatePlayerRating(username: string): Promise<number | null> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const result = await db.query({
    caller: 'updatePlayerRating',
    query: `SELECT CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END AS rating
            FROM tgd_gamesdecon WHERE gd_player_username = $1 ORDER BY gd_end_time DESC LIMIT 1`,
    params: [username.toLowerCase()],
    functionName: 'updatePlayerRating'
  })
  if (result.rows.length === 0) return null
  const rating = Number(result.rows[0].rating)
  await upsertPlayer({ username, rating_blitz: rating })
  return rating
}

export async function getPlayers(): Promise<{ username: string; display_name: string | null }[]> {
  const rows = await table_fetch({
    caller: 'getPlayers',
    table: TABLE,
    orderBy: 'pl_username ASC'
  })
  const mapped = rows.map((r: any) => ({
    username: r.pl_username,
    display_name: r.pl_display_name ?? null
  }))
  return mapped.sort((a, b) =>
    a.username === DEFAULT_PLAYER ? -1 : b.username === DEFAULT_PLAYER ? 1 : 0
  )
}
