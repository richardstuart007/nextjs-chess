'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import HabitsTable from '@/src/ui/analysis/HabitsTable'
import { getHabitsData } from '@/src/lib/analysis/db'

type Color  = 'all' | 'w' | 'b'
type SortBy = 'priority' | 'reached' | 'cpLoss'

function HabitsContent() {
  const [color,  setColor]  = useState<Color>('all')
  const [sortBy, setSortBy] = useState<SortBy>('priority')
  const [search, setSearch] = useState('')
  const [rows,   setRows]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getHabitsData({
        color:  color === 'all' ? undefined : color,
        sortBy,
        search: search || undefined,
        limit:  200
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [color, sortBy, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Blunder Habits</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Color filter */}
          <div className="flex rounded border overflow-hidden text-sm">
            {(['all', 'w', 'b'] as Color[]).map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`px-3 py-1 ${color === c ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {c === 'all' ? 'All' : c === 'w' ? 'As White' : 'As Black'}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="priority">Sort: Priority</option>
            <option value="reached">Sort: Times Reached</option>
            <option value="cpLoss">Sort: CP Loss</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search theme…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            className="border rounded px-2 py-1 text-sm w-40"
          />
        </div>
      </div>

      {loading ? (
        <MyLoadingMessage message1="Loading habits…" />
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <HabitsTable rows={rows} />
        </div>
      )}

      <div className="text-xs text-gray-400 text-right">
        {rows.length} position{rows.length !== 1 ? 's' : ''} shown ·{' '}
        <a href="/analysis/enrich" className="underline hover:text-gray-600">Enrich more games</a>
        {' · '}
        <a href="/api/analysis/build-tree?limit=100" className="underline hover:text-gray-600">Build tree</a>
        {' · '}
        <a href="/api/analysis/generate-insights?limit=20" className="underline hover:text-gray-600">Generate insights</a>
      </div>
    </div>
  )
}

export default function HabitsPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <HabitsContent />
    </Suspense>
  )
}
