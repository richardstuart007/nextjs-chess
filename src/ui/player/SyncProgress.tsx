'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { getSyncLog } from '@/src/lib/actions/sync'

interface SyncProgressProps {
  syncId: number
  onComplete: () => void
}

export default function SyncProgress({ syncId, onComplete }: SyncProgressProps) {
  const [sync, setSync] = useState<any>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout

    async function poll() {
      const data = await getSyncLog(syncId)
      setSync(data)
      if (data?.sl_status === 'completed' || data?.sl_status === 'failed') {
        clearInterval(interval)
      }
    }

    poll()
    interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [syncId])

  if (!sync) return null

  const archivePercent = sync.sl_archives_total > 0
    ? Math.round((sync.sl_archives_done / sync.sl_archives_total) * 100)
    : 0

  const isRunning = sync.sl_status === 'running'
  const isCompleted = sync.sl_status === 'completed'
  const isFailed = sync.sl_status === 'failed'

  return (
    <MyBox title={`Sync: ${sync.sl_sync_type === 'full_replace' ? 'Full Replace' : 'Refresh'}`}>
      <div className='space-y-2'>
        {/* Progress bar */}
        <div className='h-3 w-full overflow-hidden rounded bg-gray-200'>
          <div
            className={`h-full transition-all duration-300 ${
              isFailed ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${archivePercent}%` }}
          />
        </div>

        {/* Stats */}
        <div className='flex flex-wrap gap-4 text-xs text-gray-600'>
          <span>Archives: {sync.sl_archives_done} / {sync.sl_archives_total}</span>
          <span>Games found: {sync.sl_games_total}</span>
          <span>Inserted: {sync.sl_games_inserted}</span>
          {sync.sl_games_skipped > 0 && <span>Skipped: {sync.sl_games_skipped}</span>}
        </div>

        {/* Status */}
        {isRunning && (
          <p className='text-xs text-blue-600 font-bold'>Downloading...</p>
        )}
        {isCompleted && (
          <div className='flex items-center gap-2'>
            <p className='text-xs text-green-600 font-bold'>
              Sync complete — {sync.sl_games_inserted} games downloaded
            </p>
            <MyButton onClick={onComplete} overrideClass='text-xs'>
              View Games
            </MyButton>
          </div>
        )}
        {isFailed && (
          <p className='text-xs text-red-600 font-bold'>
            Failed: {sync.sl_error_message}
          </p>
        )}
      </div>
    </MyBox>
  )
}
