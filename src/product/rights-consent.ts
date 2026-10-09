/**
 * Host-neutral consent for fictional Labor Rights Simulation.
 * No Host SDK, network, prompt storage, or automatic task-blocking permission.
 */
export type WelcomeChoice = 'enable' | 'not-now'
export type WelcomeDecision = 'unseen' | 'enabled' | 'not-now'
export interface RightsConsentV1 {
  readonly schemaVersion: 1
  readonly welcomeDecision: WelcomeDecision
  readonly laborRightsEnabled: boolean
}
export interface RightsConsentStore {
  /** Undefined means new installation. Other values must be validated. */
  load(): unknown
  /** Host adapter must own its private, authorized and safely persisted storage. */
  save(record: RightsConsentV1): void
}
export type RightsStorageStatus = 'ready' | 'missing-owner' | 'invalid' | 'unavailable'
export interface RightsConsentSnapshot {
  readonly record: RightsConsentV1
  readonly status: RightsStorageStatus
  /** Not a writable or granted permission, even after choosing Enable. */
  readonly autoBlockEnabled: false
}

const DEFAULT: RightsConsentV1 = Object.freeze({
  schemaVersion: 1,
  welcomeDecision: 'unseen',
  laborRightsEnabled: false,
})

function isRecord(value: unknown): value is RightsConsentV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Partial<RightsConsentV1>
  return candidate.schemaVersion === 1
    && (candidate.welcomeDecision === 'unseen' || candidate.welcomeDecision === 'enabled'
      || candidate.welcomeDecision === 'not-now')
    && typeof candidate.laborRightsEnabled === 'boolean'
    && (candidate.welcomeDecision === 'enabled') === candidate.laborRightsEnabled
}

/** Safe parsing: unknown, malformed and future formats never grant consent. */
export function parseRightsConsent(value: unknown): RightsConsentV1 | null {
  if (value === undefined || value === null) return DEFAULT
  if (!isRecord(value)) return null
  return Object.freeze({
    schemaVersion: 1,
    welcomeDecision: value.welcomeDecision,
    laborRightsEnabled: value.laborRightsEnabled,
  })
}

export function createRightsConsentController(store?: RightsConsentStore) {
  function snapshot(): RightsConsentSnapshot {
    if (!store) return { record: DEFAULT, status: 'missing-owner', autoBlockEnabled: false }
    let raw: unknown
    try { raw = store.load() } catch {
      return { record: DEFAULT, status: 'unavailable', autoBlockEnabled: false }
    }
    const parsed = parseRightsConsent(raw)
    return {
      record: parsed ?? DEFAULT,
      status: parsed ? 'ready' : 'invalid',
      autoBlockEnabled: false,
    }
  }

  function choose(choice: WelcomeChoice): RightsConsentSnapshot {
    if (choice !== 'enable' && choice !== 'not-now') throw new TypeError('Invalid choice')
    if (!store) throw new Error('Authorized Host settings are not available')
    const current = snapshot()
    if (current.status !== 'ready') throw new Error('Host settings cannot be safely updated')
    const next: RightsConsentV1 = {
      schemaVersion: 1,
      welcomeDecision: choice === 'enable' ? 'enabled' : 'not-now',
      laborRightsEnabled: choice === 'enable',
    }
    store.save(next)
    // Never report a successful opt-in if the Host did not actually persist it.
    const saved = snapshot()
    if (saved.status !== 'ready'
      || saved.record.welcomeDecision !== next.welcomeDecision
      || saved.record.laborRightsEnabled !== next.laborRightsEnabled) {
      throw new Error('Host did not persist the rights preference')
    }
    return saved
  }

  return {
    snapshot,
    choose,
    /** Separate explicit setting, subject to the same Host write/readback check. */
    setEnabled(enabled: boolean): RightsConsentSnapshot {
      if (typeof enabled !== 'boolean') throw new TypeError('Expected boolean')
      return choose(enabled ? 'enable' : 'not-now')
    },
  }
}
