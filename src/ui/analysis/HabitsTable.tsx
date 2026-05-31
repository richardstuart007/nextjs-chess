'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chessboard } from 'react-chessboard'

interface HabitRow {
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  ins_theme: string | null
  ins_advice: string | null
  ins_priority: number | null
  worst_move: string | null
  worst_move_times: number | null
  worst_move_pct: number | null
  avg_cp_loss: number | null
}

interface HabitsTableProps {
  rows: HabitRow[]
}

function cpColor(cp: number | null): string {
  if (cp === null) return 'text-gray-400'
  if (cp > 150)   return 'text-red-600 font-semibold'
  if (cp > 75)    return 'text-amber-600 font-semibold'
  return 'text-green-700'
}

function cpLabel(cp: number | null): string {
  if (cp === null) return '—'
  return `${cp} cp`
}

export default function HabitsTable({ rows }: HabitsTableProps) {
  const router = useRouter()
  const [expandedFen, setExpandedFen] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No habit data yet. Run the position tree builder and Stockfish evaluation first,
        then generate insights.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-3 py-2 w-24">Position</th>
            <th className="px-3 py-2">Theme</th>
            <th className="px-3 py-2 text-right">Reached</th>
            <th className="px-3 py-2">Worst Move</th>
            <th className="px-3 py-2 text-right">Avg CP Loss</th>
            <th className="px-3 py-2">Advice</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => {
            const isExpanded = expandedFen === row.pos_fen
            return (
              <tr
                key={row.pos_fen}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/analysis/position/${encodeURIComponent(row.pos_fen)}`)}
              >
                {/* Mini board */}
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <div className="w-20 h-20 shrink-0">
                    <Chessboard
                      id={`mini-${row.pos_fen.slice(0, 20)}`}
                      position={row.pos_fen}
                      boardWidth={80}
                      arePiecesDraggable={false}
                      boardOrientation={row.pos_color === 'b' ? 'black' : 'white'}
                    />
                  </div>
                </td>

                {/* Theme */}
                <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px]">
                  {row.ins_theme ?? <span className="text-gray-400 italic">No insight yet</span>}
                </td>

                {/* Reached */}
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {row.pos_reached}
                </td>

                {/* Worst move */}
                <td className="px-3 py-2 font-mono text-gray-700">
                  {row.worst_move
                    ? <>{row.worst_move} <span className="text-gray-400 text-xs">({row.worst_move_pct ?? 0}%)</span></>
                    : '—'
                  }
                </td>

                {/* CP loss */}
                <td className={`px-3 py-2 text-right tabular-nums ${cpColor(row.avg_cp_loss)}`}>
                  {cpLabel(row.avg_cp_loss)}
                </td>

                {/* Advice — expandable */}
                <td
                  className="px-3 py-2 text-gray-600 max-w-xs"
                  onClick={e => { e.stopPropagation(); setExpandedFen(isExpanded ? null : row.pos_fen) }}
                >
                  {row.ins_advice ? (
                    isExpanded
                      ? <span>{row.ins_advice}</span>
                      : <span className="line-clamp-1">{row.ins_advice}</span>
                  ) : (
                    <span className="text-gray-400 italic text-xs">No advice yet</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
