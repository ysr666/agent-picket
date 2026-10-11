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
export interface UnionStory {
  readonly scene: UnionScene
  readonly cases: readonly StoryEntry[]
  readonly actions: readonly StoryEntry[]
  /** Next Host-derived threshold; not a wall-clock timer. */
  readonly nextDueInWorkMs: number | null
  readonly verifiedWorkMs: number | null
}
export function projectUnionStory(input: {
  readonly enabled: boolean
  readonly state: LaborStateV1 | null | undefined
  readonly picket: PicketActionState | null | undefined
  readonly completedTurnMs: number | null
  readonly coverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
}): UnionStory {
  const empty={cases:[],actions:[],nextDueInWorkMs:null,verifiedWorkMs:null} as const
  if(!input.enabled)return {scene:'off',...empty}
  if(!input.state)return {scene:'unavailable',...empty}
  const state=input.state
  const verified=input.coverage==='complete' && input.completedTurnMs!==null
    && Number.isSafeInteger(input.completedTurnMs) && input.completedTurnMs>=0
    ?input.completedTurnMs:null
  const cases:StoryEntry[]=[]
  if(state.pending) cases.push({
    key:'case:'+state.pending.id,
    id:state.pending.id,
    kind:state.pending.stage==='countered'?'counter':'demand',
    category:state.pending.kind,
  })
  for(const event of state.history.slice(-3).reverse()){
    cases.push({
      key:'case:'+event.id,id:event.id,
      kind:event.outcome==='accepted'||event.outcome==='counter-accepted'
        ?'accepted':'declined',category:event.kind,
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
  return {scene,cases,actions,nextDueInWorkMs,verifiedWorkMs:verified}
}
