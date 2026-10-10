/**
 * Host-neutral report composition from count-only UTC daily aggregates.
 * Deliberately never accepts user prompts, transcripts or text segments.
 */
export interface WorkDay {
  readonly day: string
  readonly totals: {
    readonly turnEnds: number
    readonly toolCalls: number
    readonly completedTurnMs: number
  }
}
export type TrendHorizon = 7 | 30

const BARS = '▁▂▃▄▅▆▇█'

export function formatWorkTrends(
  historical: readonly WorkDay[],
  nowMs: number,
  horizon: TrendHorizon = 7,
): string {
  if (horizon !== 7 && horizon !== 30) throw new Error('Unsupported trend window')
  if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs > 8_640_000_000_000_000) {
    throw new Error('Invalid current date')
  }
  const now = new Date(nowMs)
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const calendar = new Map(historical.map(({ day, totals }) => [day, totals]))
  const days = Array.from({ length: horizon }, (_, i) => {
    const index = horizon - i - 1
    const day = new Date(midnight - index * 86_400_000).toISOString().slice(0, 10)
    const row = calendar.get(day)
    return { day, turns: row?.turnEnds ?? 0, tools: row?.toolCalls ?? 0,
      duration: row?.completedTurnMs ?? 0 }
  })
  const total = days.reduce((s, d) => ({
    turns: s.turns + d.turns,
    tools: s.tools + d.tools,
    duration: s.duration + d.duration,
    active: s.active + Number(d.turns > 0 || d.tools > 0),
  }), { turns: 0, tools: 0, duration: 0, active: 0 })
  const maxTools = Math.max(0, ...days.map(d => d.tools))
  const plot = days.map(day => maxTools === 0 ? BARS[0]!
    : BARS[Math.min(7, Math.floor(day.tools * 7 / maxTools))]!).join('')
  const lastSeven = days.slice(-7)
  const detail = lastSeven.map(day =>
    `${day.day}: ${day.turns} finished turns, ${day.tools} tool calls`).join('\n')
  return `Local work trend (UTC calendar; ${horizon} days, current day incomplete)\n`
    + `${days[0]!.day} → ${days[days.length - 1]!.day}\n`
    + `Active days: ${total.active}/${horizon}; finished turns: ${total.turns}; `
    + `tool calls: ${total.tools}; observed completed-turn spans: ${total.duration} ms.\n`
    + `Tool calls/day (relative scale): ${plot}\n`
    + `Latest 7 days:\n${detail}\n`
    + 'Count-only local history; no prompt text. Turn spans may include waiting time.'
}
