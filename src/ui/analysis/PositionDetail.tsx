'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chessboard } from 'react-chessboard'
import type { Square } from 'chess.js'
import type { PositionRow, MoveRow, EvaluationRow, InsightRow } from '@/src/lib/analysis/db'

interface GameHit {
  game_ref: string
  player: string
  move_played: string
  move_num: number | null
  cp_loss: number | null
}

interface PositionDetailProps {
  position: PositionRow | null
  moves: MoveRow[]
  posEval: EvaluationRow | null
  moveEvals: EvaluationRow[]
  insight: InsightRow | null
  games: GameHit[]
}

type Tab = 'moves' | 'advice' | 'history'

function cpBadge(cpLoss: number | null): { label: string; cls: string } {
  if (cpLoss === null) return { label: '—', cls: 'text-gray-400' }
  if (cpLoss > 150) return { label: 'BAD',  cls: 'bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (cpLoss > 75)  return { label: 'POOR', cls: 'bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (cpLoss > 25)  return { label: 'OK',   cls: 'bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  return { label: 'GOOD', cls: 'bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
}

export default function PositionDetail({
  position,
  moves,
  posEval,
  moveEvals,
  insight,
  games
}: PositionDetailProps) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('moves')

  if (!position) {
    return <div className="text-center py-12 text-gray-500">Position not found.</div>
  }

  const orientation = position.pos_color === 'b' ? 'black' : 'white'
  const bestMove    = posEval?.eva_best_move ?? null
  const habitMove   = moves[0]?.mov_san ?? null

  // Build arrow overlays: green=best, red=habit
  const customArrows: [Square, Square, string][] = []
  if (bestMove && bestMove.length >= 4) {
    customArrows.push([bestMove.slice(0, 2) as Square, bestMove.slice(2, 4) as Square, 'green'])
  }
  if (habitMove && habitMove !== bestMove) {
    const habitMov = moves[0]
    if (habitMov?.mov_uci && habitMov.mov_uci.length >= 4) {
      customArrows.push([habitMov.mov_uci.slice(0, 2) as Square, habitMov.mov_uci.slice(2, 4) as Square, 'red'])
    }
  }

  // Build move eval map
  const evalMap: Record<string, number | null> = {}
  for (const ev of moveEvals) {
    if (ev.eva_move_san) evalMap[ev.eva_move_san] = ev.eva_cp
  }

  const totalTimes = moves.reduce((s, m) => s + m.mov_times, 0)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'moves',   label: 'Your Moves' },
    { key: 'advice',  label: 'AI Advice' },
    { key: 'history', label: 'Game History' }
  ]

  return (
    <div className="max-w-5xl mx-auto p-4">
      <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        ← Back to Habits
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: board */}
        <div className="space-y-2">
          <Chessboard
            id="position-detail"
            position={position.pos_fen}
            boardWidth={400}
            arePiecesDraggable={false}
            boardOrientation={orientation}
            customArrows={customArrows}
          />
          <div className="text-xs text-gray-500 space-y-0.5">
            <div>Reached <strong>{position.pos_reached}</strong> times ·{' '}
              {position.pos_color === 'b' ? 'Black' : 'White'} to move</div>
            {posEval && (
              <div>
                Best: <span className="font-mono">{posEval.eva_best_move ?? '—'}</span>{' '}
                ({posEval.eva_cp != null ? `${posEval.eva_cp} cp` : '?'})
              </div>
            )}
          </div>
        </div>

        {/* Right: tabs */}
        <div className="space-y-3">
          <div className="flex border-b">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Your Moves */}
          {tab === 'moves' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase text-left border-b">
                    <th className="py-1.5 pr-3">Move</th>
                    <th className="py-1.5 pr-3 text-right">Times</th>
                    <th className="py-1.5 pr-3 text-right">Win%</th>
                    <th className="py-1.5 pr-3 text-right">Loss%</th>
                    <th className="py-1.5 pr-3 text-right">CP Loss</th>
                    <th className="py-1.5">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {moves.map(m => {
                    const cp    = evalMap[m.mov_san] ?? null
                    const badge = cpBadge(cp)
                    const winPct  = m.mov_times > 0 ? Math.round((m.mov_wins  / m.mov_times) * 100) : 0
                    const lossPct = m.mov_times > 0 ? Math.round((m.mov_losses / m.mov_times) * 100) : 0
                    return (
                      <tr key={m.mov_san} className="hover:bg-gray-50">
                        <td className="py-1.5 pr-3 font-mono font-medium">{m.mov_san}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {m.mov_times}
                          <span className="text-gray-400 text-xs ml-1">
                            ({totalTimes > 0 ? Math.round((m.mov_times / totalTimes) * 100) : 0}%)
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-green-700">{winPct}%</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{lossPct}%</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">
                          {cp != null ? `${cp}` : '—'}
                        </td>
                        <td className="py-1.5">
                          <span className={badge.cls}>{badge.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: AI Advice */}
          {tab === 'advice' && (
            <div className="space-y-3">
              {insight ? (
                <>
                  <h3 className="font-semibold text-gray-800">{insight.ins_theme}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{insight.ins_advice}</p>
                  <a
                    href={`/analysis/quiz?fen=${encodeURIComponent(position.pos_fen)}`}
                    className="inline-block mt-2 text-sm text-blue-600 hover:underline"
                  >
                    Practice this position →
                  </a>
                </>
              ) : (
                <div className="text-gray-400 text-sm italic">
                  No AI insight yet.{' '}
                  <a href="/api/analysis/generate-insights?limit=20" className="underline">Generate insights</a>
                </div>
              )}
            </div>
          )}

          {/* Tab: Game History */}
          {tab === 'history' && (
            <div className="overflow-x-auto">
              {games.length === 0 ? (
                <p className="text-gray-400 text-sm italic">No games recorded for this position.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase text-left border-b">
                      <th className="py-1.5 pr-3">Player</th>
                      <th className="py-1.5 pr-3">Move</th>
                      <th className="py-1.5 pr-3 text-right">Move #</th>
                      <th className="py-1.5 text-right">CP Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {games.map((g, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-1.5 pr-3 text-gray-700">{g.player}</td>
                        <td className="py-1.5 pr-3 font-mono">{g.move_played}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">
                          {g.move_num != null ? g.move_num : '—'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">
                          {g.cp_loss != null ? g.cp_loss : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
