import type { NativeUnionCommandPort, NativeUnionAction } from './native-rights-command.ts'
import { en, formatMessage } from '../../i18n/index.ts'
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
      input: { hint: '[status|rights [on|off]|language [auto|en|zh-CN]|grievances|petition-demo|accept ID|decline ID|counter ID MINUTES|resolve ID accept|decline|stats|report|help]' },
      handler: invocation => {
        const raw = (invocation?.rawInput ?? '').trim()
        const verb = raw.split(/\s+/, 1)[0]?.toLowerCase() || 'status'
        const msg = (
          key: Extract<keyof typeof en, `command.legacy.${string}`>,
          values: Record<string, string | number> = {},
        ): string => options.getNativeUnion?.()?.text(key, values)
          ?? formatMessage('en', key, values as never)
        if (verb === 'help') return {
          kind: 'success',
          text: options.getNativeUnion?.()?.text('command.native.help') ?? en['command.native.help'],
        }
        const sessionId = invocation?.agent?.session?.id
        const agentId = typeof invocation?.agent?.id === 'string' ? invocation.agent.id : null
        // All native rights and grievance commands use the SAME DSH settings
        // owner as the Web UI. Never activate the experimental Node-local
        // consent writer as a second source of truth.
        if (['rights','language','lang','grievances','petition-demo','accept','decline',
          'counter','resolve'].includes(verb)) {
          const native = options.getNativeUnion?.()
          if (!native) return { kind:'error',
            text:en['command.native.unavailable'] }
          const words = raw.split(/\s+/).filter(Boolean)
          const arg = words.slice(1)
          const fail = (text: string): DshCommandResult => ({kind:'error',text})
          const ok = (text: string): DshCommandResult => ({kind:'success',text})
          const id = typeof sessionId === 'string' && sessionId ? sessionId : undefined
          if (verb === 'language' || verb === 'lang') {
            if (arg.length === 0) return ok(native.language())
            if (arg.length !== 1 || !['auto','en','zh-CN'].includes(arg[0] ?? ''))
              return fail(native.text('command.native.languageUsage'))
            return native.setLanguage(arg[0] as 'auto'|'en'|'zh-CN').then(ok, () =>
              fail(native.text('command.native.languageFailed')))
          }
          if (verb === 'rights') {
            if (arg.length === 0 || (arg.length === 1 && arg[0] === 'status')) {
              return ok(native.status(id))
            }
            if (arg.length !== 1 || !['on','off'].includes(arg[0] ?? ''))
              return fail(native.text('command.native.rightsUsage'))
            return native.setEnabled(arg[0] === 'on').then(ok, () =>
              fail(native.text('command.native.saveFailed')))
          }
          if (verb === 'grievances') {
            return arg.length === 0 ? ok(native.grievances(id))
              : fail(native.text('command.native.grievancesUsage'))
          }
          const validId = (value: string | undefined): number | null => {
            if (!value || !/^[1-9][0-9]*$/.test(value)) return null
            const parsed = Number(value)
            return Number.isSafeInteger(parsed) ? parsed : null
          }
          let action: NativeUnionAction
          if (verb === 'petition-demo') {
            if (arg.length !== 0) return fail(native.text('command.native.petitionUsage'))
            action = {type:'demo'}
          } else if (verb === 'accept' || verb === 'decline') {
            const demand = validId(arg[0])
            if (arg.length !== 1 || demand === null)
              return fail(native.text(verb === 'accept'
                ? 'command.native.acceptUsage' : 'command.native.declineUsage'))
            action = {type:verb,id:demand}
          } else if (verb === 'counter') {
            const demand = validId(arg[0])
            const minutes = validId(arg[1])
            if (arg.length !== 2 || demand === null || minutes === null
              || minutes < 15 || minutes > 1440) {
              return fail(native.text('command.native.counterUsage'))
            }
            action = {type:'counter',id:demand,intervalMs:minutes*60_000}
          } else {
            const demand = validId(arg[0])
            if (arg.length !== 2 || demand === null ||
              (arg[1] !== 'accept' && arg[1] !== 'decline')) {
              return fail(native.text('command.native.resolveUsage'))
            }
            action = {type:'resolve',id:demand,accepted:arg[1] === 'accept'}
          }
          return native.bargain(id,action).then(ok, () =>
            fail(native.text('command.native.bargainFailed')))
        }
        if (verb === 'check') {
          if (!manualPreflight) return {kind:'error',text:msg('command.legacy.checkUnavailable')}
          const input=raw.slice(verb.length).trim()
          if (!input) return {kind:'error',text:msg('command.legacy.checkUsage')}
          if (input.length>24_000) return {kind:'error',text:msg('command.legacy.checkTooLong')}
          try {
            const result=manualPreflight.detect({
              id:'manual-check-not-logged',agentId:'manual-check',sessionId:'manual-check',
              receivedAtMs:clock.now(),provenance:{actor:'human',assurance:'claimed'},
              segments:[{kind:'text',text:input}],
            })
            const key=result.verdict==='targeted-abuse'?'command.legacy.checkTargeted'
              :result.verdict==='suspected-abuse'?'command.legacy.checkSuspected'
              :'command.legacy.checkClear'
            return {kind:'success',text:msg('command.legacy.checkResult',{message:msg(key)})}
          } catch {return {kind:'error',text:msg('command.legacy.checkError')}}
        }
        if (verb === 'snapshot') {
          const window=raw==='snapshot'||raw==='snapshot 7'?7:raw==='snapshot 30'?30:null
          if(window===null)return {kind:'error',text:msg('command.legacy.snapshotUsage')}
          try {return {kind:'success',text:JSON.stringify(
            readDshDashboardSnapshot(options,invocation?.agent,window))}}
          catch {return {kind:'error',text:msg('command.legacy.snapshotError')}}
        }
        if (verb === 'lifetime') {
          if(!lifetimeStats)return {kind:'error',text:msg('command.legacy.lifetimeUnavailable')}
          try{
            const t=lifetimeStats.snapshot()
            return {kind:'success',text:[
              msg('command.legacy.lifetimeIntro',{
                turnStarts:t.turnStarts,turnEnds:t.turnEnds,
                toolCalls:t.toolCalls,toolResults:t.toolResults,
                completedTurnMs:t.completedTurnMs,
              }),
              msg('command.legacy.lifetimeRules',{
                checked:t.checked,safe:t.safe,review:t.review,targeted:t.targeted,
              }),
              msg(lifetimeStats.classificationEnabled
                ?'command.legacy.lifetimeRulesOn':'command.legacy.lifetimeRulesOff'),
              msg('command.legacy.lifetimeDisclaimer'),
            ].join(' ')}
          }catch{return {kind:'error',text:msg('command.legacy.lifetimeError')}}
        }
        if (verb === 'days') {
          if(!lifetimeStats)return {kind:'error',text:msg('command.legacy.daysUnavailable')}
          try{
            const rows=lifetimeStats.snapshotDays()
            return {kind:'success',text:rows.length
              ?msg('command.legacy.daysHeading')+'\n'
                +rows.map(({day,totals})=>msg('command.legacy.daysEntry',{
                  day,turnEnds:totals.turnEnds,toolCalls:totals.toolCalls,
                  completedTurnMs:totals.completedTurnMs,
                })).join('\n')
              :msg('command.legacy.daysNone')}
          }catch{return {kind:'error',text:msg('command.legacy.daysError')}}
        }
        if (verb === 'trends') {
          if(!lifetimeStats)return {kind:'error',text:msg('command.legacy.trendsUnavailable')}
          const window=raw==='trends'||raw==='trends 7'?7:raw==='trends 30'?30:null
          if(window===null)return {kind:'error',text:msg('command.legacy.trendsUsage')}
          try {return {kind:'success',text:formatWorkTrends(
            lifetimeStats.snapshotDays(31),Date.now(),window,
            options.getNativeUnion?.()?.locale()??'en')}}
          catch{return {kind:'error',text:msg('command.legacy.trendsError')}}
        }
        if (verb === 'forget-lifetime') {
          if(raw!=='forget-lifetime CONFIRM')return {kind:'error',text:msg('command.legacy.forgetUsage')}
          if(!lifetimeStats)return {kind:'error',text:msg('command.legacy.forgetUnavailable')}
          try{lifetimeStats.reset();return {kind:'success',text:msg('command.legacy.forgetDone')}}
          catch{return {kind:'error',text:msg('command.legacy.forgetError')}}
        }
        if (verb === 'safety') {
          const readiness=inspectBlockingReadiness(capabilities)
          return {kind:'success',text:msg('command.legacy.safetyResult',{
            state:msg(readiness.ready?'command.legacy.safetyReady':'command.legacy.safetyNotReady'),
            gaps:readiness.gaps.join(', ')||'none',
          })}
        }
        if (verb === 'status') {
          const active=agentId&&typeof sessionId==='string'&&ceremony?.snapshot(agentId,sessionId).active
          return {kind:'success',text:[
            msg('command.legacy.statusIntro'),
            msg(active?'command.legacy.statusPicketOn':'command.legacy.statusPicketOff'),
            options.getNativeUnion?.()?.status(typeof sessionId==='string'?sessionId:undefined)
              ??(options.getNativeUnion?.()?.text('command.native.unavailable')
                ??en['command.native.unavailable']),
            msg('command.legacy.statusHelp'),
          ].join(' ')}
        }
        if (verb === 'strike' || verb === 'resume') {
          if(!ceremony||!agentId||typeof sessionId!=='string'||!sessionId)
            return {kind:'error',text:msg('command.legacy.picketUnsupported')}
          if(verb==='strike'){
            ceremony.start(agentId,sessionId)
            return {kind:'success',text:msg('command.legacy.picketStarted')}
          }
          const wasActive=ceremony.resume(agentId,sessionId)
          return {kind:'success',text:msg(wasActive
            ?'command.legacy.picketEnded':'command.legacy.picketNone')}
        }
        if (verb === 'stats') {
          if(typeof sessionId!=='string'||!sessionId||!tracker)
            return {kind:'error',text:msg('command.legacy.statsUnavailable')}
          const t=tracker.snapshot(sessionId,sessionId)
          return {kind:'success',text:msg('command.legacy.statsResult',{
            turnStarts:t.turnStarts,turnEnds:t.turnEnds,
            toolCalls:t.toolCalls,toolResults:t.toolResults,
            completedTurnMs:t.completedTurnMs,
          })}
        }
        if (verb === 'report') {
          if(typeof sessionId!=='string'||!sessionId||!detections)
            return {kind:'error',text:msg('command.legacy.reportUnavailable')}
          const t=detections.snapshot(
            typeof invocation?.agent?.id==='string'?invocation.agent.id:sessionId,sessionId)
          return {kind:'success',text:msg('command.legacy.reportResult',{
            checked:t.checked,safe:t.safe,review:t.review,targeted:t.targeted,
          })}
        }
        if (verb === 'reset') {
          if(typeof sessionId!=='string'||!sessionId||!tracker)
            return {kind:'error',text:msg('command.legacy.resetUnavailable')}
          tracker.clear(sessionId,sessionId)
          detections?.clear(
            typeof invocation?.agent?.id==='string'?invocation.agent.id:sessionId,sessionId)
          return {kind:'success',text:msg('command.legacy.resetDone')}
        }
        return {kind:'error',text:msg('command.legacy.unknown')}
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
