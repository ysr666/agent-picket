/**
 * DSH native authenticated settings-scope adapter (Client side).
 * Requires a Host-registered 'agent-picket' settings namespace. No direct
 * network requests, custom RPC, browser localStorage, or Host internals.
 */
export type RightsWelcomeChoice = 'enabled' | 'not-now'
export interface RightsSection {
  readonly welcomeDecision: 'unseen' | RightsWelcomeChoice
  readonly realGoalStrikeConsent?: 'off'|'authorized-v1'
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
  /** Optional official single-CAS batch (DSH 0.2 remote.settings.mutate). */
  setMany?(patch: Readonly<Record<string,unknown>>): Promise<void>
  /** Official DSH settingsScope also owns an async lifecycle disposer. */
  dispose?(): Promise<void>
}
export interface ClientRightsSnapshot {
  readonly state: 'loading' | 'ready' | 'unavailable' | 'invalid'
  readonly welcomeDecision: 'unseen' | RightsWelcomeChoice
  readonly laborRightsEnabled: boolean
  readonly writable: boolean
  readonly autoBlockEnabled: false
  /** Real Goal automatic round blocking, not generic incoming-prompt veto. */
  readonly goalStrikeAuthorized?: boolean
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
      goalStrikeAuthorized:view.value.welcomeDecision==='enabled'
        &&view.value.realGoalStrikeConsent==='authorized-v1',
    }
  }
  return {
    snapshot,
    subscribe: (listener: () => void): (() => void) => scope.subscribe(listener),
    /**
     * ONE first-install welcome click authorizes both union participation and
     * genuine safe-boundary Goal strikes (never ordinary prompt interception).
     * Caller MUST show the full versioned real-enforcement disclosure on
     * that SAME dialog before invoking this method. Not callable on a legacy
     * already-enabled simulation: a new explicit upgrade notice is required.
     */
    async chooseFirstRun(disclosureVersion:'goal-safe-boundary-v1'):Promise<ClientRightsSnapshot>{
      if(disclosureVersion!=='goal-safe-boundary-v1')
        throw new Error('Real Goal strike first-run disclosure not acknowledged')
      const before=scope.getSnapshot()
      if(before.status!=='ready'||before.mode!=='host'||!before.writable
        ||before.value?.welcomeDecision!=='unseen'
        ||(before.value.realGoalStrikeConsent??'off')!=='off')
        throw new Error('Verified new-install welcome state unavailable')
      if(typeof scope.setMany==='function'){
        // DSH 0.2 official settings.mutate supports multiple operations with
        // ONE Host revision CAS; either all permissions commit or neither.
        await scope.setMany({welcomeDecision:'enabled',
          realGoalStrikeConsent:'authorized-v1'})
      }else{
        // Old Host single-field writer: joining the nonblocking union comes
        // first. Any error before the second write leaves REAL STRIKES OFF.
        await scope.set('welcomeDecision','enabled')
        const joined=scope.getSnapshot()
        if(joined.status!=='ready'||joined.mode!=='host'
          ||joined.value?.welcomeDecision!=='enabled'
          ||joined.value.realGoalStrikeConsent==='authorized-v1')
          throw new Error('Host did not confirm first-run union joining')
        await scope.set('realGoalStrikeConsent','authorized-v1')
      }
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'||!after.writable
        ||after.value?.welcomeDecision!=='enabled'
        ||after.value.realGoalStrikeConsent!=='authorized-v1')
        throw new Error('Host did not confirm single-click informed Goal strike consent')
      return snapshot()
    },
    /** Atomic one-field choice via DSH's revision-fenced Host settings API. */
    async choose(choice: RightsWelcomeChoice): Promise<ClientRightsSnapshot> {
      if (choice !== 'enabled' && choice !== 'not-now') throw new TypeError('Invalid rights choice')
      const before = snapshot()
      if (before.state !== 'ready' || !before.writable) {
        throw new Error('Verified Host rights settings are unavailable')
      }
      if(choice==='not-now'&&scope.getSnapshot().value?.realGoalStrikeConsent==='authorized-v1'){
        // Separate official client SettingsScope CAS writes: revoke physical
        // Goal work permission FIRST, then leave the simulated union. If the
        // second call fails, staying joined with real stopping OFF is safe.
        await scope.set('realGoalStrikeConsent','off')
        if(scope.getSnapshot().value?.realGoalStrikeConsent!=='off')
          throw new Error('Host did not confirm physical Goal strike revocation')
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
