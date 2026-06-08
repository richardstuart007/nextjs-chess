'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { MyHelp } from 'nextjs-shared/MyHelp'
import PipelineHelp from '@/src/ui/analysis/PipelineHelp'
import { MyHelpStep } from 'nextjs-shared/MyHelpStep'
import { runCronSync } from '@/src/lib/actions/cron'
import { getPlayers } from '@/src/lib/actions/players'
import { getPipelineStatus, getPipelineStatusForRange, refreshStep1, refreshStep2, refreshStep3, refreshStep4, refreshStep5, type PipelineStatus, type PipelineStatusRange } from '@/src/lib/actions/pipelineStatus'
import { getPipelineRates } from '@/src/lib/actions/pipelineLog'
import { getUnenrichedGames, type UnenrichedGame } from '@/src/lib/analysis/chessdb'
import { enrichGamesStockfish } from '@/src/lib/analysis/enrichGamesStockfish'
import { enrichPositionsStockfish } from '@/src/lib/analysis/enrichPositionsStockfish'
import EvalProgress from '@/src/ui/analysis/EvalProgress'

const TODAY     = new Date().toISOString().slice(0, 10)
const THIS_YEAR = new Date().getFullYear()

function n(val: number | undefined): string {
  return val === undefined ? '—' : val.toLocaleString()
}

function eta(remaining: number | undefined, msPerItem: number | null): string {
  if (!remaining || !msPerItem) return ''
  const ms = remaining * msPerItem
  if (ms < 60_000)    return `~${Math.round(ms / 1_000)}s`
  if (ms < 3_600_000) return `~${Math.round(ms / 60_000)}m`
  return `~${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`
}

const SQL_STATUS_1 =
`SELECT 'tgr_gamesraw'   AS tbl, COUNT(*) FROM tgr_gamesraw
UNION ALL SELECT 'tgd_gamesdecon', COUNT(*) FROM tgd_gamesdecon;`

const SQL_STATUS_2 =
`SELECT 'enriched'  AS status, COUNT(*) FROM ten_enrichment WHERE en_enriched = TRUE
UNION ALL
SELECT 'remaining', COUNT(*) FROM tgr_gamesraw r
LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
WHERE e.en_enid IS NULL OR e.en_enriched = FALSE;`

const SQL_STATUS_3 =
`SELECT 'games processed' AS status,
  (SELECT COUNT(*) FROM (SELECT DISTINCT gam_game_ref, gam_player FROM tgam_game_positions) t)
UNION ALL
SELECT 'games remaining',
  COUNT(*) FROM tgr_gamesraw r
  WHERE (r.gr_raw_data->>'pgn') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tgam_game_positions
      WHERE gam_game_ref = r.gr_chesscom_uuid AND gam_player = r.gr_player_username
    )
UNION ALL SELECT 'positions',      COUNT(*) FROM tpos_positions
UNION ALL SELECT 'moves',          COUNT(*) FROM tmov_moves
UNION ALL SELECT 'game-positions', COUNT(*) FROM tgam_game_positions;`

function sqlRange1(from: string, to: string): string {
  return (
`SELECT 'tgr_gamesraw'   AS tbl, COUNT(*) FROM tgr_gamesraw
WHERE TO_TIMESTAMP(gr_end_time) >= '${from}'::date
  AND TO_TIMESTAMP(gr_end_time) < ('${to}'::date + interval '1 day')
UNION ALL
SELECT 'tgd_gamesdecon', COUNT(*) FROM tgd_gamesdecon d
JOIN tgr_gamesraw r ON r.gr_grid = d.gd_grid
WHERE TO_TIMESTAMP(gr_end_time) >= '${from}'::date
  AND TO_TIMESTAMP(gr_end_time) < ('${to}'::date + interval '1 day');`
  )
}

function sqlRange2(from: string, to: string): string {
  return (
`SELECT 'enriched'  AS status, COUNT(*) FROM ten_enrichment e
JOIN tgr_gamesraw r ON r.gr_grid = e.en_grid
WHERE e.en_enriched = TRUE
  AND TO_TIMESTAMP(r.gr_end_time) >= '${from}'::date
  AND TO_TIMESTAMP(r.gr_end_time) < ('${to}'::date + interval '1 day')
UNION ALL
SELECT 'remaining', COUNT(*) FROM tgr_gamesraw r
LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
WHERE (e.en_enid IS NULL OR e.en_enriched = FALSE)
  AND TO_TIMESTAMP(r.gr_end_time) >= '${from}'::date
  AND TO_TIMESTAMP(r.gr_end_time) < ('${to}'::date + interval '1 day');`
  )
}

function sqlRange3(from: string, to: string): string {
  return (
`SELECT 'games processed' AS status, COUNT(*) FROM (
  SELECT DISTINCT gp.gam_game_ref, gp.gam_player
  FROM tgam_game_positions gp
  JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
  WHERE TO_TIMESTAMP(r.gr_end_time) >= '${from}'::date
    AND TO_TIMESTAMP(r.gr_end_time) < ('${to}'::date + interval '1 day')
) t
UNION ALL
SELECT 'games remaining', COUNT(*) FROM tgr_gamesraw r
WHERE (r.gr_raw_data->>'pgn') IS NOT NULL
  AND TO_TIMESTAMP(r.gr_end_time) >= '${from}'::date
  AND TO_TIMESTAMP(r.gr_end_time) < ('${to}'::date + interval '1 day')
  AND NOT EXISTS (
    SELECT 1 FROM tgam_game_positions
    WHERE gam_game_ref = r.gr_chesscom_uuid AND gam_player = r.gr_player_username
  );`
  )
}

const SQL_STATUS_4 =
`SELECT 'evaluated' AS status, COUNT(*) FROM teva_evaluations WHERE eva_move_san IS NULL
UNION ALL
SELECT 'remaining', COUNT(*) FROM tpos_positions p
LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
WHERE e.eva_id IS NULL;`

const SQL_STATUS_5 =
`SELECT 'insights'  AS status, COUNT(*) FROM tins_insights
UNION ALL
SELECT 'remaining', COUNT(*) FROM tpos_positions p
LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
WHERE i.ins_id IS NULL
  AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL);`

function ColorDot({ color }: { color: string }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1 border ${
      color === 'white' ? 'bg-gray-200 border-gray-400' : 'bg-gray-800 border-gray-800'
    }`} />
  )
}

function ResultBadge({ result }: { result: string }) {
  const cls =
    result === 'win'  ? 'bg-green-100 text-green-700' :
    result === 'loss' ? 'bg-red-100   text-red-600'   :
                        'bg-gray-100  text-gray-600'
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{result}</span>
}

function StatusBadge({ complete }: { complete: boolean | null }) {
  if (complete === null) return null
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
      complete ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    }`}>
      {complete ? 'Completed' : 'Incomplete'}
    </span>
  )
}

export default function PipelinePage() {
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])

  // ── Global parameters (shared by all steps) ────────────────────────────────
  const [globalDateFrom,  setGlobalDateFrom]  = useState(`${THIS_YEAR}-01-01`)
  const [globalDateTo,    setGlobalDateTo]    = useState(TODAY)
  const [globalDepth,     setGlobalDepth]     = useState(16)
  const [globalBatchSize, setGlobalBatchSize] = useState(50)

  // ── Per-step status state ──────────────────────────────────────────────────
  const [s1, setS1] = useState<{ allRaw: number; allDecon: number; rangeRaw: number; rangeDecon: number } | null>(null)
  const [s2, setS2] = useState<{ allEnriched: number; allRemaining: number; rangeEnriched: number; rangeRemaining: number } | null>(null)
  const [s3, setS3] = useState<{ allProcessed: number; allRemaining: number; allPositions: number; rangeProcessed: number; rangeRemaining: number } | null>(null)
  const [s4, setS4] = useState<{ evaluated: number; remaining: number; rangeEvaluated: number; rangeRemaining: number } | null>(null)
  const [s5, setS5] = useState<{ insights: number; remaining: number; rangeInsights: number; rangeRemaining: number } | null>(null)
  const [s1Loading, setS1Loading] = useState(false)
  const [s2Loading, setS2Loading] = useState(false)
  const [s3Loading, setS3Loading] = useState(false)
  const [s4Loading, setS4Loading] = useState(false)
  const [s5Loading, setS5Loading] = useState(false)
  const [rates, setRates] = useState<{ step2: number|null; step3: number|null; step4: number|null; step5: number|null } | null>(null)

  async function doRefreshStep1() { setS1Loading(true); setS1(await refreshStep1(globalDateFrom, globalDateTo)); setS1Loading(false) }
  async function doRefreshStep2() { setS2Loading(true); setS2(await refreshStep2(globalDateFrom, globalDateTo)); setS2Loading(false) }
  async function doRefreshStep3() { setS3Loading(true); setS3(await refreshStep3(globalDateFrom, globalDateTo)); setS3Loading(false) }
  async function doRefreshStep4() { setS4Loading(true); setS4(await refreshStep4(globalDateFrom, globalDateTo)); setS4Loading(false) }
  async function doRefreshStep5() { setS5Loading(true); setS5(await refreshStep5(globalDateFrom, globalDateTo)); setS5Loading(false) }

  useEffect(() => {
    async function load() {
      const ps = await getPlayers()
      setPlayers(ps)
      const [all, range, r] = await Promise.all([getPipelineStatus(), getPipelineStatusForRange(`${THIS_YEAR}-01-01`, TODAY), getPipelineRates()])
      setRates(r)
      setS1({ allRaw: all.gamesraw, allDecon: all.gamesdecon, rangeRaw: range.gamesraw, rangeDecon: range.gamesdecon })
      setS2({ allEnriched: all.enriched, allRemaining: all.enrichmentRemaining, rangeEnriched: range.enriched, rangeRemaining: range.enrichmentRemaining })
      setS3({ allProcessed: all.treeGamesProcessed, allRemaining: all.treeGamesRemaining, allPositions: all.positions, rangeProcessed: range.treeGamesProcessed, rangeRemaining: range.treeGamesRemaining })
      const s4init = await refreshStep4(`${THIS_YEAR}-01-01`, TODAY)
      setS4(s4init)
      const s5init = await refreshStep5(`${THIS_YEAR}-01-01`, TODAY)
      setS5(s5init)
    }
    load()
  }, [])

  // ── Step 1: Game Sync ──────────────────────────────────────────────────────
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ players: { username: string; inserted: number; deconstructed: number }[] } | null>(null)
  const [syncError,   setSyncError]   = useState('')

  async function handleGameSync() {
    setSyncRunning(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const result = await runCronSync()
      setSyncResult(result)
      getPipelineRates().then(setRates)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncRunning(false)
    }
  }

  // ── Step 2: Stockfish Analysis ─────────────────────────────────────────────
  const [allGames,      setAllGames]      = useState<UnenrichedGame[]>([])
  const [selected,      setSelected]      = useState<Set<number>>(new Set())
  const [gamesLoading,  setGamesLoading]  = useState(false)
  const [gamesLoaded,   setGamesLoaded]   = useState(false)
  const [stockfishDone, setStockfishDone] = useState(false)

  const [serverRunning, setServerRunning] = useState(false)
  const [serverResult,  setServerResult]  = useState<{ processed: number; errors: number; skipped: number } | null>(null)
  const [serverError,   setServerError]   = useState('')

  async function handleServerEnrich() {
    setServerRunning(true)
    setServerResult(null)
    setServerError('')
    try {
      const result = await enrichGamesStockfish({
        dateFrom: globalDateFrom || undefined,
        dateTo:   globalDateTo   || undefined,
        depth:    globalDepth,
        limit:    globalBatchSize,
      })
      setServerResult(result)
      getPipelineRates().then(setRates)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setServerRunning(false)
    }
  }

  async function handleLoadGames() {
    setGamesLoading(true)
    setGamesLoaded(false)
    setStockfishDone(false)
    setAllGames([])
    setSelected(new Set())
    try {
      const rows = await getUnenrichedGames(0, {
        dateFrom: globalDateFrom || undefined,
        dateTo:   globalDateTo   || undefined,
      })
      setAllGames(rows)
      setSelected(new Set(rows.map(r => r.grid)))
      setGamesLoaded(true)
    } finally {
      setGamesLoading(false)
    }
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

  // ── Step 3: Build Position Tree ────────────────────────────────────────────
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ ok: boolean; gamesProcessed?: number; positions?: number; moves?: number; errors?: number; error?: string } | null>(null)

  async function handleBuildTree() {
    setTreeRunning(true)
    setTreeResult(null)
    try {
      const params = new URLSearchParams({ limit: '0' })
      if (globalDateFrom) params.set('dateFrom', globalDateFrom)
      if (globalDateTo)   params.set('dateTo',   globalDateTo)
      const res  = await fetch(`/api/analysis/build-tree?${params}`)
      const data = await res.json()
      if (!data.ok) { setTreeResult({ ok: false, error: data.error }); return }
      setTreeResult({ ok: true, gamesProcessed: data.gamesProcessed, positions: data.positions, moves: data.moves, errors: data.errors })
      getPipelineRates().then(setRates)
    } catch (err) {
      setTreeResult({ ok: false, error: String(err) })
    } finally {
      setTreeRunning(false)
    }
  }

  // ── Step 4: Evaluate Positions ────────────────────────────────────────────
  const [posRunning,     setPosRunning]     = useState(false)
  const [posResult,      setPosResult]      = useState<{ processed: number; errors: number; remaining: number } | null>(null)
  const [posError,       setPosError]       = useState('')
  const [posBrowserDone, setPosBrowserDone] = useState(false)

  async function handleEvaluatePositions() {
    setPosRunning(true)
    setPosResult(null)
    setPosError('')
    try {
      const result = await enrichPositionsStockfish({ limit: globalBatchSize, depth: globalDepth, dateFrom: globalDateFrom, dateTo: globalDateTo })
      setPosResult(result)
      getPipelineRates().then(setRates)
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPosRunning(false)
    }
  }

  // ── Step 5: Generate AI Insights ───────────────────────────────────────────
  const [insightsRunning, setInsightsRunning] = useState(false)
  const [insightsResult,  setInsightsResult]  = useState<{ ok: boolean; processed?: number; errors?: number; error?: string } | null>(null)

  async function handleGenerateInsights() {
    setInsightsRunning(true)
    setInsightsResult(null)
    try {
      const insightParams = new URLSearchParams({ limit: String(globalBatchSize) })
      if (globalDateFrom) insightParams.set('dateFrom', globalDateFrom)
      if (globalDateTo)   insightParams.set('dateTo',   globalDateTo)
      const res  = await fetch(`/api/analysis/generate-insights?${insightParams}`)
      const data = await res.json()
      setInsightsResult(data)
      getPipelineRates().then(setRates)
    } catch (err) {
      setInsightsResult({ ok: false, error: String(err) })
    } finally {
      setInsightsRunning(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className='space-y-4 relative'>

      <div className='flex items-center gap-2'>
        <h2 className='text-sm font-bold text-gray-800'>Analysis Pipeline</h2>
        <PipelineHelp />
      </div>

      {/* Global parameters — shared by all steps */}
      <MyBox>
        <div className='flex flex-wrap items-end gap-4'>
          <div>
            <p className='text-xxs text-gray-500 mb-0.5'>Date from</p>
            <MyInput type='date' value={globalDateFrom} max={TODAY}
              onChange={e => { setGlobalDateFrom(e.target.value); setS1(null); setS2(null); setS3(null); setS4(null); setS5(null) }} />
          </div>
          <div>
            <p className='text-xxs text-gray-500 mb-0.5'>Date to</p>
            <MyInput type='date' value={globalDateTo} max={TODAY}
              onChange={e => { setGlobalDateTo(e.target.value); setS1(null); setS2(null); setS3(null); setS4(null); setS5(null) }} />
          </div>
          <div>
            <p className='text-xxs text-gray-500 mb-0.5'>Stockfish depth</p>
            <MyInput type='number' value={globalDepth} min={8} max={24}
              onChange={e => setGlobalDepth(Math.min(24, parseInt(e.target.value) || 16))}
              overrideClass='w-16' />
          </div>
          <div>
            <p className='text-xxs text-gray-500 mb-0.5'>Batch size</p>
            <MyInput type='number' value={globalBatchSize} min={1} max={1000}
              onChange={e => setGlobalBatchSize(Math.max(1, parseInt(e.target.value) || 50))}
              overrideClass='w-20' />
          </div>
        </div>
      </MyBox>

      {/* Step 1 */}
      <MyBox>
        <div className='flex items-center gap-2 mb-2'>
          <h3 className='text-xs font-bold'>1. Game Sync — All Players</h3>
          <MyHelpStep
            title='1. Game Sync — All Players'
            input={['chess.com REST API — https://api.chess.com/pub/player/{username}/games/{year}/{month}']}
            processing="Downloads all new games from chess.com for every registered player. For each new game, inserts a raw record into tgr_gamesraw (full PGN + complete JSON response), then deconstructs it into tgd_gamesdecon, extracting opening name, ECO code, result, player and opponent ratings, time class and termination type. Updates each player's latest rating per time class in tplr_player_ratings. Skips games already in the database."
            output={[
              'tgr_gamesraw — one row per game per player: raw PGN and complete JSON response from chess.com',
              'tgd_gamesdecon — parsed game fields: opening name, ECO code, result, player / opponent ratings, time class, termination',
              'tplr_player_ratings — latest rating per player per time class',
            ]}
            consumers={[
              'tgr_gamesraw → Step 2 Stockfish Analysis (enrichGamesStockfish / EvalProgress), Step 3 Build Position Tree (buildPositionTree)',
              'tgd_gamesdecon → GameList (games list on dashboard), analysis filters',
              'tplr_player_ratings → PlayerProfile rating display on dashboard',
            ]}
          />
          <MyButton onClick={doRefreshStep1} disabled={s1Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s1Loading ? '…' : '↻'}</MyButton>
        </div>
        <div className='space-y-1 mb-3'>
          <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
            <span className='font-medium text-gray-400 w-8'>All</span>
            <span>tgr_gamesraw: <strong className='text-gray-800'>{n(s1?.allRaw)}</strong></span>
            <span className='text-gray-300'>·</span>
            <span>tgd_gamesdecon: <strong className='text-gray-800'>{n(s1?.allDecon)}</strong></span>
            <span className='text-gray-300'>·</span>
            <StatusBadge complete={s1 === null ? null : s1.allRaw === s1.allDecon} />
            <MyHelp label='SQL' title='Game Sync — Status SQL (All)' text={SQL_STATUS_1} />
          </div>
          <div className='flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md text-xs text-gray-600'>
            <span className='font-medium text-blue-400 w-12 shrink-0'>Range</span>
            <span>tgr_gamesraw: <strong className='text-gray-800'>{n(s1?.rangeRaw)}</strong></span>
            <span className='text-gray-300'>·</span>
            <span>tgd_gamesdecon: <strong className='text-gray-800'>{n(s1?.rangeDecon)}</strong></span>
            <span className='text-gray-300'>·</span>
            <StatusBadge complete={s1 === null ? null : s1.rangeRaw === s1.rangeDecon} />
            <MyHelp label='SQL' title='Game Sync — Status SQL (Date Range)' text={sqlRange1(globalDateFrom, globalDateTo)} />
          </div>
        </div>
        <div className='flex items-center gap-2 mb-2'>
          <MyButton onClick={handleGameSync} disabled={syncRunning}>
            {syncRunning ? 'Syncing...' : 'Run Game Sync'}
          </MyButton>
        </div>
        {syncError && <p className='text-xs text-red-600'>{syncError}</p>}
        {syncResult && (
          <div className='mt-2 text-xs text-gray-700 space-y-1'>
            {syncResult.players.map(p => (
              <div key={p.username}>
                {p.username}: {p.inserted} inserted, {p.deconstructed} deconstructed
              </div>
            ))}
          </div>
        )}
      </MyBox>

      {/* Step 2 */}
      <MyBox>
        <div className='space-y-3'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>2. Stockfish Analysis</h3>
            <MyHelpStep
              title='2. Stockfish Analysis'
              input={['tgr_gamesraw — PGN and game UUID for each unenriched game']}
              processing='Replays every move in each game and evaluates with Stockfish. Calculates centipawn loss per move — how much worse the played move was compared to the engine best. Skips already-enriched games.'
              output={['ten_enrichment — one row per game per player: avg CP loss, blunder count (>200 CP), mistake count (>100 CP), accuracy %, critical move number and CP drop, game phase of critical moment, lead changes, volatility']}
              consumers={['Analysis pages (Habits, Quiz, Briefing) — per-game performance statistics']}
            />
            <MyButton onClick={doRefreshStep2} disabled={s2Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s2Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-gray-400 w-8'>All</span>
              <span>enriched: <strong className='text-gray-800'>{n(s2?.allEnriched)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s2?.allRemaining)}</strong></span>
              {eta(s2?.allRemaining, rates?.step2 ?? null) && <span className='text-gray-400 text-xs'>{eta(s2?.allRemaining, rates?.step2 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s2 === null ? null : s2.allRemaining === 0} />
              <MyHelp label='SQL' title='Stockfish Analysis — Status SQL (All)' text={SQL_STATUS_2} />
            </div>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-blue-400 w-12 shrink-0'>Range</span>
              <span>enriched: <strong className='text-gray-800'>{n(s2?.rangeEnriched)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s2?.rangeRemaining)}</strong></span>
              {eta(s2?.rangeRemaining, rates?.step2 ?? null) && <span className='text-gray-400 text-xs'>{eta(s2?.rangeRemaining, rates?.step2 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s2 === null ? null : s2.rangeRemaining === 0} />
              <MyHelp label='SQL' title='Stockfish Analysis — Status SQL (Date Range)' text={sqlRange2(globalDateFrom, globalDateTo)} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleServerEnrich} disabled={serverRunning}>
              {serverRunning ? 'Running...' : 'Run Server Stockfish'}
            </MyButton>
            <MyHelp label='Help' title='Server-side Stockfish' text='Runs the native Stockfish binary on the server (C:/Users/richa/tools/stockfish/stockfish.exe). Approximately 2–5× faster than browser WASM. Does not require the browser tab to stay open — safe to navigate away while it runs. Processes games in batches; click again to continue. Runs over all games in the selected date range — no individual game selection.' />
            <MyButton onClick={handleLoadGames} disabled={gamesLoading}>
              {gamesLoading ? 'Loading...' : 'Selected Games Stockfish'}
            </MyButton>
            <MyHelp label='Help' title='Browser Stockfish' text='Runs the Stockfish chess engine as a WebAssembly module directly in your browser. Lets you select individual games to analyse. Requires this browser tab to remain open — navigating away stops the analysis mid-run. Produces a list of games which are pre-selected to run Stockfish evaluation against.' />
          </div>

          {gamesLoaded && (
            <div className='border rounded-lg overflow-hidden'>
              <div className='flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b'>
                <span className='text-xs text-gray-700'>
                  {allGames.length} game{allGames.length !== 1 ? 's' : ''} found
                  {allGames.length > 0 && <> · <strong>{selected.size}</strong> selected</>}
                </span>
                {allGames.length > 0 && (
                  <MyButton onClick={toggleAll} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:underline'>
                    {selected.size === allGames.length ? 'Deselect all' : 'Select all'}
                  </MyButton>
                )}
              </div>
              {allGames.length === 0 ? (
                <p className='px-3 py-4 text-xs text-gray-500 text-center'>No unenriched games for these filters.</p>
              ) : (
                <div className='overflow-y-auto max-h-48'>
                  <table className='w-full text-xs'>
                    <tbody className='divide-y divide-gray-100'>
                      {allGames.map(g => (
                        <tr key={g.grid} onClick={() => toggleOne(g.grid)}
                          className={`cursor-pointer hover:bg-gray-50 ${selected.has(g.grid) ? '' : 'opacity-40'}`}>
                          <td className='px-2 py-1'>
                            <input type='checkbox' checked={selected.has(g.grid)}
                              onChange={() => toggleOne(g.grid)}
                              onClick={e => e.stopPropagation()} />
                          </td>
                          <td className='px-2 py-1 text-gray-500 tabular-nums whitespace-nowrap'>{g.end_date}</td>
                          <td className='px-2 py-1'>
                            <span className='flex items-center'>
                              <ColorDot color={g.color} />
                              <span className='text-gray-600 capitalize'>{g.color}</span>
                            </span>
                          </td>
                          <td className='px-2 py-1 text-gray-700'>{g.opponent}</td>
                          <td className='px-2 py-1'><ResultBadge result={g.result} /></td>
                          <td className='px-2 py-1 text-gray-400 max-w-[160px] truncate'>{g.opening_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {gamesLoaded && selectedGames.length > 0 && !stockfishDone && (
            <EvalProgress
              mode='enrich'
              games={selectedGames}
              depth={globalDepth}
              onComplete={() => setStockfishDone(true)}
            />
          )}

          {stockfishDone && (
            <p className='text-xs text-green-600 font-medium'>Browser analysis complete.</p>
          )}
          {serverError && <p className='text-xs text-red-600'>{serverError}</p>}
          {serverResult && (
            <div className='flex items-center gap-3 px-3 py-2 bg-green-50 border border-green-200 rounded-md text-xs'>
              <span className='text-green-700 font-medium flex-1'>
                Server done — {serverResult.processed} processed{serverResult.skipped > 0 ? `, ${serverResult.skipped} skipped` : ''}{serverResult.errors > 0 ? `, ${serverResult.errors} errors` : ''}
              </span>
              <MyButton onClick={() => setServerResult(null)} overrideClass='h-auto px-3 py-1 text-xs'>
                Continue
              </MyButton>
            </div>
          )}
        </div>
      </MyBox>

      {/* Step 3 */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>3. Build Position Tree</h3>
            <MyHelpStep
              title='3. Build Position Tree'
              input={['tgr_gamesraw — PGN and game result for each game not yet in the position tree']}
              processing='Replays each game up to move 20 using chess.js. Records every unique board position (FEN) reached and the move played from it. Builds a frequency model showing which positions you reach repeatedly and what you play from them. Skips games already processed. Repeat until games processed = 0.'
              output={[
                'tpos_positions — unique FEN positions reached across all games',
                'tmov_moves — every move played from each position with win / loss / draw counts',
                'tgam_game_positions — per-game record linking each game to the positions it visited',
              ]}
              consumers={[
                'Step 4 Evaluate Positions (enrichPositionsStockfish) — evaluates each unique FEN',
                'Step 5 Generate AI Insights (generateInsights) — reads positions and moves for coaching',
                'Habits / Quiz / Briefing pages — read tpos_positions and tmov_moves for analysis',
              ]}
            />
            <MyButton onClick={doRefreshStep3} disabled={s3Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s3Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-gray-400 w-8'>All</span>
              <span>processed: <strong className='text-gray-800'>{n(s3?.allProcessed)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s3?.allRemaining)}</strong></span>
              {eta(s3?.allRemaining, rates?.step3 ?? null) && <span className='text-gray-400 text-xs'>{eta(s3?.allRemaining, rates?.step3 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <span>positions: <strong className='text-gray-800'>{n(s3?.allPositions)}</strong></span>
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s3 === null ? null : s3.allRemaining === 0} />
              <MyHelp label='SQL' title='Position Tree — Status SQL (All)' text={SQL_STATUS_3} />
            </div>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-blue-400 w-12 shrink-0'>Range</span>
              <span>processed: <strong className='text-gray-800'>{n(s3?.rangeProcessed)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s3?.rangeRemaining)}</strong></span>
              {eta(s3?.rangeRemaining, rates?.step3 ?? null) && <span className='text-gray-400 text-xs'>{eta(s3?.rangeRemaining, rates?.step3 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s3 === null ? null : s3.rangeRemaining === 0} />
              <MyHelp label='SQL' title='Position Tree — Status SQL (Date Range)' text={sqlRange3(globalDateFrom, globalDateTo)} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleBuildTree} disabled={treeRunning}>
              {treeRunning ? 'Building...' : 'Build Position Tree'}
            </MyButton>
          </div>
          {treeResult && (
            <p className={`text-xs ${treeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {treeResult.ok
                ? `Done — ${treeResult.gamesProcessed} games, ${treeResult.positions} positions, ${treeResult.moves} moves${treeResult.errors ? `, ${treeResult.errors} errors` : ''}`
                : `Error: ${treeResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

      {/* Step 4 */}
      <MyBox>
        <div className='space-y-3'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>4. Evaluate Positions</h3>
            <MyHelpStep
              title='4. Evaluate Positions'
              input={['tpos_positions — unique FEN positions not yet in teva_evaluations']}
              processing="Evaluates each unique board position from the tree with Stockfish. Normalises the centipawn score to white's perspective and records the best move. Required before Generate AI Insights can produce results — step 5 returns 0 if this table is empty. Run in batches; repeat until remaining = 0."
              output={['teva_evaluations — one row per position: centipawn score (white perspective), best move (UCI notation), search depth']}
              consumers={[
                'Step 5 Generate AI Insights (generateInsights) — requires evaluations before it can run',
                'Habits / Quiz pages — use CP scores and best moves for drill data',
              ]}
            />
            <MyButton onClick={doRefreshStep4} disabled={s4Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s4Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-gray-400 w-8'>All</span>
              <span>evaluated: <strong className='text-gray-800'>{n(s4?.evaluated)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s4?.remaining)}</strong></span>
              {eta(s4?.remaining, rates?.step4 ?? null) && <span className='text-gray-400 text-xs'>{eta(s4?.remaining, rates?.step4 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s4 === null ? null : s4.remaining === 0} />
              <MyHelp label='SQL' title='Evaluate Positions — Status SQL' text={SQL_STATUS_4} />
            </div>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-blue-400 w-12 shrink-0'>Range</span>
              <span>evaluated: <strong className='text-gray-800'>{n(s4?.rangeEvaluated)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s4?.rangeRemaining)}</strong></span>
              {eta(s4?.rangeRemaining, rates?.step4 ?? null) && <span className='text-gray-400 text-xs'>{eta(s4?.rangeRemaining, rates?.step4 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s4 === null ? null : s4.rangeRemaining === 0} />
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-2'>
            <MyButton onClick={handleEvaluatePositions} disabled={posRunning}>
              {posRunning ? 'Running...' : 'Run Server Evaluate'}
            </MyButton>
            <MyHelp label='Help' title='Server-side Evaluate' text='Evaluates positions using the native Stockfish binary on the server. Faster than browser WASM, no tab required. Processes in batches of the specified size; click again to continue until remaining = 0.' />
            <EvalProgress
              mode='positions'
              positionLimit={globalBatchSize}
              depth={globalDepth}
              onComplete={() => setPosBrowserDone(true)}
            />
          </div>
          {posError && <p className='text-xs text-red-600'>{posError}</p>}
          {posResult && (
            <p className={`text-xs ${posResult.remaining === 0 ? 'text-green-600' : 'text-blue-700'}`}>
              Server done — {posResult.processed} evaluated
              {posResult.errors > 0 ? `, ${posResult.errors} errors` : ''}
              {' · '}{posResult.remaining > 0 ? `${posResult.remaining.toLocaleString()} remaining — run again` : 'all done'}
            </p>
          )}
          {posBrowserDone && <p className='text-xs text-green-600'>Browser evaluation complete.</p>}
        </div>
      </MyBox>

      {/* Step 5 */}
      <MyBox>
        <div className='space-y-2'>
          <div className='flex items-center gap-2 mb-2'>
            <h3 className='text-xs font-bold'>5. Generate AI Insights</h3>
            <MyHelpStep
              title='5. Generate AI Insights'
              input={[
                'tpos_positions — positions to generate coaching advice for',
                'tmov_moves — moves played from each position with frequency',
                'teva_evaluations — Stockfish centipawn score per position (required — step returns 0 if empty)',
              ]}
              processing='For each position that has a Stockfish evaluation but no insight yet, sends the FEN, CP score, and move history to Claude AI. Claude returns a short coaching theme and practical improvement advice. Runs in batches of 20; repeat until remaining = 0.'
              output={['tins_insights — one row per position: coaching theme (≤8 words), advice text (≤3 sentences), priority score used to rank Habits page']}
              consumers={[
                'Habits page — displays positions ranked by priority with coaching advice',
                'Quiz page — uses insights to frame quiz questions from your worst positions',
                'Briefing page — generates a coaching summary from top-priority insights',
              ]}
            />
            <MyButton onClick={doRefreshStep5} disabled={s5Loading} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:text-blue-800 border border-blue-300 px-1.5 py-0.5 leading-none'>{s5Loading ? '…' : '↻'}</MyButton>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-gray-400 w-8'>All</span>
              <span>insights: <strong className='text-gray-800'>{n(s5?.insights)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s5?.remaining)}</strong></span>
              {eta(s5?.remaining, rates?.step5 ?? null) && <span className='text-gray-400 text-xs'>{eta(s5?.remaining, rates?.step5 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s5 === null ? null : s5.remaining === 0} />
              <MyHelp label='SQL' title='AI Insights — Status SQL' text={SQL_STATUS_5} />
            </div>
            <div className='flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md text-xs text-gray-600'>
              <span className='font-medium text-blue-400 w-12 shrink-0'>Range</span>
              <span>insights: <strong className='text-gray-800'>{n(s5?.rangeInsights)}</strong></span>
              <span className='text-gray-300'>·</span>
              <span>remaining: <strong className='text-gray-800'>{n(s5?.rangeRemaining)}</strong></span>
              {eta(s5?.rangeRemaining, rates?.step5 ?? null) && <span className='text-gray-400 text-xs'>{eta(s5?.rangeRemaining, rates?.step5 ?? null)}</span>}
              <span className='text-gray-300'>·</span>
              <StatusBadge complete={s5 === null ? null : s5.rangeRemaining === 0} />
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <MyButton onClick={handleGenerateInsights} disabled={insightsRunning}>
              {insightsRunning ? 'Generating...' : 'Generate AI Insights'}
            </MyButton>
          </div>
          {insightsResult && (
            <p className={`text-xs ${insightsResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {insightsResult.ok
                ? `Done — ${insightsResult.processed} insights generated${insightsResult.errors ? `, ${insightsResult.errors} errors` : ''}`
                : `Error: ${insightsResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

    </div>
  )
}
