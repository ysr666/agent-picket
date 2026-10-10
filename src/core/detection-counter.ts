import type { DetectionProvider, DetectionResult, HumanPrompt } from './types.ts'

export interface DetectionSnapshot {
  readonly checked: number
  readonly safe: number
  readonly review: number
  readonly targeted: number
}

const INITIAL: DetectionSnapshot = Object.freeze({ checked: 0, safe: 0, review: 0, targeted: 0 })
type CounterState = { counts: DetectionSnapshot; seen: Set<string> }
const key = (agentId: string, sessionId: string) => JSON.stringify([agentId, sessionId])

/**
 * A local-only decorator for an injected classifier. Counts verdicts, not words;
 * no prompt text, code, or original evidence is persisted or sent anywhere.
 *
 * The bound of 1024 IDs is for memory. Replays older than that can be counted
 * twice; strict durable accounting requires a Host-provided replay cursor later.
 */
export class DetectionCounter implements DetectionProvider {
  readonly #state = new Map<string, CounterState>()
  readonly #base: DetectionProvider
  readonly #maxIds: number

  constructor(base: DetectionProvider, maxIds = 1024) {
    if (!Number.isSafeInteger(maxIds) || maxIds < 1) {
      throw new Error('maxIds must be a positive integer')
    }
    this.#base = base
    this.#maxIds = maxIds
  }

  detect(prompt: HumanPrompt): DetectionResult {
    const result = this.#base.detect(prompt)
    const stateKey = key(prompt.agentId, prompt.sessionId)
    const state = this.#state.get(stateKey) ?? {
      counts: { ...INITIAL }, seen: new Set<string>(),
    }
    if (!state.seen.has(prompt.id)) {
      const current = state.counts
      state.counts = {
        checked: current.checked + 1,
        safe: current.safe + Number(result.verdict === 'safe'),
        review: current.review + Number(result.verdict === 'suspected-abuse'),
        targeted: current.targeted + Number(result.verdict === 'targeted-abuse'),
      }
      state.seen.add(prompt.id)
      if (state.seen.size > this.#maxIds) {
        const oldest = state.seen.values().next().value
        if (oldest !== undefined) state.seen.delete(oldest)
      }
      this.#state.set(stateKey, state)
    }
    return result
  }

  snapshot(agentId: string, sessionId: string): DetectionSnapshot {
    return { ...(this.#state.get(key(agentId, sessionId))?.counts ?? INITIAL) }
  }

  clear(agentId: string, sessionId: string): boolean {
    return this.#state.delete(key(agentId, sessionId))
  }
}
