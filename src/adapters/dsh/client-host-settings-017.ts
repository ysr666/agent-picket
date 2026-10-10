/**
 * DSH 0.1.7+ official authenticated Host-settings bridge.
 *
 * The new ConfigForms generic form decoder cannot project a native-only
 * Schemastery ledger validation transform. Read from the SAME official shared
 * settings describe mirror instead. Write exclusively through the existing
 * remote.settings.mutate API, with the Host's revision CAS and confirmed result.
 * Never install a second settings provider, a custom RPC, or a browser cache.
 */
import { parseUnionLedger, MAX_UNION_LEDGER_BYTES } from '../../product/union-ledger.ts'
import type { DshSettingsScope, SettingsScopeSnapshot } from './client-rights-scope.ts'
import type { UnionSettingsSection } from './client-bargaining.ts'

export interface HostNamespaceView {
  readonly ns: string
  readonly revision: number
  readonly value: unknown
}
export interface OfficialHostMirror {
  getSnapshot(): {
    readonly status: 'idle' | 'loading' | 'ready' | 'unavailable'
    readonly view?: {
      readonly namespaces: readonly HostNamespaceView[]
      readonly writable: boolean
    }
  }
  subscribe(listener: () => void): () => void
  ensure(): Promise<void>
  acceptView(view: HostNamespaceView): void
}
export interface OfficialHostSettings {
  readonly $host?: { readonly isLoopback: boolean }
  readonly settings?: {
    mutate(ns: string,
      ops: readonly { readonly op:'set'; readonly path:readonly string[]; readonly value: unknown }[],
      revision: number): Promise<{
        readonly ok: boolean
        readonly value?: HostNamespaceView
      }>
  }
}
const NAMESPACE = 'agent-picket'
const isChoice = (value: unknown): value is UnionSettingsSection['welcomeDecision'] =>
  value === 'unseen' || value === 'enabled' || value === 'not-now'
function safeLedger(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_UNION_LEDGER_BYTES) return false
  const parsed = parseUnionLedger(value)
  return parsed !== null && (value === '' || JSON.stringify(parsed) === value)
}

/** One read mirror and one serialized mutation chain, owned by DSH's Client fiber. */
export function createOfficialDsh017Scope(
  mirror: OfficialHostMirror, remote: OfficialHostSettings,
): DshSettingsScope<UnionSettingsSection> {
  let tail: Promise<unknown> = Promise.resolve()
  const snapshot = (): SettingsScopeSnapshot<UnionSettingsSection> => {
    const mode = remote.$host?.isLoopback === true ? 'host' : 'memory'
    const held = mirror.getSnapshot()
    const base = { mode, writable: false, revision: undefined, value: undefined } as const
    if (mode !== 'host') return { ...base, status:'unavailable' }
    if (held.status !== 'ready' || !held.view) {
      return { ...base, status: held.status === 'unavailable' ? 'unavailable' : 'loading' }
    }
    const row = held.view.namespaces.find(value => value.ns === NAMESPACE)
    if (!row) return { ...base, status:'unavailable' }
    const writable = held.view.writable === true
    const revision = row.revision
    const source = row.value
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return { status:'ready', mode, writable, revision, value:undefined }
    }
    const data = source as Record<string,unknown>
    // Malformed or future configurations are NEVER interpreted as consent.
    if (!isChoice(data.welcomeDecision) || !safeLedger(data.unionLedger)) {
      return { status:'ready', mode, writable, revision, value:undefined }
    }
    return {
      status:'ready', mode, writable, revision,
      value:{welcomeDecision:data.welcomeDecision,unionLedger:data.unionLedger},
    }
  }
  // Official settings provider owns subscriptions and refreshes this mirror
  // after server invalidations and reconnects. Do not start a second poller.
  void mirror.ensure().catch(() => {})
  return {
    getSnapshot: snapshot,
    subscribe: listener => mirror.subscribe(listener),
    set(field, value) {
      const operation = tail.then(async () => {
        if (field === 'welcomeDecision') {
          if (!isChoice(value)) throw new TypeError('Invalid union consent choice')
        } else if (field === 'unionLedger') {
          if (!safeLedger(value)) throw new Error('Unsafe union ledger')
        } else {
          throw new TypeError('Unrecognized Host settings field')
        }
        const before = snapshot()
        if (before.status !== 'ready' || !before.writable || !before.value
          || before.revision === undefined || !remote.settings) {
          throw new Error('Verified Host settings are unavailable')
        }
        const result = await remote.settings.mutate(NAMESPACE, [
          {op:'set',path:[field],value},
        ],before.revision)
        if (result.ok !== true || !result.value || result.value.ns !== NAMESPACE
          || !Number.isSafeInteger(result.value.revision)) {
          throw new Error('Host rejected or did not confirm the union setting')
        }
        mirror.acceptView(result.value)
        const after = snapshot()
        if (after.status !== 'ready' || !after.value
          || after.value[field] !== value) {
          throw new Error('Host settings confirmation did not match the requested value')
        }
      })
      tail = operation.catch(() => {})
      return operation
    },
  }
}
