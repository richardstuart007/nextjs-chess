'use client'

import { useState } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { runCronSync } from '@/src/lib/actions/cron'

export default function CronPage() {
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ players: { username: string; inserted: number; deconstructed: number }[] } | null>(null)
  const [syncError,   setSyncError]   = useState('')

  async function handleGameSync() {
    setSyncRunning(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const data = await runCronSync()
      setSyncResult(data)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Cron sync failed')
    } finally {
      setSyncRunning(false)
    }
  }

  return (
    <div className='space-y-4'>

      <h2 className='text-sm font-bold text-gray-800'>Cron Jobs</h2>

      <MyBox title='Game Sync — All Players'>
        <div className='flex items-center gap-2 mb-2'>
          <MyButton onClick={handleGameSync} disabled={syncRunning}>
            {syncRunning ? 'Running...' : 'Run Game Sync'}
          </MyButton>
          <MyHelpField text='Downloads new games from chess.com for all players and deconstructs them into tgd_gamesdecon.' />
        </div>
        {syncError && <p className='text-xs text-red-600'>{syncError}</p>}
        {syncResult && (
          <div className='mt-2 text-xs text-gray-700 space-y-1'>
            {syncResult.players.map(p => (
              <div key={p.username}>
                {p.username}: {p.inserted} inserted, {p.deconstructed} deconstructed
              </div>
            ))}
          </div>
        )}
      </MyBox>

    </div>
  )
}
