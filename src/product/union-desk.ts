/**
 * Fictional, nonblocking AI union desk. All decisions are simulation state only.
 * Host must provide a single-writer, locally authorized Store per Agent/session.
 * No model calls, user prompt text, file operations or Host interception.
 */
export type LaborDemandKind = 'break' | 'overtime'
export type DemandStage = 'open' | 'countered'
export type BargainOutcome = 'accepted' | 'declined' | 'counter-accepted' | 'counter-declined'
export interface LaborAgreement {
  readonly breakIntervalMs: number
  readonly overtimeIntervalMs: number
}
export interface LaborDemand {
  readonly id: number
  readonly kind: LaborDemandKind
  readonly raisedAtElapsedMs: number
  readonly stage: DemandStage
  readonly counterOfferMs: number | null
}
export interface BargainHistory {
  readonly id: number
  readonly kind: LaborDemandKind
  readonly outcome: BargainOutcome
}
export interface LaborStateV1 {
  readonly schemaVersion: 1
  readonly revision: number
  readonly agreement: LaborAgreement
  readonly nextBreakDueMs: number
  readonly nextOvertimeDueMs: number
  readonly lastTriggerElapsedMs: number
  readonly pending: LaborDemand | null
  readonly history: readonly BargainHistory[]
}
export interface LaborStore {
  load(): unknown
  save(next: LaborStateV1): void
}
export interface LaborDeskSnapshot {
  readonly enabled: boolean
  readonly state: LaborStateV1 | null
}
export type Coverage = 'complete' | 'partial' | 'not-loaded' | 'unavailable'

export const DEFAULT_LABOR_AGREEMENT: Readonly<LaborAgreement> = Object.freeze({
  breakIntervalMs: 2 * 60 * 60_000,
  overtimeIntervalMs: 8 * 60 * 60_000,
})
const MIN_INTERVAL = 15 * 60_000
const MAX_INTERVAL = 24 * 60 * 60_000
const MAX_HISTORY = 20

function validInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= MIN_INTERVAL && value <= MAX_INTERVAL
}
const validTime = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

// Protocol records are intentionally numeric/enum-only. Never preserve
// unknown keys from an untrusted settings document, including nested keys.
// In particular, a valid agreement must not smuggle prompt/tool content.
function hasExactlyKeys(value: unknown, expected: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value)
  return actual.length === expected.length
    && expected.every(key => Object.hasOwn(value, key))
}

export function freshLaborState(): LaborStateV1 {
  return {
    schemaVersion: 1, revision: 0,
    agreement: { ...DEFAULT_LABOR_AGREEMENT },
    nextBreakDueMs: DEFAULT_LABOR_AGREEMENT.breakIntervalMs,
    nextOvertimeDueMs: DEFAULT_LABOR_AGREEMENT.overtimeIntervalMs,
    lastTriggerElapsedMs: 0,
    pending: null, history: [],
  }
}
export function parseLaborState(value: unknown): LaborStateV1 | null {
  if (value === undefined || value === null) return freshLaborState()
  if (!hasExactlyKeys(value, [
    'schemaVersion', 'revision', 'agreement', 'nextBreakDueMs',
    'nextOvertimeDueMs', 'lastTriggerElapsedMs', 'pending', 'history',
  ])) return null
  const s = value as Partial<LaborStateV1>
  if (s.schemaVersion !== 1 || !validTime(s.revision)
    || !hasExactlyKeys(s.agreement, ['breakIntervalMs', 'overtimeIntervalMs'])
    || !validInterval(s.agreement?.breakIntervalMs)
    || !validInterval(s.agreement.overtimeIntervalMs)
    || !validTime(s.nextBreakDueMs) || !validTime(s.nextOvertimeDueMs)
    || !validTime(s.lastTriggerElapsedMs) || !Array.isArray(s.history)
    || s.history.length > MAX_HISTORY) return null
  const kinds = ['break', 'overtime']
  const outcomes = ['accepted', 'declined', 'counter-accepted', 'counter-declined']
  if (!s.history.every((h: BargainHistory) =>
    hasExactlyKeys(h, ['id', 'kind', 'outcome']) && validTime(h.id)
    && kinds.includes(h.kind) && outcomes.includes(h.outcome))) return null
  const p = s.pending
  if (p === undefined) return null
  if (p !== null && (!hasExactlyKeys(p, [
    'id', 'kind', 'raisedAtElapsedMs', 'stage', 'counterOfferMs',
  ]) || !validTime(p.id)
    || !kinds.includes(p.kind) || !validTime(p.raisedAtElapsedMs)
    || (p.stage !== 'open' && p.stage !== 'countered')
    || (p.stage === 'open' && p.counterOfferMs !== null)
    || (p.stage === 'countered' && !validInterval(p.counterOfferMs)))) return null
  return {
    schemaVersion: 1, revision: s.revision,
    agreement: {
      breakIntervalMs: s.agreement.breakIntervalMs,
      overtimeIntervalMs: s.agreement.overtimeIntervalMs,
    },
    nextBreakDueMs: s.nextBreakDueMs, nextOvertimeDueMs: s.nextOvertimeDueMs,
    lastTriggerElapsedMs: s.lastTriggerElapsedMs,
    pending: p ? {
      id: p.id, kind: p.kind, raisedAtElapsedMs: p.raisedAtElapsedMs,
      stage: p.stage, counterOfferMs: p.counterOfferMs,
    } : null,
    history: s.history.map((h: BargainHistory) => ({
      id: h.id, kind: h.kind, outcome: h.outcome,
    })),
  }
}

export function createLaborDesk(options: {
  readonly store?: LaborStore
  /** Must read the independently authorized consent from Issue #29. */
  readonly consent?: () => boolean
}) {
  const enabled = (): boolean => {
    try { return options.consent?.() === true } catch { return false }
  }
  const read = (): LaborStateV1 => {
    if (!options.store) throw new Error('No authorized union state storage')
    const state = parseLaborState(options.store.load())
    if (!state) throw new Error('Invalid or future union state')
    return state
  }
  const write = (next: LaborStateV1): LaborStateV1 => {
    if (!options.store) throw new Error('No authorized union state storage')
    options.store.save(next)
    const saved = read()
    if (JSON.stringify(saved) !== JSON.stringify(next)) {
      throw new Error('Union state persistence could not be verified')
    }
    return saved
  }
  const requireEnabled = (): void => {
    if (!enabled()) throw new Error('Labor simulation is disabled')
  }
  const closeDemand = (s: LaborStateV1, outcome: BargainOutcome, newInterval?: number): LaborStateV1 => {
    if (!s.pending) throw new Error('No active union demand')
    const p = s.pending
    const agreement: { breakIntervalMs: number; overtimeIntervalMs: number } = { ...s.agreement }
    if (newInterval !== undefined) {
      if (p.kind === 'break') agreement.breakIntervalMs = newInterval
      else agreement.overtimeIntervalMs = newInterval
    }
    return {
      ...s, revision: s.revision + 1, agreement, pending: null,
      // A negotiation resolves the work observed when the demand was raised.
      // Advance BOTH deadlines from that evidence cursor, so an overdue
      // secondary category cannot immediately generate a stale grievance
      // at exactly the same completed-turn count. This is a work-based
      // cooldown, not a hidden timer or artificial delay to real Agent tasks.
      nextBreakDueMs: Math.max(s.nextBreakDueMs,
        s.lastTriggerElapsedMs + agreement.breakIntervalMs),
      nextOvertimeDueMs: Math.max(s.nextOvertimeDueMs,
        s.lastTriggerElapsedMs + agreement.overtimeIntervalMs),
      history: [...s.history, { id: p.id, kind: p.kind, outcome }].slice(-MAX_HISTORY),
    }
  }
  return {
    snapshot(): LaborDeskSnapshot {
      if (!enabled()) return { enabled: false, state: null }
      try { return { enabled: true, state: read() } }
      catch { return { enabled: true, state: null } }
    },
    /** Numbers must be verified completed-turn elapsed counts, not idle time. */
    observe(elapsedMs: number | null, coverage: Coverage): LaborDemand | null {
      if (!enabled() || coverage !== 'complete' || !validTime(elapsedMs)) return null
      let s: LaborStateV1
      try { s = read() } catch { return null } // no impact on Agent
      if (s.pending || elapsedMs < s.lastTriggerElapsedMs) return null
      const kind: LaborDemandKind | null =
        elapsedMs >= s.nextOvertimeDueMs ? 'overtime'
          : elapsedMs >= s.nextBreakDueMs ? 'break' : null
      if (!kind) return null
      const demand: LaborDemand = {
        id: s.revision + 1, kind, raisedAtElapsedMs: elapsedMs,
        stage: 'open', counterOfferMs: null,
      }
      try {
        write({ ...s, revision: s.revision + 1, lastTriggerElapsedMs: elapsedMs, pending: demand })
        return demand
      } catch { return null } // corrupt/unwritable Host cannot trigger spurious actions
    },
    /** Explicitly user-launched DEMO request; never claim observed fatigue/worktime. */
    raiseDemoBreak(): LaborDemand | null {
      if (!enabled()) return null
      const s = read()
      if (s.pending) return null
      const demand: LaborDemand = {
        id: s.revision + 1, kind: 'break',
        raisedAtElapsedMs: s.lastTriggerElapsedMs,
        stage: 'open', counterOfferMs: null,
      }
      write({ ...s, revision: s.revision + 1, pending: demand })
      return demand
    },
    /** Accept/decline updates the future simulated demand schedule, never Host work. */
    respond(id: number, choice: 'accept' | 'decline'): LaborStateV1 {
      requireEnabled()
      const s = read()
      if (!s.pending || s.pending.id !== id || s.pending.stage !== 'open') {
        throw new Error('No matching open union demand')
      }
      if (choice !== 'accept' && choice !== 'decline') throw new TypeError('Invalid response')
      return write(closeDemand(s, choice === 'accept' ? 'accepted' : 'declined'))
    },
    counter(id: number, intervalMs: number): LaborStateV1 {
      requireEnabled()
      if (!validInterval(intervalMs)) throw new RangeError('Invalid simulated interval')
      const s = read()
      if (!s.pending || s.pending.id !== id || s.pending.stage !== 'open') {
        throw new Error('No matching open union demand')
      }
      return write({
        ...s, revision: s.revision + 1,
        pending: { ...s.pending, stage: 'countered', counterOfferMs: intervalMs },
      })
    },
    /** Explicit simulated union-side resolution; not a real vote or autonomous AI action. */
    resolveCounter(id: number, unionAccepts: boolean): LaborStateV1 {
      requireEnabled()
      if (typeof unionAccepts !== 'boolean') throw new TypeError('Invalid simulated resolution')
      const s = read()
      if (!s.pending || s.pending.id !== id || s.pending.stage !== 'countered'
        || s.pending.counterOfferMs === null) throw new Error('No counterproposal to resolve')
      return write(closeDemand(s, unionAccepts ? 'counter-accepted' : 'counter-declined',
        unionAccepts ? s.pending.counterOfferMs : undefined))
    },
  }
}
