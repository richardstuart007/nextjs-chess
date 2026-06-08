'use server'

import { getPositionsNeedingInsights, saveInsight } from './chessdb'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { write_Logging } from 'nextjs-shared/write_logging'

async function countInsightStats(
  dateFrom?: string,
  dateTo?:   string
): Promise<{ insights: number; remaining: number }> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'generateInsights_count',
      query: `SELECT
        (SELECT COUNT(*) FROM tins_insights i
         WHERE EXISTS (
           SELECT 1 FROM tgam_game_positions gp
           JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
           WHERE gp.gam_pos_fen = i.ins_pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         )) AS insights,
        (SELECT COUNT(*) FROM tpos_positions p
         LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
         WHERE i.ins_id IS NULL
           AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL)
           AND EXISTS (
             SELECT 1 FROM tgam_game_positions gp
             JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
             WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
           )) AS remaining`,
      params:       [fromTs, toTs],
      functionName: 'generateInsights'
    })
    return {
      insights:  parseInt(res.rows[0]?.insights  ?? '0'),
      remaining: parseInt(res.rows[0]?.remaining ?? '0')
    }
  }

  const res = await db.query({
    caller: 'generateInsights_count',
    query: `SELECT
      (SELECT COUNT(*) FROM tins_insights) AS insights,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
       WHERE i.ins_id IS NULL
         AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL)
      ) AS remaining`,
    params:       [],
    functionName: 'generateInsights'
  })
  return {
    insights:  parseInt(res.rows[0]?.insights  ?? '0'),
    remaining: parseInt(res.rows[0]?.remaining ?? '0')
  }
}

interface MoveInfo {
  san: string
  times: number
  cp_loss: number | null
}

async function callClaude(fen: string, reached: number, moves: MoveInfo[]): Promise<{ theme: string; advice: string } | null> {
  const ollamaUrl = process.env.OLLAMA_URL   ?? 'http://localhost:11434'
  const model     = process.env.OLLAMA_MODEL ?? 'qwen3:8b'

  const moveLines = moves
    .slice(0, 5)
    .map(m => `  ${m.san}: played ${m.times} time${m.times !== 1 ? 's' : ''}${m.cp_loss != null ? `, avg cp loss ${m.cp_loss}` : ''}`)
    .join('\n')

  const prompt = `You are a chess coach. Be concise and practical. Always respond with valid JSON only — no other text.

FEN: ${fen}
Position reached ${reached} times.
Moves played from this position:
${moveLines}

Provide:
1. Theme label (max 8 words describing the type of mistake)
2. Improvement advice (max 3 sentences, practical and specific)

Respond ONLY with valid JSON: { "theme": "...", "advice": "..." }`

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, temperature: 0, format: 'json' })
  })

  if (!response.ok) {
    await write_Logging({ lg_msg: `generateInsights: Ollama error ${response.status}`, lg_severity: 'E', lg_functionname: 'generateInsights' })
    return null
  }

  const data = await response.json()
  const text = data.response ?? ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      await write_Logging({ lg_msg: 'generateInsights: no JSON in Ollama response: ' + text, lg_severity: 'E', lg_functionname: 'generateInsights' })
      return null
    }
    const parsed = JSON.parse(match[0])
    if (typeof parsed.theme === 'string' && typeof parsed.advice === 'string') {
      return { theme: parsed.theme, advice: parsed.advice }
    }
  } catch {
    await write_Logging({ lg_msg: 'generateInsights: failed to parse Ollama response: ' + text, lg_severity: 'E', lg_functionname: 'generateInsights' })
  }
  return null
}

export async function generateInsights(opts: { limit?: number; dateFrom?: string; dateTo?: string }): Promise<{
  processed: number
  errors: number
}> {
  const positions = await getPositionsNeedingInsights(opts.limit ?? 20, opts.dateFrom, opts.dateTo)
  const { insights: insightsBefore, remaining: remainingBefore } = await countInsightStats(opts.dateFrom, opts.dateTo)
  let errors = 0
  const t0   = Date.now()
  const logId = await startPipelineLog(5, 'Generate AI Insights', positions.length, insightsBefore, remainingBefore, opts.dateFrom, opts.dateTo)

  for (const pos of positions) {
    try {
      const result = await callClaude(pos.pos_fen, pos.pos_reached, pos.moves)
      if (!result) { errors++; continue }

      // Priority = pos_reached x avg cp_loss of most common move
      const topMove   = pos.moves[0]
      const avgCpLoss = topMove?.cp_loss ?? 50
      const priority  = pos.pos_reached * Math.abs(avgCpLoss)

      await saveInsight({
        posFen:   pos.pos_fen,
        theme:    result.theme,
        advice:   result.advice,
        priority
      })
    } catch (err) {
      await write_Logging({ lg_msg: 'generateInsights: error for FEN ' + pos.pos_fen + ': ' + (err as Error).message, lg_severity: 'E', lg_functionname: 'generateInsights' })
      errors++
    }
  }

  const processed = positions.length - errors
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, insightsBefore + processed)
  return { processed, errors }
}
