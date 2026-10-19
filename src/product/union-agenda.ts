/** The union's next *real, actionable* item, reconstructed from its Host ledger.
 * No fabricated timestamps, model-generated events, background reminders,
 * prompt content, extra storage, or claims that theatrical actions stop work.
 */
import type {LaborDemandKind,LaborStateV1} from './union-desk.ts'

export type UnionAgendaPhase='off'|'unavailable'|'unverified'|'working'
  |'milestone'|'demand'|'counter'|'resolved'
export interface UnionAgenda {
  readonly phase:UnionAgendaPhase
  readonly caseId:number|null
  readonly kind:LaborDemandKind|null
  /** Different from latest-case kind: the next possible demand may be overtime. */
  readonly nextKind:Exclude<LaborDemandKind,'welfare'>|null
  readonly remainingWorkMs:number|null
  /** Saved active term; NEVER asserted to have been set by a particular case. */
  readonly currentTermMs:number|null
  readonly latestOutcome:'accepted'|'declined'|'counter-accepted'|'counter-declined'|null
  /** Distinguishes a confirmed symbolic action from an actual Agent stop. */
  readonly symbolicPicketActive:boolean
  /** Three stages of the *current* episode, not fictional independent events. */
  readonly stage:0|1|2|3
}
export function projectUnionAgenda(input:{
  enabled:boolean
  available:boolean
  state:LaborStateV1|null|undefined
  picketActive:boolean
  completedTurnMs:number|null
  coverage:'complete'|'partial'|'not-loaded'|'unavailable'
}):UnionAgenda {
  const empty={caseId:null,kind:null,nextKind:null,remainingWorkMs:null,currentTermMs:null,
    latestOutcome:null,stage:0 as const,symbolicPicketActive:false}
  if(!input.enabled)return {phase:'off',...empty}
  if(!input.available||!input.state)return {phase:'unavailable',...empty}
  const state=input.state
  const picket=input.picketActive
  if(state.pending){
    return {phase:state.pending.stage==='countered'?'counter':'demand',
      caseId:state.pending.id,kind:state.pending.kind,nextKind:null,
      remainingWorkMs:null,currentTermMs:state.pending.stage==='countered'
        ?state.pending.counterOfferMs:null,
      latestOutcome:null,stage:state.pending.stage==='countered'?2:1,
      symbolicPicketActive:picket}
  }
  const verified=input.coverage==='complete'
    &&input.completedTurnMs!==null&&Number.isSafeInteger(input.completedTurnMs)
    &&input.completedTurnMs>=state.lastTriggerElapsedMs
    ?input.completedTurnMs:null
  // The Host's observe() gives overdue overtime precedence, even if an
  // older rest petition also became due. Otherwise choose the earliest next
  // threshold, not the type of the last resolved case.
  const nextKind:Exclude<LaborDemandKind,'welfare'>=verified!==null
    &&verified>=state.nextOvertimeDueMs?'overtime'
    :verified!==null&&verified>=state.nextBreakDueMs?'break'
    :state.nextOvertimeDueMs<=state.nextBreakDueMs?'overtime':'break'
  const nextDue=nextKind==='break'?state.nextBreakDueMs:state.nextOvertimeDueMs
  const nextRemaining=verified===null?null:Math.max(0,nextDue-verified)
  const overdue=verified!==null&&verified>=nextDue
  const latest=state.history.at(-1)
  if(latest){
    // A prior negotiation is history, not an endlessly active hero scene.
    // Once fresh verified work reaches another threshold the next chapter
    // takes precedence; the old resolved case remains in the casebook.
    if(overdue)return {phase:'milestone',caseId:null,kind:nextKind,
      nextKind,remainingWorkMs:0,currentTermMs:null,
      latestOutcome:null,stage:0,symbolicPicketActive:picket}
    const term=latest.kind==='welfare'?null
      :latest.kind==='break'?state.agreement.breakIntervalMs
        :state.agreement.overtimeIntervalMs
    return {phase:'resolved',caseId:latest.id,kind:latest.kind,
      nextKind,remainingWorkMs:nextRemaining,
      currentTermMs:term,latestOutcome:latest.outcome,stage:3,
      symbolicPicketActive:picket}
  }
  if(verified===null)return {phase:'unverified',...empty,
    symbolicPicketActive:picket}
  return {phase:overdue?'milestone':'working',caseId:null,kind:nextKind,
    nextKind,remainingWorkMs:nextRemaining,currentTermMs:null,
    latestOutcome:null,stage:0,symbolicPicketActive:picket}
}
