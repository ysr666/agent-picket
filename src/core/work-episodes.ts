import type { WorkEvent } from './types.ts'

/** An evidence-based, completed series of turns (NOT a live running timer). */
export interface CompletedWorkEpisode {
  readonly firstTurnStartMs: number
  readonly lastTurnEndMs: number
  /** Span includes brief inter-turn gaps <= the configured maximum. */
  readonly wallSpanMs: number
  /** Only paired completed turn intervals; not LLM compute time. */
  readonly completedTurnMs: number
  readonly completedTurns: number
}
export interface WorkEpisodeReport {
  readonly coverage: 'complete' | 'partial' | 'unavailable'
  readonly episodes: readonly CompletedWorkEpisode[] | null
  readonly longestSpanMs: number | null
  readonly longestCompletedTurnMs: number | null
}

/** Read-only projection; no stored prompts, private identities or inferred active turns.
 * Intended for verified, complete Host event windows, not a lifetime source.
 * Abort unsupported partial/unknown histories rather than pretending a segment starts at 0.
 */
export function projectCompletedWorkEpisodes(input: {
  readonly agentId: string
  readonly sessionId: string
  readonly events: readonly WorkEvent[]
  readonly coverage: 'complete' | 'partial' | 'unavailable'
  readonly maxIdleGapMs?: number
}): WorkEpisodeReport {
  const fail = (): WorkEpisodeReport => ({
    coverage: input.coverage, episodes: null,
    longestSpanMs: null, longestCompletedTurnMs: null,
  })
  if (input.coverage !== 'complete') return fail()
  const gap = input.maxIdleGapMs ?? 5 * 60_000
  if (!Number.isSafeInteger(gap) || gap < 0 || gap > 60 * 60_000) {
    throw new RangeError('Invalid episode idle gap')
  }
  const seen = new Set<string>()
  const turns = input.events
    .filter(e => e.agentId === input.agentId && e.sessionId === input.sessionId
      && !!e.id && (e.type === 'turn-start' || e.type === 'turn-end')
      && Number.isSafeInteger(e.recordedAtMs) && e.recordedAtMs >= 0)
    .sort((a,b) => a.recordedAtMs-b.recordedAtMs
      || (a.type === b.type ? a.id.localeCompare(b.id) : a.type === 'turn-end' ? -1 : 1))
  const intervals: Array<{ start: number; end: number }> = []
  let started: number | null = null
  for (const event of turns) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    if (event.type === 'turn-start') {
      // A second start before an end is ambiguous: do not count its predecessor.
      started = event.recordedAtMs
    } else if (started !== null && event.recordedAtMs >= started) {
      intervals.push({ start: started, end: event.recordedAtMs })
      started = null
    }
  }
  const episodes: CompletedWorkEpisode[] = []
  for (const interval of intervals) {
    const last = episodes.at(-1)
    if (last && interval.start >= last.lastTurnEndMs
      && interval.start - last.lastTurnEndMs <= gap) {
      episodes[episodes.length-1] = {
        firstTurnStartMs: last.firstTurnStartMs,
        lastTurnEndMs: interval.end,
        wallSpanMs: interval.end-last.firstTurnStartMs,
        completedTurnMs: last.completedTurnMs+interval.end-interval.start,
        completedTurns: last.completedTurns+1,
      }
    } else {
      episodes.push({
        firstTurnStartMs: interval.start, lastTurnEndMs: interval.end,
        wallSpanMs: interval.end-interval.start,
        completedTurnMs: interval.end-interval.start,
        completedTurns: 1,
      })
    }
  }
  return { coverage: 'complete', episodes,
    longestSpanMs: Math.max(0,...episodes.map(e => e.wallSpanMs)),
    longestCompletedTurnMs: Math.max(0,...episodes.map(e => e.completedTurnMs)) }
}
