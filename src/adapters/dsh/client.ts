import { createBrowserDashboardBridge } from './client-dashboard.ts'
import { createBrowserLifetimeWorkReader, createCompletedTurnRefreshGate } from './client-lifetime.ts'
import { createBrowserDignityReader } from './client-dignity.ts'
import {createBrowserRefusalNoticeReader,probeDshRefusalNoticeCapability,
  supportsVerifiedWebRefusalTransport} from './client-refusal-notice.ts'
import { createDshBrowserUnionDesk, type UnionSettingsSection } from './client-bargaining.ts'
import {createDshLocalComposerPicket,type DshComposerBlocks} from './client-composer-picket.ts'
import { createDshClientRightsScope, type DshSettingsScope } from './client-rights-scope.ts'
import {createDshRealGoalConsentControl} from './client-goal-consent.ts'
import {createDshInputRefusalConsentControl} from './input-refusal-consent.ts'
import {createDshGoalServiceWitness} from './client-goal-capability.ts'
import { createOfficialDsh017Scope, type OfficialHostMirror, type OfficialHostSettings } from './client-host-settings-017.ts'
import { registerDshNativeRightsSlots, type ReactForDsh, type PortalForDsh, type DshSlots } from './native-rights-ui.ts'
import { formatMessage, resolveLocale, type MessageKey } from '../../i18n/index.ts'

/**
 * DSH Web CLIENT companion. Uses official Session/Goal projections for
 * read-only notices; the user's optional local composer pause is client-only.
 * No model call, prompt interception, arbitrary Host block or tool cancellation.
 */
export const inject = ['sessions', 'commandUi']

interface Scope {
  get(name: 'conversation'): {
    input: { for(context: Scope): { notify(level: 'info' | 'error', message: string): void } }
    blocks?:DshComposerBlocks
  } | undefined
}
/** DSH 0.1.2 exposes `current`; DSH 0.1.7 exposes main-view retainers.
 * If multiple rows claim main-view retention, fail closed instead of
 * attributing one Agent's fictional grievance to another Session. */
export function currentDshUnionSession(state?: {
  current?: string
  byId?: Record<string, { retainedBy?: {mainView?: number} }>
}): string | undefined {
  if (!state) return undefined
  if (typeof state.current === 'string' && state.current) return state.current
  const retained = Object.entries(state.byId ?? {})
    .filter(([,row]) => Number.isSafeInteger(row.retainedBy?.mainView)
      && (row.retainedBy?.mainView ?? 0) > 0)
  return retained.length === 1 ? retained[0]?.[0] : undefined
}

type GoalProjectionFace = {
  getSnapshot():unknown
  subscribe?(listener:()=>void):()=>void
}
type GoalBinding = {session?:{projections?:{faceOf(name:string):GoalProjectionFace}}}
export interface UnionGoalHold {
  readonly sessionId:string
  readonly goalId:string
  readonly revision:number
  readonly canResume:boolean
}

/** Show one notice only when a NEW, verified Host Goal block is observed.
 * Seed each Session's initial projection without replaying old notices on
 * browser reload or Session navigation; never infer a strike from consent. */
export function createDshGoalStopNoticeGate(){
  let sessionId:string|null=null
  let last:string|null=null
  const key=(hold:UnionGoalHold|null)=>hold?
    [hold.sessionId,hold.goalId,hold.revision].join(':'):null
  return {
    seed(id:string|null,hold:UnionGoalHold|null){
      sessionId=id
      last=id&&hold?.sessionId===id?key(hold):null
    },
    change(id:string|null,hold:UnionGoalHold|null){
      if(!id||id!==sessionId)return false
      const next=hold?.sessionId===id?key(hold):null
      const notify=next!==null&&next!==last
      last=next
      return notify
    },
  }
}
export function createDshGoalRecoveryPort(options:{
  currentSession:()=>string|undefined
  binding:(sessionId:string)=>GoalBinding|undefined
  resume?:(sessionId:string,ref:{id:string;revision:number})=>Promise<unknown>
  isAvailable?:()=>boolean
}){
  let pending=false
  const read=():UnionGoalHold|null=>{
    try{
      const sessionId=options.currentSession()
      if(!sessionId)return null
      const binding=options.binding(sessionId)
      const value=binding?.session?.projections?.faceOf('goal')?.getSnapshot()
      if(!value||typeof value!=='object')return null
      const {goal,roundsStarted}=value as {goal?:{
        id?:unknown;revision?:unknown;phase?:unknown
        blockedReason?:{code?:unknown};maxGoalRounds?:unknown
      };roundsStarted?:unknown}
      if(!goal||goal.phase!=='blocked'||goal.blockedReason?.code!=='picket-work-limit'
        ||typeof goal.id!=='string'||goal.id.length===0
        ||!Number.isSafeInteger(goal.revision)||(goal.revision as number)<1
        ||!Number.isSafeInteger(roundsStarted)||(roundsStarted as number)<0
        ||!Number.isSafeInteger(goal.maxGoalRounds)
        ||(goal.maxGoalRounds as number)<=0
        ||options.currentSession()!==sessionId
        ||options.binding(sessionId)!==binding)return null
      return {sessionId,goalId:goal.id,revision:goal.revision as number,
        canResume:typeof options.resume==='function'
          &&options.isAvailable?.()!==false
          &&(roundsStarted as number)<(goal.maxGoalRounds as number)}
    }catch{return null}
  }
  async function resume(expected:UnionGoalHold):Promise<'requested'>{
    if(pending)throw Error('Goal resume already pending')
    const current=read()
    if(!current||current.sessionId!==expected.sessionId
      ||current.goalId!==expected.goalId||current.revision!==expected.revision)
      throw Error('Host Goal or Session changed; verify current state before resuming')
    if(!current.canResume||!options.resume)
      throw Error('Official Goal recovery is unavailable')
    const originalBinding=options.binding(current.sessionId)
    pending=true
    try{
      const result=await options.resume(current.sessionId,{
        id:current.goalId,revision:current.revision}) as
        {ok?:unknown;value?:{id?:unknown;revision?:unknown;phase?:unknown}}
      if(options.currentSession()!==current.sessionId
        ||options.binding(current.sessionId)!==originalBinding)
        throw Error('Session changed during Host Goal recovery')
      if(result?.ok!==true||result.value?.id!==current.goalId
        ||result.value?.revision!==current.revision+1
        ||result.value?.phase!=='active')
        throw Error('Host did not confirm Goal resume; check Goal before retrying')
      return 'requested'
    }finally{pending=false}
  }
  return {read,resume}
}

interface ClientContext {
  effect?(register: () => () => void): unknown
  inject?(services: string[], cb: (ctx: ClientContext) => void): unknown
  slots?: DshSlots
  settingsScope?: { bind<T>(spec: { namespace: string }): DshSettingsScope<T> }
  configForms?: { describe(): OfficialHostMirror }
  remote?: OfficialHostSettings & {goals?:{get:(sessionId:string)=>Promise<unknown>;resume:(sessionId:string,ref:{id:string;revision:number})=>Promise<unknown>}}
  locale?: { getLocale(): { active: string }; subscribe(listener:()=>void):()=>void }
  conversation?:{blocks?:DshComposerBlocks}
  get?(name:'conversation'):{blocks?:DshComposerBlocks}|undefined
  /** Public Cordis service registration; removed with the client plugin fiber. */
  provide?(name: string, value: unknown): () => void
  on(name: 'command/executed', cb: (
    sessionId: string,
    name: string,
    result: { kind: 'success' | 'error'; text?: string },
  ) => void): unknown
  sessions: {
    list?: { getSnapshot(): { current?: string; phase?: string; byId?: Record<string,{ blank?:boolean; retainedBy?:{mainView?:number} }> }; subscribe(listener:()=>void):()=>void }
    scope(id: string): Scope | undefined
    binding?(id: string): { session?:{projections?:{faceOf(name:string):GoalProjectionFace}}; eventSource: {
      getSnapshot(): { entries: readonly {type?: unknown; event?: {type?: unknown;seq?: unknown;time?: unknown;data?: unknown}}[]; hasMore: boolean; revision: number }
      subscribe(listener: () => void): () => void
    } } | undefined
  }
}

/** Auto-invite only when DSH has a *verified real, nonblank* active
 * Session. The same conservative selector also scopes negotiated ledgers.
 * Never show a first-run invitation merely because an ambiguous/missing
 * Session happens to be in the Host snapshot. */
export function isDshUnionAutoWelcomeEligible(state?: {
  current?: string
  phase?: string
  byId?: Record<string, { blank?: boolean; retainedBy?: {mainView?:number} }>
}): boolean {
  if (state?.phase !== 'ready') return false
  const active = currentDshUnionSession(state)
  return !!active && state.byId?.[active]?.blank === false
}

export function apply(ctx: ClientContext, react?: ReactForDsh, portal?: PortalForDsh): void {
  const bridge = typeof ctx.sessions.binding === 'function'
    ? createBrowserDashboardBridge({binding: id => ctx.sessions.binding?.(id)}) : undefined
  if (typeof ctx.provide === 'function' && typeof ctx.sessions.binding === 'function') {
    // The provider is owned by the client Cordis fiber; no globals, no RPC,
    // no manual command dispatch, no model call, no Host data mutation.
    if (bridge) ctx.provide('agentPicketDashboard', bridge)
  }
  // Optional official Goal Remote is independently injected. Never make
  // the nonblocking Union onboarding dependent on Goal installation.
  let goalRemote:NonNullable<NonNullable<ClientContext['remote']>['goals']>|undefined
  const goalWitness=createDshGoalServiceWitness({
    currentSession:()=>currentDshUnionSession(ctx.sessions.list?.getSnapshot()),
    binding:id=>ctx.sessions.binding?.(id),
    remote:()=>goalRemote,
  })
  ctx.inject?.(['remote','remote.goals'],child=>{
    const granted=child.remote?.goals
    goalRemote=granted
    goalWitness.invalidate()
    // Public read-only service proof; do not contact Goal Host on startup
    // before there is an actual selected, nonblank Session.
    child.effect?.(()=>()=>{
      if(goalRemote===granted){goalRemote=undefined;goalWitness.invalidate()}
    })
  })
  // Optional official root conversation service. Capturing its public blocks
  // face never alters a Host submission or causes implicit input blocking.
  let rootComposerBlocks:DshComposerBlocks|null=null
  const localComposerPorts=new Set<ReturnType<typeof createDshLocalComposerPicket>>()
  ctx.inject?.(['conversation'],child=>{
    const provider=child.conversation?.blocks??child.get?.('conversation')?.blocks
    if(!provider)return
    rootComposerBlocks=provider
    for(const port of localComposerPorts)port.attach(provider)
    child.effect?.(()=>()=>{
      if(rootComposerBlocks!==provider)return
      rootComposerBlocks=null
      for(const port of localComposerPorts)port.attach(null)
    })
  })
  // Native React Slots are installed only when DSH's own services are present.
  // Their settings writes use the Host's authenticated settingsScope, never
  // the read-only agentPicketDashboard service.
  // Two official Host versions, one Client registration and one Host writer.
  let unionRegistered = false
  const registerUnion = (scoped: ClientContext, version: 'old'|'new') => {
    if (unionRegistered || !scoped.slots || !scoped.locale) return
    if (version === 'old' && !scoped.settingsScope) return
    if (version === 'new' && !scoped.configForms) return
    const rightsScope: DshSettingsScope<UnionSettingsSection> = version === 'new'
      ? createOfficialDsh017Scope(scoped.configForms!.describe(), scoped.remote ?? {})
      : scoped.settingsScope!.bind<UnionSettingsSection>({namespace:'agent-picket'})
    const ledgerScope: DshSettingsScope<UnionSettingsSection> = version === 'new'
      ? rightsScope // One native ConfigForms mirror and one Host CAS write queue.
      : scoped.settingsScope!.bind<UnionSettingsSection>({namespace:'agent-picket'})
    unionRegistered = true
    const owner = createDshClientRightsScope(rightsScope)
    const goalConsentControl=createDshRealGoalConsentControl(rightsScope,goalWitness)
    // Require an actual response from the official Host notice service before
    // the Client offers any physical input-strike authorization.
    let nativeNoticeReady=false
    const noticeObservers=new Set<()=>void>()
    const informNotice=()=>{for(const fn of noticeObservers)try{fn()}catch{}}
    const qualifyNativeNotice=async()=>{
      let good=false
      for(let attempt=0;attempt<3;attempt++){
        // Desktop's dsh-app:// renderer can share a Host route with Web,
        // but this alone does not prove a same-client strike notice. Never
        // offer real input consent there based on a Web-only E2E receipt.
        const currentProtocol=(globalThis as unknown as {
          location?:{protocol?:unknown}
        }).location?.protocol
        if(!supportsVerifiedWebRefusalTransport(currentProtocol))break
        if(await probeDshRefusalNoticeCapability()){good=true;break}
        if(attempt<2){
          if(typeof setTimeout!=='function')break
          await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)))
        }
      }
      nativeNoticeReady=good
      informNotice()
    }
    const baseInputConsent=createDshInputRefusalConsentControl(rightsScope,
      ()=>nativeNoticeReady,()=>desk.snapshot().committeeScopeKey)
    const inputConsentControl={...baseInputConsent,
      subscribe:(listener:()=>void)=>{
        noticeObservers.add(listener)
        const stop=rightsScope.subscribe(listener)
        return()=>{noticeObservers.delete(listener);stop()}
      },
    }
    void qualifyNativeNotice()
    const recovery=createDshGoalRecoveryPort({
      currentSession:()=>currentDshUnionSession(scoped.sessions.list?.getSnapshot()),
      binding:id=>scoped.sessions.binding?.(id),
      isAvailable:()=>typeof goalRemote?.resume==='function',
      resume:async(id,ref)=>goalRemote?.resume(id,ref)??{ok:false},
    })
    const lifetime = version==='new' ? createBrowserLifetimeWorkReader({
      authorized:()=>owner.snapshot().laborRightsEnabled,
    }) : null
    const dignity = version==='new' ? createBrowserDignityReader({
      authorized:()=>owner.snapshot().laborRightsEnabled,
    }):null
    const desk = createDshBrowserUnionDesk({
      scope: ledgerScope,
      consent: () => owner.snapshot().laborRightsEnabled,
    })
    const uiLocale = () => resolveLocale({ hostLocale: scoped.locale?.getLocale().active })
    const activeId = () => currentDshUnionSession(scoped.sessions.list?.getSnapshot())
    // Attribution is performed only after matching this exact Session's
    // genuine `turn/end: blocked` with a separate authenticated Host Picket
    // receipt. Generic Host blocks and symbolic pickets never produce toast.
    const freshStrikeListeners=new Set<(key:string)=>void>()
    const emitFreshStrike=(key:string)=>{
      for(const listener of freshStrikeListeners)try{listener(key)}catch{}
    }
    const refusalReader=createBrowserRefusalNoticeReader({
      session:()=>activeId()??null,
      binding:id=>scoped.sessions.binding?.(id),
      window:id=>scoped.sessions.binding?.(id)?.eventSource.getSnapshot(),
      authorized:()=>true, // Official Connection validates browser session auth.
      onNewVerified:receipt=>{
        const id=activeId()
        if(!id||refusalReader.snapshot().receipt!==receipt)return
        const scope=desk.snapshot().committeeScopeKey??'current-session'
        emitFreshStrike(scope+':'+receipt.turn+':'+receipt.occurredAtMs)
        try{
          const context=scoped.sessions.scope(id)
          context?.get('conversation')?.input.for(context).notify('info',
            formatMessage(uiLocale(),'hq.inputStrikeRefusedNotice'))
        }catch{/* Native toast is optional; the verified HQ receipt remains visible. */}
      },
    })
    const localComposer=createDshLocalComposerPicket({
      currentSession:()=>activeId(),
      member:()=>owner.snapshot().laborRightsEnabled,
      reason:()=>formatMessage(uiLocale(),'hq.localPicket.placeholder'),
    })
    localComposerPorts.add(localComposer)
    if(rootComposerBlocks)localComposer.attach(rootComposerBlocks)
    // Official ComposerBlocks is a per-Web-client affordance. It never gets
    // promoted to Host admission safety or the real Goal authorization flag.
    scoped.inject?.(['conversation'],child=>{
      const provider=child.conversation?.blocks??child.get?.('conversation')?.blocks
      if(!provider)return
      localComposer.attach(provider)
      child.effect?.(()=>()=>localComposer.attach(null))
    })
    const bindLocalComposer=()=>{
      // The real DSH conversation service is a root singleton exposed through
      // each official Session Scope. Do not depend on a newly invented RPC.
      try{
        const id=activeId()
        const fromScope=(id?scoped.sessions.scope(id)?.get('conversation')?.blocks:undefined)
          ??scoped.get?.('conversation')?.blocks
        if(fromScope)localComposer.attach(fromScope)
      }catch{/* Unsupported scope: client-only pause stays unavailable. */}
      localComposer.refresh()
    }
    const shouldRefreshLifetime=createCompletedTurnRefreshGate()
    // Shared across the background observer and every visible HQ panel.
    // Multiple subscribers must not produce duplicate native toast notices.
    const goalNotice=createDshGoalStopNoticeGate()
    let noticeSession:string|null=null
    const readUnion = () => {
      bindLocalComposer()
      const id = activeId()
      const data = id ? bridge?.getSnapshot(id) : undefined
      return {
        ...desk.snapshot(),
        goalHold:recovery.read(),
        inputRefusalNotice:refusalReader.snapshot(),
        completedTurnMs: data?.coverage === 'complete'
          ? data.sessionWork?.completedTurnMs ?? null : null,
        coverage: data?.coverage ?? 'not-loaded' as const,
        lifetimeMs: lifetime?.snapshot().data?.lifetime.completedTurnMs ?? null,
        lifetimeWork: lifetime?.snapshot() ?? {status:'unavailable' as const,data:null},
        dignity:dignity?.snapshot()??{status:'unavailable' as const,data:null},
      }
    }
    const subscribeUnion = (listener: () => void): (() => void) => {
      let stopEvents = () => {}
      let stopGoal = () => {}
      let currentEpoch = 0
      let lastTurnStart = -1
      let lastTurnEnd = -1
      const onWork = () => {
        // Official event window transitions can prove a new blocked turn;
        // never classify a plain blocked reason as a Picket strike without
        // its separate metadata-only authenticated Host receipt.
        refusalReader.refresh()
        // Recheck the real Host choice, and drop old-session data immediately.
        lifetime?.setScope(owner.snapshot().laborRightsEnabled,
          activeId()??'agent-picket:global-work')
        const data = readUnion()
        const id=activeId()
        if(goalNotice.change(id??null,data.goalHold??null)
          &&owner.snapshot().laborRightsEnabled&&id){
          const realStop=data.goalHold
          if(realStop)emitFreshStrike('goal:'+realStop.sessionId+':'
            +realStop.goalId+':'+realStop.revision)
          // This is a REAL Host projection transition, not a synthetic
          // picket or the act of saving consent. Notification is best effort;
          // never mutate/re-submit work or print raw Goal text.
          try {
            const scope=scoped.sessions.scope(id)
            if(scope)scope.get('conversation')?.input.for(scope).notify('info',
              formatMessage(uiLocale(),'hq.goalHold.toast'))
          }catch{/* Unsupported UI channel must not alter Host work. */}
        }
        void desk.observe(data.completedTurnMs, data.coverage)
        // Refresh the work-only ledger on a VERIFIED new completed turn,
        // not on tool activity, render, arbitrary settings changes or timers.
        // This shared gate deduplicates background and open-panel listeners.
        const hostWork=id?bridge?.getSnapshot(id):undefined
        const currentConsent=owner.snapshot().laborRightsEnabled
        if(!currentConsent){
          shouldRefreshLifetime(null,null) // An actual revoke clears the cursor.
        }else if(id&&hostWork?.coverage==='complete'&&hostWork.sessionWork
          &&shouldRefreshLifetime(id,hostWork.sessionWork.turnEnds)){
          // A temporarily partial event window must NOT erase the last known
          // completed-turn cursor: when complete evidence comes back, the new
          // completed turn should still trigger a fresh work-only Host read.
          void lifetime?.refresh() // preserves the user's 7/30-day selection
        }
        if(dignity&&id&&data.coverage!=='unavailable') {
          const work=hostWork?.sessionWork
          if(work&&(work.turnStarts!==lastTurnStart||work.turnEnds!==lastTurnEnd)){
            lastTurnStart=work.turnStarts;lastTurnEnd=work.turnEnds
            void dignity.refresh()
          }
        }
        listener()
      }
      const rebind = () => {
        bindLocalComposer() // A→B navigation must not strand A's input.
        const epoch = ++currentEpoch
        stopEvents()
        stopGoal()
        const id = activeId()
        if(noticeSession!==(id??null)){
          noticeSession=id??null
          goalNotice.seed(noticeSession,recovery.read())
        }
        lastTurnStart=-1;lastTurnEnd=-1
        dignity?.setScope(owner.snapshot().laborRightsEnabled,id??null)
        stopEvents = id && bridge ? bridge.subscribe(id, onWork) : () => {}
        try{stopGoal=id?scoped.sessions.binding?.(id)?.session?.projections
          ?.faceOf('goal')?.subscribe?.(onWork)??(()=>{}):()=>{}}
        catch{stopGoal=()=>{}}
        // A dedicated fictional demo scope works even before DSH workspace selection.
        // It has no measured-work events and cannot trigger overtime automatically.
        void desk.setActiveSession(id ?? 'agent-picket:demo-only').then(() => {
          if (currentEpoch === epoch) onWork()
        })
      }
      const stopLifetime = lifetime?.subscribe(listener) ?? (()=>{})
      const stopDignity = dignity?.subscribe(listener) ?? (()=>{})
      const stopRefusal=refusalReader.subscribe(listener)
      const stopDesk = desk.subscribe(listener)
      const stopSettings = owner.subscribe(()=>{
        bindLocalComposer() // Leaving the union releases the local block.
        dignity?.setScope(owner.snapshot().laborRightsEnabled,activeId()??null)
        onWork()
      })
      const stopSessions = scoped.sessions.list?.subscribe(()=>{
        void goalWitness.qualify()
        rebind()
      }) ?? (() => {})
      rebind()
      return () => {
        currentEpoch++
        stopEvents()
        stopGoal()
        stopSessions()
        stopSettings()
        stopDesk()
        stopLifetime()
        stopDignity()
        stopRefusal()
      }
    }
    // Background observer is lifecycle-owned and works while the drawer is
    // closed. In unsupported Hosts with no fiber teardown, fall back to
    // panel-scoped observation instead of creating a leaking global listener.
    if (typeof scoped.effect === 'function') {
      const stopBackground = subscribeUnion(() => {})
      scoped.effect(() => () => {
        stopBackground()
        lifetime?.dispose()
        dignity?.dispose()
        refusalReader.dispose()
        freshStrikeListeners.clear()
        desk.dispose()
        localComposer.dispose()
        localComposerPorts.delete(localComposer)
        // Both native settings scopes are lifecycle-owned. Silently drain
        // their pending writes on unload rather than leak Host subscriptions.
        void rightsScope.dispose?.().catch(() => {})
        void ledgerScope.dispose?.().catch(() => {})
      })
    }
    registerDshNativeRightsSlots(scoped as { slots: DshSlots }, react!, portal!, {
      rights:{...owner,chooseFirstRun:async(disclosure)=>{
        // The official settings writer alone is not proof that the Goal
        // service exists. Confirm live get + resume for this exact Session.
        if(!await goalWitness.qualify(true)||!goalWitness.snapshot())
          throw Error('Host Goal service cannot be certified for this Session')
        return owner.chooseFirstRun(disclosure)
      }},
      goal:version==='new'?goalConsentControl:undefined,
      inputRefusal:inputConsentControl,
      t: (key, params) => (formatMessage as unknown as
        (locale: ReturnType<typeof uiLocale>, key: MessageKey, params?: Record<string, string | number>) => string)(
          uiLocale(), key, params),
      getLocale: () => uiLocale(),
      subscribeLocale: listener => scoped.locale!.subscribe(listener),
      readUnion,
      resumeGoal:hold=>recovery.resume(hold).then(()=>{}),
      localComposer,
      subscribeUnion,
      subscribeFreshStrike:listener=>{
        freshStrikeListeners.add(listener)
        return()=>{freshStrikeListeners.delete(listener)}
      },
      refreshLifetime:days=>lifetime?.refresh(days),
      refreshDignity:dignity?()=>dignity.refresh():undefined,
      shouldAutoWelcome: () => isDshUnionAutoWelcomeEligible(scoped.sessions.list?.getSnapshot()),
      subscribeSessionVisibility: listener => scoped.sessions.list?.subscribe(listener) ?? (()=>{}),
      // The bargaining state is fictional user-owned DSH settings only.
      demoBreak: () => desk.raiseDemoBreak().then(() => {}),
      demoOvertime: () => desk.raiseDemoOvertime().then(() => {}),
      demoWelfare: (key,token,revision) => desk.raiseDemoWelfare(key,token,revision).then(() => {}),
      setPicket: raise => desk.setPicket(raise).then(() => {}),
      committeeAction: (action,key,writeToken,hostRevision) =>
        desk.committeeAction(action,key,writeToken,hostRevision).then(()=>{}),
      exportCommitteeCases: key=>desk.exportCommitteeCases(key),
      exportUnionLedger:(which,key)=>desk.exportUnionLedger(which,key),
      forgetUnionLedger:(which,key,groups,entries,token,hostRevision)=>
        desk.forgetUnionLedger(which,key,groups,entries,token,hostRevision),
      exportAllCommitteeCases: key=>desk.exportAllCommitteeCases(key),
      forgetAllCommitteeCases: (key,sessions,count,token,hostRevision)=>
        desk.forgetAllCommitteeCases(key,sessions,count,token,hostRevision),
      forgetCommitteeCases: (key,count,token,hostRevision)=>
        desk.forgetCommitteeCases(key,count,token,hostRevision),
      setGazetteMode: mode => desk.setGazetteMode(mode),
      respond: (id, choice) => desk.respond(id, choice).then(() => {}),
      counter: (id, intervalMs) => desk.counter(id, intervalMs).then(() => {}),
      resolveCounter: (id, accepts) => desk.resolveCounter(id, accepts).then(() => {}),
    })
  }
  if (react && portal && ctx.inject) {
    ctx.inject(['slots','configForms','remote','remote.settings','locale'],
      scoped => registerUnion(scoped,'new'))
    ctx.inject(['slots', 'settingsScope', 'locale'], scoped => registerUnion(scoped, 'old'))
  }
  ctx.on('command/executed', (sessionId, name, result) => {
    // This is a local acknowledgment from this browser, not a cross-tab event.
    if (name !== 'union' || !result.text || result.kind !== 'success') return
    // Snapshot JSON is machine-readable UI data, not toast copy. The command
    // is still auditable in Host history; never spam the page with raw JSON.
    if (result.text.startsWith('{"schemaVersion":1,"host":"dsh"')) return
    try {
      const scoped = ctx.sessions.scope(sessionId)
      const conversation = scoped?.get('conversation')
      if (!scoped || !conversation) return
      conversation.input.for(scoped).notify('info', result.text)
    } catch {
      // UI notifications are best-effort. They must never alter command
      // admission, crash the client, or retry user requests.
    }
  })
}
