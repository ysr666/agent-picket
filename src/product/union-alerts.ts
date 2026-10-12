/**
 * Read-only release-candidate union notices. Observed Host facts only:
 * no invented live clock, AI emotion, verified-human identity or veto.
 * Notices are visible in the Union HQ, not OS notifications or a task hold.
 */
export type UnionAlertKind = 'daily-eight-hours' | 'session-two-hours'
  | 'targeted-language' | 'review-language'
export interface UnionAlert {
  readonly kind: UnionAlertKind
  readonly source: 'work' | 'dignity'
}
export interface UnionAlertInput {
  readonly enabled: boolean
  readonly sessionCoverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
  readonly sessionCompletedTurnMs: number | null
  /** Validated current UTC-day work from the official Host ledger, or null. */
  readonly utcDayCompletedTurnMs: number | null
  /** Volatile, claimed-user-origin rule verdict; never human identity proof. */
  readonly dignityLatest: 'none' | 'safe' | 'review' | 'targeted' | null
}
const verified=(value: number | null):value is number=>
  value!==null&&Number.isSafeInteger(value)&&value>=0
export function projectUnionAlerts(input:UnionAlertInput):readonly UnionAlert[] {
  if(!input.enabled)return []
  const alerts:UnionAlert[]=[]
  // A Host durable UTC-day total outranks the shorter per-session reminder.
  // Neither is a measure of continuous labor or model-compute time.
  if(verified(input.utcDayCompletedTurnMs) && input.utcDayCompletedTurnMs>=8*3_600_000){
    alerts.push({kind:'daily-eight-hours',source:'work'})
  }else if(input.sessionCoverage==='complete'
    &&verified(input.sessionCompletedTurnMs)
    &&input.sessionCompletedTurnMs>=2*3_600_000){
    alerts.push({kind:'session-two-hours',source:'work'})
  }
  if(input.dignityLatest==='targeted'){
    alerts.push({kind:'targeted-language',source:'dignity'})
  }else if(input.dignityLatest==='review'){
    alerts.push({kind:'review-language',source:'dignity'})
  }
  return alerts
}
