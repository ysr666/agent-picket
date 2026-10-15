/**
 * Replayable fictional newsroom: a read-only projection over Host-owned
 * union and picket ledgers. Never generates timestamped events, votes,
 * messages, or work. No persistent fictional event store is created.
 *
 * The two ledgers have no shared clock: each is a separate feed, NOT
 * one invented cross-ledger chronology.
 */
import type { LaborStateV1 } from './union-desk.ts'
import type { PicketActionState } from './picket-ledger.ts'

export type UnionScene = 'off' | 'unavailable' | 'picket' | 'demand'
  | 'counter' | 'accepted' | 'declined' | 'shift-report' | 'quiet'
export interface StoryEntry {
  readonly key: string
  readonly id: number
  readonly kind: 'demand' | 'counter' | 'accepted' | 'declined'
    | 'picket-raised' | 'picket-lowered'
  readonly category?: 'break' | 'overtime'
}
/**
 * An auditable case episode, not an event invented by a language model.
 *
 * The Host persists only a final outcome for resolved cases. Therefore old
 * outcomes may be replayed, but current policy terms and upcoming work
 * thresholds may be attached ONLY to the most recent same-category decision.
 * A recorded counter-accepted outcome proves a counter existed; its historical
 * exact offer is no longer available, so it must never be recreated.
 */
export interface UnionCaseEpisode {
  readonly key: string
  readonly id: number
  readonly kind: 'break' | 'overtime'
  readonly stage: 'demand' | 'counter' | 'accepted' | 'declined'
    | 'counter-accepted' | 'counter-declined'
  /** Only a currently pending counter stores the offered term. */
  readonly counterOfferMs: number | null
  /** Current effective policy, NOT an earlier case's original outcome term. */
  readonly currentTermMs: number | null
  /** Host's previously committed work-based due floor, not a deadline. */
  readonly nextDueAtWorkMs: number | null
  readonly remainingVerifiedWorkMs: number | null
  /** This stage was a real Host ledger entry, never a fictional transition. */
  readonly evidence: 'host-ledger'
}
export interface UnionStory {
  readonly scene: UnionScene
  readonly cases: readonly StoryEntry[]
  readonly episodes: readonly UnionCaseEpisode[]
  readonly actions: readonly StoryEntry[]
  /** Next Host-derived threshold; not a wall-clock timer. */
  readonly nextDueInWorkMs: number | null
  readonly verifiedWorkMs: number | null
  /** Whether official completed-work evidence supports the case countdown. */
  readonly workEvidence: 'verified' | 'incomplete' | 'stale'
}
export function projectUnionStory(input: {
  readonly enabled: boolean
  readonly state: LaborStateV1 | null | undefined
  readonly picket: PicketActionState | null | undefined
  readonly completedTurnMs: number | null
  readonly coverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
}): UnionStory {
  const empty={cases:[],episodes:[],actions:[],nextDueInWorkMs:null,verifiedWorkMs:null,
    workEvidence:'incomplete' as const}
  if(!input.enabled)return {scene:'off',...empty}
  if(!input.state)return {scene:'unavailable',...empty}
  const state=input.state
  const complete=input.coverage==='complete' && input.completedTurnMs!==null
    && Number.isSafeInteger(input.completedTurnMs) && input.completedTurnMs>=0
  const workEvidence:'verified'|'incomplete'|'stale'=!complete?'incomplete'
    :input.completedTurnMs! < state.lastTriggerElapsedMs?'stale':'verified'
  // A lagging Host snapshot cannot substantiate a work-based follow-up.
  const verified=workEvidence==='verified'?input.completedTurnMs:null
  const cases:StoryEntry[]=[]
  if(state.pending) cases.push({
    key:'case:'+state.pending.id,
    id:state.pending.id,
    kind:state.pending.stage==='countered'?'counter':'demand',
    category:state.pending.kind,
  })
  const observedCaseIds=new Set(cases.map(entry=>entry.id))
  for(const event of state.history.slice(-3).reverse()){
    if(observedCaseIds.has(event.id))continue
    observedCaseIds.add(event.id)
    cases.push({
      key:'case:'+event.id,id:event.id,
      kind:event.outcome==='accepted'||event.outcome==='counter-accepted'
        ?'accepted':'declined',category:event.kind,
    })
  }
  const recent=state.history.slice(-3).reverse()
  const episodes:UnionCaseEpisode[]=[]
  // Pending always starts the feed, older cases remain distinct. The
  // persisted history is independently ordered; no cross-picket join.
  if(state.pending) episodes.push({
    key:'case:'+state.pending.id,id:state.pending.id,
    kind:state.pending.kind,
    stage:state.pending.stage==='countered'?'counter':'demand',
    counterOfferMs:state.pending.counterOfferMs,
    currentTermMs:null,nextDueAtWorkMs:null,remainingVerifiedWorkMs:null,
    evidence:'host-ledger',
  })
  const episodeIds=new Set(episodes.map(entry=>entry.id))
  for(const decision of recent){
    if(episodeIds.has(decision.id))continue
    episodeIds.add(decision.id)
    const firstForCategory=!state.pending &&
      !episodes.some(ep=>ep.kind===decision.kind) &&
      !recent.slice(0,recent.indexOf(decision)).some(prev=>prev.kind===decision.kind)
    const due=firstForCategory
      ?decision.kind==='break'?state.nextBreakDueMs:state.nextOvertimeDueMs:null
    const credible=due!==null&&verified!==null&&
      verified>=state.lastTriggerElapsedMs
    episodes.push({
      key:'case:'+decision.id,id:decision.id,
      kind:decision.kind,stage:decision.outcome,
      counterOfferMs:null,
      currentTermMs:firstForCategory
        ?decision.kind==='break'
          ?state.agreement.breakIntervalMs:state.agreement.overtimeIntervalMs:null,
      nextDueAtWorkMs:credible?due:null,
      remainingVerifiedWorkMs:credible?Math.max(0,due-verified):null,
      evidence:'host-ledger',
    })
  }
  const actions:StoryEntry[]=input.picket?.history.slice(-3).reverse().map(event=>({
    key:'picket:'+event.id,id:event.id,kind:event.kind,
  }))??[]
  const last=state.history.at(-1)
  const scene:UnionScene=input.picket?.active?'picket'
    :state.pending?.stage==='countered'?'counter'
    :state.pending?'demand'
    :last&&(last.outcome==='accepted'||last.outcome==='counter-accepted')?'accepted'
    :last?'declined'
    :verified!==null&&verified>=3_600_000?'shift-report':'quiet'
  const nextDueInWorkMs=verified!==null&&!state.pending
    ?Math.max(0,Math.min(state.nextBreakDueMs,state.nextOvertimeDueMs)-verified)
    :null
  return {scene,cases,episodes,actions,nextDueInWorkMs,verifiedWorkMs:verified,
    workEvidence}
}
