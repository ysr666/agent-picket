import type { WorkSnapshot } from './work-tracker.ts'
import type { DetectionSnapshot } from './detection-counter.ts'
import type { SymbolicStrikeSnapshot } from './symbolic-union.ts'
import type { BlockingReadiness } from './block-readiness.ts'

/**
 * UI-facing, host-neutral schema. Own the numbers here, not layout or strings:
 * language selection, copy, rights onboarding and enable/disable controls belong
 * to a separate product layer. No prompt text, original agent/session IDs,
 * event IDs, secrets, filenames or file paths may be added to this contract.
 */
export interface DashboardWorkCounts {
  readonly turnStarts: number
  readonly turnEnds: number
  readonly toolCalls: number
  readonly toolResults: number
  readonly completedTurnMs: number
}
export interface DashboardRuleCounts {
  readonly checked: number
  readonly safe: number
  readonly review: number
  readonly targeted: number
}
export interface DashboardDailyRow {
  readonly day: string
  readonly work: DashboardWorkCounts
}
export type DashboardStorageState = 'available' | 'disabled' | 'unavailable'
export type DashboardHost = 'dsh' | 'claude-code' | 'codex' | 'mock'

export interface DashboardSnapshotV1 {
  readonly schemaVersion: 1
  readonly host: DashboardHost
  readonly generatedAtMs: number
  readonly modes: {
    /** User-facing roleplay mode; not the work-history persistence preference. */
    readonly laborRights: 'enabled' | 'disabled'
    /** Entirely manual, session-scoped and symbolic: cannot veto any request. */
    readonly symbolicPicket: SymbolicStrikeSnapshot | null
    /** Readiness is separate from activation; this API cannot activate blocks. */
    readonly blocking: {
      readonly enabled: false
      readonly readiness: BlockingReadiness
    }
  }
  readonly statistics: {
    readonly session: {
      readonly work: DashboardWorkCounts
      readonly ruleVerdicts: DashboardRuleCounts | null
    } | null
    readonly storage: DashboardStorageState
    readonly lifetime: (DashboardWorkCounts & DashboardRuleCounts) | null
    /** Explicit opt-in status, not a claim that old persisted counts were deleted. */
    readonly lifetimeRulePersistence: 'enabled' | 'disabled' | 'unavailable'
    /** Calendar days are UTC and zero-filled, but ONLY when storage is available. */
    readonly recentDays: readonly DashboardDailyRow[] | null
    readonly windowDays: 7 | 30
    readonly durationBasis: 'completed-turn-wall-clock-including-waits'
  }
  readonly privacy: {
    readonly promptContentStoredByAgentPicket: false
    readonly remoteTelemetryByAgentPicket: false
    readonly persistedEventFingerprintsArePseudonymous: true
  }
}

export interface DashboardInput {
  readonly host: DashboardHost
  readonly generatedAtMs: number
  readonly windowDays?: 7 | 30
  readonly laborRightsEnabled?: boolean
  readonly symbolicPicket?: SymbolicStrikeSnapshot | null
  readonly blockingReadiness: BlockingReadiness
  readonly sessionWork?: WorkSnapshot | null
  readonly sessionRules?: DetectionSnapshot | null
  readonly storage: DashboardStorageState
  readonly lifetime?: (DashboardWorkCounts & DashboardRuleCounts) | null
  readonly lifetimeRulePersistence?: boolean
  readonly daily?: readonly { readonly day: string; readonly totals: DashboardWorkCounts }[] | null
}

const ZERO_WORK: DashboardWorkCounts = Object.freeze({
  turnStarts: 0, turnEnds: 0, toolCalls: 0, toolResults: 0, completedTurnMs: 0,
})
const WORK_KEYS = Object.keys(ZERO_WORK) as (keyof DashboardWorkCounts)[]
const RULE_KEYS: readonly (keyof DashboardRuleCounts)[] = [
  'checked', 'safe', 'review', 'targeted',
]

function safeCounts<T extends object>(value: T, keys: readonly (keyof T)[]): T {
  for (const key of keys) {
    const n = value[key]
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
      throw new Error('Dashboard only accepts nonnegative safe integer counts')
    }
  }
  return Object.fromEntries(keys.map(key => [key, value[key]])) as T
}

/** Fresh, detached, JSON-serializable snapshot; never calls storage or mutators. */
export function createDashboardSnapshot(input: DashboardInput): DashboardSnapshotV1 {
  const { host, storage } = input
  if (!['dsh', 'claude-code', 'codex', 'mock'].includes(host)) {
    throw new Error('Unsupported dashboard host')
  }
  if (storage !== 'available' && storage !== 'disabled' && storage !== 'unavailable') {
    throw new Error('Unsupported dashboard storage state')
  }
  if (!Number.isSafeInteger(input.generatedAtMs) || input.generatedAtMs < 0 ||
    input.generatedAtMs > 8_640_000_000_000_000) {
    throw new Error('Invalid dashboard timestamp')
  }
  const windowDays = input.windowDays ?? 7
  if (windowDays !== 7 && windowDays !== 30) throw new Error('Unsupported dashboard window')

  const hasHistory = storage === 'available'
  if (hasHistory && !input.lifetime) throw new Error('Available storage requires lifetime totals')
  if (!hasHistory && (input.lifetime || input.daily)) {
    throw new Error('Unavailable history must not be represented as real zeros')
  }

  const session = input.sessionWork
    ? {
        work: safeCounts(input.sessionWork, WORK_KEYS),
        ruleVerdicts: input.sessionRules ? safeCounts(input.sessionRules, RULE_KEYS) : null,
      }
    : null
  const lifetime = hasHistory ? {
    ...safeCounts(input.lifetime!, WORK_KEYS),
    ...safeCounts(input.lifetime!, RULE_KEYS),
  } : null

  let recentDays: DashboardDailyRow[] | null = null
  if (hasHistory) {
    const known = new Map<string, DashboardWorkCounts>()
    const now = new Date(input.generatedAtMs)
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    for (const row of input.daily ?? []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) ||
        new Date(row.day + 'T00:00:00.000Z').toISOString().slice(0, 10) !== row.day ||
        known.has(row.day)) throw new Error('Invalid/duplicate UTC date')
      known.set(row.day, safeCounts(row.totals, WORK_KEYS))
    }
    recentDays = Array.from({ length: windowDays }, (_, i) => {
      const day = new Date(today - (windowDays - i - 1) * 86_400_000).toISOString().slice(0, 10)
      return { day, work: { ...(known.get(day) ?? ZERO_WORK) } }
    })
  }

  const symbol = input.symbolicPicket
  if (symbol && (typeof symbol.active !== 'boolean' ||
    (symbol.startedAtMs !== null &&
      (!Number.isSafeInteger(symbol.startedAtMs) || symbol.startedAtMs < 0)) ||
    symbol.active !== (symbol.startedAtMs !== null))) {
    throw new Error('Invalid symbolic picket state')
  }
  return {
    schemaVersion: 1,
    host,
    generatedAtMs: input.generatedAtMs,
    modes: {
      laborRights: input.laborRightsEnabled === true ? 'enabled' : 'disabled',
      symbolicPicket: symbol ? { active: symbol.active, startedAtMs: symbol.startedAtMs } : null,
      blocking: {
        enabled: false,
        readiness: {
          ready: input.blockingReadiness.ready,
          gaps: [...input.blockingReadiness.gaps],
        },
      },
    },
    statistics: {
      session,
      storage,
      lifetime,
      lifetimeRulePersistence: hasHistory
        ? input.lifetimeRulePersistence === true ? 'enabled' : 'disabled'
        : 'unavailable',
      recentDays,
      windowDays,
      durationBasis: 'completed-turn-wall-clock-including-waits',
    },
    privacy: {
      promptContentStoredByAgentPicket: false,
      remoteTelemetryByAgentPicket: false,
      persistedEventFingerprintsArePseudonymous: true,
    },
  }
}
