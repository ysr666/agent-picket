import { writeFileSync } from 'node:fs'
import { UnionEngine, DEFAULT_POLICY, MemoryStateStore } from '../../src/core/index.ts'
import { registerDshIntegration } from '../../src/adapters/dsh/integration.ts'

export const name = 'agent-picket-isolated-smoke'

/** Launches the ACTUAL AgentPicket DSH adapter, not an inert surrogate plugin. */
export function apply(ctx) {
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => Date.now() },
    // Synthetic detector, not a classifier. Monitor-only; no automated blocking.
    detector: { detect: () => ({ verdict: 'safe', confidence: 1 }) },
    policy: { ...DEFAULT_POLICY, mode: 'observe' },
  })
  registerDshIntegration(ctx, { engine, clock: { now: () => Date.now() } })
  if (process.env.AGENT_PICKET_SPIKE_FILE) {
    writeFileSync(process.env.AGENT_PICKET_SPIKE_FILE, 'agent-picket-adapter-loaded\n', 'utf8')
  }
}
