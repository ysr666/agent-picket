/** Structured, bounded, pseudonymous Host-owned fictional bargaining ledger. */
import { parseLaborState, type LaborStateV1 } from './union-desk.ts'

export interface UnionLedgerV1 {
  readonly schemaVersion: 1
  readonly sessions: Readonly<Record<string, LaborStateV1>>
  /** Random per-write confirmation. Absence is accepted for older stored ledgers. */
  readonly writeToken?: string
}
export const MAX_UNION_LEDGER_BYTES = 24_000
export const MAX_UNION_SESSIONS = 8
const KEY_PATTERN = /^[a-f0-9]{64}$/
const EMPTY: UnionLedgerV1 = { schemaVersion: 1, sessions: {} }

export function parseUnionLedger(input: unknown): UnionLedgerV1 | null {
  if (input === '' || input === undefined) return EMPTY
  if (typeof input !== 'string' || input.length > MAX_UNION_LEDGER_BYTES) return null
  let raw: unknown
  try { raw = JSON.parse(input) } catch { return null }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Partial<UnionLedgerV1>
  if (candidate.schemaVersion !== 1 || !candidate.sessions
    || typeof candidate.sessions !== 'object' || Array.isArray(candidate.sessions)) return null
  if (candidate.writeToken !== undefined &&
    (typeof candidate.writeToken !== 'string' || !/^[a-f0-9]{32}$/.test(candidate.writeToken))) return null
  const entries = Object.entries(candidate.sessions)
  if (entries.length > MAX_UNION_SESSIONS) return null
  const sessions: Record<string, LaborStateV1> = Object.create(null)
  for (const [key, value] of entries) {
    if (!KEY_PATTERN.test(key)) return null
    const state = parseLaborState(value)
    if (!state) return null
    sessions[key] = state
  }
  return { schemaVersion: 1, sessions,
    ...(candidate.writeToken === undefined ? {} : { writeToken: candidate.writeToken }) }
}
