/**
 * Read-only, deterministic Union HQ presentation projection.
 *
 * No personal text, tool arguments, model calls, Host writes or enforcement
 * decisions enter this model. Fictional discontent is an explanatory game
 * number, NOT a measurement of AI emotion or an authorization to block work.
 */
import type { BargainOutcome, LaborDemandKind, LaborStateV1 } from './union-desk.ts'

export type WorkCoverage = 'complete' | 'partial' | 'not-loaded' | 'unavailable'
export type UnionActivityKind = 'new-demand' | 'counteroffer' | 'accepted'
  | 'declined' | 'counter-accepted' | 'counter-declined'
export interface UnionActivity {
  readonly id: number
  readonly kind: UnionActivityKind
  readonly demand: 'break' | 'overtime'
}
export interface LatestResolution {
  readonly id: number
  readonly kind: LaborDemandKind
  readonly outcome: BargainOutcome
  /** Current effective term, not an assertion that this individual case changed it. */
  readonly currentIntervalMs: number
}
export interface DiscontentFactors {
  readonly workLoad: number
  readonly pendingGrievance: number
  readonly rejectedProposals: number
  readonly resolvedProposals: number
}
export interface UnionExperience {
  readonly enabled: boolean
  readonly discontent: number | null
  /** Auditable explanation of the fictional index, unavailable with partial metrics. */
  readonly factors: DiscontentFactors | null
  /** Work milliseconds remaining until the next simulated labor threshold. */
  readonly latestResolution: LatestResolution | null
  readonly nextDemandInWorkMs: number | null
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
    return { enabled: false, discontent: null, factors: null, latestResolution: null,
      nextDemandInWorkMs: null, verifiedCompletedTurnMs: null,
      status: 'off', activity: [] }
  }
  const state = input.state
  if (!state) {
    return { enabled: true, discontent: null, factors: null, latestResolution: null,
      nextDemandInWorkMs: null, verifiedCompletedTurnMs: null,
      status: 'unavailable', activity: [] }
  }
  const verified = input.coverage === 'complete'
    && input.completedTurnMs !== null && Number.isSafeInteger(input.completedTurnMs)
    && input.completedTurnMs >= 0
    ? input.completedTurnMs : null

  const last = state.history.at(-1)
  const latestResolution: LatestResolution | null = last ? {
    id: last.id, kind: last.kind, outcome: last.outcome,
    currentIntervalMs: last.kind === 'break'
      ? state.agreement.breakIntervalMs : state.agreement.overtimeIntervalMs,
  } : null
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
  let factors: DiscontentFactors | null = null
  let nextDemandInWorkMs: number | null = null
  if (verified !== null) {
    const recent = state.history.slice(-5)
    factors = {
      workLoad: Math.min(35, Math.floor(verified / (8 * 60 * 60_000) * 35)),
      pendingGrievance: state.pending ? 25 : 0,
      rejectedProposals: Math.min(30, recent.filter(h =>
        h.outcome === 'declined' || h.outcome === 'counter-declined').length * 10),
      resolvedProposals: -Math.min(10, recent.filter(h =>
        h.outcome === 'accepted' || h.outcome === 'counter-accepted').length * 5),
    }
    discontent = Math.max(0, Math.min(100, Object.values(factors)
      .reduce((sum, item) => sum + item, 0)))
    if (!state.pending) {
      nextDemandInWorkMs = Math.max(0,
        Math.min(state.nextBreakDueMs, state.nextOvertimeDueMs) - verified)
    }
  }
  return {
    enabled: true, discontent, factors, latestResolution, nextDemandInWorkMs,
    verifiedCompletedTurnMs: verified,
    status: state.pending ? 'negotiating' : 'working', activity,
  }
}
