'use client'

import { useState, useEffect, useCallback } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import MyPagination from 'nextjs-shared/MyPagination'
import { ChessComGame } from '@/src/lib/chesscom'
import {
  fetchFilteredGames,
  fetchFilteredGamePages,
  GameFilters
} from '@/src/lib/actions/games'

interface GameListProps {
  username: string
  onSelectGame: (game: ChessComGame) => void
}

const RESULT_STYLES: Record<string, string> = {
  win: 'text-green-600 font-bold',
  loss: 'text-red-600 font-bold',
  draw: 'text-gray-500 font-bold'
}

export default function GameList({ username, onSelectGame }: GameListProps) {
  // Filter state
  const [filters, setFilters] = useState<GameFilters>({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(15)

  function updateFilter(key: keyof GameFilters, value: string) {
    setFilters(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else if (key === 'opponentRatingMin' || key === 'opponentRatingMax') {
        (next as any)[key] = parseInt(value, 10) || undefined
      } else {
        (next as any)[key] = value
      }
      return next
    })
    setCurrentPage(1)
  }

  const loadData = useCallback(async () => {
    if (!username) return
    setLoading(true)
    try {
      const [rows, pages] = await Promise.all([
        fetchFilteredGames(username, filters, currentPage, itemsPerPage),
        fetchFilteredGamePages(username, filters, itemsPerPage)
      ])
      setGames(rows)
      setTotalPages(pages)
    } catch (err) {
      console.error('Failed to load games:', err)
    } finally {
      setLoading(false)
    }
  }, [username, filters, currentPage, itemsPerPage])

  useEffect(() => {
    loadData()
  }, [loadData])

  function handleSelectGame(row: any) {
    const game: ChessComGame = {
      url: row.gd_game_url,
      pgn: row.gd_pgn,
      time_control: row.gd_time_control,
      time_class: row.gd_time_class,
      end_time: row.gd_end_time,
      rated: row.gd_is_rated,
      rules: 'chess',
      white: {
        username: row.gd_white_username,
        rating: row.gd_white_rating,
        result: row.gd_player_color === 'white'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      },
      black: {
        username: row.gd_black_username,
        rating: row.gd_black_rating,
        result: row.gd_player_color === 'black'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      }
    }
    ;(game as any)._gameId = row.gd_grid
    ;(game as any)._openingName = row.gd_opening_name
    ;(game as any)._ecoCode = row.gd_eco_code
    onSelectGame(game)
  }

  function handleReset() {
    setFilters({})
    setCurrentPage(1)
  }

  return (
    <MyBox title='Games'>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-xs'>
          <thead>
            {/* Header row */}
            <tr className='border-b border-gray-200 text-gray-500'>
              <th className='pb-1 pr-2'>Date</th>
              <th className='pb-1 pr-2'>Color</th>
              <th className='pb-1 pr-2'>Opponent</th>
              <th className='pb-1 pr-2'>Opp. Rating</th>
              <th className='pb-1 pr-2'>Result</th>
              <th className='pb-1 pr-2'>Time</th>
              <th className='pb-1 pr-2'>Opening</th>
              <th className='pb-1 pr-2'>ECO</th>
              <th className='pb-1'></th>
            </tr>
            {/* Filter row */}
            <tr className='border-b border-gray-300 bg-gray-50'>
              <td className='py-1 pr-2'>
                <div className='flex gap-0.5'>
                  <MyInput
                    type='date'
                    value={filters.dateFrom ?? ''}
                    onChange={e => updateFilter('dateFrom', e.target.value)}
                    overrideClass='w-28 text-xxs'
                    placeholder='From'
                  />
                  <MyInput
                    type='date'
                    value={filters.dateTo ?? ''}
                    onChange={e => updateFilter('dateTo', e.target.value)}
                    overrideClass='w-28 text-xxs'
                    placeholder='To'
                  />
                </div>
              </td>
              <td className='py-1 pr-2'>
                <MySelect
                  options={['', 'white', 'black']}
                  value={filters.color ?? ''}
                  onChange={e => updateFilter('color', e.target.value)}
                />
              </td>
              <td className='py-1 pr-2'>
                <MyInput
                  value={filters.opponent ?? ''}
                  onChange={e => updateFilter('opponent', e.target.value)}
                  placeholder='Filter...'
                  overrideClass='w-24'
                />
              </td>
              <td className='py-1 pr-2'>
                <div className='flex gap-0.5'>
                  <MyInput
                    type='number'
                    value={filters.opponentRatingMin ?? ''}
                    onChange={e => updateFilter('opponentRatingMin', e.target.value)}
                    placeholder='Min'
                    overrideClass='w-14'
                  />
                  <MyInput
                    type='number'
                    value={filters.opponentRatingMax ?? ''}
                    onChange={e => updateFilter('opponentRatingMax', e.target.value)}
                    placeholder='Max'
                    overrideClass='w-14'
                  />
                </div>
              </td>
              <td className='py-1 pr-2'>
                <MySelect
                  options={['', 'win', 'loss', 'draw']}
                  value={filters.result ?? ''}
                  onChange={e => updateFilter('result', e.target.value)}
                />
              </td>
              <td className='py-1 pr-2'>
                <MySelect
                  options={['', 'bullet', 'blitz', 'rapid', 'daily']}
                  value={filters.timeClass ?? ''}
                  onChange={e => updateFilter('timeClass', e.target.value)}
                />
              </td>
              <td className='py-1 pr-2'>
                <MyInput
                  value={filters.opening ?? ''}
                  onChange={e => updateFilter('opening', e.target.value)}
                  placeholder='Filter...'
                  overrideClass='w-28'
                />
              </td>
              <td className='py-1 pr-2'>
                <MyInput
                  value={filters.eco ?? ''}
                  onChange={e => updateFilter('eco', e.target.value)}
                  placeholder='e.g. B27'
                  overrideClass='w-16'
                />
              </td>
              <td className='py-1'>
                <MyButton onClick={handleReset} overrideClass='text-xxs px-1 h-5 bg-gray-400 hover:bg-gray-500'>
                  Reset
                </MyButton>
              </td>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className='py-4 text-center text-xs text-gray-500'>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && games.length === 0 && (
              <tr>
                <td colSpan={9} className='py-4 text-center text-xs text-gray-500'>
                  No games found. Try adjusting your filters or populate games first.
                </td>
              </tr>
            )}
            {!loading && games.map((row) => {
              const date = new Date(row.gd_end_time * 1000)

              return (
                <tr
                  key={row.gd_grid}
                  className='cursor-pointer border-b border-gray-100 hover:bg-blue-50'
                  onClick={() => handleSelectGame(row)}
                >
                  <td className='py-1.5 pr-2 whitespace-nowrap'>
                    {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className='py-1.5 pr-2'>
                    <span className={`inline-block h-3 w-3 rounded-full border border-gray-300 ${
                      row.gd_player_color === 'white' ? 'bg-white' : 'bg-gray-800'
                    }`} />
                  </td>
                  <td className='py-1.5 pr-2'>{row.gd_opponent_username}</td>
                  <td className='py-1.5 pr-2'>{row.gd_opponent_rating}</td>
                  <td className={`py-1.5 pr-2 ${RESULT_STYLES[row.gd_player_result]}`}>
                    {row.gd_player_result}
                  </td>
                  <td className='py-1.5 pr-2'>{row.gd_time_class}</td>
                  <td className='py-1.5 pr-2 max-w-40 truncate' title={row.gd_opening_name}>
                    {row.gd_opening_name || 'Unknown'}
                  </td>
                  <td className='py-1.5 pr-2 text-gray-400'>{row.gd_eco_code}</td>
                  <td className='py-1.5'>
                    <MyButton
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectGame(row)
                      }}
                      overrideClass='text-xxs px-2 py-0.5 h-5'
                    >
                      Analyze
                    </MyButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination + rows per page */}
      <div className='mt-3 flex items-center justify-between'>
        <MySelect
          label='Rows'
          options={['10', '15', '25', '50']}
          value={String(itemsPerPage)}
          onChange={e => {
            setItemsPerPage(parseInt(e.target.value, 10))
            setCurrentPage(1)
          }}
        />
        {totalPages > 1 && (
          <MyPagination
            totalPages={totalPages}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
          />
        )}
        <span className='text-xxs text-gray-400'>
          Page {currentPage} of {totalPages}
        </span>
      </div>
    </MyBox>
  )
}
