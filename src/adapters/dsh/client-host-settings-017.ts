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
  let disposed = false
  const subscriptions = new Set<() => void>()
  const snapshot = (): SettingsScopeSnapshot<UnionSettingsSection> => {
    if (disposed) return { status:'unavailable',mode:'memory',
      writable:false,revision:undefined,value:undefined }
    const mode = remote.$host?.isLoopback === true ? 'host' : 'memory'
    const held = mirror.getSnapshot()
    const base = { mode, writable: false, revision: undefined, value: undefined } as const
    if (mode !== 'host') return { ...base, status:'unavailable' }
    if (held.status !== 'ready' || !held.view) {
      return { ...base, status: held.status === 'unavailable' ? 'unavailable' : 'loading' }
    }
    // Treat an impossible duplicate/malformed namespace as untrusted, never
    // as evidence that rights were granted. An invalid revision cannot be
    // used for authenticated CAS, even if the choice field says "enabled".
    const entries = held.view.namespaces.filter(value => value.ns === NAMESPACE)
    if (entries.length !== 1) return { ...base, status:'unavailable' }
    const row = entries[0]!
    if (!Number.isSafeInteger(row.revision) || row.revision < 0) {
      return { ...base, status:'unavailable' }
    }
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
    subscribe(listener) {
      if (disposed) return () => {}
      const stop = mirror.subscribe(() => { if (!disposed) listener() })
      subscriptions.add(stop)
      return () => { subscriptions.delete(stop); stop() }
    },
    async dispose() {
      if (disposed) return
      disposed = true
      for (const stop of subscriptions) stop()
      subscriptions.clear()
      await tail
    },
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
        if (disposed || before.status !== 'ready' || !before.writable || !before.value
          || before.revision === undefined || !remote.settings) {
          throw new Error('Verified Host settings are unavailable')
        }
        const result = await remote.settings.mutate(NAMESPACE, [
          {op:'set',path:[field],value},
        ],before.revision)
        // Inspect the entire receipt BEFORE exposing it to any subscriber.
        // A successful HTTP/RPC result alone is never proof of Host consent.
        const receipt = result.value
        const payload = receipt?.value
        if (result.ok !== true || !receipt || receipt.ns !== NAMESPACE
          || !Number.isSafeInteger(receipt.revision) || receipt.revision < before.revision
          || typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          throw new Error('Host rejected or did not confirm the union setting')
        }
        const data = payload as Record<string,unknown>
        if (!isChoice(data.welcomeDecision) || !safeLedger(data.unionLedger)
          || data[field] !== value
          || (before.value[field] !== value && receipt.revision === before.revision)) {
          throw new Error('Host settings confirmation did not match the requested value')
        }
        // This may have awaited a network round trip. Do not resurrect consent
        // after the Client unmounts, the Host disconnects, or another tab has
        // already superseded this receipt with a newer revision.
        const current = snapshot()
        if (disposed || current.status !== 'ready' || !current.writable
          || current.revision === undefined || current.revision > receipt.revision) {
          throw new Error('Host settings changed or became unavailable during write')
        }
        if (current.revision === receipt.revision) {
          if (current.value?.[field] !== value) {
            throw new Error('Host settings already differ from the stale receipt')
          }
          return // The official mirror already published this verified revision.
        }
        mirror.acceptView(receipt)
        const after = snapshot()
        if (after.status !== 'ready' || !after.value
          || after.revision !== receipt.revision || after.value[field] !== value) {
          throw new Error('Host settings confirmation did not match the requested value')
        }
      })
      tail = operation.catch(() => {})
      return operation
    },
  }
}
