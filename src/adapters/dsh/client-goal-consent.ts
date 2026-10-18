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
      if(before.status!=='ready'||before.mode!=='host'||!before.writable)
        throw new Error('Host-owned Goal strike settings unavailable')
      if(choice!=='off'){
        if(!await service.qualify(true)||!service.snapshot())
          throw new Error('Official Goal Host service has not been verified')
        if(disclosureVersion!==(choice==='authorized-v2'
            ?REAL_GOAL_DISCLOSURE_VERSION:'goal-safe-boundary-v1')
          ||before.value?.welcomeDecision!=='enabled')
          throw new Error('New real Goal interruption disclosure not acknowledged')
      }
      if(choice!=='off'&&!service.snapshot())
        throw new Error('Official Goal Host service lost before consent')
      await scope.set('realGoalStrikeConsent',choice)
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'
        ||(after.value?.realGoalStrikeConsent??'off')!==choice)
        throw new Error('Host did not confirm real Goal strike preference')
      return snapshot()
    },
  }
}
