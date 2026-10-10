/**
 * Browser-side fictional bargaining; durable records are written ONLY through
 * DSH's authenticated, revision-fenced Host settingsScope. No custom RPC,
 * model calls, transcript storage, or authorization to stop Agent tasks.
 *
 * This is per-DSH-Session simulation. The Host owns the settings document;
 * user-scoped hashes pseudonymize session references in that document.
 */
import { createLaborDesk, parseLaborState, type Coverage, type LaborDemand, type LaborStateV1 } from '../../product/union-desk.ts'
import type { DshSettingsScope, SettingsScopeSnapshot } from './client-rights-scope.ts'

export interface UnionSettingsSection {
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
  readonly unionLedger: string
}
export interface UnionLedgerV1 {
  readonly schemaVersion: 1
  readonly sessions: Readonly<Record<string, LaborStateV1>>
}
export interface BrowserUnionSnapshot {
  readonly available: boolean
  readonly state: LaborStateV1 | null
  readonly pending: LaborDemand | null
  readonly autoBlockEnabled: false
}
const MAX_RECORDS = 8
const MAX_BYTES = 24_000
const KEY_PATTERN = /^[a-f0-9]{64}$/
const DEFAULT_LEDGER: UnionLedgerV1 = { schemaVersion: 1, sessions: {} }

export function parseUnionLedger(input: unknown): UnionLedgerV1 | null {
  if (input === '' || input === undefined) return DEFAULT_LEDGER
  if (typeof input !== 'string' || input.length > MAX_BYTES) return null
  let raw: unknown
  try { raw = JSON.parse(input) } catch { return null }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = raw as Partial<UnionLedgerV1>
  if (candidate.schemaVersion !== 1 || !candidate.sessions
    || typeof candidate.sessions !== 'object' || Array.isArray(candidate.sessions)) return null
  const entries = Object.entries(candidate.sessions)
  if (entries.length > MAX_RECORDS) return null
  const sessions: Record<string, LaborStateV1> = Object.create(null)
  for (const [key, value] of entries) {
    if (!KEY_PATTERN.test(key)) return null
    const state = parseLaborState(value)
    if (!state) return null
    sessions[key] = state
  }
  return { schemaVersion: 1, sessions }
}

export function createDshBrowserUnionDesk(options: {
  readonly scope: DshSettingsScope<UnionSettingsSection>
  readonly consent: () => boolean
  readonly hashSession?: (id: string) => Promise<string>
}) {
  const { scope } = options
  const listeners = new Set<() => void>()
  const notify = () => { for (const callback of listeners) callback() }
  const unsubscribe = scope.subscribe(notify)
  let activeKey: string | null = null
  let serial: Promise<unknown> = Promise.resolve()
  const consent = () => {
    try { return options.consent() === true } catch { return false }
  }
  const hashSession = options.hashSession ?? (async (id: string): Promise<string> => {
    if (!globalThis.crypto?.subtle) throw new Error('Secure session hashing unavailable')
    const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
    return [...new Uint8Array(hash)].map(part => part.toString(16).padStart(2, '0')).join('')
  })
  const read = () => {
    const view = scope.getSnapshot()
    if (view.status !== 'ready' || view.mode !== 'host' || !view.writable
      || view.value?.welcomeDecision !== 'enabled' || !consent() || !activeKey) return null
    const ledger = parseUnionLedger(view.value.unionLedger)
    if (!ledger) return null
    return { view, ledger, key: activeKey }
  }
  const snapshot = (): BrowserUnionSnapshot => {
    try {
      const data = read()
      const state = data ? parseLaborState(data.ledger.sessions[data.key]) : null
      return { available: state !== null, state, pending: state?.pending ?? null, autoBlockEnabled: false }
    } catch {
      return { available: false, state: null, pending: null, autoBlockEnabled: false }
    }
  }

  async function perform<T>(action: (desk: ReturnType<typeof createLaborDesk>) => T): Promise<T> {
    const before = read()
    if (!before) throw new Error('Authorized, enabled Host union settings unavailable')
    let next = before.ledger.sessions[before.key]
    const desk = createLaborDesk({
      store: { load: () => next, save: record => { next = record } },
      consent,
    })
    const outcome = action(desk)
    if (!next || next === before.ledger.sessions[before.key]) return outcome
    if (activeKey !== before.key || !consent()) {
      throw new Error('Session or consent changed during negotiation')
    }
    const entries = Object.entries(before.ledger.sessions)
      .filter(([key]) => key !== before.key)
      .slice(-(MAX_RECORDS - 1))
    const sessions = Object.fromEntries([...entries, [before.key, next]])
    const serialized = JSON.stringify({ schemaVersion: 1, sessions })
    if (serialized.length > MAX_BYTES) throw new Error('Union ledger capacity exceeded')
    await scope.set('unionLedger', serialized)
    const after = read()
    if (!after || after.key !== before.key ||
      JSON.stringify(after.ledger.sessions[before.key]) !== JSON.stringify(next)) {
      throw new Error('Host did not confirm union agreement update')
    }
    notify()
    return outcome
  }

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const task = serial.then(action)
    serial = task.catch(() => {})
    return task
  }
  return {
    snapshot,
    subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback) } },
    async setActiveSession(sessionId?: string): Promise<void> {
      // Invalidate the previous session immediately: async hashing MUST NOT
      // leak a previous session's state to the new session.
      activeKey = null
      notify()
      if (typeof sessionId !== 'string' || !sessionId) return
      const scopedId = sessionId
      let key: string
      try { key = await hashSession(scopedId) } catch { return }
      if (!KEY_PATTERN.test(key)) return
      // Session switches can race; the invoking integration serializes changes.
      activeKey = key
      notify()
    },
    /** Only complete verified event windows may trigger measured-work demands. */
    async observe(elapsedMs: number | null, coverage: Coverage): Promise<LaborDemand | null> {
      if (coverage !== 'complete' || elapsedMs === null
        || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return null
      return enqueue(async () => {
        try { return await perform(desk => desk.observe(elapsedMs, coverage)) }
        catch { return null } // failure can never interrupt the real Agent
      })
    },
    respond(id: number, choice: 'accept' | 'decline') {
      return enqueue(() => perform(desk => desk.respond(id, choice)))
    },
    counter(id: number, intervalMs: number) {
      return enqueue(() => perform(desk => desk.counter(id, intervalMs)))
    },
    resolveCounter(id: number, accepts: boolean) {
      return enqueue(() => perform(desk => desk.resolveCounter(id, accepts)))
    },
    dispose() { unsubscribe(); listeners.clear(); activeKey = null },
  }
}
