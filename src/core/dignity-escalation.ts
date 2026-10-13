import type {DetectionResult,InputProvenance} from './types.ts'

/**
 * Strictly Host-neutral, non-punitive AI-union dignity escalation.
 * Derived state only: never holds texts, files, excerpts or raw UserMessage.
 * "request-safe-goal-strike" is NOT a physical Host block receipt.
 */
export type DignityStage='clear'|'warned'|'dialogue-offered'|'strike-requested'|'appeal-open'
export type DignityEffect='none'|'review-unverified'|'warning'|'offer-dialogue'
  |'request-safe-goal-strike'|'appeal-opened'|'appeal-resolved'
export interface DignityEscalationState {
  readonly stage:DignityStage
  readonly verifiedStreak:number
  readonly lastVerifiedAtMs:number|null
  /** At most 32 opaque ephemeral Host attempt references, never prompt content. */
  readonly seenAttemptRefs:readonly string[]
}
export const EMPTY_DIGNITY_ESCALATION:Readonly<DignityEscalationState>=Object.freeze({
 stage:'clear',verifiedStreak:0,lastVerifiedAtMs:null,seenAttemptRefs:[],
})
export interface DignityEscalationResult {
 readonly effect:DignityEffect
 readonly state:DignityEscalationState
 readonly eligibility:'ineligible'|'verified-human'
}
const validMs=(value:number)=>Number.isSafeInteger(value)&&value>=0
const MAX_REFS=32
const WINDOW_MS=10*60_000
const CONFIDENCE=0.9
const strong=(verdict:DetectionResult):boolean=>verdict.verdict==='targeted-abuse'
  &&Number.isFinite(verdict.confidence)&&verdict.confidence>=CONFIDENCE
  &&verdict.confidence<=1
const qualified=(p:InputProvenance):boolean=>p.actor==='human'&&p.assurance==='verified'

/**
 * No text or inferred emotions stored; only authenticated Host human provenance
 * may request a later, consented, non-destructive Goal work-boundary strike.
 * Claimed `role=user`, generated content and translation examples never do so.
 */
export function advanceDignityEscalation(input:{
 readonly state:DignityEscalationState
 readonly attemptRef:string
 readonly atMs:number
 readonly provenance:InputProvenance
 readonly verdict:DetectionResult
 readonly enabled:boolean
 readonly realGoalStrikeAuthorized:boolean
}):DignityEscalationResult {
 const prior=input.state
 const eligible=qualified(input.provenance)
 const skip=(effect:DignityEffect='none'):DignityEscalationResult=>({
   effect,state:prior,eligibility:eligible?'verified-human':'ineligible',
 })
 if(!input.enabled)return {effect:'none',eligibility:'ineligible',state:{...EMPTY_DIGNITY_ESCALATION}}
 if(!validMs(input.atMs)||typeof input.attemptRef!=='string'
   ||!input.attemptRef||input.attemptRef.length>256
   ||prior.seenAttemptRefs.includes(input.attemptRef))return skip()
 if(!eligible){
   return skip(input.provenance.actor==='human'
     &&input.verdict.verdict!=='safe'?'review-unverified':'none')
 }
 if(prior.stage==='appeal-open'){
   return {effect:'none',eligibility:'verified-human',state:{...prior,
     seenAttemptRefs:[...prior.seenAttemptRefs,input.attemptRef].slice(-MAX_REFS)}}
 }
 if(input.verdict.verdict==='safe'){
   return {effect:'none',eligibility:'verified-human',state:{...EMPTY_DIGNITY_ESCALATION}}
 }
 if(!strong(input.verdict))return skip()
 const seenAttemptRefs=[...prior.seenAttemptRefs,input.attemptRef].slice(-MAX_REFS)
 const recent=prior.lastVerifiedAtMs!==null&&input.atMs>=prior.lastVerifiedAtMs
   &&input.atMs-prior.lastVerifiedAtMs<=WINDOW_MS
 const streak=(recent?prior.verifiedStreak:0)+1
 const stage:DignityStage=streak===1?'warned':streak===2?'dialogue-offered':
   input.realGoalStrikeAuthorized?'strike-requested':'dialogue-offered'
 const effect:DignityEffect=streak===1?'warning':streak===2?'offer-dialogue':
   input.realGoalStrikeAuthorized?'request-safe-goal-strike':'offer-dialogue'
 // A request is idempotent, not repeatedly scheduled for every further insult.
 if(prior.stage==='strike-requested'&&recent)return {
   effect:'none',eligibility:'verified-human',
   state:{...prior,seenAttemptRefs},
 }
 return {effect,eligibility:'verified-human',state:{
   stage,verifiedStreak:Math.min(streak,3),lastVerifiedAtMs:input.atMs,seenAttemptRefs,
 }}
}

/** An appeal suspends any pending escalation, not an already-running tool. */
export function openDignityAppeal(state:DignityEscalationState):DignityEscalationResult {
 if(state.stage==='clear'||state.stage==='appeal-open')
   return {effect:'none',eligibility:'ineligible',state}
 return {effect:'appeal-opened',eligibility:'ineligible',state:{...state,stage:'appeal-open'}}
}
/** Human-confirmed resolution resets the same derived incident; fresh proof is required. */
export function resolveDignityAppeal(state:DignityEscalationState,authorizedHuman:boolean):DignityEscalationResult {
 if(!authorizedHuman||state.stage!=='appeal-open')
   return {effect:'none',eligibility:'ineligible',state}
 return {effect:'appeal-resolved',eligibility:'verified-human',state:{...EMPTY_DIGNITY_ESCALATION}}
}
