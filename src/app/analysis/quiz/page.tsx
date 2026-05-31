'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import QuizMode from '@/src/ui/analysis/QuizMode'
import { getQuizQueue } from '@/src/lib/analysis/db'

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

  return <QuizMode queue={queue} sessionId={SESSION_ID} />
}

export default function QuizPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <QuizContent />
    </Suspense>
  )
}
