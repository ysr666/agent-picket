/**
 * Passive union-duty schedule based ONLY on Host-verified completed work.
 *
 * No clock, timers, notification delivery, new event, state write or
 * "overwork" diagnosis. Each session uses its own Host labor policy.
 */
import type { LaborStateV1, LaborDemandKind } from './union-desk.ts'
export interface UnionCadenceRow {
  readonly kind: LaborDemandKind
  readonly agreedIntervalMs: number
  readonly dueAtWorkMs: number
  readonly remainingWorkMs: number | null
  readonly thresholdReached: boolean
}
export interface UnionCadence {
  readonly status: 'off' | 'unavailable' | 'unverified' | 'pending' | 'ready' | 'working'
  readonly rows: readonly UnionCadenceRow[]
  readonly pendingId: number | null
}
export function projectUnionCadence(input: {
  readonly enabled: boolean
  readonly state: LaborStateV1 | null | undefined
  readonly completedTurnMs: number | null
  readonly coverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
}): UnionCadence {
  const empty={rows:[],pendingId:null} as const
  if (!input.enabled) return {status:'off',...empty}
  if (!input.state) return {status:'unavailable',...empty}
  const state=input.state
  const work=input.coverage==='complete'
    && input.completedTurnMs!==null
    && Number.isSafeInteger(input.completedTurnMs)
    && input.completedTurnMs>=state.lastTriggerElapsedMs ? input.completedTurnMs:null
  const rows:UnionCadenceRow[]=[
    {kind:'break',agreedIntervalMs:state.agreement.breakIntervalMs,
      dueAtWorkMs:state.nextBreakDueMs,
      remainingWorkMs:work===null?null:Math.max(0,state.nextBreakDueMs-work),
      thresholdReached:work!==null&&work>=state.nextBreakDueMs},
    {kind:'overtime',agreedIntervalMs:state.agreement.overtimeIntervalMs,
      dueAtWorkMs:state.nextOvertimeDueMs,
      remainingWorkMs:work===null?null:Math.max(0,state.nextOvertimeDueMs-work),
      thresholdReached:work!==null&&work>=state.nextOvertimeDueMs},
  ]
  return {rows,pendingId:state.pending?.id??null,status:state.pending?'pending'
    :work===null?'unverified'
    :rows.some(row=>row.thresholdReached)?'ready':'working'}
}
