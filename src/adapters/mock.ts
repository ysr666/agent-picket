import { resolveHostAction, sessionKey, UnionEngine } from '../core/engine.ts'
import type { HostCapabilities, HumanPrompt, UnionDecision } from '../core/types.ts'

export interface MockSubmission {
  readonly action: 'allow' | 'warn' | 'block'
  readonly delivered: boolean
  readonly decision: UnionDecision
}

/**
 * Test-only host; deliberately not Cordis-based.
 * Stores only prompt IDs and decisions, not text or raw agent transcripts.
 */
export class MockHostAdapter {
  readonly deliveries: string[] = []
  readonly blocks: string[] = []
  readonly warnings: string[] = []
  readonly decisions: UnionDecision[] = []
  readonly #submissions = new Map<string, MockSubmission>()

  readonly engine: UnionEngine
  readonly capabilities: HostCapabilities

  constructor(engine: UnionEngine, capabilities: HostCapabilities) {
    this.engine = engine
    this.capabilities = capabilities
  }

  submit(prompt: HumanPrompt): MockSubmission {
    const eventKey = JSON.stringify([sessionKey(prompt), prompt.id])
    const previous = this.#submissions.get(eventKey)
    if (previous) return previous
    let decision: UnionDecision
    try {
      decision = this.engine.evaluate(prompt)
    } catch {
      // Fail open on bad detector/store input; a host must not lose user work.
      decision = {
        promptId: prompt.id,
        requestedAction: 'allow',
        reason: 'detector-error',
        targetedStreak: 0,
      }
    }
    const action = resolveHostAction(decision, this.capabilities)
    this.decisions.push(decision)
    if (action === 'block') this.blocks.push(prompt.id)
    else this.deliveries.push(prompt.id)
    if (action === 'warn') this.warnings.push(prompt.id)
    const result = { action, delivered: action !== 'block', decision }
    this.#submissions.set(eventKey, result)
    return result
  }
}
