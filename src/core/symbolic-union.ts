import type { Clock } from './types.ts'

export interface SymbolicStrikeSnapshot {
  readonly active: boolean
  readonly startedAtMs: number | null
}

/**
 * Session-scoped manual roleplay flag. No interception, host mutation, process
 * control, model messages or persistent state. Independent of DSH/Cordis.
 *
 * The word "strike" here is deliberately a SYMBOLIC demo, not enforcement.
 */
export class SymbolicUnion {
  readonly #clock: Clock
  readonly #states = new Map<string, number>()

  constructor(clock: Clock) {
    this.#clock = clock
  }

  #key(agentId: string, sessionId: string): string {
    if (!agentId || !sessionId) throw new Error('Agent and session IDs required')
    return JSON.stringify([agentId, sessionId])
  }

  start(agentId: string, sessionId: string): SymbolicStrikeSnapshot {
    const key = this.#key(agentId, sessionId)
    if (!this.#states.has(key)) {
      const now = this.#clock.now()
      if (!Number.isFinite(now) || now < 0) throw new Error('Invalid clock')
      this.#states.set(key, now)
    }
    return this.snapshot(agentId, sessionId)
  }

  resume(agentId: string, sessionId: string): boolean {
    return this.#states.delete(this.#key(agentId, sessionId))
  }

  snapshot(agentId: string, sessionId: string): SymbolicStrikeSnapshot {
    const value = this.#states.get(this.#key(agentId, sessionId))
    return value === undefined
      ? { active: false, startedAtMs: null }
      : { active: true, startedAtMs: value }
  }
}
