/**
 * Read-only, deterministic Union HQ presentation projection.
 *
 * No personal text, tool arguments, model calls, Host writes or enforcement
 * decisions enter this model. Fictional discontent is an explanatory game
 * number, NOT a measurement of AI emotion or an authorization to block work.
 */
import type { LaborStateV1 } from './union-desk.ts'

export type WorkCoverage = 'complete' | 'partial' | 'not-loaded' | 'unavailable'
export type UnionActivityKind = 'new-demand' | 'counteroffer' | 'accepted'
  | 'declined' | 'counter-accepted' | 'counter-declined'
export interface UnionActivity {
  readonly id: number
  readonly kind: UnionActivityKind
  readonly demand: 'break' | 'overtime'
}
export interface UnionExperience {
  readonly enabled: boolean
  readonly discontent: number | null
  /** Meaningful observed work time; never estimates the live open turn. */
  readonly verifiedCompletedTurnMs: number | null
  readonly status: 'off' | 'unavailable' | 'negotiating' | 'working'
  /** Most recent Host-owned ledger actions; never an invented story or vote. */
  readonly activity: readonly UnionActivity[]
}
export interface UnionExperienceInput {
  readonly enabled: boolean
  readonly state: LaborStateV1 | null | undefined
  readonly completedTurnMs: number | null
  readonly coverage: WorkCoverage
}

/** Score is available only with a complete observed event window and valid ledger.
 * Up to 35 load points, 25 for an outstanding demand, and 30 for recent declined
 * proposals; at most 10 points reduced by recent accepted proposals.
 * It never reads a model's subjective state or treats a warning as abuse proof.
 */
export function projectUnionExperience(input: UnionExperienceInput): UnionExperience {
  if (!input.enabled) {
    return { enabled: false, discontent: null, verifiedCompletedTurnMs: null,
      status: 'off', activity: [] }
  }
  const state = input.state
  if (!state) {
    return { enabled: true, discontent: null, verifiedCompletedTurnMs: null,
      status: 'unavailable', activity: [] }
  }
  const verified = input.coverage === 'complete'
    && input.completedTurnMs !== null && Number.isSafeInteger(input.completedTurnMs)
    && input.completedTurnMs >= 0
    ? input.completedTurnMs : null

  const activity: UnionActivity[] = []
  if (state.pending) {
    activity.push({
      id: state.pending.id,
      kind: state.pending.stage === 'countered' ? 'counteroffer' : 'new-demand',
      demand: state.pending.kind,
    })
  }
  for (const h of state.history.slice(-4).reverse()) {
    activity.push({ id: h.id, kind: h.outcome, demand: h.kind })
  }
  // No provisional score when recent Host work coverage is missing/partial.
  let discontent: number | null = null
  if (verified !== null) {
    const load = Math.min(35, Math.floor(verified / (8 * 60 * 60_000) * 35))
    const recent = state.history.slice(-5)
    const declined = recent.filter(h => h.outcome === 'declined'
      || h.outcome === 'counter-declined').length
    const accepted = recent.filter(h => h.outcome === 'accepted'
      || h.outcome === 'counter-accepted').length
    discontent = Math.max(0, Math.min(100,
      load + (state.pending ? 25 : 0) + Math.min(30, declined * 10)
      - Math.min(10, accepted * 5)))
  }
  return {
    enabled: true, discontent, verifiedCompletedTurnMs: verified,
    status: state.pending ? 'negotiating' : 'working', activity,
  }
}
