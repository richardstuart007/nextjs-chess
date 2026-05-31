'use client'

import { Suspense, useState, useEffect } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import BriefingReport from '@/src/ui/analysis/BriefingReport'
import { getPlayers } from '@/src/lib/actions/players'
import { generateBriefing } from '@/src/lib/analysis/generateBriefing'
import type { BriefingResult } from '@/src/lib/analysis/generateBriefing'

type Period = 'today' | 'week' | 'month' | 'custom'
type BriefingType = 'D' | 'W'

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function periodDates(period: Period): { from: string; to: string } {
  const now = new Date()
  const to  = toISO(now)
  if (period === 'today')  return { from: to, to }
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    return { from: toISO(d), to }
  }
  if (period === 'month') {
    const d = new Date(now); d.setMonth(d.getMonth() - 1)
    return { from: toISO(d), to }
  }
  return { from: toISO(now), to }
}

function BriefingContent() {
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])
  const [player,  setPlayer]  = useState('')
  const [period,  setPeriod]  = useState<Period>('week')
  const [type,    setType]    = useState<BriefingType>('W')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [result,   setResult]   = useState<BriefingResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    getPlayers().then(ps => {
      setPlayers(ps)
      if (ps.length > 0) setPlayer(ps[0].username)
    })
  }, [])

  useEffect(() => {
    if (period !== 'custom') {
      const { from, to } = periodDates(period)
      setDateFrom(from)
      setDateTo(to)
      setType(period === 'today' ? 'D' : 'W')
    }
  }, [period])

  async function handleGenerate() {
    if (!player || !dateFrom || !dateTo) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await generateBriefing({ player, type, dateFrom, dateTo })
      setResult(res)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate briefing')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Coaching Briefing</h1>

      {/* Selection panel */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Player</label>
            <select
              value={player}
              onChange={e => setPlayer(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {players.map(p => (
                <option key={p.username} value={p.username}>
                  {p.display_name ?? p.username}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as Period)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {period === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !player}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate Briefing'}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      {loading && <MyLoadingMessage message1="Generating briefing…" />}

      {result && <BriefingReport result={result} />}
    </div>
  )
}

export default function BriefingPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <BriefingContent />
    </Suspense>
  )
}
