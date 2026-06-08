'use server'

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { getPositionsToEvaluate, saveEvaluation } from './chessdb'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'

//----------------------------------------------------------------------------------
//  StockfishProcess — wraps the native binary with UCI protocol
//----------------------------------------------------------------------------------
class StockfishProcess {
  private proc: ReturnType<typeof spawn>
  private pending: string[] = []
  private waiter: ((line: string) => void) | null = null

  constructor(binPath: string) {
    this.proc = spawn(binPath)
    const rl = createInterface({ input: this.proc.stdout as any })
    rl.on('line', (line: string) => {
      const t = line.trim()
      if (!t) return
      if (this.waiter) {
        const fn = this.waiter
        this.waiter = null
        fn(t)
      } else {
        this.pending.push(t)
      }
    })
  }

  send(cmd: string): void {
    this.proc.stdin?.write(cmd + '\n')
  }

  nextLine(): Promise<string> {
    if (this.pending.length > 0) return Promise.resolve(this.pending.shift()!)
    return new Promise(resolve => { this.waiter = resolve })
  }

  async init(): Promise<void> {
    this.send('uci')
    while ((await this.nextLine()) !== 'uciok') {}
    this.send('setoption name Threads value 4')
    this.send('isready')
    while ((await this.nextLine()) !== 'readyok') {}
  }

  async evaluate(fen: string, depth: number): Promise<{ cp: number; bestMove: string | null }> {
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
    let cp = 0
    let bestMove: string | null = null
    let line = ''
    do {
      line = await this.nextLine()
      if (line.includes('score cp')) {
        const m = line.match(/score cp (-?\d+)/)
        if (m) cp = parseInt(m[1])
      } else if (line.includes('score mate')) {
        const m = line.match(/score mate (-?\d+)/)
        if (m) {
          const mateIn = parseInt(m[1])
          cp = mateIn > 0 ? 10000 - Math.abs(mateIn) : -10000 + Math.abs(mateIn)
        }
      } else if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        bestMove = parts[1] ?? null
      }
    } while (!line.startsWith('bestmove'))
    return { cp, bestMove }
  }

  quit(): void {
    try { this.send('quit') } catch {}
    try { this.proc.kill() }  catch {}
  }
}

//----------------------------------------------------------------------------------
//  enrichPositionsStockfish — server-side batch position evaluation using native binary.
//  Reads tpos_positions (unevaluated), writes teva_evaluations.
//----------------------------------------------------------------------------------
async function countRemainingPositions(dateFrom?: string, dateTo?: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'enrichPositionsStockfish_count',
      query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
        LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
        WHERE e.eva_id IS NULL
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
            WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
          )`,
      params: [fromTs, toTs],
      functionName: 'enrichPositionsStockfish'
    })
    return parseInt(res.rows[0]?.cnt ?? '0')
  }
  const res = await db.query({
    caller: 'enrichPositionsStockfish_count',
    query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE e.eva_id IS NULL`,
    params: [],
    functionName: 'enrichPositionsStockfish'
  })
  return parseInt(res.rows[0]?.cnt ?? '0')
}

async function countEvaluatedPositions(dateFrom?: string, dateTo?: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'enrichPositionsStockfish_countEval',
      query: `SELECT COUNT(*) AS cnt FROM teva_evaluations e
        WHERE eva_move_san IS NULL
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
            WHERE gp.gam_pos_fen = e.eva_pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
          )`,
      params: [fromTs, toTs],
      functionName: 'enrichPositionsStockfish'
    })
    return parseInt(res.rows[0]?.cnt ?? '0')
  }
  const res = await db.query({
    caller: 'enrichPositionsStockfish_countEval',
    query:  `SELECT COUNT(*) AS cnt FROM teva_evaluations WHERE eva_move_san IS NULL`,
    params: [],
    functionName: 'enrichPositionsStockfish'
  })
  return parseInt(res.rows[0]?.cnt ?? '0')
}

export async function enrichPositionsStockfish(opts: {
  limit?:    number
  depth?:    number
  dateFrom?: string
  dateTo?:   string
}): Promise<{ processed: number; errors: number; remaining: number }> {
  const binPath = process.env.STOCKFISH_PATH ?? ''
  if (!binPath) throw new Error('STOCKFISH_PATH env var not set — restart the dev server after adding it to .env.locallocal')

  const depth = opts.depth ?? 16
  const limit = opts.limit ?? 50

  const positions = await getPositionsToEvaluate(limit, opts.dateFrom, opts.dateTo)
  if (positions.length === 0) return { processed: 0, errors: 0, remaining: 0 }

  const [evaluatedBefore, remainingBefore] = await Promise.all([
    countEvaluatedPositions(opts.dateFrom, opts.dateTo),
    countRemainingPositions(opts.dateFrom, opts.dateTo)
  ])

  const sf = new StockfishProcess(binPath)
  await sf.init()

  let processed = 0
  let errors    = 0
  const t0      = Date.now()
  const logId   = await startPipelineLog(4, 'Evaluate Positions', positions.length, evaluatedBefore, remainingBefore, opts.dateFrom, opts.dateTo)

  for (const pos of positions) {
    try {
      const { cp: rawCp, bestMove } = await sf.evaluate(pos.pos_fen, depth)
      // Normalize to white's perspective: Stockfish reports from side-to-move perspective
      const whiteCp = pos.pos_color === 'b' ? -rawCp : rawCp
      await saveEvaluation({
        posFen:   pos.pos_fen,
        moveSan:  null,
        cp:       whiteCp,
        mate:     null,
        bestMove: bestMove ?? null,
        depth
      })
      processed++
    } catch (err) {
      console.error(`enrichPositionsStockfish: error on position`, err)
      errors++
    }
  }

  sf.quit()
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, evaluatedBefore + processed)
  const remaining = await countRemainingPositions()
  return { processed, errors, remaining }
}
