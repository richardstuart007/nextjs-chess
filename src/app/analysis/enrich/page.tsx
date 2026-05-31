'use client'

import { Suspense, useState, useEffect } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import EvalProgress from '@/src/ui/analysis/EvalProgress'
import { getPlayers } from '@/src/lib/actions/players'
import { getUnenrichedGamesForPlayer, type UnenrichedGame, type EnrichFilters } from '@/src/lib/analysis/db'

// ---- Helpers ---------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10)
const THIS_YEAR = new Date().getFullYear()

function ResultBadge({ result }: { result: string }) {
  const cls =
    result === 'win'  ? 'bg-green-100 text-green-700' :
    result === 'loss' ? 'bg-red-100 text-red-600'     :
                        'bg-gray-100 text-gray-600'
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{result}</span>
}

function ColorDot({ color }: { color: string }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1 ${color === 'white' ? 'bg-gray-200 border border-gray-400' : 'bg-gray-800'}`} />
  )
}

// ---- Main component --------------------------------------------------------

function EnrichContent() {
  const [players,        setPlayers]        = useState<{ username: string; display_name: string | null }[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [depth,          setDepth]          = useState(16)

  // Filters — matching the main games display
  const [dateFrom, setDateFrom] = useState(`${THIS_YEAR}-01-01`)
  const [dateTo,   setDateTo]   = useState(TODAY)
  const [color,    setColor]    = useState<'' | 'white' | 'black'>('')
  const [opening,  setOpening]  = useState('')
  const [eco,      setEco]      = useState('')

  const [allGames,  setAllGames]  = useState<UnenrichedGame[]>([])
  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [loading,   setLoading]   = useState(false)
  const [loaded,    setLoaded]    = useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    getPlayers().then(ps => {
      setPlayers(ps)
      if (ps.length > 0) setSelectedPlayer(ps[0].username)
    })
  }, [])

  async function handleLoad() {
    if (!selectedPlayer) return
    setLoading(true)
    setLoaded(false)
    setDone(false)
    setAllGames([])
    setSelected(new Set())
    try {
      const filters: EnrichFilters = {
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
        color:    color    || undefined,
        opening:  opening  || undefined,
        eco:      eco      || undefined
      }
      const rows = await getUnenrichedGamesForPlayer(selectedPlayer, 0, undefined, undefined, filters)
      setAllGames(rows)
      setSelected(new Set(rows.map(r => r.grid)))
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setDateFrom(`${THIS_YEAR}-01-01`)
    setDateTo(TODAY)
    setColor('')
    setOpening('')
    setEco('')
  }

  function toggleAll() {
    setSelected(s => s.size === allGames.length ? new Set() : new Set(allGames.map(g => g.grid)))
  }

  function toggleOne(grid: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(grid) ? next.delete(grid) : next.add(grid)
      return next
    })
  }

  const selectedGames = allGames.filter(g => selected.has(g.grid))

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Game Enrichment</h1>
        <p className="text-gray-500 text-sm mt-1">
          Select games then run Stockfish in your browser to compute accuracy, blunders and more.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {/* Player */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Player</label>
            <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm">
              {players.map(p => (
                <option key={p.username} value={p.username}>{p.display_name ?? p.username}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <select value={color} onChange={e => setColor(e.target.value as '' | 'white' | 'black')}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">All</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date from</label>
            <input type="date" value={dateFrom} max={TODAY}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date to</label>
            <input type="date" value={dateTo} max={TODAY}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>

          {/* Opening */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Opening name</label>
            <input type="text" value={opening} placeholder="e.g. Sicilian…"
              onChange={e => setOpening(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>

          {/* ECO */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ECO code</label>
            <input type="text" value={eco} placeholder="e.g. B20"
              onChange={e => setEco(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>

          {/* Depth */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stockfish depth</label>
            <input type="number" value={depth} min={8} max={24}
              onChange={e => setDepth(Math.max(8, Math.min(24, parseInt(e.target.value) || 16)))}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleLoad} disabled={loading || !selectedPlayer}
            className="px-4 py-1.5 bg-gray-800 text-white rounded hover:bg-gray-900 text-sm font-medium disabled:opacity-50">
            {loading ? 'Loading…' : 'Load games'}
          </button>
          <button onClick={handleReset}
            className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50">
            Reset filters
          </button>
        </div>
      </div>

      {/* ── Game list ── */}
      {loaded && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              {allGames.length} game{allGames.length !== 1 ? 's' : ''} found
              {allGames.length > 0 && <> · <strong>{selected.size}</strong> selected</>}
            </span>
            {allGames.length > 0 && (
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                {selected.size === allGames.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {allGames.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-500 text-center">
              No unenriched games found for these filters.
            </p>
          ) : (
            <div className="overflow-y-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Color</th>
                    <th className="px-3 py-2 text-left">Opponent</th>
                    <th className="px-3 py-2 text-left">Result</th>
                    <th className="px-3 py-2 text-left">Opening</th>
                    <th className="px-3 py-2 text-left">ECO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allGames.map(g => (
                    <tr key={g.grid} onClick={() => toggleOne(g.grid)}
                      className={`cursor-pointer hover:bg-gray-50 ${selected.has(g.grid) ? '' : 'opacity-50'}`}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={selected.has(g.grid)}
                          onChange={() => toggleOne(g.grid)}
                          onClick={e => e.stopPropagation()} className="rounded" />
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-gray-600 whitespace-nowrap">{g.end_date}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center">
                          <ColorDot color={g.color} />
                          <span className="text-gray-600 capitalize">{g.color}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-800">{g.opponent}</td>
                      <td className="px-3 py-1.5"><ResultBadge result={g.result} /></td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate">{g.opening_name || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{g.eco_code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Enrich panel ── */}
      {loaded && selectedGames.length > 0 && !done && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Run Stockfish Enrichment</h2>
            <span className="text-xs text-gray-500">
              depth {depth} · {selectedGames.length} game{selectedGames.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Runs entirely in your browser — keep this tab open until complete.
          </p>
          <EvalProgress
            mode="enrich"
            games={selectedGames}
            depth={depth}
            onComplete={() => setDone(true)}
          />
        </div>
      )}

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          Enrichment complete. Visit{' '}
          <a href="/analysis/habits" className="underline">Habits</a> or{' '}
          <a href="/analysis/briefing" className="underline">Briefing</a> to see the results.
        </div>
      )}
    </div>
  )
}

export default function EnrichPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <EnrichContent />
    </Suspense>
  )
}
