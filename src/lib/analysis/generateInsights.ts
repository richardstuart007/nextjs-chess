'use server'

import { getPositionsNeedingInsights, saveInsight } from './db'

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

interface MoveInfo {
  san: string
  times: number
  cp_loss: number | null
}

async function callClaude(fen: string, reached: number, moves: MoveInfo[]): Promise<{ theme: string; advice: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('generateInsights: ANTHROPIC_API_KEY not set')
    return null
  }

  const moveLines = moves
    .slice(0, 5)
    .map(m => `  ${m.san}: played ${m.times} time${m.times !== 1 ? 's' : ''}${m.cp_loss != null ? `, avg cp loss ${m.cp_loss}` : ''}`)
    .join('\n')

  const userPrompt = `FEN: ${fen}
Position reached ${reached} times.
Moves played from this position:
${moveLines}

Provide:
1. Theme label (max 8 words describing the type of mistake)
2. Improvement advice (max 3 sentences, practical and specific)

Respond ONLY with valid JSON: { "theme": "...", "advice": "..." }`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 256,
      system: 'You are a chess coach. Be concise and practical. Always respond with valid JSON only.',
      messages: [{ role: 'user', content: userPrompt }]
    })
  })

  if (!response.ok) {
    console.error(`generateInsights: Anthropic API error ${response.status}`)
    return null
  }

  const data = await response.json()
  const text = data?.content?.[0]?.text ?? ''
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed.theme === 'string' && typeof parsed.advice === 'string') {
      return { theme: parsed.theme, advice: parsed.advice }
    }
  } catch {
    console.error('generateInsights: failed to parse Claude response', text)
  }
  return null
}

export async function generateInsights(opts: { limit?: number }): Promise<{
  processed: number
  errors: number
}> {
  const positions = await getPositionsNeedingInsights(opts.limit ?? 20)
  let errors = 0

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
      console.error('generateInsights: error for FEN', pos.pos_fen, err)
      errors++
    }
  }

  return { processed: positions.length - errors, errors }
}
