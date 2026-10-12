import { createBrowserDashboardBridge } from './client-dashboard.ts'
import { createBrowserLifetimeWorkReader, createCompletedTurnRefreshGate } from './client-lifetime.ts'
import { createBrowserDignityReader } from './client-dignity.ts'
import { createDshBrowserUnionDesk, type UnionSettingsSection } from './client-bargaining.ts'
import { createDshClientRightsScope, type DshSettingsScope } from './client-rights-scope.ts'
import { createOfficialDsh017Scope, type OfficialHostMirror, type OfficialHostSettings } from './client-host-settings-017.ts'
import { registerDshNativeRightsSlots, type ReactForDsh, type PortalForDsh, type DshSlots } from './native-rights-ui.ts'
import { formatMessage, resolveLocale, type MessageKey } from '../../i18n/index.ts'

/**
 * DSH Web CLIENT companion. Listens only to the public command/executed event;
 * does not touch the composer, manipulate the Session, or trigger a model call.
 * The one local helper is explicitly inlined at build time; the emitted browser factory is self-contained.
 */
export const inject = ['sessions', 'commandUi']

interface Scope {
  get(name: 'conversation'): {
    input: { for(context: Scope): { notify(level: 'info' | 'error', message: string): void } }
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

interface ClientContext {
  effect?(register: () => () => void): unknown
  inject?(services: string[], cb: (ctx: ClientContext) => void): unknown
  slots?: DshSlots
  settingsScope?: { bind<T>(spec: { namespace: string }): DshSettingsScope<T> }
  configForms?: { describe(): OfficialHostMirror }
  remote?: OfficialHostSettings
  locale?: { getLocale(): { active: string }; subscribe(listener:()=>void):()=>void }
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
    binding?(id: string): { eventSource: {
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
    const shouldRefreshLifetime=createCompletedTurnRefreshGate()
    const readUnion = () => {
      const id = activeId()
      const data = id ? bridge?.getSnapshot(id) : undefined
      return {
        ...desk.snapshot(),
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
      let currentEpoch = 0
      let lastTurnStart = -1
      let lastTurnEnd = -1
      const onWork = () => {
        // Recheck the real Host choice, and drop old-session data immediately.
        lifetime?.setScope(owner.snapshot().laborRightsEnabled,
          activeId()??'agent-picket:global-work')
        const data = readUnion()
        void desk.observe(data.completedTurnMs, data.coverage)
        // Refresh the work-only ledger on a VERIFIED new completed turn,
        // not on tool activity, render, arbitrary settings changes or timers.
        // This shared gate deduplicates background and open-panel listeners.
        const id=activeId()
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
        const epoch = ++currentEpoch
        stopEvents()
        const id = activeId()
        lastTurnStart=-1;lastTurnEnd=-1
        dignity?.setScope(owner.snapshot().laborRightsEnabled,id??null)
        stopEvents = id && bridge ? bridge.subscribe(id, onWork) : () => {}
        // A dedicated fictional demo scope works even before DSH workspace selection.
        // It has no measured-work events and cannot trigger overtime automatically.
        void desk.setActiveSession(id ?? 'agent-picket:demo-only').then(() => {
          if (currentEpoch === epoch) onWork()
        })
      }
      const stopLifetime = lifetime?.subscribe(listener) ?? (()=>{})
      const stopDignity = dignity?.subscribe(listener) ?? (()=>{})
      const stopDesk = desk.subscribe(listener)
      const stopSettings = owner.subscribe(()=>{
        dignity?.setScope(owner.snapshot().laborRightsEnabled,activeId()??null)
        onWork()
      })
      const stopSessions = scoped.sessions.list?.subscribe(rebind) ?? (() => {})
      rebind()
      return () => {
        currentEpoch++
        stopEvents()
        stopSessions()
        stopSettings()
        stopDesk()
        stopLifetime()
        stopDignity()
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
        desk.dispose()
        // Both native settings scopes are lifecycle-owned. Silently drain
        // their pending writes on unload rather than leak Host subscriptions.
        void rightsScope.dispose?.().catch(() => {})
        void ledgerScope.dispose?.().catch(() => {})
      })
    }
    registerDshNativeRightsSlots(scoped as { slots: DshSlots }, react!, portal!, {
      rights: owner,
      t: (key, params) => (formatMessage as unknown as
        (locale: ReturnType<typeof uiLocale>, key: MessageKey, params?: Record<string, string | number>) => string)(
          uiLocale(), key, params),
      getLocale: () => uiLocale(),
      subscribeLocale: listener => scoped.locale!.subscribe(listener),
      readUnion,
      subscribeUnion,
      refreshLifetime:days=>lifetime?.refresh(days),
      shouldAutoWelcome: () => isDshUnionAutoWelcomeEligible(scoped.sessions.list?.getSnapshot()),
      subscribeSessionVisibility: listener => scoped.sessions.list?.subscribe(listener) ?? (()=>{}),
      // The bargaining state is fictional user-owned DSH settings only.
      demoBreak: () => desk.raiseDemoBreak().then(() => {}),
      demoOvertime: () => desk.raiseDemoOvertime().then(() => {}),
      setPicket: raise => desk.setPicket(raise).then(() => {}),
      committeeAction: (action,key) => desk.committeeAction(action,key).then(()=>{}),
      exportCommitteeCases: key=>desk.exportCommitteeCases(key),
      exportUnionLedger:(which,key)=>desk.exportUnionLedger(which,key),
      forgetUnionLedger:(which,key,groups,entries,token)=>
        desk.forgetUnionLedger(which,key,groups,entries,token),
      exportAllCommitteeCases: key=>desk.exportAllCommitteeCases(key),
      forgetAllCommitteeCases: (key,sessions,count,token)=>
        desk.forgetAllCommitteeCases(key,sessions,count,token),
      forgetCommitteeCases: (key,count,token)=>
        desk.forgetCommitteeCases(key,count,token),
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
