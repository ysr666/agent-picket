/**
 * DSH native authenticated settings-scope adapter (Client side).
 * Requires a Host-registered 'agent-picket' settings namespace. No direct
 * network requests, custom RPC, browser localStorage, or Host internals.
 */
export type RightsWelcomeChoice = 'enabled' | 'not-now'
export interface RightsSection {
  readonly welcomeDecision: 'unseen' | RightsWelcomeChoice
  readonly unionLedger?: string
}
export interface SettingsScopeSnapshot<T> {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: T | undefined
  readonly writable: boolean
  readonly mode: 'host' | 'memory'
  readonly revision: number | undefined
}
export interface DshSettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}
export interface ClientRightsSnapshot {
  readonly state: 'loading' | 'ready' | 'unavailable' | 'invalid'
  readonly welcomeDecision: 'unseen' | RightsWelcomeChoice
  readonly laborRightsEnabled: boolean
  readonly writable: boolean
  readonly autoBlockEnabled: false
}
function validChoice(value: unknown): value is RightsSection['welcomeDecision'] {
  return value === 'unseen' || value === 'enabled' || value === 'not-now'
}

export function createDshClientRightsScope(scope: DshSettingsScope<RightsSection>) {
  const snapshot = (): ClientRightsSnapshot => {
    let view: SettingsScopeSnapshot<RightsSection>
    try { view = scope.getSnapshot() }
    catch {
      return { state:'unavailable',welcomeDecision:'unseen',laborRightsEnabled:false,
        writable:false,autoBlockEnabled:false }
    }
    if (view.status !== 'ready' || view.mode !== 'host') {
      return {
        state: view.status === 'loading' && view.mode === 'host' ? 'loading' : 'unavailable',
        welcomeDecision:'unseen',laborRightsEnabled:false,writable:false,autoBlockEnabled:false,
      }
    }
    if (!validChoice(view.value?.welcomeDecision)) {
      return {state:'invalid',welcomeDecision:'unseen',laborRightsEnabled:false,
        writable:false,autoBlockEnabled:false}
    }
    return {
      state:'ready',welcomeDecision:view.value.welcomeDecision,
      laborRightsEnabled:view.value.welcomeDecision === 'enabled',
      writable:view.writable,autoBlockEnabled:false,
    }
  }
  return {
    snapshot,
    subscribe: (listener: () => void): (() => void) => scope.subscribe(listener),
    /** Atomic one-field choice via DSH's revision-fenced Host settings API. */
    async choose(choice: RightsWelcomeChoice): Promise<ClientRightsSnapshot> {
      if (choice !== 'enabled' && choice !== 'not-now') throw new TypeError('Invalid rights choice')
      const before = snapshot()
      if (before.state !== 'ready' || !before.writable) {
        throw new Error('Verified Host rights settings are unavailable')
      }
      await scope.set('welcomeDecision', choice)
      const after = snapshot()
      if (after.state !== 'ready' || after.welcomeDecision !== choice) {
        throw new Error('Host did not confirm the rights preference')
      }
      return after
    },
  }
}

/** View state for an accessible DSH native settings.onboarding contribution. */
export function getWelcomeState(rights: ClientRightsSnapshot):
  'waiting' | 'unavailable' | 'invite' | 'completed' {
  if (rights.state === 'loading') return 'waiting'
  if (rights.state !== 'ready' || !rights.writable) return 'unavailable'
  return rights.welcomeDecision === 'unseen' ? 'invite' : 'completed'
}
