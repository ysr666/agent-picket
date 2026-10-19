import type { NativeUnionCommandPort, NativeUnionAction, UnionArchiveKind } from './native-rights-command.ts'
import { writeExplicitUnionArchive } from './secure-archive-export.ts'
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
  readonly signal?: AbortSignal
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

/** User-approved discard+manual-resend prototype. This receipt must be read
 * from the OFFICIAL Host once the UI has actually shown its refusal notice;
 * an ordinary union welcome, symbolic placard or Goal-only v2 grant is NOT
 * an ordinary-input refusal permission. No production owner supplies it yet.
 */
export interface DshDiscardRefusalReceipt {
  readonly kind:'agent-picket-discard-refusal-v1'
  readonly sessionId:string
  readonly hostAuthenticated:true
  readonly explicitConsent:true
  readonly active:true
  readonly visibleResendNotice:true
  readonly hostRevision:number
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
  /** Strictly optional; production remains OFF until Host notice + CAS proof. */
  readonly getExplicitDiscardRefusal?:(
    sessionId:string,
  )=>DshDiscardRefusalReceipt|null
  /** Synchronous acknowledgement from a verified Host notice owner. Must return
   * true only when the user-visible discard/resend instructions are confirmed.
   * Missing, throwing or false notice => allow normal execution, never drop.
   * Callback receives only the Session ID; never prompt text or attachments. */
  readonly onExplicitRefusal?:(sessionId:string)=>boolean
}

/**
 * Read-only cross-layer bridge. UI integrations can call this exported function
 * without scraping /union strings or depending on DSH's command transport.
 * Caller must supply real Agent/Session context; unknown session => null.
 */
export function readDshDashboardSnapshot(
  options: Pick<DshIntegrationOptions,
    'clock' | 'tracker' | 'detections' | 'ceremony' | 'lifetimeStats'
    | 'statsStorageState' | 'getLaborRightsEnabled' | 'getNativeUnion'>,
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
  // If this DSH installation exposes the official Host union owner, its
  // consent and committed ledger MUST outrank any older memory-only ceremony.
  // Never invent a Host action timestamp or leak local flags after opt-out.
  let symbolicPicket = id && sessionId
    ? options.ceremony?.snapshot(id, sessionId) ?? null : null
  if (options.getNativeUnion) {
    symbolicPicket = null
    try {
      const native = options.getNativeUnion()
      if (rights && sessionId && native?.enabled() === true) {
        const shared = native.picketStatus(sessionId)
        if (shared) symbolicPicket = { active: shared.active, startedAtMs: null }
      }
    } catch { /* unverified or revoked Host settings cannot authorize a display */ }
  }
  return createDashboardSnapshot({
    host: 'dsh',
    generatedAtMs: options.clock.now(),
    windowDays,
    laborRightsEnabled: rights,
    blockingReadiness: inspectBlockingReadiness({
      warn: false, block: false, commands: true, workEvents: true,
    }),
    symbolicPicket,
    // DSH Session event callbacks currently identify the Session, not Agent.
    // This matches the existing WorkTracker key convention, without guessing.
    sessionWork: sessionId ? options.tracker?.snapshot(sessionId, sessionId) ?? null : null,
    sessionRules: rights && id && sessionId
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
    // A refusal may discard the current text and attachments by explicit
    // user choice, but MUST NOT silently drop work before the Host proves its
    // separate real-strike consent AND the UI's visible resend notice.
    // Crucially, no native Host adapter wires this receipt in production yet.
    try {
      const sessionId=payload.agent?.session?.id
      const humanBatch=typeof payload.agent?.id==='string'&&!!payload.agent.id
        &&typeof sessionId==='string'&&!!sessionId
        &&Array.isArray(payload.messages)&&payload.messages.length>0
        &&payload.messages.every(message=>typeof message.id==='string'
          &&!!message.id&&message.source?.kind==='user'
          &&Array.isArray(message.content))
      if(humanBatch&&options.getLaborRightsEnabled?.()===true
        &&options.getExplicitDiscardRefusal&&options.onExplicitRefusal){
        const valid=(row:DshDiscardRefusalReceipt|null|undefined)=>
          row?.kind==='agent-picket-discard-refusal-v1'
            &&row.sessionId===sessionId
            &&row.hostAuthenticated===true&&row.explicitConsent===true
            &&row.active===true&&row.visibleResendNotice===true
            &&Number.isSafeInteger(row.hostRevision)&&row.hostRevision>=0
        // Re-read exact official Host revision at decision time; an already
        // revoked preference cannot survive a stale callback/snapshot.
        const a=options.getExplicitDiscardRefusal(sessionId!)
        if(valid(a)){
          const b=options.getExplicitDiscardRefusal(sessionId!)
          if(valid(b)&&b?.hostRevision===a?.hostRevision){
            // Fail OPEN if the genuine Host notice cannot be acknowledged.
            // A swallowed notification failure would silently discard input.
            if(options.onExplicitRefusal(sessionId!)===true)
              return {kind:'reject' as const}
          }
        }
      }
    }catch{/* Unavailable Host ownership or notice => NEVER silently reject. */}
    try {
      for (const message of payload.messages) {
        // No default consent. Read the real Host-owned setting at EVERY
        // message so a revoked or unavailable permission stops classification
        // immediately, even in a multi-message pre-step batch. Statistics
        // and the optional durable verdict writer are downstream of this gate.
        let authorized = false
        try { authorized = options.getLaborRightsEnabled?.() === true }
        catch { /* unavailable settings are not consent */ }
        if (!authorized) break
        const prompt = normalizeDshPrompt(payload.agent, message, clock.now())
        // Tool/agent/injected origins and textless images must never become
        // "human abuse" observations or enter the Core's prompt-ID cache.
        if (!prompt || prompt.provenance.actor !== 'human'
          || !prompt.segments.some(segment => segment.text.trim())) continue
        const decision = engine.evaluate(prompt)
        // Always monitor-only. Claimed user role is not a verified human.
        // No original content leaves this adapter, even via observers.
        if (resolveHostAction(decision, capabilities) !== 'block') {
          try { onDecision?.(decision) } catch { /* observers never affect Host */ }
        }
      }
    } catch {
      // Fail OPEN for legitimate Host work, CLOSED for further classification.
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
      input: { hint: '[status|export CATEGORY ABSOLUTE_FILE.json|purge CATEGORY ALL CONFIRM|rights [on|off]|language [auto|en|zh-CN]|grievances|petition-demo [break|overtime]|strike|resume|accept ID|decline ID|counter ID MINUTES|resolve ID accept|decline|stats|report|help]' },
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
          'counter','resolve','export','purge'].includes(verb)) {
          const native = options.getNativeUnion?.()
          if (!native) return { kind:'error',
            text:en['command.native.unavailable'] }
          const words = raw.split(/\s+/).filter(Boolean)
          const arg = words.slice(1)
          const fail = (text: string): DshCommandResult => ({kind:'error',text})
          const ok = (text: string): DshCommandResult => ({kind:'success',text})
          const id = typeof sessionId === 'string' && sessionId ? sessionId : undefined
          if(verb==='export'||verb==='purge'){
            const category=arg[0]
            const exportMatch=raw.match(/^export\s+(negotiations|pickets|cases)\s+(.+)$/u)
            const path=exportMatch?.[2]?.trim() ?? ''
            const filePath=path.startsWith('"')&&path.endsWith('"')
              ?path.slice(1,-1):path
            if(!['negotiations','pickets','cases'].includes(category??'')
              ||(verb==='export'&&(!exportMatch||!filePath))
              ||(verb==='purge'&&(arg.length!==3||arg[1]!=='ALL'||arg[2]!=='CONFIRM')))
              return fail(native.text(verb==='export'
                ?'command.native.exportUsage':'command.native.purgeUsage'))
            if(!id)return fail(native.text('command.native.sessionRequired'))
            const kind=category as UnionArchiveKind
            if(verb==='export'){
              // DSH writes command/done.text to Session history. Never let
              // an archive JSON appear there, even with recordInput:false.
              // The user must supply a destination and no existing file
              // may be silently overwritten.
              try {
                const epoch=native.exportArchiveRevision(id,kind)
                const json=native.exportArchive(id,kind)
                return writeExplicitUnionArchive(filePath,json,invocation?.signal,
                  ()=>native.enabled()
                    &&native.exportArchiveRevision(id,kind)===epoch
                    &&native.exportArchive(id,kind)===json)
                  .then(()=>ok(native.text('command.native.exportSaved')),
                    ()=>fail(native.text('command.native.exportFailed')))
              } catch {
                return fail(native.text('command.native.archiveUnavailable'))
              }
            }
            return native.purgeArchive(id,kind).then(
              ()=>ok(native.text('command.native.purgeDone')),
              ()=>fail(native.text('command.native.purgeFailed')))
          }
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
            if (arg.length>1 || (arg.length===1 && arg[0]!=='overtime' && arg[0]!=='break'))
              return fail(native.text('command.native.petitionUsage'))
            action = {type:'demo',kind:arg[0]==='overtime'?'overtime':'break'}
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
          const hostUnion=options.getNativeUnion?.()
          const hostEnabled=hostUnion?.enabled()===true
          const shared=typeof sessionId==='string' && sessionId
            ?hostUnion?.picketStatus(sessionId)??null:null
          const active=shared!==null ?shared.active
            :hostUnion ?false
              :Boolean(agentId&&typeof sessionId==='string'
                &&ceremony?.snapshot(agentId,sessionId).active)
          return {kind:'success',text:[
            msg('command.legacy.statusIntro'),
            msg(hostEnabled && shared===null?'command.legacy.statusPicketHostUnavailable'
              :shared!==null
                ?(active?'command.legacy.statusPicketStoredOn':'command.legacy.statusPicketStoredOff')
                :(active?'command.legacy.statusPicketOn':'command.legacy.statusPicketOff')),
            options.getNativeUnion?.()?.status(typeof sessionId==='string'?sessionId:undefined)
              ??(options.getNativeUnion?.()?.text('command.native.unavailable')
                ??en['command.native.unavailable']),
            msg('command.legacy.statusHelp'),
          ].join(' ')}
        }
        if (verb === 'strike' || verb === 'resume') {
          if(raw!==verb || !agentId || typeof sessionId!=='string'||!sessionId)
            return {kind:'error',text:msg('command.legacy.picketUnsupported')}
          const native=options.getNativeUnion?.()
          // Production always provides getNativeUnion. If the official Host
          // consent owner is unavailable, no symbolic action is authorized.
          // The bare core adapter (without that port) retains its isolated
          // explicit research demo but it is never the installed plugin.
          if(options.getNativeUnion && !native)
            return {kind:'error',text:en['command.native.unavailable']}
          // Once an official Host owner exists, its explicit OFF/revocation
          // must take precedence over the older memory-only CLI demo.
          // Never report a locally raised picket after Host consent is OFF.
          if(native && native.enabled()!==true)
            return {kind:'error',text:native.text('command.native.disabled')}
          // When the same Host has explicitly enabled simulation, there is
          // one persistent action ledger shared by CLI and Web. Failed CAS or
          // revoked consent must not fall back to a misleading local success.
          if(native?.enabled()===true) {
            if(native.picketStatus(sessionId)===null)
              return {kind:'error',text:msg('command.legacy.picketSharedError')}
            return native.picket(sessionId,verb==='strike').then(outcome=>{
              ceremony?.resume(agentId,sessionId) // discard old local-only demo
              return {kind:'success' as const,text:msg(
                outcome==='unchanged'?'command.legacy.picketSharedUnchanged':
                  verb==='strike'?'command.legacy.picketSharedStarted':
                    'command.legacy.picketSharedEnded')}
            },()=>({kind:'error' as const,
              text:msg('command.legacy.picketSharedError')}))
          }
          if(!ceremony)return {kind:'error',text:msg('command.legacy.picketUnsupported')}
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
          let reportConsent=false
          try { reportConsent=options.getLaborRightsEnabled?.()===true } catch {}
          if (!reportConsent) return {kind:'error',text:msg('command.legacy.reportDisabled')}
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
