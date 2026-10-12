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
import { parsePicketLedger, MAX_PICKET_LEDGER_BYTES } from '../../product/picket-ledger.ts'
import { parseDignityCaseLedger, MAX_DIGNITY_CASE_BYTES } from '../../product/dignity-case-ledger.ts'
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
const safeMode = (value:unknown):value is 'visible'|'quiet' => value==='visible'||value==='quiet'
const isRealGoalConsent=(value:unknown):value is 'off'|'authorized-v1'=>
  value==='off'||value==='authorized-v1'
const isChoice = (value: unknown): value is UnionSettingsSection['welcomeDecision'] =>
  value === 'unseen' || value === 'enabled' || value === 'not-now'
function safeLedger(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_UNION_LEDGER_BYTES) return false
  const parsed = parseUnionLedger(value)
  return parsed !== null && (value === '' || JSON.stringify(parsed) === value)
}

function safeDignityCases(value:unknown):value is string {
 if(typeof value!=='string'||value.length>MAX_DIGNITY_CASE_BYTES)return false
 const parsed=parseDignityCaseLedger(value)
 return parsed!==null&&(value===''||JSON.stringify(parsed)===value)
}
function safePicketLedger(value:unknown):value is string {
  if(typeof value!=='string'||value.length>MAX_PICKET_LEDGER_BYTES)return false
  const parsed=parsePicketLedger(value)
  return parsed!==null&&(value===''||JSON.stringify(parsed)===value)
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
    const picket= data.unionPicketLedger ?? ''
    const gazetteMode=data.unionGazetteMode ?? 'visible'
    const caseLedger=data.unionDignityCases ?? ''
    const goalConsent=data.realGoalStrikeConsent??'off'
    if (!isChoice(data.welcomeDecision) || !safeLedger(data.unionLedger)
      || !safePicketLedger(picket) || !safeDignityCases(caseLedger) || !safeMode(gazetteMode)
      || !isRealGoalConsent(goalConsent)) {
      return { status:'ready', mode, writable, revision, value:undefined }
    }
    return {
      status:'ready', mode, writable, revision,
      value:{welcomeDecision:data.welcomeDecision,realGoalStrikeConsent:goalConsent,unionLedger:data.unionLedger,unionPicketLedger:picket,unionDignityCases:caseLedger,unionGazetteMode:gazetteMode},
    }
  }
  // Official settings provider owns subscriptions and refreshes this mirror
  // after server invalidations and reconnects. Do not start a second poller.
  void mirror.ensure().catch(() => {})
  const setFields=(patch:Readonly<Record<string,unknown>>):Promise<void>=>{
    const operation=tail.then(async()=>{
      const entries=Object.entries(patch)
      if(entries.length<1||entries.length>2)throw new TypeError('Invalid Host settings batch')
      for(const [field,value] of entries){
        if(field==='welcomeDecision'){
          if(!isChoice(value))throw new TypeError('Invalid union consent choice')
        }else if(field==='realGoalStrikeConsent'){
          if(!isRealGoalConsent(value))throw new TypeError('Invalid real Goal strike consent')
        }else if(field==='unionLedger'){
          if(!safeLedger(value))throw new Error('Unsafe union ledger')
        }else if(field==='unionPicketLedger'){
          if(!safePicketLedger(value))throw new Error('Unsafe picket ledger')
        }else if(field==='unionDignityCases'){
          if(!safeDignityCases(value))throw new Error('Unsafe dignity committee case data')
        }else if(field==='unionGazetteMode'){
          if(!safeMode(value))throw new TypeError('Invalid Gazette display choice')
        }else throw new TypeError('Unrecognized Host settings field')
      }
      const before=snapshot()
      if(disposed||before.status!=='ready'||!before.writable||!before.value
        ||before.revision===undefined||!remote.settings)
        throw new Error('Verified Host settings are unavailable')
      const result=await remote.settings.mutate(NAMESPACE,
        entries.map(([field,value])=>({op:'set' as const,path:[field],value})),
        before.revision)
      const receipt=result.value
      const payload=receipt?.value
      if(result.ok!==true||!receipt||receipt.ns!==NAMESPACE
        ||!Number.isSafeInteger(receipt.revision)||receipt.revision<before.revision
        ||typeof payload!=='object'||payload===null||Array.isArray(payload))
        throw new Error('Host rejected or did not confirm the union setting')
      const data=payload as Record<string,unknown>
      if(!isChoice(data.welcomeDecision)||!isRealGoalConsent(data.realGoalStrikeConsent??'off')
        ||!safeLedger(data.unionLedger)||!safePicketLedger(data.unionPicketLedger??'')
        ||!safeMode(data.unionGazetteMode??'visible')
        ||!safeDignityCases(data.unionDignityCases??'')
        ||entries.some(([field,value])=>data[field]!==value)
        ||(entries.some(([field,value])=>(before.value as unknown as Record<string,unknown>)[field]!==value)
          &&receipt.revision===before.revision))
        throw new Error('Host settings confirmation did not match the requested value')
      const current=snapshot()
      if(disposed||current.status!=='ready'||!current.writable
        ||current.revision===undefined||current.revision>receipt.revision)
        throw new Error('Host settings changed or became unavailable during write')
      if(current.revision===receipt.revision){
        if(entries.some(([field,value])=>(current.value as Record<string,unknown>|undefined)?.[field]!==value))
          throw new Error('Host settings already differ from the stale receipt')
        return
      }
      mirror.acceptView(receipt)
      const after=snapshot()
      if(after.status!=='ready'||!after.value||after.revision!==receipt.revision
        ||entries.some(([field,value])=>(after.value as unknown as Record<string,unknown>)[field]!==value))
        throw new Error('Host settings confirmation did not match the requested value')
    })
    tail=operation.catch(()=>{})
    return operation
  }
  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      if (disposed) return () => {}
      // Observers execute after the authoritative Host CAS and must never
      // throw back into mirror.acceptView(). Otherwise a confirmed consent
      // change is reported as failed and later panels miss the notification.
      const stop = mirror.subscribe(() => {
        if (!disposed) {
          try { listener() } catch { /* isolate broken UI observers */ }
        }
      })
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
    set(field,value){return setFields({[field]:value})},
    setMany(patch){return setFields(patch)},
  }
}
