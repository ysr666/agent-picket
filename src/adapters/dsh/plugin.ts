import { DEFAULT_POLICY, MemoryStateStore, UnionEngine } from '../../core/index.ts'
import { WorkTracker } from '../../core/work-tracker.ts'
import { LocalRuleDetector } from '../../core/local-detector.ts'
import { DetectionCounter } from '../../core/detection-counter.ts'
import { SymbolicUnion } from '../../core/symbolic-union.ts'
import { registerDshIntegration, type DshIntegrationContext } from './integration.ts'

/**
 * Native DeepSeek Harness/Cordis plugin entry. Node 22.19+ TypeScript stripping
 * is required for this source-install preview. No remote service or daemon.
 *
 * This plugin is strictly monitor-only: neither this module nor its adapter
 * can block, reject, cancel or rewrite an Agent step.
 */
export const name = 'agent-picket'

export function apply(ctx: DshIntegrationContext): void {
  const detections = new DetectionCounter(new LocalRuleDetector())
  const clock = { now: () => Date.now() }
  const engine = new UnionEngine({
    detector: detections,
    store: new MemoryStateStore(),
    clock,
    policy: { ...DEFAULT_POLICY, mode: 'observe' },
  })
  registerDshIntegration(ctx, {
    engine,
    clock,
    detections,
    tracker: new WorkTracker(),
    ceremony: new SymbolicUnion(clock),
  })
}
