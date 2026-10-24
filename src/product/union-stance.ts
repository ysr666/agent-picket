/**
 * A fictional union "stance", not a model's state of mind or a voter count.
 * Only Host-confirmed work/negotiation/placard facts choose the scene.
 * An unauthorised action is never performed here; UI must gate Host actions.
 *
 * There is deliberately NO separate stance log, timer or model inference.
 */
import type {LaborStateV1} from './union-desk.ts'
import type {UnionExperience} from './union-experience.ts'

export type UnionStancePhase = 'off'|'unavailable'|'picket'|'petition'
  |'counter'|'dissent'|'agreement'|'watching'|'work-due'
export type UnionStanceAction = 'none'|'bargain'|'records'
  |'raise-placard'|'lower-placard'|'work-desk'
export interface UnionStance {
  readonly phase:UnionStancePhase
  /** A score is available only if the work projection has full coverage. */
  readonly score:number|null
  readonly action:UnionStanceAction
  readonly reason:'opt-out'|'missing-host'|'actual-placard'|'host-demand'
    |'host-counter'|'filed-dissent'|'filed-terms'|'work-threshold'|'ordinary'
  readonly caseId:number|null
}
export function projectUnionStance(input:{
  readonly enabled:boolean
  readonly state:LaborStateV1|null|undefined
  readonly picketActive:boolean
  readonly experience:UnionExperience
}):UnionStance{
  const score=input.experience.discontent
  if(!input.enabled)return {phase:'off',score:null,action:'none',
    reason:'opt-out',caseId:null}
  if(!input.state)return {phase:'unavailable',score:null,action:'none',
    reason:'missing-host',caseId:null}
  const state=input.state
  if(input.picketActive)return {phase:'picket',score,action:'lower-placard',
    reason:'actual-placard',caseId:state.pending?.id??null}
  if(state.pending)return {phase:state.pending.stage==='countered'?'counter':'petition',
    score,action:'bargain',reason:state.pending.stage==='countered'
      ?'host-counter':'host-demand',caseId:state.pending.id}
  if(input.experience.nextDemandInWorkMs===0)return {
    phase:'work-due',score,action:'work-desk',
    reason:'work-threshold',caseId:null}
  const recent=state.history.at(-1)
  if(recent){
    const declined=recent.outcome==='declined'||recent.outcome==='counter-declined'
    return {phase:declined?'dissent':'agreement',score,
      action:declined?'raise-placard':'records',
      reason:declined?'filed-dissent':'filed-terms',caseId:recent.id}
  }
  // A threshold can suggest review but must not forge a Host petition.
  return {phase:'watching',score,action:'work-desk',
    reason:'ordinary',caseId:null}
}
