import type {DshSettingsScope} from './client-rights-scope.ts'

/**
 * UI bridge for explicit versioned real Goal agreement. Old v1 grants remain
 * saved but do not activate a normal install. Only a new v2 user gesture can
 * authorize the official production Goal stop boundary.
 * Host-owned SettingsScope is the only writer. Neither welcomeDecision='enabled'
 * nor any old union ceremony authorizes this capability.
 */
export interface RealGoalConsentSection {
  readonly welcomeDecision:'unseen'|'enabled'|'not-now'
  readonly realGoalStrikeConsent?:'off'|'authorized-v1'|'authorized-v2'
}
export const REAL_GOAL_DISCLOSURE_VERSION='goal-safe-boundary-v2' as const
export interface GoalCapabilityWitness {
  snapshot():boolean
  qualify(fresh?:boolean):Promise<boolean>
  subscribe(listener:()=>void):()=>void
}
export function createDshRealGoalConsentControl(
  scope:DshSettingsScope<RealGoalConsentSection>,service:GoalCapabilityWitness,
){
  const snapshot=()=>{
    try {
      const s=scope.getSnapshot()
      const value=s.value?.realGoalStrikeConsent??'off'
      const valid=s.status==='ready'&&s.mode==='host'
        &&(['off','authorized-v1','authorized-v2'].includes(value))
      return {available:valid&&service.snapshot(),writable:valid&&s.writable,
        authorized:valid&&s.value?.welcomeDecision==='enabled'
          &&value!=='off',
        activated:valid&&s.value?.welcomeDecision==='enabled'
          &&value==='authorized-v2'}
    }catch{return {available:false,writable:false,authorized:false,activated:false}}
  }
  return {
    snapshot,
    subscribe:service.subscribe,
    qualify:service.qualify,
    /** UI must display explicit uninterrupted-current-round + resumable-Goal warning first. */
    async choose(choice:'off'|'authorized-v1'|'authorized-v2',disclosureVersion?:typeof REAL_GOAL_DISCLOSURE_VERSION|'goal-safe-boundary-v1'){
      const before=scope.getSnapshot()
      if(before.status!=='ready'||before.mode!=='host'||!before.writable
        ||!before.value||!['off','authorized-v1','authorized-v2']
          .includes(before.value.realGoalStrikeConsent??'off'))
        throw new Error('Host-owned Goal strike settings unavailable')
      if(choice!=='off'){
        if(!await service.qualify(true)||!service.snapshot())
          throw new Error('Official Goal Host service has not been verified')
        if(disclosureVersion!==(choice==='authorized-v2'
            ?REAL_GOAL_DISCLOSURE_VERSION:'goal-safe-boundary-v1')
          ||before.value?.welcomeDecision!=='enabled')
          throw new Error('New real Goal interruption disclosure not acknowledged')
      }
      if(choice!=='off'){
        // Qualifying a live Host service is asynchronous. A second tab can
        // leave the union or revoke its grant while qualification is pending.
        // Do not turn that stale click into a fresh real stoppage permission.
        const current=scope.getSnapshot()
        if(!service.snapshot()||current.status!=='ready'
          ||current.mode!=='host'||!current.writable
          ||current.value?.welcomeDecision!=='enabled'
          ||current.revision!==before.revision
          ||current.value.realGoalStrikeConsent!==before.value.realGoalStrikeConsent)
          throw new Error('Host consent changed during Goal qualification')
      }
      await scope.set('realGoalStrikeConsent',choice)
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'
        ||(after.value?.realGoalStrikeConsent??'off')!==choice
        ||(choice!=='off'&&after.value?.welcomeDecision!=='enabled'))
        throw new Error('Host did not confirm real Goal strike preference')
      return snapshot()
    },
  }
}
