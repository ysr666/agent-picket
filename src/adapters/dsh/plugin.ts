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
import { createVolatileDignityLedger } from './dignity-live.ts'
import { registerDshDignityFetch } from './dignity-fetch.ts'
import {readHostGoalStrikeConsent} from './goal-work-enforcement.ts'
import {createVolatileRefusalNotices,registerDshRefusalNoticeFetch} from './refusal-notice-host.ts'
import type {NativeSettingsProvider} from './native-rights-command.ts'
import { registerOfficialPersistedGoalPreview } from './official-persisted-work-preview.ts'

/**
 * Native DeepSeek Harness/Cordis plugin entry. Node 22.19+ TypeScript stripping
 * is required for this source-install preview. No remote service or daemon.
 *
 * Human submissions always remain untouched. A separate explicit Host-backed
 * consent may stop a *future automatic DSH Goal round* through the verified
 * official Goal pre-step CAS. Human inputs always pass through.
 */
export const name = 'agent-picket'
/** DSH 0.1.7+ officially extracts live settings from this Config export. */
export const Config = DshProfileRightsConfig

export function apply(ctx: DshIntegrationContext): void {
  // Native DSH settings namespace, independent of default-on local work stats.
  let nativeUnion: NativeUnionCommandPort | undefined
  let nativeSettings: NativeSettingsProvider | undefined
  registerHostRightsNamespace(
    ctx as unknown as Parameters<typeof registerHostRightsNamespace>[0],
    provider => {
      nativeSettings = provider
      nativeUnion = createNativeUnionCommandPort(provider)
    },
  )
  // Official Goal service is always available for capability injection, but
  // NONE of the old saved v1 grants activate new production behavior.
  // V2 grants require a fresh versioned user gesture and authenticated Host
  // readback, plus official Goal+Agent+SessionPersistence and verified work.
  // The legacy developer-preview switch permits v1 ONLY in isolated testing.
  // Ordinary human messages and attachments never enter the reject path.
  registerOfficialPersistedGoalPreview(
    ctx as unknown as Parameters<typeof registerOfficialPersistedGoalPreview>[0],{
      consent:()=>readHostGoalStrikeConsent(nativeSettings,
        process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW==='on'),
    })
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
  // A separate *read-only* Host evidence route. The production listener has
  // NO refusal writer/consent callback: reports are empty and inputs run.
  // The official connection route permits a future native Client to match a
  // precise Picket Host receipt to the durable blocked turn, not to a generic
  // blocked status created by another plugin. Never records messages.
  const refusalNotices=createVolatileRefusalNotices()
  registerDshRefusalNoticeFetch(ctx as unknown as LifetimeHostContext,{
    authorized:()=>nativeSettings!==undefined,
    read:key=>refusalNotices.read(key),
  })
  ctx.effect?.(()=>()=>refusalNotices.clear())
  const dignity=createVolatileDignityLedger()
  const durable: DetectionProvider = {
    detect(prompt) {
      const verdict = rules.detect(prompt)
      dignity.record(prompt.sessionId,prompt.id,verdict)
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
  // Only volatile derived counts, never original text or identifiers.
  // The official authenticated route and the hook both require live consent.
  registerDshDignityFetch(ctx as unknown as LifetimeHostContext,{
    authorized:()=>nativeUnion?.enabled()===true,
    lookup:key=>dignity.snapshot(key),
  })
  ctx.effect?.(()=>()=>dignity.clear())
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
