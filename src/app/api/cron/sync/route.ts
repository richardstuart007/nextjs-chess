import { NextRequest, NextResponse } from 'next/server'
import { getPlayers, updatePlayerRating } from '@/src/lib/actions/players'
import { initSync, syncArchive } from '@/src/lib/actions/sync'
import { deconstructGames } from '@/src/lib/actions/deconstruct'
import { sql } from 'nextjs-shared/db'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const db = await sql()
    const lockResult = await db.query({
      caller: 'cron_sync',
      query: 'SELECT pg_try_advisory_lock(1) AS acquired',
      functionName: 'GET'
    })
    if (!lockResult.rows[0].acquired) {
      return NextResponse.json({ message: 'Sync already running, skipping' })
    }

    const players = await getPlayers()
    const summary: { username: string; inserted: number; deconstructed: number }[] = []

    for (const player of players) {
      const username = player.username
      let totalInserted = 0

      try {
        const { archives, latestEndTime } = await initSync(username, 'refresh')

        for (const archiveUrl of archives) {
          const result = await syncArchive({ username, archiveUrl, syncType: 'refresh', latestEndTime })
          totalInserted += result.inserted
        }

        const { processed } = await deconstructGames(username, 0)
        await updatePlayerRating(username)
        summary.push({ username, inserted: totalInserted, deconstructed: processed })
      } catch (err) {
        console.error(`Cron sync failed for ${username}:`, err)
        summary.push({ username, inserted: totalInserted, deconstructed: 0 })
      }
    }

    const totalInserted = summary.reduce((s, p) => s + p.inserted, 0)
    const totalDeconstructed = summary.reduce((s, p) => s + p.deconstructed, 0)

    return NextResponse.json({ players: summary, totalInserted, totalDeconstructed })
  } catch (err) {
    console.error('Cron sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
