import { createBrowserDashboardBridge } from './client-dashboard.ts'
import { createDshClientRightsScope, type DshSettingsScope, type RightsSection } from './client-rights-scope.ts'
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
interface ClientContext {
  inject?(services: string[], cb: (ctx: ClientContext) => void): unknown
  slots?: DshSlots
  settingsScope?: { bind<T>(spec: { namespace: string }): DshSettingsScope<T> }
  locale?: { getLocale(): { active: string }; subscribe(listener:()=>void):()=>void }
  /** Public Cordis service registration; removed with the client plugin fiber. */
  provide?(name: string, value: unknown): () => void
  on(name: 'command/executed', cb: (
    sessionId: string,
    name: string,
    result: { kind: 'success' | 'error'; text?: string },
  ) => void): unknown
  sessions: {
    list?: { getSnapshot(): { current?: string }; subscribe(listener:()=>void):()=>void }
    scope(id: string): Scope | undefined
    binding?(id: string): { eventSource: {
      getSnapshot(): { entries: readonly {type?: unknown; event?: {type?: unknown;seq?: unknown;time?: unknown;data?: unknown}}[]; hasMore: boolean; revision: number }
      subscribe(listener: () => void): () => void
    } } | undefined
  }
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
  if (react && portal && ctx.inject) ctx.inject(['slots', 'settingsScope', 'locale'], scoped => {
    if (!scoped.slots || !scoped.settingsScope || !scoped.locale) return
    const owner = createDshClientRightsScope(
      scoped.settingsScope.bind<RightsSection>({ namespace: 'agent-picket' }))
    const uiLocale = () => resolveLocale({ hostLocale: scoped.locale?.getLocale().active })
    const activeId = () => scoped.sessions.list?.getSnapshot().current
    const readUnion = () => {
      const id = activeId()
      const data = id ? bridge?.getSnapshot(id) : undefined
      return {
        pending: null,
        completedTurnMs: data?.coverage === 'complete'
          ? data.sessionWork?.completedTurnMs ?? null : null,
        coverage: data?.coverage ?? 'not-loaded' as const,
        lifetimeMs: null,
      }
    }
    const subscribeUnion = (listener: () => void): (() => void) => {
      let stop = () => {}
      const rebind = () => {
        stop()
        const id = activeId()
        stop = id && bridge ? bridge.subscribe(id, () => listener()) : () => {}
        listener()
      }
      const off = scoped.sessions.list?.subscribe(rebind) ?? (() => {})
      rebind()
      return () => { off(); stop() }
    }
    registerDshNativeRightsSlots(scoped as { slots: DshSlots }, react, portal, {
      rights: owner,
      t: (key, params) => (formatMessage as unknown as
        (locale: ReturnType<typeof uiLocale>, key: MessageKey, params?: Record<string, string | number>) => string)(
          uiLocale(), key, params),
      getLocale: () => uiLocale(),
      subscribeLocale: listener => scoped.locale!.subscribe(listener),
      readUnion,
      subscribeUnion,
      // Deliberately no Browser-side grievance writer until a vetted
      // authenticated session-scoped Host settings/action API is installed.
    })
  })
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
