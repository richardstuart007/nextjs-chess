'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MyButton } from 'nextjs-shared/MyButton'
import MyBox from 'nextjs-shared/MyBox'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import MaintenancePanel from '@/src/ui/player/MaintenancePanel'
import GameList from '@/src/ui/games/GameList'
import SyncProgress from '@/src/ui/player/SyncProgress'
import {
  ChessComPlayer,
  ChessComRatings,
  ChessComGame,
  fetchPlayer,
  fetchPlayerStats
} from '@/src/lib/chesscom'
import { getPlayer, upsertPlayer } from '@/src/lib/actions/players'
import { getGameCount, getDeconGameCount } from '@/src/lib/actions/games'
import { syncGames } from '@/src/lib/actions/sync'

export default function Home() {
  const router = useRouter()
  const [player, setPlayer] = useState<ChessComPlayer | null>(null)
  const [ratings, setRatings] = useState<ChessComRatings | null>(null)
  const [dbPlayer, setDbPlayer] = useState<any>(null)
  const [gameCount, setGameCount] = useState(0)
  const [deconCount, setDeconCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncId, setSyncId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [gameListKey, setGameListKey] = useState(0)

  // Auto-load the default player on mount
  useEffect(() => {
    const defaultUser = process.env.NEXT_PUBLIC_PRIMARY_USERNAME ?? 'stricade'
    handleSearch(defaultUser).catch(err => {
      console.error('Auto-load failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to auto-load player')
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(username: string) {
    setError('')
    setLoading(true)
    setPlayer(null)
    setRatings(null)
    setDbPlayer(null)
    setGameCount(0)
    setDeconCount(0)

    try {
      const [playerData, statsData] = await Promise.all([
        fetchPlayer(username),
        fetchPlayerStats(username)
      ])

      setPlayer(playerData)
      setRatings(statsData)

      const ratingsFlat: Record<string, number> = {}
      for (const [key, val] of Object.entries(statsData)) {
        ratingsFlat[`rating_${key}`] = val.last.rating
      }

      await upsertPlayer({
        username: playerData.username.toLowerCase(),
        avatar: playerData.avatar,
        display_name: playerData.name,
        joined: playerData.joined,
        last_online: playerData.last_online,
        url: playerData.url,
        is_primary: playerData.username.toLowerCase() === (process.env.NEXT_PUBLIC_PRIMARY_USERNAME ?? 'stricade').toLowerCase(),
        ...ratingsFlat
      })

      const existingPlayer = await getPlayer(username)
      setDbPlayer(existingPlayer)

      const [rawCount, decon] = await Promise.all([
        getGameCount(username),
        getDeconGameCount(username)
      ])
      setGameCount(rawCount)
      setDeconCount(decon)
      setGameListKey(k => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch player data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync(syncType: 'full_replace' | 'refresh') {
    if (!player) return
    setSyncing(true)
    setSyncId(null)

    try {
      const result = await syncGames(player.username, syncType)
      setSyncId(result.syncId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
      setSyncing(false)
    }
  }

  async function handleSyncComplete() {
    setSyncing(false)
    setSyncId(null)
    if (player) {
      const [refreshedPlayer, rawCount] = await Promise.all([
        getPlayer(player.username),
        getGameCount(player.username)
      ])
      setDbPlayer(refreshedPlayer)
      setGameCount(rawCount)
    }
  }

  async function handleDeconComplete() {
    if (player) {
      const decon = await getDeconGameCount(player.username)
      setDeconCount(decon)
      setGameListKey(k => k + 1)
    }
  }

  function handleSelectGame(game: ChessComGame) {
    const gameId = (game as any)._gameId
    if (gameId) {
      router.push(`/analyze?game=${gameId}&user=${encodeURIComponent(player?.username ?? '')}`)
    }
  }

  function handleFreeAnalysis() {
    router.push(`/analyze?mode=free&user=${encodeURIComponent(player?.username ?? '')}`)
  }

  return (
    <div className='space-y-4'>
      {/* Top row: Player Profile + Maintenance */}
      <div className='grid grid-cols-2 gap-3'>
        <div className='h-full [&>div]:h-full [&>div]:mb-0'>
          {player && ratings ? (
            <PlayerProfile
              username={player.username}
              avatar={player.avatar}
              joinDate={new Date(player.joined * 1000).toLocaleDateString()}
              ratings={Object.fromEntries(
                Object.entries(ratings).map(([k, v]) => [k, v.last.rating])
              )}
            />
          ) : (
            <MyBox title='Player Profile'>
              <p className='text-xs text-gray-400'>{loading ? 'Loading...' : 'Search for a player'}</p>
            </MyBox>
          )}
        </div>
        <div className='h-full [&>div]:h-full [&>div]:mb-0'>
          <MaintenancePanel
            username={player?.username ?? (process.env.NEXT_PUBLIC_PRIMARY_USERNAME ?? 'stricade')}
            rawCount={gameCount}
            deconCount={deconCount}
            onSearch={handleSearch}
            onSync={handleSync}
            onDeconComplete={handleDeconComplete}
            loading={loading}
            syncing={syncing}
            error={error}
          />
        </div>
      </div>

      {/* Sync progress */}
      {syncing && syncId && (
        <SyncProgress syncId={syncId} onComplete={handleSyncComplete} />
      )}

      {/* Sync prompt if no raw games */}
      {player && gameCount === 0 && !syncing && !loading && (
        <MyBox title='No Games Found'>
          <p className='text-xs text-gray-600 mb-2'>
            No games in the database for {player.username}. Download all games from chess.com?
          </p>
          <MyButton onClick={() => handleSync('full_replace')}>
            Download All Games
          </MyButton>
        </MyBox>
      )}

      <MyButton
        onClick={handleFreeAnalysis}
        overrideClass='bg-green-600 hover:bg-green-700 px-4'
      >
        Free Analysis — Start from empty board
      </MyButton>

      {/* Game list */}
      {player && deconCount > 0 && (
        <GameList
          key={gameListKey}
          username={player.username}
          onSelectGame={handleSelectGame}
        />
      )}
    </div>
  )
}
