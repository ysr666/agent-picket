import type { SessionState, StateStore } from './types.ts'

function copyState(state: SessionState): SessionState {
  return {
    targetedStreak: state.targetedStreak,
    lastTargetedAtMs: state.lastTargetedAtMs,
    processed: state.processed.map(item => ({
      promptId: item.promptId,
      decision: { ...item.decision },
    })),
  }
}

/** Ephemeral reference implementation; not a production durable store. */
export class MemoryStateStore implements StateStore {
  readonly #states = new Map<string, SessionState>()

  get(key: string): SessionState | undefined {
    const value = this.#states.get(key)
    return value ? copyState(value) : undefined
  }

  set(key: string, state: SessionState): void {
    this.#states.set(key, copyState(state))
  }
}
