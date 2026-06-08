'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import QuizMode from '@/src/ui/analysis/QuizMode'
import { getQuizQueue } from '@/src/lib/analysis/chessdb'

const QUIZ_ITEMS = [
  { heading: 'How to play',       body: 'Play your move by clicking or dragging a piece on the board. The 50 highest-priority habit positions are queued up automatically.' },
  { heading: 'Reveal phase',      body: 'After your move, see how it compares: your move, your usual habit move (if different), and Stockfish\'s best move — plus AI coaching advice for that position.' },
  { heading: 'Session score',     body: 'The bar above the board tracks positions attempted, good moves played, and your average CP loss for this session.' },
  { heading: 'Specific position', body: 'To practice a particular position, open it from the Habits page — you\'ll be taken straight there.' },
]

const SESSION_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2)

function QuizContent() {
  const searchParams  = useSearchParams()
  const fenParam      = searchParams.get('fen')
  const [queue, setQueue]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getQuizQueue(50).then(q => {
      // If a specific FEN was requested, bring it to the front
      if (fenParam) {
        const decoded = decodeURIComponent(fenParam)
        const idx = q.findIndex(p => p.pos_fen === decoded)
        if (idx > 0) {
          const [item] = q.splice(idx, 1)
          q.unshift(item)
        }
      }
      setQueue(q)
      setLoading(false)
    })
  }, [fenParam])

  if (loading) return <MyLoadingMessage message1="Loading quiz…" />

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-gray-600">Position Quiz</span>
        <MyHelp title='How to use' items={QUIZ_ITEMS} />
      </div>
      <QuizMode queue={queue} sessionId={SESSION_ID} />
    </div>
  )
}

export default function QuizPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <QuizContent />
    </Suspense>
  )
}
