'use client'

import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'

export interface SyncProgressData {
  syncType: 'full_replace' | 'refresh'
  status: 'running' | 'completed' | 'failed'
  archivesDone: number
  archivesTotal: number
  gamesInserted: number
  gamesSkipped: number
  errorMessage?: string
}

interface SyncProgressProps {
  progress: SyncProgressData
  onComplete: () => void
}

export default function SyncProgress({ progress, onComplete }: SyncProgressProps) {
  const archivePercent = progress.archivesTotal > 0
    ? Math.round((progress.archivesDone / progress.archivesTotal) * 100)
    : 0

  const isRunning = progress.status === 'running'
  const isCompleted = progress.status === 'completed'
  const isFailed = progress.status === 'failed'

  return (
    <MyBox title={`Sync: ${progress.syncType === 'full_replace' ? 'Full Replace' : 'Refresh'}`}>
      <div className='space-y-2'>
        <div className='h-3 w-full overflow-hidden rounded bg-gray-200'>
          <div
            className={`h-full transition-all duration-300 ${
              isFailed ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${archivePercent}%` }}
          />
        </div>

        <div className='flex flex-wrap gap-4 text-xs text-gray-600'>
          <span>Archives: {progress.archivesDone} / {progress.archivesTotal}</span>
          <span>Inserted: {progress.gamesInserted.toLocaleString()}</span>
          {progress.gamesSkipped > 0 && <span>Skipped: {progress.gamesSkipped.toLocaleString()}</span>}
        </div>

        {isRunning && (
          <p className='text-xs text-blue-600 font-bold'>Downloading...</p>
        )}
        {isCompleted && (
          <div className='flex items-center gap-2'>
            <p className='text-xs text-green-600 font-bold'>
              Sync complete — {progress.gamesInserted.toLocaleString()} games downloaded
            </p>
            <MyButton onClick={onComplete} overrideClass='text-xs'>
              View Games
            </MyButton>
          </div>
        )}
        {isFailed && (
          <p className='text-xs text-red-600 font-bold'>
            Failed: {progress.errorMessage}
          </p>
        )}
      </div>
    </MyBox>
  )
}
