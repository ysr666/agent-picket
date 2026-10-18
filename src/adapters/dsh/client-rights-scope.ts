/**
 * DSH native authenticated settings-scope adapter (Client side).
 * Requires a Host-registered 'agent-picket' settings namespace. No direct
 * network requests, custom RPC, browser localStorage, or Host internals.
 */
export type RightsWelcomeChoice = 'enabled' | 'not-now'
export interface RightsSection {
  readonly welcomeDecision: 'unseen' | RightsWelcomeChoice
  readonly realGoalStrikeConsent?: 'off'|'authorized-v1'|'authorized-v2'
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
        &&['authorized-v1','authorized-v2'].includes(view.value.realGoalStrikeConsent??'off'),
    }
  }
  return {
    snapshot,
    subscribe: (listener: () => void): (() => void) => scope.subscribe(listener),
    /**
     * ONE first-install welcome click authorizes both union participation and
     * safe-boundary Goal strikes (never ordinary prompt interception). A new
     * v2 disclosure enables normal-install execution, not prior v1 permission.
     * Caller MUST show the full versioned real-enforcement disclosure on
     * that SAME dialog before invoking this method. Not callable on a legacy
     * already-enabled simulation: a new explicit upgrade notice is required.
     */
    async chooseFirstRun(disclosureVersion:'goal-safe-boundary-v1'|'goal-safe-boundary-v2'):Promise<ClientRightsSnapshot>{
      if(!['goal-safe-boundary-v1','goal-safe-boundary-v2'].includes(disclosureVersion))
        throw new Error('Real Goal strike first-run disclosure not acknowledged')
      const before=scope.getSnapshot()
      if(before.status!=='ready'||before.mode!=='host'||!before.writable
        ||before.value?.welcomeDecision!=='unseen'
        ||(before.value.realGoalStrikeConsent??'off')!=='off')
        throw new Error('Verified new-install welcome state unavailable')
      const grant=disclosureVersion==='goal-safe-boundary-v2'?'authorized-v2':'authorized-v1'
      if(typeof scope.setMany==='function'){
        // DSH 0.2 official settings.mutate supports multiple operations with
        // ONE Host revision CAS; either all permissions commit or neither.
        await scope.setMany({welcomeDecision:'enabled',
          realGoalStrikeConsent:grant})
      }else{
        // Old Host single-field writer: joining the nonblocking union comes
        // first. Any error before the second write leaves REAL STRIKES OFF.
        await scope.set('welcomeDecision','enabled')
        const joined=scope.getSnapshot()
        if(joined.status!=='ready'||joined.mode!=='host'
          ||joined.value?.welcomeDecision!=='enabled'
          ||(joined.value.realGoalStrikeConsent??'off')!=='off')
          throw new Error('Host did not confirm first-run union joining')
        await scope.set('realGoalStrikeConsent',grant)
      }
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'||!after.writable
        ||after.value?.welcomeDecision!=='enabled'
        ||after.value.realGoalStrikeConsent!==grant)
        throw new Error('Host did not confirm single-click informed Goal strike consent')
      return snapshot()
    },
    /** Official Host CAS, including atomic Goal revocation on modern DSH. */
    async choose(choice: RightsWelcomeChoice): Promise<ClientRightsSnapshot> {
      if (choice !== 'enabled' && choice !== 'not-now') throw new TypeError('Invalid rights choice')
      const before = snapshot()
      if (before.state !== 'ready' || !before.writable) {
        throw new Error('Verified Host rights settings are unavailable')
      }
      const original=scope.getSnapshot()
      if(original.status!=='ready'||original.mode!=='host'||!original.writable
        ||!original.value||!['off','authorized-v1','authorized-v2'].includes(
          original.value.realGoalStrikeConsent??'off'))
        throw new Error('Host Goal consent state is unavailable or invalid')
      if(choice==='not-now'){
        if(typeof scope.setMany==='function'){
          // Official DSH 0.2 settings.mutate must commit membership + physical
          // Goal revocation in ONE revision-fenced Host transaction. A peer
          // cannot slip a stale strike grant between two separate local writes.
          await scope.setMany({welcomeDecision:'not-now',realGoalStrikeConsent:'off'})
        }else{
          // Legacy single-field Host: revoke the physical Goal right FIRST.
          // A failed second write leaves the user joined but no real strike.
          if((original.value.realGoalStrikeConsent??'off')!=='off'){
            await scope.set('realGoalStrikeConsent','off')
            if(scope.getSnapshot().value?.realGoalStrikeConsent!=='off')
              throw new Error('Host did not confirm physical Goal strike revocation')
          }
          await scope.set('welcomeDecision','not-now')
        }
      }else if(original.value.welcomeDecision!=='enabled'
        &&(original.value.realGoalStrikeConsent??'off')!=='off'){
        // An inconsistent legacy OFF-union / ON-Goal record must NEVER
        // silently resurrect a physical strike on ordinary union rejoin.
        if(typeof scope.setMany==='function')
          await scope.setMany({welcomeDecision:'enabled',realGoalStrikeConsent:'off'})
        else{
          await scope.set('realGoalStrikeConsent','off')
          if(scope.getSnapshot().value?.realGoalStrikeConsent!=='off')
            throw new Error('Host did not confirm stale Goal strike revocation')
          await scope.set('welcomeDecision','enabled')
        }
      }else{
        await scope.set('welcomeDecision',choice)
      }
      const actual=scope.getSnapshot()
      const after=snapshot()
      if(after.state!=='ready'||after.welcomeDecision!==choice
        ||(choice==='not-now' &&(actual.value?.realGoalStrikeConsent??'off')!=='off')
        ||(choice==='enabled'&&original.value.welcomeDecision!=='enabled'
          &&(actual.value?.realGoalStrikeConsent??'off')!=='off')){
        throw new Error('Host did not confirm the rights preference and Goal revocation')
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
