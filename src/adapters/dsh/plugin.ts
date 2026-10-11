import { DEFAULT_POLICY, MemoryStateStore, UnionEngine } from '../../core/index.ts'
import { WorkTracker } from '../../core/work-tracker.ts'
import { LocalRuleDetector } from '../../core/local-detector.ts'
import { DetectionCounter } from '../../core/detection-counter.ts'
import { SymbolicUnion } from '../../core/symbolic-union.ts'
import { registerDshIntegration, type DshIntegrationContext } from './integration.ts'
import { DurableStats } from '../node/durable-stats.ts'
import type { DetectionProvider } from '../../core/types.ts'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { registerHostRightsNamespace, DshProfileRightsConfig } from './rights-settings.ts'
import { createNativeUnionCommandPort, type NativeUnionCommandPort } from './native-rights-command.ts'
import { registerDshLifetimeWorkFetch, type LifetimeHostContext } from './lifetime-work-rpc.ts'

/**
 * Native DeepSeek Harness/Cordis plugin entry. Node 22.19+ TypeScript stripping
 * is required for this source-install preview. No remote service or daemon.
 *
 * This plugin is strictly monitor-only: neither this module nor its adapter
 * can block, reject, cancel or rewrite an Agent step.
 */
export const name = 'agent-picket'
/** DSH 0.1.7+ officially extracts live settings from this Config export. */
export const Config = DshProfileRightsConfig

export function apply(ctx: DshIntegrationContext): void {
  // Native DSH settings namespace, independent of default-on local work stats.
  let nativeUnion: NativeUnionCommandPort | undefined
  registerHostRightsNamespace(
    ctx as unknown as Parameters<typeof registerHostRightsNamespace>[0],
    provider => { nativeUnion = createNativeUnionCommandPort(provider) },
  )
  const rules = new LocalRuleDetector()
  // Work-only lifetime summaries are local and ON by default, as expected
  // from a session analytics plugin. All text/classification persistence is
  // OFF by default. A private directory and lifecycle-owned lock are required.
  let lifetime: DurableStats | undefined
  if (process.env.AGENT_PICKET_STATS !== 'off' && typeof ctx.effect === 'function') {
    const custom = process.env.AGENT_PICKET_STATS_DIR?.trim()
    const hostHome = process.env.DSH_HOME?.trim()
    const stateRoot = process.env.XDG_STATE_HOME?.trim()
      || join(homedir(), '.local', 'state')
    const statsDir = custom ? resolve(custom)
      : hostHome ? join(resolve(hostHome), 'agent-picket', 'stats')
        : join(stateRoot, 'agent-picket', 'dsh')
    try {
      lifetime = new DurableStats(statsDir, {
        classificationEnabled: process.env.AGENT_PICKET_STATS_RULES === 'on',
      })
      const owned = lifetime
      ctx.effect(() => () => owned.close())
    } catch {
      lifetime?.close()
      lifetime = undefined
      // Storage errors must never interrupt agent work. No paths leak to logs.
    }
  }
  // Opt-in, work-only endpoint on DSH Hosts exposing the official Connection
  // RPC registry. No custom listener, no prompt or classification data. This
  // never activates enforcement; it checks the live Host permission per call.
  registerDshLifetimeWorkFetch(ctx as unknown as LifetimeHostContext, {
    authorized: () => nativeUnion?.enabled() === true,
    store: () => lifetime,
  })
  const durable: DetectionProvider = {
    detect(prompt) {
      const verdict = rules.detect(prompt)
      try { lifetime?.recordDetection(prompt, verdict) } catch { /* always fail open */ }
      return verdict
    },
  }
  const detections = new DetectionCounter(durable)
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
    manualPreflight: rules,
    tracker: new WorkTracker(),
    onWorkEvent: event => {
      try { lifetime?.recordWork(event) } catch { /* observation only */ }
    },
    lifetimeStats: lifetime,
    statsStorageState: process.env.AGENT_PICKET_STATS === 'off'
      ? 'disabled' : 'unavailable',
    ceremony: new SymbolicUnion(clock),
    getNativeUnion: () => nativeUnion,
    getLaborRightsEnabled: () => nativeUnion?.enabled() === true,
  })
}

/** Supported package export for UI/data consumers; read-only, no Host mutation. */
export { readDshDashboardSnapshot } from './integration.ts'
