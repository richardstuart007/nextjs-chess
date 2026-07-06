'use client'
import { useState, Suspense } from 'react'
import OwnerTableCache from 'nextjs-shared/OwnerTableCache'
import OwnerTableLogging from 'nextjs-shared/OwnerTableLogging'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { runCronSync } from '@/src/lib/actions/cron'
import MaintenancePage from '@/src/app/owner/maintenance/page'

const TABS = ['Logging', 'Cache', 'Cron', 'Maintenance'] as const
type Tab = typeof TABS[number]

export default function OwnerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Logging')
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult, setSyncResult] = useState<{ players: { username: string; inserted: number; deconstructed: number }[] } | null>(null)
  const [syncError, setSyncError] = useState('')

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
    <div>
      <nav className='flex gap-6 px-8 pt-6 pb-0 border-b border-gray-200 text-sm'>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? 'pb-2 border-b-2 border-gray-900 text-gray-900 font-medium'
                : 'pb-2 text-gray-500 hover:text-gray-700'
            }
          >
            {tab}
          </button>
        ))}
      </nav>
      <Suspense>
        {activeTab === 'Logging' && <OwnerTableLogging />}
        {activeTab === 'Cache' && <OwnerTableCache />}
        {activeTab === 'Cron' && (
          <div className='p-8 space-y-4'>
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
        )}
        {activeTab === 'Maintenance' && (
          <div className='p-8'>
            <MaintenancePage />
          </div>
        )}
      </Suspense>
    </div>
  )
}
