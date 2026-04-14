'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_update } from 'nextjs-shared/table_update'

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
  joined?: number
  last_online?: number
  url?: string
  rating_rapid?: number
  rating_blitz?: number
  rating_bullet?: number
  rating_daily?: number
  is_primary?: boolean
}) {
  const existing = await getPlayer(data.username)

  // Map input fields to column names
  const columnMap: Record<string, string> = {
    username: 'pl_username',
    avatar: 'pl_avatar',
    display_name: 'pl_display_name',
    joined: 'pl_joined',
    last_online: 'pl_last_online',
    url: 'pl_url',
    rating_rapid: 'pl_rating_rapid',
    rating_blitz: 'pl_rating_blitz',
    rating_bullet: 'pl_rating_bullet',
    rating_daily: 'pl_rating_daily',
    is_primary: 'pl_is_primary'
  }

  if (existing) {
    const pairs = Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => ({
        column: columnMap[key] ?? key,
        value: key === 'username' ? (value as string).toLowerCase() : value as string | number | boolean
      }))
    pairs.push({ column: 'pl_updated_at', value: new Date().toISOString() })

    await table_update({
      caller: 'upsertPlayer',
      table: TABLE,
      columnValuePairs: pairs,
      whereColumnValuePairs: [{ column: 'pl_plid', value: existing.pl_plid }]
    })
    return { ...existing, ...data }
  }

  const pairs = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      column: columnMap[key] ?? key,
      value: key === 'username' ? (value as string).toLowerCase() : value as string | number | boolean
    }))

  const rows = await table_write({
    caller: 'upsertPlayer',
    table: TABLE,
    columnValuePairs: pairs
  })
  return rows[0] ?? null
}

export async function updatePlayerLastSynced(username: string) {
  await table_update({
    caller: 'updatePlayerLastSynced',
    table: TABLE,
    columnValuePairs: [
      { column: 'pl_last_synced', value: new Date().toISOString() },
      { column: 'pl_updated_at', value: new Date().toISOString() }
    ],
    whereColumnValuePairs: [{ column: 'pl_username', value: username.toLowerCase() }]
  })
}
