'use client'

import { useState } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import MyBox from 'nextjs-shared/MyBox'
import { MyConfirmDialog, ConfirmDialogInt } from 'nextjs-shared/MyConfirmDialog'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { deconstructGames } from '@/src/lib/actions/deconstruct'

interface MaintenancePanelProps {
  username: string
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

  // Populate state
  const [populateLimit, setPopulateLimit] = useState('100')
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
    try {
      const numLimit = populateLimit === 'All' ? 0 : parseInt(populateLimit, 10)
      const res = await deconstructGames(initialUsername, numLimit)
      setPopulateResult(res)
      onDeconComplete()
    } catch {
      setPopulateResult({ processed: 0, skipped: 0, errors: 1 })
    } finally {
      setPopulating(false)
    }
  }

  const remaining = rawCount - deconCount

  return (
    <>
      <MyBox title='Maintenance'>
        <div className='space-y-3'>
          {/* Search */}
          <div className='flex items-end gap-2'>
            <div>
              <label htmlFor='username' className='mb-1 block text-xs text-gray-700'>
                Chess.com Username
              </label>
              <MyInput
                id='username'
                type='text'
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder='Enter chess.com username'
                overrideClass='w-48'
              />
            </div>
            <MyButton onClick={handleSubmit} disabled={loading}>
              {loading ? 'Loading...' : 'Search'}
            </MyButton>
          </div>

          {error && <p className='text-xs text-red-600'>{error}</p>}
          {loading && <MyLoadingMessage message1='Loading player...' />}

          {/* Raw games + sync controls */}
          {!loading && (
            <div className='border-t border-gray-200 pt-2'>
              <div className='flex items-center justify-between'>
                <p className='text-xs text-gray-700'>
                  Raw games: <span className='font-bold'>{rawCount.toLocaleString()}</span>
                </p>
                <div className='flex items-center gap-2'>
                  <MyButton
                    onClick={() => onSync('refresh')}
                    disabled={syncing}
                    overrideClass='text-xxs'
                  >
                    {syncing ? 'Syncing...' : 'Refresh'}
                  </MyButton>
                  <MyButton
                    onClick={handleFullReplace}
                    disabled={syncing}
                    overrideClass='text-xxs bg-red-500 hover:bg-red-600'
                  >
                    Full Replace
                  </MyButton>
                </div>
              </div>
            </div>
          )}

          {/* Deconstructed + populate controls */}
          {rawCount > 0 && !loading && (
            <div className='border-t border-gray-200 pt-2'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-xs text-gray-700'>
                    Deconstructed: <span className={`font-bold ${deconCount > 0 ? 'text-green-600' : ''}`}>
                      {deconCount.toLocaleString()}
                    </span>
                    <span className='text-gray-400 ml-1'>
                      ({remaining.toLocaleString()} remaining)
                    </span>
                  </p>
                </div>
                <div className='flex items-center gap-2'>
                  <MySelect
                    options={['10', '50', '100', '500', '1000', 'All']}
                    value={populateLimit}
                    onChange={e => setPopulateLimit(e.target.value)}
                    className='w-16'
                  />
                  <MyButton
                    onClick={handlePopulate}
                    disabled={populating}
                    overrideClass='text-xxs'
                  >
                    {populating ? 'Processing...' : 'Populate'}
                  </MyButton>
                </div>
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
