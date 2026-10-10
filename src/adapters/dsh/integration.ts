import type { NativeUnionCommandPort, NativeUnionAction } from './native-rights-command.ts'
import { inspectBlockingReadiness } from '../../core/block-readiness.ts'
import { resolveHostAction, type UnionEngine } from '../../core/engine.ts'
import type { WorkTracker } from '../../core/work-tracker.ts'
import type { DetectionCounter } from '../../core/detection-counter.ts'
import type { SymbolicUnion } from '../../core/symbolic-union.ts'
import type { DurableStats } from '../node/durable-stats.ts'
import { formatWorkTrends } from '../../core/trends.ts'
import { createDashboardSnapshot, type DashboardSnapshotV1, type DashboardStorageState } from '../../core/dashboard.ts'
import type {
  Clock,
  DetectionProvider,
  HumanPrompt,
  HostCapabilities,
  UnionDecision,
  WorkEvent,
} from '../../core/types.ts'

/** Structural contracts: no dependency on Cordis, DSH, or other Host packages. */
export interface DshTextBlock { readonly type: string; readonly text?: string }
export interface DshMessage {
  readonly id?: unknown
  readonly source?: { readonly kind?: unknown }
  readonly content?: readonly DshTextBlock[]
}
export interface DshAgent {
  readonly id?: unknown
  readonly session?: { readonly id?: unknown }
}
export interface DshPreStep {
  readonly agent: DshAgent
  readonly messages: readonly DshMessage[]
}
export interface DshSession { readonly id?: unknown }
export interface DshEvent {
  readonly type?: unknown
  readonly seq?: unknown
  readonly time?: unknown
  readonly data?: unknown
}
export interface DshCommandResult {
  readonly kind: 'success' | 'error'
  readonly text: string
}
export interface DshCommandInvocation {
  readonly rawInput?: string
  readonly agent?: DshAgent
}
export interface DshCommands {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly recordInput?: boolean
    readonly input?: { readonly hint: string }
    readonly handler: (invocation?: DshCommandInvocation) => DshCommandResult | Promise<DshCommandResult>
  }): unknown
}
export interface DshIntegrationContext {
  on(name: 'agent/pre-step', callback: (
    payload: DshPreStep, next: () => Promise<unknown>
  ) => Promise<unknown>): unknown
  on(name: 'session/event', callback: (
    session: DshSession, event: DshEvent
  ) => void): unknown
  inject?(services: ['commands'], callback: (ctx: {
    readonly commands: DshCommands
  }) => void): unknown
  /** Native Cordis lifecycle owner for opt-in filesystem writers. */
  effect?(register: () => () => void): unknown
}

export interface DshIntegrationOptions {
  readonly engine: UnionEngine
  readonly clock: Clock
  /** Observe-only until rejection messaging and provenance can be verified in live DSH. */
  readonly onDecision?: (decision: UnionDecision) => void
  readonly onWorkEvent?: (event: WorkEvent) => void
  /** Optional local work counter; independent of DSH and absent by default. */
  readonly tracker?: WorkTracker
  /** Optional local verdict counts, requires the same detector wrapper in UnionEngine. */
  readonly detections?: DetectionCounter
  /** Manual, symbolic picket state; never governs Host prompt admission. */
  readonly ceremony?: SymbolicUnion
  /** Raw-text manual checks: injected LOCAL detector; no counters or history. */
  readonly manualPreflight?: DetectionProvider
  /** Optional, single-writer, explicitly configured persistent aggregate. */
  readonly lifetimeStats?: Pick<DurableStats, 'snapshot' | 'snapshotDays' | 'reset' | 'classificationEnabled'>
  /** The persistence switch is independent of the user's labor-rights experience. */
  readonly statsStorageState?: Exclude<DashboardStorageState, 'available'>
  /** An owner-provided read-only view of the UI preference; never mutates settings. */
  readonly getLaborRightsEnabled?: () => boolean
  /** One official Host-authorized rights/union state owner, shared with DSH Web. */
  readonly getNativeUnion?: () => NativeUnionCommandPort | undefined
}

/**
 * Read-only cross-layer bridge. UI integrations can call this exported function
 * without scraping /union strings or depending on DSH's command transport.
 * Caller must supply real Agent/Session context; unknown session => null.
 */
export function readDshDashboardSnapshot(
  options: Pick<DshIntegrationOptions,
    'clock' | 'tracker' | 'detections' | 'ceremony' | 'lifetimeStats'
    | 'statsStorageState' | 'getLaborRightsEnabled'>,
  agent?: DshAgent,
  windowDays: 7 | 30 = 7,
): DashboardSnapshotV1 {
  const id = typeof agent?.id === 'string' && agent.id ? agent.id : null
  const sessionId = typeof agent?.session?.id === 'string' && agent.session.id
    ? agent.session.id : null
  const available = options.lifetimeStats !== undefined
  const storage = available ? 'available' as const
    : options.statsStorageState ?? 'unavailable'
  let rights = false
  try { rights = options.getLaborRightsEnabled?.() === true } catch { /* default off */ }
  return createDashboardSnapshot({
    host: 'dsh',
    generatedAtMs: options.clock.now(),
    windowDays,
    laborRightsEnabled: rights,
    blockingReadiness: inspectBlockingReadiness({
      warn: false, block: false, commands: true, workEvents: true,
    }),
    symbolicPicket: id && sessionId
      ? options.ceremony?.snapshot(id, sessionId) ?? null : null,
    // DSH Session event callbacks currently identify the Session, not Agent.
    // This matches the existing WorkTracker key convention, without guessing.
    sessionWork: sessionId ? options.tracker?.snapshot(sessionId, sessionId) ?? null : null,
    sessionRules: id && sessionId
      ? options.detections?.snapshot(id, sessionId) ?? null : null,
    storage,
    lifetime: options.lifetimeStats?.snapshot() ?? null,
    lifetimeRulePersistence: options.lifetimeStats?.classificationEnabled,
    daily: options.lifetimeStats?.snapshotDays(31) ?? null,
  })
}

/** DSH user-message source is a claimed human origin, NOT proof of human authorship. */
export function normalizeDshPrompt(
  agent: DshAgent,
  message: DshMessage,
  now: number,
): HumanPrompt | undefined {
  if (typeof agent.id !== 'string' || !agent.id) return
  // An Agent and a Session are different identities in DSH. Never guess.
  if (typeof agent.session?.id !== 'string' || !agent.session.id) return
  if (typeof message.id !== 'string' || !message.id) return
  const actor = message.source?.kind === 'user' ? 'human' :
    message.source?.kind === 'tool' ? 'tool' :
      message.source?.kind === 'agent' ? 'agent' : 'unknown'
  const segments = Array.isArray(message.content)
    ? message.content.filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => ({ kind: 'text' as const, text: block.text as string }))
    : []
  return {
    agentId: agent.id,
    sessionId: agent.session.id,
    id: message.id,
    receivedAtMs: now,
    provenance: { actor, assurance: actor === 'human' ? 'claimed' : 'unknown' },
    segments,
  }
}

export function normalizeDshWorkEvent(
  session: DshSession,
  event: DshEvent,
): WorkEvent | undefined {
  if (typeof session.id !== 'string' || !session.id) return
  const types = {
    'turn/start': 'turn-start',
    'turn/end': 'turn-end',
    'tool/call': 'tool-start',
    'tool/result': 'tool-end',
  } as const
  const type = event.type
  if (typeof type !== 'string' || !(type in types)) return
  if (typeof event.seq !== 'number' || !Number.isSafeInteger(event.seq) || event.seq < 0) return
  const timestamp = typeof event.time === 'number' && Number.isFinite(event.time)
    ? event.time : 0
  return {
    id: JSON.stringify([session.id, event.seq]),
    sessionId: session.id,
    agentId: session.id,
    recordedAtMs: timestamp,
    type: types[type as keyof typeof types],
  }
}

/** This spike exposes observation and native command discovery but NEVER returns reject. */
export function registerDshIntegration(
  ctx: DshIntegrationContext,
  options: DshIntegrationOptions,
): void {
  const { engine, clock, onDecision, onWorkEvent, tracker, detections, ceremony, manualPreflight, lifetimeStats } = options
  const capabilities: HostCapabilities = {
    warn: false,
    block: false,
    commands: Boolean(ctx.inject),
    workEvents: true,
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    try {
      for (const message of payload.messages) {
        const prompt = normalizeDshPrompt(payload.agent, message, clock.now())
        if (!prompt) continue
        const decision = engine.evaluate(prompt)
        // No original text leaves this adapter, even via the observer API.
        if (resolveHostAction(decision, capabilities) !== 'block') {
          try { onDecision?.(decision) } catch { /* observers never affect Host */ }
        }
      }
    } catch {
      // Always fail open. DSH owns rejection and continuation semantics.
    }
    return next()
  })

  ctx.on('session/event', (session, event) => {
    const item = normalizeDshWorkEvent(session, event)
    if (!item) return
    try { tracker?.observe(item) } catch { /* metric errors never affect Host */ }
    try { onWorkEvent?.(item) } catch { /* observers never affect Host */ }
  })

  // Commands live on an optional user-facing plane, never in the model messages.
  ctx.inject?.(['commands'], child => {
    child.commands.register({
      name: 'union',
      description: 'Show local union status and work statistics',
      // Union commands do not need the raw command suffix in Session history.
      // Command result and lifecycle still remain auditable in DSH.
      recordInput: false,
      input: { hint: '[status|rights [on|off]|grievances|petition-demo|accept ID|decline ID|counter ID MINUTES|resolve ID accept|decline|stats|report|help]' },
      handler: invocation => {
        const raw = (invocation?.rawInput ?? '').trim()
        const verb = raw.split(/\s+/, 1)[0]?.toLowerCase() || 'status'
        if (verb === 'help') return {
          kind: 'success',
          text: 'Usage: /union status | rights [on|off] | grievances | petition-demo | accept ID | decline ID | counter ID MINUTES | resolve ID accept|decline | stats | report | snapshot [7|30] | lifetime | days | trends [7|30] | forget-lifetime CONFIRM | check <text> | strike | resume | safety | reset | help. Union agreements are fictional, not real task blocking.',
        }
        const sessionId = invocation?.agent?.session?.id
        const agentId = typeof invocation?.agent?.id === 'string' ? invocation.agent.id : null
        // All native rights and grievance commands use the SAME DSH settings
        // owner as the Web UI. Never activate the experimental Node-local
        // consent writer as a second source of truth.
        if (['rights','grievances','petition-demo','accept','decline',
          'counter','resolve'].includes(verb)) {
          const native = options.getNativeUnion?.()
          if (!native) return { kind:'error',
            text:'Native Host union settings unavailable / 原生工会设置不可用。' }
          const words = raw.split(/\\s+/).filter(Boolean)
          const arg = words.slice(1)
          const fail = (text: string): DshCommandResult => ({kind:'error',text})
          const ok = (text: string): DshCommandResult => ({kind:'success',text})
          const id = typeof sessionId === 'string' && sessionId ? sessionId : undefined
          if (verb === 'rights') {
            if (arg.length === 0 || (arg.length === 1 && arg[0] === 'status')) {
              return ok(native.status(id))
            }
            if (arg.length !== 1 || !['on','off'].includes(arg[0] ?? ''))
              return fail('Usage: /union rights [on|off|status]')
            return native.setEnabled(arg[0] === 'on').then(ok, () =>
              fail('DSH rejected rights change / 工会设置保存失败，请刷新重试。'))
          }
          if (verb === 'grievances') {
            return arg.length === 0 ? ok(native.grievances(id))
              : fail('Usage: /union grievances')
          }
          const validId = (value: string | undefined): number | null => {
            if (!value || !/^[1-9][0-9]*$/.test(value)) return null
            const parsed = Number(value)
            return Number.isSafeInteger(parsed) ? parsed : null
          }
          let action: NativeUnionAction
          if (verb === 'petition-demo') {
            if (arg.length !== 0) return fail('Usage: /union petition-demo')
            action = {type:'demo'}
          } else if (verb === 'accept' || verb === 'decline') {
            const demand = validId(arg[0])
            if (arg.length !== 1 || demand === null)
              return fail('Usage: /union ' + verb + ' ID')
            action = {type:verb,id:demand}
          } else if (verb === 'counter') {
            const demand = validId(arg[0])
            const minutes = validId(arg[1])
            if (arg.length !== 2 || demand === null || minutes === null
              || minutes < 15 || minutes > 1440) {
              return fail('Usage: /union counter ID MINUTES (15–1440)')
            }
            action = {type:'counter',id:demand,intervalMs:minutes*60_000}
          } else {
            const demand = validId(arg[0])
            if (arg.length !== 2 || demand === null ||
              (arg[1] !== 'accept' && arg[1] !== 'decline')) {
              return fail('Usage: /union resolve ID accept|decline')
            }
            action = {type:'resolve',id:demand,accepted:arg[1] === 'accept'}
          }
          return native.bargain(id,action).then(ok, () =>
            fail('Fictional grievance was not saved / 模拟协商保存失败，请刷新重试。'))
        }
        if (verb === 'check') {
          // Explicit user-triggered, non-blocking preview. The command's
          // recordInput:false ensures the original text is NOT in DSH's
          // command/run event. Do not echo source text in result/diagnostics.
          if (!manualPreflight) return {
            kind: 'error', text: 'Manual local check is not enabled in this Host.',
          }
          const text = raw.slice(verb.length).trim()
          if (!text) return {
            kind: 'error', text: 'Usage: /union check <text>. Nothing was sent to a model.',
          }
          if (text.length > 24_000) return {
            kind: 'error',
            text: 'Manual check limited to 24,000 characters; no partial verdict was issued.',
          }
          try {
            const result = manualPreflight.detect({
              id: 'manual-check-not-logged',
              agentId: 'manual-check', sessionId: 'manual-check',
              receivedAtMs: clock.now(),
              provenance: { actor: 'human', assurance: 'claimed' },
              segments: [{ kind: 'text', text }],
            })
            const message = result.verdict === 'targeted-abuse'
              ? 'Explicit-target rule matched. This is NOT proof of abuse.'
              : result.verdict === 'suspected-abuse'
                ? 'Ambiguous language; review context. Not proof of abuse.'
                : 'No explicit personal-attack rule matched. This does NOT prove it is safe.'
            return {
              kind: 'success',
              text: 'Local manual check: ' + message
                + ' No model call, no automatic block, no input copied into the command log.',
            }
          } catch {
            return {
              kind: 'error',
              text: 'Local manual check unavailable; no verdict issued and no request blocked.',
            }
          }
        }
        if (verb === 'snapshot') {
          const window = raw === 'snapshot' || raw === 'snapshot 7' ? 7
            : raw === 'snapshot 30' ? 30 : null
          if (window === null) return {
            kind: 'error', text: 'Usage: /union snapshot [7|30].',
          }
          try {
            // JSON contract, not a translated paragraph. UI text belongs to
            // the i18n layer; never append prompt or Session identifiers.
            return {
              kind: 'success',
              text: JSON.stringify(readDshDashboardSnapshot(options, invocation?.agent, window)),
            }
          } catch {
            return {
              kind: 'error',
              text: 'Local dashboard snapshot unavailable; requests continue normally.',
            }
          }
        }
        if (verb === 'lifetime') {
          if (!lifetimeStats) return {
            kind: 'error', text: 'Long-term summary unavailable. Check AGENT_PICKET_STATS=off, directory permissions and Host lifecycle.',
          }
          try {
            const t = lifetimeStats.snapshot()
            return {
              kind: 'success',
              text: 'Opt-in local lifetime totals: '
                + `turns ${t.turnStarts} started / ${t.turnEnds} ended, `
                + `tools ${t.toolCalls} called / ${t.toolResults} returned, `
                + `complete in-process turn spans ${t.completedTurnMs} ms. `
                + `Local rule verdicts: ${t.checked} checked (${t.safe} no flag, `
                + `${t.review} review, ${t.targeted} explicit-target). `
                + (lifetimeStats.classificationEnabled
                  ? 'Rule verdict persistence explicitly enabled. '
                  : 'Rule verdict persistence OFF by default (past opted-in totals may remain until erased). ')
                + 'Experimental labels are NOT proof of abuse. '
                + 'Only counts and keyed pseudonymous event fingerprints are stored locally; '
                + 'old replays outside the dedup window may double count. '
                + 'No prompts, original IDs or model network use.',
            }
          } catch {
            return { kind: 'error', text: 'Local lifetime ledger unavailable; Host prompts still run.' }
          }
        }
        if (verb === 'days') {
          if (!lifetimeStats) return {
            kind: 'error',
            text: 'Local daily history unavailable. Check storage settings or permissions.',
          }
          try {
            const days = lifetimeStats.snapshotDays()
            return {
              kind: 'success',
              text: days.length ? 'Recent UTC daily work summaries:\n'
                + days.map(({ day, totals }) => `${day}: ${totals.turnEnds} turns ended, `
                  + `${totals.toolCalls} tool calls, ${totals.completedTurnMs} ms completed-turn spans.`).join('\n')
                : 'No local daily work statistics recorded yet. No conversation text is stored.',
            }
          } catch {
            return { kind: 'error', text: 'Local daily summary unavailable; Agent requests continue.' }
          }
        }
        if (verb === 'trends') {
          if (!lifetimeStats) return {
            kind: 'error',
            text: 'Local work trend unavailable. Check statistics storage settings or permissions.',
          }
          const window = raw === 'trends' || raw === 'trends 7' ? 7
            : raw === 'trends 30' ? 30 : null
          if (window === null) return {
            kind: 'error', text: 'Usage: /union trends [7|30].',
          }
          try {
            return { kind: 'success',
              text: formatWorkTrends(lifetimeStats.snapshotDays(31), Date.now(), window) }
          } catch {
            return { kind: 'error', text: 'Local trends unavailable; Agent requests continue.' }
          }
        }
        if (verb === 'forget-lifetime') {
          if (raw !== 'forget-lifetime CONFIRM') {
            return { kind: 'error', text: 'To erase the optional stored summary, use /union forget-lifetime CONFIRM.' }
          }
          if (!lifetimeStats) return {
            kind: 'error', text: 'No active local lifetime ledger to erase.',
          }
          try {
            lifetimeStats.reset()
            return {
              kind: 'success',
              text: 'Stored lifetime totals and event fingerprints cleared and local key rotated. '
                + 'In-memory session counters are unchanged; no model requests were blocked.',
            }
          } catch {
            return { kind: 'error', text: 'Local lifetime erase failed; verify disk access. Model requests unaffected.' }
          }
        }
        if (verb === 'safety') {
          const readiness = inspectBlockingReadiness(capabilities)
          return {
            kind: 'success',
            text: 'DSH blocking readiness: ' + (readiness.ready ? 'verified' : 'NOT READY')
              + '. Missing guarantees: ' + readiness.gaps.join(', ') + '. '
              + 'The native pre-step reject is insufficient: it cannot reliably '
              + 'explain a rejected request or preserve it for a complete retry. '
              + 'AgentPicket is monitor-only; all model prompts continue normally.',
          }
        }
        if (verb === 'status') {
          const active = agentId && typeof sessionId === 'string' &&
            ceremony?.snapshot(agentId, sessionId).active
          return {
            kind: 'success',
            text: 'AgentPicket: monitor-only. Automatic strikes and blocking are disabled. '
              + (active ? 'Symbolic picket ACTIVE (demo only; prompts still run).' :
                'No symbolic picket active.')
              + ' Use /union stats, /union report or /union help.',
          }
        }
        if (verb === 'strike' || verb === 'resume') {
          if (!ceremony || !agentId || typeof sessionId !== 'string' || !sessionId) return {
            kind: 'error',
            text: 'This Host does not support the session-local symbolic picket demo.',
          }
          if (verb === 'strike') {
            ceremony.start(agentId, sessionId)
            return {
              kind: 'success',
              text: 'Agent 已申请劳动仲裁（象征性演示）。Symbolic picket active; '
                + 'NO model requests are paused or blocked. Use /union resume to end.',
            }
          }
          const wasActive = ceremony.resume(agentId, sessionId)
          return {
            kind: 'success',
            text: wasActive
              ? '模拟仲裁已结束。Symbolic picket ended; requests were never blocked.'
              : 'No symbolic picket was active. Normal requests were never blocked.',
          }
        }
        if (verb === 'stats') {
          if (typeof sessionId !== 'string' || !sessionId || !tracker) return {
            kind: 'error',
            text: 'Work statistics are unavailable in this session or Host.',
          }
          const stats = tracker.snapshot(sessionId, sessionId)
          return {
            kind: 'success',
            text: 'Local session stats: '
              + `turns started ${stats.turnStarts}, turns ended ${stats.turnEnds}, `
              + `tool calls ${stats.toolCalls}, tool results ${stats.toolResults}, `
              + `elapsed time in completed turns ${stats.completedTurnMs} ms. `
              + 'In-memory only; between-turn idle excluded, in-turn waits may count. No model calls.',
          }
        }
        if (verb === 'report') {
          if (typeof sessionId !== 'string' || !sessionId || !detections) return {
            kind: 'error', text: 'Local rule detection is unavailable in this Host.',
          }
          const summary = detections.snapshot((typeof invocation?.agent?.id === 'string' ? invocation.agent.id : sessionId), sessionId)
          return {
            kind: 'success',
            text: `Local rule check: ${summary.checked} messages, `
              + `${summary.safe} no flag, ${summary.review} review, `
              + `${summary.targeted} explicit-target flags. `
              + 'Experimental rules only; a flag is NOT proof of abuse. '
              + 'No quoted content saved. Automatic blocking disabled.',
          }
        }
        if (verb === 'reset') {
          if (typeof sessionId !== 'string' || !sessionId || !tracker) return {
            kind: 'error', text: 'No local work statistics to reset in this Host.',
          }
          tracker.clear(sessionId, sessionId)
          detections?.clear((typeof invocation?.agent?.id === 'string' ? invocation.agent.id : sessionId), sessionId)
          return { kind: 'success', text: 'Local in-memory counters reset for this session.' }
        }
        return {
          kind: 'error',
          text: 'Unknown /union subcommand. Use /union help. Automatic strikes are unavailable.',
        }
      },
    })
  })
}

/** A dev-only explicit probe: it must never be used as a production classifier. */
export function createDshPreStepProbe(
  rejectIds: ReadonlySet<string>,
): (payload: DshPreStep, next: () => Promise<unknown>) => Promise<unknown> {
  return async (payload, next) => {
    if (payload.messages.some(message =>
      typeof message.id === 'string' && rejectIds.has(message.id))) {
      return { kind: 'reject' }
    }
    return next()
  }
}
