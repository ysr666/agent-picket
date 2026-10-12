import { inspectBlockingReadiness } from './block-readiness.ts'
import type { HostCapabilities, UnionDecision } from './types.ts'

/** A request for a Host-owned, lossless pre-submit HOLD, not permission to reject. */
export interface PreSubmitAdmission {
  readonly action: 'allow' | 'warn' | 'request-host-hold'
  readonly cause: 'none' | 'work-threshold' | 'repeated-targeted-abuse'
  readonly safety: 'not-needed' | 'qualified-host' | 'downgraded'
}
export interface PreSubmitAdmissionInput {
  /** Explicit mode chosen through this Host's authenticated versioned consent. */
  readonly mode: 'off' | 'warn' | 'enforce'
  /** Only safe to evaluate at the Host-owned entry, BEFORE taking user input. */
  readonly boundary: 'pre-submit' | 'already-running'
  readonly capabilities: HostCapabilities
  readonly work: {
    readonly coverage: 'complete' | 'partial' | 'unavailable'
    /** Work duration from verified completed turns, not wall-clock idle. */
    readonly completedTurnMs: number | null
    /** Work counter at last explicitly confirmed user resume, or zero. */
    readonly resumeFloorMs: number
    readonly thresholdMs: number
  } | null
  /** Already produced by a provenance-aware UnionEngine for this input. */
  readonly abuse: UnionDecision | null
}
const valid=(n:number|null):n is number=>n!==null
  &&Number.isSafeInteger(n)&&n>=0
/**
 * Pure and Host-neutral. Never consumes a message, kills a tool or stores a
 * prompt. The adapter must independently validate the Host attestation and
 * obtain a durable hold receipt before claiming effective task blocking.
 */
export function planPreSubmitAdmission(input:PreSubmitAdmissionInput):PreSubmitAdmission {
  const none:PreSubmitAdmission={action:'allow',cause:'none',safety:'not-needed'}
  if(input.mode==='off')return none
  const work=input.work
  const due=work!==null&&work.coverage==='complete'
    &&valid(work.completedTurnMs)&&valid(work.resumeFloorMs)
    &&Number.isSafeInteger(work.thresholdMs)
    &&work.thresholdMs>=60_000
    &&work.completedTurnMs>=work.resumeFloorMs
    &&work.completedTurnMs-work.resumeFloorMs>=work.thresholdMs
  // Even a malformed/forged Core object cannot independently assert a block.
  const severe=input.abuse?.requestedAction==='block'
    &&input.abuse.reason==='repeated-targeted-abuse'
    &&Number.isSafeInteger(input.abuse.targetedStreak)
    &&input.abuse.targetedStreak>=3
  const cause=severe?'repeated-targeted-abuse':due?'work-threshold':'none'
  if(cause==='none')return none
  if(input.mode!=='enforce'||input.boundary!=='pre-submit'
    ||!inspectBlockingReadiness(input.capabilities).ready){
    return {action:input.capabilities.warn?'warn':'allow',cause,
      safety:'downgraded'}
  }
  return {action:'request-host-hold',cause,safety:'qualified-host'}
}
