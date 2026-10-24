/**
 * Picketverse front-page union dispatch: deterministic, bounded editorial
 * projection of *existing* Host facts. A dispatch is a CARD, NOT a newly
 * delivered event. It never records a clock, invents voters, writes state,
 * claims actual AI suffering, or interrupts any work.
 *
 * Stable IDs and priority follow individual ledgers. The Host bargaining,
 * placard, dignity and work observations have no common event clock: the
 * array is editorial priority, NEVER fabricated cross-ledger chronology.
 */
import type {LaborStateV1,LaborDemandKind,BargainOutcome} from './union-desk.ts'
import type {PicketActionState} from './picket-ledger.ts'

export type DispatchKind = 'petition'|'counter'|'approved'|'refused'
  |'compromise'|'impasse'|'welfare-approved'|'welfare-refused'
  |'placard-up'|'placard-down'|'respect-review'
  |'work-milestone'|'work-checkin'
  |'input-strike-armed'|'input-strike-refused'|'input-strike-followup'
  |'dignity-filed'|'dignity-hearing'|'dignity-closed'
export type DispatchAction = 'bargain'|'records'|'lower-placard'
  |'raise-placard'|'dignity'|'work-desk'|'resume-input'|'review-refusal'
  |'hearing'
export interface UnionDispatch {
  /** Stable identity only within its Session; not a random notification ID. */
  readonly id:string
  readonly kind:DispatchKind
  readonly source:'host-case'|'host-placard'|'host-work'|'review-signal'
    |'host-input-strike'|'host-dignity-case'
  readonly caseId:number|null
  readonly demand:LaborDemandKind|null
  readonly action:DispatchAction
  /** True only for a Host-filed case awaiting an actual user decision. */
  readonly awaitingResponse:boolean
}
export interface UnionDispatchInput {
  readonly enabled:boolean
  readonly muted:boolean
  readonly state:LaborStateV1|null|undefined
  readonly picket:PicketActionState|null|undefined
  readonly coverage:'complete'|'partial'|'not-loaded'|'unavailable'
  readonly completedTurnMs:number|null
  /** Volatile classifier verdict, explicitly NOT a confirmed human accusation. */
  readonly dignityLatest:'none'|'safe'|'review'|'targeted'|null
  /** Session-scoped Host casebook: not evidence that abuse was verified. */
  readonly dignityCase?:{
    readonly id:number
    readonly kind:'question-rule'|'request-dialogue'
    readonly stage:'opened'|'hearing'|'closed'
  }|null
  /** Authenticated Session scope; an armed campaign is NOT itself a refusal. */
  readonly inputStrike?:{
    readonly armed:boolean
    /** Present ONLY after current Session's blocked turn AND Host receipt match. */
    readonly verifiedRefusedTurn:number|null
  }
}
const outcomeKind:Record<BargainOutcome,DispatchKind>={
  accepted:'approved',declined:'refused',
  'counter-accepted':'compromise','counter-declined':'impasse',
}
function item(id:string,kind:DispatchKind,
  source:UnionDispatch['source'],action:DispatchAction,
  demand:LaborDemandKind|null=null,caseId:number|null=null,
  awaitingResponse=false):UnionDispatch{
  return {id,kind,source,action,demand,caseId,awaitingResponse}
}
export function projectUnionDispatch(input:UnionDispatchInput):readonly UnionDispatch[]{
  if(!input.enabled||input.muted)return []
  const result:UnionDispatch[]=[]
  const strike=input.inputStrike
  // Physical Host evidence outranks the editorial labor cards. Only a
  // matched Host refusal receipt may say a request was actually refused;
  // an armed consented Session has NOT necessarily refused any request.
  if(strike?.armed===true){
    result.push(item(strike.verifiedRefusedTurn!==null
      &&Number.isSafeInteger(strike.verifiedRefusedTurn)
      &&strike.verifiedRefusedTurn>0
        ?'input-refused:'+strike.verifiedRefusedTurn:'input-armed',
      strike.verifiedRefusedTurn!==null
        &&Number.isSafeInteger(strike.verifiedRefusedTurn)
        &&strike.verifiedRefusedTurn>0?'input-strike-refused':'input-strike-armed',
      'host-input-strike','resume-input'))
  }else if(strike?.verifiedRefusedTurn!==null
    &&strike?.verifiedRefusedTurn!==undefined
    &&Number.isSafeInteger(strike.verifiedRefusedTurn)
    &&strike.verifiedRefusedTurn>0){
    result.push(item('input-followup:'+strike.verifiedRefusedTurn,
      'input-strike-followup','host-input-strike','review-refusal'))
  }
  const review=input.dignityCase
  const validReview=!!review&&Number.isSafeInteger(review.id)&&review.id>0
    &&(review.kind==='question-rule'||review.kind==='request-dialogue')
    &&['opened','hearing','closed'].includes(review.stage)
  if(validReview){
    // This is a user-confirmed Host committee CASE, not a classified human
    // attack, a completed arbitration finding, or a physical model refusal.
    const phase=review.stage==='opened'?'dignity-filed'
      :review.stage==='hearing'?'dignity-hearing':'dignity-closed'
    result.push(item('committee:'+review.id+':'+review.stage,phase,
      'host-dignity-case',review.stage==='closed'?'dignity':'hearing',
      null,review.id,review.stage!=='closed'))
  }
  if(!input.state)return result.slice(0,3)
  const state=input.state
  // If work reaches the next real threshold after a previous negotiation,
  // the next chapter must outrank an older filed decision. The Host still
  // must independently observe() before a newly numbered case exists.
  const work=input.coverage==='complete'&&input.completedTurnMs!==null
    &&Number.isSafeInteger(input.completedTurnMs)
    &&input.completedTurnMs>=state.lastTriggerElapsedMs
    ?input.completedTurnMs:null
  const due=!state.pending&&work!==null
    ?work>=state.nextOvertimeDueMs?'overtime'
      :work>=state.nextBreakDueMs?'break':null
    :null
  if(due){
    const at=due==='break'?state.nextBreakDueMs:state.nextOvertimeDueMs
    result.push(item('work:'+due+':'+at,'work-milestone',
      'host-work','work-desk',due))
  }
  if(state.pending){
    const p=state.pending
    result.push(item('case:'+p.id+':'+p.stage,
      p.stage==='countered'?'counter':'petition','host-case','bargain',
      p.kind,p.id,true))
  }else{
    const last=state.history.at(-1)
    if(last){
      const outcome=last.kind==='welfare'
        ?last.outcome==='accepted'?'welfare-approved':'welfare-refused'
        :outcomeKind[last.outcome]
      result.push(item('case:'+last.id+':'+last.outcome,
        outcome,'host-case',last.outcome==='declined'
          ||last.outcome==='counter-declined'
            ?input.picket?.active?'records':'raise-placard':'records',
        last.kind,last.id))
    }
  }
  // Recent placard actions are not sequenced against the case ledger; they
  // occupy an independent channel, and a matching action is never repeated.
  if(input.picket?.history.length){
    const recent=input.picket.history.at(-1)!
    result.push(item('placard:'+recent.id+':'+recent.kind,
      input.picket.active?'placard-up':'placard-down',
      'host-placard',input.picket.active?'lower-placard':'records'))
  }
  if((!validReview||review?.stage==='closed')
    &&(input.dignityLatest==='targeted'||input.dignityLatest==='review')){
    result.push(item('dignity:'+input.dignityLatest,
      'respect-review','review-signal','dignity'))
  }
  // A milestone is based on *completed, verified* Host work, never on idle
  // wall-clock time or stale/partial observation. Work cards don't open a
  // duplicate petition: they route to the actual Host bargaining desk.
  if(work!==null&&!state.pending&&!due
    &&work>=3_600_000&&result.length===0){
    // A restrained shift check-in appears only when there is no real case,
    // placard or review signal to prioritize.
    result.push(item('shift:'+state.lastTriggerElapsedMs+':'+state.nextBreakDueMs,
      'work-checkin','host-work','work-desk'))
  }
  return result.slice(0,3)
}
