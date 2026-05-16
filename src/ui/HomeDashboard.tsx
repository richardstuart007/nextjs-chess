'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MyButton } from 'nextjs-shared/MyButton'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import GameList from '@/src/ui/games/GameList'
import RatingChart from '@/src/ui/charts/RatingChart'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import TerminationChart from '@/src/ui/charts/TerminationChart'
import MyBox from 'nextjs-shared/MyBox'
import { getPlayer } from '@/src/lib/actions/players'
import { ChessComGame } from '@/src/lib/chesscom'

interface Player {
  username: string
  display_name: string | null
}

interface HomeDashboardProps {
  players: Player[]
  lastAnalyzedGameId?: number
}

export default function HomeDashboard({ players, lastAnalyzedGameId }: HomeDashboardProps) {
  const router = useRouter()
  const [dbPlayers, setDbPlayers] = useState<any[]>([])
  const [tab, setTab] = useState<'games' | 'graph' | 'openings' | 'endings'>(() => {
    try { return (sessionStorage.getItem('chess-tab') as any) ?? 'games' } catch { return 'games' }
  })
  const [sharedGames, setSharedGames] = useState<any[]>([])

  useEffect(() => {
    async function loadAll() {
      const results = await Promise.all(players.map(p => getPlayer(p.username)))
      setDbPlayers(results)
    }
    loadAll()
  }, [players.map(p => p.username).join(',')])

  function changeTab(t: 'games' | 'graph' | 'openings' | 'endings') {
    setTab(t)
    try { sessionStorage.setItem('chess-tab', t) } catch {}
  }

  function handleSelectGame(game: ChessComGame, username: string) {
    const gameId = (game as any)._gameId
    if (gameId) {
      router.push(`/analyze?game=${gameId}&user=${encodeURIComponent(username)}`)
    }
  }

  if (players.length === 0) {
    return (
      <MyBox title='No Players'>
        <p className='text-xs text-gray-600'>
          No players in the database yet.{' '}
          <a href='/maintenance' className='text-blue-600 underline'>Go to Maintenance</a>{' '}
          to add players.
        </p>
      </MyBox>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3'>
        {players.map((p, i) => {
          const db = dbPlayers[i]
          const ratings: Record<string, number> = {}
          if (db?.pl_rating_blitz) ratings['blitz'] = db.pl_rating_blitz
          return (
            <PlayerProfile
              key={p.username}
              username={db?.pl_username ?? p.username}
              displayName={db?.pl_display_name ?? undefined}
              avatar={db?.pl_avatar}
              ratings={Object.keys(ratings).length > 0 ? ratings : undefined}
            />
          )
        })}
      </div>

      <div className='flex border-b border-gray-200'>
        <button
          onClick={() => changeTab('games')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'games'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Games
        </button>
        <button
          onClick={() => changeTab('graph')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'graph'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Rating
        </button>
        <button
          onClick={() => changeTab('openings')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'openings'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Openings
        </button>
        <button
          onClick={() => changeTab('endings')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'endings'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Endings
        </button>
      </div>

      <div className={tab === 'games' ? '' : 'hidden'}>
        <GameList
          players={players.map(p => ({ username: p.username, displayName: p.display_name }))}
          onSelectGame={handleSelectGame}
          onGamesChange={setSharedGames}
          lastAnalyzedGameId={lastAnalyzedGameId}
        />
      </div>

      <div className={tab === 'graph' ? '' : 'hidden'}>
        <RatingChart games={sharedGames} />
      </div>

      <div className={tab === 'openings' ? '' : 'hidden'}>
        <OpeningScoreChart players={players.map(p => p.username)} onSelectGame={handleSelectGame} lastAnalyzedGameId={lastAnalyzedGameId} />
      </div>

      <div className={tab === 'endings' ? '' : 'hidden'}>
        <TerminationChart players={players.map(p => p.username)} />
      </div>
    </div>
  )
}
