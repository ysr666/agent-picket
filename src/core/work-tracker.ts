import type { WorkEvent } from './types.ts'

/**
 * Purely local, session-scoped event counters.
 * Durations represent completed turn wall-clock spans only. They exclude gaps
 * between turns, but can include waiting inside an active turn (e.g. for user
 * approval); they are NOT model compute time or proof of work.
 */
export interface WorkSnapshot {
  readonly turnStarts: number
  readonly turnEnds: number
  readonly toolCalls: number
  readonly toolResults: number
  readonly completedTurnMs: number
}

type State = {
  counts: WorkSnapshot
  currentTurnStart: number | null
  seen: Set<string>
}

const EMPTY: WorkSnapshot = Object.freeze({
  turnStarts: 0,
  turnEnds: 0,
  toolCalls: 0,
  toolResults: 0,
  completedTurnMs: 0,
})

function keyOf(agentId: string, sessionId: string): string {
  return JSON.stringify([agentId, sessionId])
}

export class WorkTracker {
  readonly #states = new Map<string, State>()
  readonly #remembered: number

  constructor(options: { rememberedEventIds?: number } = {}) {
    this.#remembered = options.rememberedEventIds ?? 1024
    if (!Number.isSafeInteger(this.#remembered) || this.#remembered < 1) {
      throw new Error('rememberedEventIds must be a positive integer')
    }
  }

  /** Return false for a repeated/invalid event, to avoid duplicate Host counting. */
  observe(event: WorkEvent): boolean {
    if (!event.id || !event.agentId || !event.sessionId ||
      !Number.isFinite(event.recordedAtMs) || event.recordedAtMs < 0) return false

    const key = keyOf(event.agentId, event.sessionId)
    const state = this.#states.get(key) ?? {
      counts: { ...EMPTY }, currentTurnStart: null, seen: new Set<string>(),
    }
    if (state.seen.has(event.id)) return false

    // Do not mutate a previously observed session on unknown event types.
    if (!['turn-start','turn-end','tool-start','tool-end'].includes(event.type)) return false

    const c = { ...state.counts }
    if (event.type === 'turn-start') {
      c.turnStarts++
      // Avoid silently double-counting an unclosed turn interval.
      state.currentTurnStart = event.recordedAtMs
    } else if (event.type === 'turn-end') {
      c.turnEnds++
      const start = state.currentTurnStart
      if (start !== null && event.recordedAtMs >= start) {
        c.completedTurnMs += event.recordedAtMs - start
      }
      state.currentTurnStart = null
    } else if (event.type === 'tool-start') c.toolCalls++
    else c.toolResults++

    state.counts = c
    state.seen.add(event.id)
    if (state.seen.size > this.#remembered) {
      const oldest = state.seen.values().next().value
      if (oldest !== undefined) state.seen.delete(oldest)
    }
    this.#states.set(key, state)
    return true
  }

  snapshot(agentId: string, sessionId: string): WorkSnapshot {
    const value = this.#states.get(keyOf(agentId, sessionId))?.counts ?? EMPTY
    return { ...value }
  }

  clear(agentId: string, sessionId: string): boolean {
    return this.#states.delete(keyOf(agentId, sessionId))
  }
}
