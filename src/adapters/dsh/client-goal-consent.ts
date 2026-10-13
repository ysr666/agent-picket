import type {DshSettingsScope} from './client-rights-scope.ts'

/**
 * UI bridge for a *separate*, informed real Goal strike agreement.
 * Host-owned SettingsScope is the only writer. Neither welcomeDecision='enabled'
 * nor any old union ceremony authorizes this capability.
 */
export interface RealGoalConsentSection {
  readonly welcomeDecision:'unseen'|'enabled'|'not-now'
  readonly realGoalStrikeConsent?:'off'|'authorized-v1'
}
export const REAL_GOAL_DISCLOSURE_VERSION='goal-safe-boundary-v1' as const
export function createDshRealGoalConsentControl(scope:DshSettingsScope<RealGoalConsentSection>){
  const snapshot=()=>{
    try {
      const s=scope.getSnapshot()
      const value=s.value?.realGoalStrikeConsent??'off'
      const valid=s.status==='ready'&&s.mode==='host'
        &&(value==='off'||value==='authorized-v1')
      return {available:valid,writable:valid&&s.writable,
        authorized:valid&&s.value?.welcomeDecision==='enabled'
          &&value==='authorized-v1'}
    }catch{return {available:false,writable:false,authorized:false}}
  }
  return {
    snapshot,
    /** UI must display explicit uninterrupted-current-round + resumable-Goal warning first. */
    async choose(choice:'off'|'authorized-v1',disclosureVersion?:typeof REAL_GOAL_DISCLOSURE_VERSION){
      const before=scope.getSnapshot()
      if(before.status!=='ready'||before.mode!=='host'||!before.writable)
        throw new Error('Host-owned Goal strike settings unavailable')
      if(choice==='authorized-v1'){
        if(disclosureVersion!==REAL_GOAL_DISCLOSURE_VERSION
          ||before.value?.welcomeDecision!=='enabled')
          throw new Error('New real Goal interruption disclosure not acknowledged')
      }
      await scope.set('realGoalStrikeConsent',choice)
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'
        ||(after.value?.realGoalStrikeConsent??'off')!==choice)
        throw new Error('Host did not confirm real Goal strike preference')
      return snapshot()
    },
  }
}
