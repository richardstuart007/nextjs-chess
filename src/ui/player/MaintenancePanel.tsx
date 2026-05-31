'use client'

import { useState } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import MyBox from 'nextjs-shared/MyBox'
import { MyConfirmDialog, ConfirmDialogInt } from 'nextjs-shared/MyConfirmDialog'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { deconstructGames } from '@/src/lib/actions/deconstruct'

interface MaintenancePanelProps {
  username: string
  players: { username: string; display_name: string | null }[]
  rawCount: number
  deconCount: number
  onSearch: (username: string) => void
  onSync: (type: 'full_replace' | 'refresh') => void
  onDeconComplete: () => void
  loading: boolean
  syncing: boolean
  error: string
}

const CONFIRM_INITIAL: ConfirmDialogInt = {
  isOpen: false,
  title: '',
  subTitle: '',
  onConfirm: () => {}
}

export default function MaintenancePanel({
  username: initialUsername,
  players,
  rawCount,
  deconCount,
  onSearch,
  onSync,
  onDeconComplete,
  loading,
  syncing,
  error
}: MaintenancePanelProps) {
  const [username, setUsername] = useState(initialUsername)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogInt>(CONFIRM_INITIAL)

  const [populating, setPopulating] = useState(false)
  const [populateResult, setPopulateResult] = useState<{ processed: number; skipped: number; errors: number } | null>(null)

  function handleSubmit() {
    const trimmed = username.trim()
    if (!trimmed) return
    onSearch(trimmed)
  }

  function handleFullReplace() {
    setConfirmDialog({
      isOpen: true,
      title: 'Full Replace',
      subTitle: 'This will DELETE all games and re-download from chess.com',
      line1: `Player: ${initialUsername}`,
      line2: `Games to delete: ${rawCount}`,
      line3: 'This cannot be undone',
      onConfirm: () => {
        setConfirmDialog(CONFIRM_INITIAL)
        onSync('full_replace')
      }
    })
  }

  async function handlePopulate() {
    setPopulating(true)
    setPopulateResult(null)
    const batchSize = 500
    const accumulated = { processed: 0, skipped: 0, errors: 0 }

    try {
      while (true) {
        const res = await deconstructGames(initialUsername, batchSize)
        accumulated.processed += res.processed
        accumulated.skipped += res.skipped
        accumulated.errors += res.errors
        setPopulateResult({ ...accumulated })
        if (res.processed === 0) break
      }
      onDeconComplete()
    } catch {
      setPopulateResult({ ...accumulated, errors: accumulated.errors + 1 })
    } finally {
      setPopulating(false)
    }
  }

  const remaining = rawCount - deconCount

  return (
    <>
      <MyBox title='Maintenance'>
        <div className='space-y-3'>
          <MyHelp
            label='Help'
            title='Maintenance Help'
            items={[
              { heading: 'Fetch Statistics', body: 'Select a player and click to load their chess.com profile and show how many games are stored locally.' },
              { heading: 'Download new games', body: 'Fetches only games added since the last sync from chess.com and saves them to the database.' },
              { heading: 'Populate', body: 'Set the dropdown to All then click Populate — converts the raw downloaded games into the structured format used by the games list and analysis features.' },
              { heading: 'Tip', body: 'Repeat for each player, then restart the dev server to clear the cache so updated totals appear everywhere.' },
            ]}
          />

          {/* Player dropdown */}
          <div className='flex items-end gap-2'>
            <div>
              <label className='mb-1 block text-xs text-gray-700'>Player</label>
              <select
                value={username}
                onChange={e => setUsername(e.target.value)}
                className='rounded border border-gray-300 px-2 py-1 text-xs text-gray-700'
              >
                {players.map(p => (
                  <option key={p.username} value={p.username}>
                    {p.display_name ? `${p.display_name} (${p.username})` : p.username}
                  </option>
                ))}
              </select>
            </div>
            <MyButton onClick={handleSubmit} disabled={loading}>
              {loading ? 'Loading...' : 'Fetch Statistics'}
            </MyButton>
          </div>

          {error && <p className='text-xs text-red-600'>{error}</p>}
          {loading && <MyLoadingMessage message1='Loading player...' />}

          {/* Raw games + sync controls */}
          {!loading && (
            <div className='border-t border-gray-200 pt-2 flex items-center gap-3'>
              <p className='text-xs text-gray-700'>
                Raw games: <span className='font-bold'>{rawCount.toLocaleString()}</span>
              </p>
              <MyButton
                onClick={() => onSync('refresh')}
                disabled={syncing}
                overrideClass='text-xxs'
              >
                {syncing ? 'Downloading...' : 'Download new games'}
              </MyButton>
            </div>
          )}

          {/* Deconstructed + populate controls */}
          {rawCount > 0 && !loading && (
            <div className='border-t border-gray-200 pt-2'>
              <div className='flex items-center gap-3'>
                <p className='text-xs text-gray-700'>
                  Deconstructed: <span className={`font-bold ${deconCount > 0 ? 'text-green-600' : ''}`}>
                    {deconCount.toLocaleString()}
                  </span>
                  <span className='text-gray-400 ml-1'>
                    ({remaining.toLocaleString()} remaining)
                  </span>
                </p>
                <MyButton
                  onClick={handlePopulate}
                  disabled={populating}
                  overrideClass='text-xxs'
                >
                  {populating ? 'Processing...' : 'Populate'}
                </MyButton>
              </div>

              {populateResult && (
                <p className='text-xxs mt-1'>
                  <span className='text-green-600 font-bold'>Processed: {populateResult.processed}</span>
                  {populateResult.skipped > 0 && <span className='ml-2 text-gray-500'>Skipped: {populateResult.skipped}</span>}
                  {populateResult.errors > 0 && <span className='ml-2 text-red-600'>Errors: {populateResult.errors}</span>}
                </p>
              )}
            </div>
          )}

        </div>
      </MyBox>

      <MyConfirmDialog
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />
    </>
  )
}
