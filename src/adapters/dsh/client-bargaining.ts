/**
 * Browser-side fictional bargaining; durable records are written ONLY through
 * DSH's authenticated, revision-fenced Host settingsScope. No custom RPC,
 * model calls, transcript storage, or authorization to stop Agent tasks.
 *
 * This is per-DSH-Session simulation. The Host owns the settings document;
 * user-scoped hashes pseudonymize session references in that document.
 */
import { createLaborDesk, parseLaborState, type Coverage, type LaborDemand, type LaborStateV1 } from '../../product/union-desk.ts'
import { parseUnionLedger, MAX_UNION_SESSIONS, MAX_UNION_LEDGER_BYTES } from '../../product/union-ledger.ts'
import { parsePicketLedger, MAX_PICKET_LEDGER_BYTES, MAX_PICKET_SESSIONS, MAX_PICKET_HISTORY, type PicketActionState } from '../../product/picket-ledger.ts'
import type { DshSettingsScope } from './client-rights-scope.ts'
import { advanceDignityCase, parseDignityCaseLedger, MAX_DIGNITY_CASE_BYTES, MAX_DIGNITY_CASE_SESSIONS, type DignityCaseKind, type DignityCaseOutcome, type DignityCaseSession } from '../../product/dignity-case-ledger.ts'

export interface UnionSettingsSection {
  readonly realGoalStrikeConsent?:'off'|'authorized-v1'|'authorized-v2'
  readonly realInputStrikeConsent?:'off'|'discard-resend-v1'|'shared-v2'
  readonly realInputStrikeCampaign?:string
  readonly realToolStrikeConsent?:'off'|'authorized-v1'
  readonly realToolStrikeCampaign?:string
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
  readonly unionLedger: string
  readonly unionPicketLedger?: string
  readonly unionGazetteMode?: 'visible'|'quiet'
  readonly unionDignityCases?: string
}
export interface BrowserUnionSnapshot {
  readonly available: boolean
  readonly state: LaborStateV1 | null
  readonly pending: LaborDemand | null
  readonly picket: PicketActionState | null
  readonly gazetteMode: 'visible'|'quiet'|null
  readonly committeeCases: DignityCaseSession|null
  /** Safe hashed Session discriminator for two-click irreversible erasure. */
  readonly committeeScopeKey: string|null
  readonly negotiationArchive:{readonly sessions:number;readonly entries:number;readonly writeToken:string|null}|null
  readonly picketArchive:{readonly sessions:number;readonly entries:number;readonly raises:number;readonly writeToken:string|null}|null
  readonly committeeArchive: {readonly sessions:number;readonly cases:number;
    readonly writeToken:string|null}|null
  readonly autoBlockEnabled: false
  /** Authorized Host revision, needed for legacy ledgers with no writeToken. */
  readonly hostRevision:number|null
}

export function createDshBrowserUnionDesk(options: {
  readonly scope: DshSettingsScope<UnionSettingsSection>
  readonly consent: () => boolean
  readonly hashSession?: (id: string) => Promise<string>
}) {
  const { scope } = options
  const listeners = new Set<() => void>()
  let disposed = false
  // A faulty/disposed UI subscriber must never reclassify a committed Host CAS
  // as a failed action, or prevent other subscribers receiving the receipt.
  const notify = () => { for (const callback of listeners) {
    try { callback() } catch { /* observer errors cannot affect Host writes */ }
  } }
  const unsubscribe = scope.subscribe(notify)
  let activeKey: string | null = null
  // Volatile, never persisted: prevents redundant same-Session rebind events
  // from spuriously cancelling a pending authorized action.
  let boundSessionId: string | null = null
  let serial: Promise<unknown> = Promise.resolve()
  let sessionEpoch = 0
  const consent = () => {
    try { return options.consent() === true } catch { return false }
  }
  const hashSession = options.hashSession ?? (async (id: string): Promise<string> => {
    if (!globalThis.crypto?.subtle) throw new Error('Secure session hashing unavailable')
    const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
    return [...new Uint8Array(hash)].map(part => part.toString(16).padStart(2, '0')).join('')
  })
  const read = () => {
    if (disposed) return null
    const view = scope.getSnapshot()
    if (view.status !== 'ready' || view.mode !== 'host' || !view.writable
      || view.value?.welcomeDecision !== 'enabled' || !consent() || !activeKey) return null
    const ledger = parseUnionLedger(view.value.unionLedger)
    const picketLedger = parsePicketLedger(view.value.unionPicketLedger ?? '')
    const gazetteMode=view.value.unionGazetteMode ?? 'visible'
    const caseLedger=parseDignityCaseLedger(view.value.unionDignityCases ?? '')
    if (!ledger || !picketLedger || !caseLedger || (gazetteMode!=='visible'&&gazetteMode!=='quiet')) return null
    return { view, ledger, picketLedger, caseLedger, gazetteMode, key: activeKey }
  }
  const snapshot = (): BrowserUnionSnapshot => {
    try {
      const data = read()
      const state = data ? parseLaborState(data.ledger.sessions[data.key]) : null
      return { available: state !== null, state, pending: state?.pending ?? null,
        picket: data?.picketLedger.sessions[data.key] ?? null,
        gazetteMode:data?.gazetteMode??null,
        committeeCases: data?.caseLedger.sessions[data.key] ?? (data?{cases:[]}:null),
        committeeScopeKey:data?.key??null,
        negotiationArchive:data?{
          sessions:Object.keys(data.ledger.sessions).length,
          entries:Object.values(data.ledger.sessions).reduce((n,state)=>
            n+state.history.length+(state.pending?1:0),0),
          writeToken:data.ledger.writeToken??null,
        }:null,
        picketArchive:data?{
          sessions:Object.keys(data.picketLedger.sessions).length,
          entries:Object.values(data.picketLedger.sessions).reduce((n,state)=>
            n+state.history.length,0),
          // Each archived session numbers its alternating raise/lower records
          // from 1; last id preserves prior raises even after history rolls.
          // A removed Session is not part of this retained-archive tally.
          raises:Object.values(data.picketLedger.sessions).reduce((n,state)=>
            n+Math.ceil((state.history.at(-1)?.id??0)/2),0),
          writeToken:data.picketLedger.writeToken??null,
        }:null,
        committeeArchive:data?{
          sessions:Object.keys(data.caseLedger.sessions).length,
          cases:Object.values(data.caseLedger.sessions)
            .reduce((total,session)=>total+session.cases.length,0),
          writeToken:data.caseLedger.writeToken??null,
        }:null,
        hostRevision:data?.view.revision??null,autoBlockEnabled: false }
    } catch {
      return { available: false, state: null, pending: null, picket: null,
        gazetteMode:null,committeeCases:null,committeeScopeKey:null,committeeArchive:null,negotiationArchive:null,picketArchive:null,hostRevision:null,autoBlockEnabled: false }
    }
  }

  async function perform<T>(
    action: (desk: ReturnType<typeof createLaborDesk>) => T,
    reviewed?:{key:string;token:string|null;revision?:number|null},
  ): Promise<T> {
    const before = read()
    if (!before) throw new Error('Authorized, enabled Host union settings unavailable')
    if(reviewed){
      // A stale UI button may outlive its Session. Session IDs and numeric
      // demand IDs can repeat across independent Host ledgers. Require the
      // exact Session and archive receipt the user actually reviewed.
      const currentToken=before.ledger.writeToken??null
      if(reviewed.key!==before.key||reviewed.token!==currentToken
        ||(currentToken===null&&(!Number.isSafeInteger(reviewed.revision)
          ||reviewed.revision!==before.view.revision)))
        throw new Error('Union negotiation changed; re-open current case')
    }
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
      .slice(-(MAX_UNION_SESSIONS - 1))
    const sessions = Object.fromEntries([...entries, [before.key, next]])
    // A unique per-operation receipt disambiguates successful writes from
    // revision-conflict recovery when another tab produced the same agreement.
    // Never claim that our write succeeded solely because the final state matches.
    const entropy = new Uint8Array(16)
    if (!globalThis.crypto?.getRandomValues) {
      throw new Error('Secure agreement receipts unavailable')
    }
    globalThis.crypto.getRandomValues(entropy)
    const writeToken = [...entropy].map(part => part.toString(16).padStart(2,'0')).join('')
    const serialized = JSON.stringify({ schemaVersion: 1, sessions, writeToken })
    if (serialized.length > MAX_UNION_LEDGER_BYTES) throw new Error('Union ledger capacity exceeded')
    await scope.set('unionLedger', serialized)
    const after = read()
    if (!after || after.key !== before.key || after.ledger.writeToken !== writeToken ||
      JSON.stringify(after.ledger.sessions[before.key]) !== JSON.stringify(next)) {
      throw new Error('Host did not confirm union agreement update')
    }
    notify()
    return outcome
  }

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    // Bind EVERY user-triggered / Host-triggered queued action to the exact
    // Session in which it was requested. CAS alone cannot prevent the
    // browser from reading a NEW Session after awaiting a previous write.
    const requestedEpoch=sessionEpoch
    const requestedKey=activeKey
    const task = serial.then(() => {
      if(disposed)throw new Error('Disposed Host union desk unavailable')
      if(!requestedKey||sessionEpoch!==requestedEpoch
        ||activeKey!==requestedKey)
        throw new Error('Session changed before queued Host union action')
      return action().then(result => {
        // A→B→A can produce the same SHA-256 Session key again after a
        // Host write was already admitted. Never claim that this old
        // action belongs to the newly active Session epoch. A Host CAS
        // might nonetheless have committed before navigation; the user
        // must inspect Host state rather than being told it was undone.
        if(disposed||sessionEpoch!==requestedEpoch||activeKey!==requestedKey)
          throw new Error('Session changed during Host union action; inspect current state')
        return result
      })
    })
    serial = task.catch(() => {})
    return task
  }
  return {
    snapshot,
    subscribe(callback: () => void) {
      if (disposed) return () => {}
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    },
    async setActiveSession(sessionId?: string): Promise<void> {
      // Stale callbacks after Client fiber teardown must never rearm a Host
      // settings writer or expose a once-visible Session's private ledger.
      if (disposed) return
      // Invalidate the previous session immediately: async hashing MUST NOT
      // leak a previous session's state to the new session.
      const scopedId = typeof sessionId === 'string' && sessionId
        ? sessionId : null
      if(scopedId&&scopedId===boundSessionId&&activeKey)return
      const epoch = ++sessionEpoch
      boundSessionId=scopedId
      activeKey = null
      notify()
      if (!scopedId) return
      let key: string
      try { key = await hashSession(scopedId) } catch { return }
      if (!/^[a-f0-9]{64}$/.test(key) || sessionEpoch !== epoch) return
      activeKey = key
      notify()
    },
    /** Only complete verified event windows may trigger measured-work demands. */
    async observe(elapsedMs: number | null, coverage: Coverage): Promise<LaborDemand | null> {
      if (coverage !== 'complete' || elapsedMs === null
        || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return null
      // The UI observes a SPECIFIC Session's completed work when scheduling
      // this task. A prior Host CAS may delay the queue until a different
      // Session is active. Never use A's elapsed time to mutate B's ledger.
      if(disposed||!activeKey)return null
      return enqueue(async () => {
        try { return await perform(desk => desk.observe(elapsedMs, coverage)) }
        catch { return null } // failure can never interrupt the real Agent
      }).catch(()=>null) // a Session switch cancels obsolete background work
    },
    raiseDemoBreak(expectedKey?:string,expectedToken?:string|null,
      expectedRevision?:number|null) {
      const reviewed=expectedKey===undefined?undefined:{
        key:expectedKey,token:expectedToken??null,revision:expectedRevision}
      return enqueue(() => perform(desk => desk.raiseDemoDemand('break'),reviewed))
    },
    raiseDemoOvertime(expectedKey?:string,expectedToken?:string|null,
      expectedRevision?:number|null) {
      const reviewed=expectedKey===undefined?undefined:{
        key:expectedKey,token:expectedToken??null,revision:expectedRevision}
      return enqueue(() => perform(desk => desk.raiseDemoDemand('overtime'),reviewed))
    },
    raiseDemoWelfare(expectedKey?:string,expectedToken?:string|null,
      expectedRevision?:number|null) {
      const reviewed=expectedKey===undefined?undefined:{
        key:expectedKey,token:expectedToken??null,revision:expectedRevision}
      return enqueue(() => perform(desk => desk.raiseDemoDemand('welfare'),reviewed))
    },
    setGazetteMode(mode:'visible'|'quiet') {
      return enqueue(async()=>{
        if(mode!=='visible'&&mode!=='quiet')throw new TypeError('Invalid Gazette display mode')
        const before=read()
        if(!before)throw new Error('Authorized Host settings unavailable')
        if(before.gazetteMode===mode)return
        const key=before.key
        await scope.set('unionGazetteMode',mode)
        const after=read()
        if(!after||after.key!==key||after.gazetteMode!==mode)
          throw new Error('Host did not confirm Gazette display preference')
        notify()
      })
    },
    committeeAction(action:{kind:'file';topic:DignityCaseKind}
      |{kind:'convene';id:number}|{kind:'retract';id:number}
      |{kind:'close';id:number;outcome:DignityCaseOutcome},
      expectedKey?:string,expectedWriteToken?:string|null,expectedHostRevision?:number|null) {
      return enqueue(async()=>{
        const before=read()
        if(!before)throw new Error('Authenticated, opted-in union committee unavailable')
        if(expectedKey!==undefined&&expectedKey!==before.key)
          throw new Error('Committee Session changed; re-confirm action')
        if(action.kind==='retract'||action.kind==='close'){
          // BOTH deletion and irreversible hearing closure require the
          // exact Host ledger the person reviewed. After another tab
          // retracts/re-files, the new case may reuse the same numeric ID,
          // kind and hearing stage. Those fields alone are not authorization.
          const actualToken=before.caseLedger.writeToken??null
          if(expectedWriteToken===undefined||expectedWriteToken!==actualToken
            ||(actualToken===null
              &&(!Number.isSafeInteger(expectedHostRevision)
                ||before.view.revision!==expectedHostRevision)))
            throw new Error('Committee archive changed; re-confirm '+(
              action.kind==='close'?'case closure':'retraction'))
        }
        const prior=before.caseLedger.sessions[before.key]??{cases:[]}
        const next=advanceDignityCase(prior,action)
        const others=Object.entries(before.caseLedger.sessions).filter(([key])=>key!==before.key)
          .slice(-(MAX_DIGNITY_CASE_SESSIONS-1))
        // Fully remove the current Session entry if the last pending case was
        // retracted; never leave a stale Session tombstone.
        const sessions=Object.fromEntries(
          next.cases.length?[...others,[before.key,next]]:others)
        if(!globalThis.crypto?.getRandomValues)throw new Error('Secure case receipts unavailable')
        const bytes=new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        const writeToken=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
        const serialized=JSON.stringify({schemaVersion:1,sessions,writeToken})
        if(serialized.length>MAX_DIGNITY_CASE_BYTES)throw new Error('Committee case history full')
        if(activeKey!==before.key||!consent())
          throw new Error('Session or consent changed before case filing')
        await scope.set('unionDignityCases',serialized)
        const after=read()
        if(!after||after.key!==before.key||after.caseLedger.writeToken!==writeToken
          ||(next.cases.length
            ?JSON.stringify(after.caseLedger.sessions[before.key])!==JSON.stringify(next)
            :Object.hasOwn(after.caseLedger.sessions,before.key)))
          throw new Error('Host did not confirm the committee case')
        notify()
        return next
      })
    },
    exportCommitteeCases(expectedKey:string){
      const before=read()
      if(!before||before.key!==expectedKey)
        throw new Error('Host Session changed or union consent is unavailable')
      const cases=before.caseLedger.sessions[expectedKey]?.cases??[]
      if(cases.length===0)throw new Error('No committee cases to export')
      // Export *only* allowlisted typed case metadata: NO hashed Session ID,
      // random write token, Host settings, raw dialogue or detected samples.
      return JSON.stringify({
        format:'agent-picket-committee-cases',
        schemaVersion:1,
        cases:cases.map(c=>({id:c.id,kind:c.kind,stage:c.stage,outcome:c.outcome})),
      },null,2)+'\n'
    },
    exportUnionLedger(which:'negotiations'|'pickets',expectedKey:string){
      const before=read()
      if(!before||before.key!==expectedKey)
        throw new Error('Host Session changed or union consent is unavailable')
      if(which!=='negotiations'&&which!=='pickets')
        throw new TypeError('Unknown union ledger export kind')
      const records=which==='negotiations'
        ?Object.entries(before.ledger.sessions)
        :Object.entries(before.picketLedger.sessions)
      if(!records.length)throw new Error('No stored union records to export')
      const groups=which==='negotiations'
        ?Object.entries(before.ledger.sessions).map(([key,state],i)=>({
          group:i+1,current:key===expectedKey,
          // Explicitly enumerate each validated numeric/enumerated state field.
          state:{
            schemaVersion:state.schemaVersion,revision:state.revision,
            agreement:{
              breakIntervalMs:state.agreement.breakIntervalMs,
              overtimeIntervalMs:state.agreement.overtimeIntervalMs,
            },
            nextBreakDueMs:state.nextBreakDueMs,
            nextOvertimeDueMs:state.nextOvertimeDueMs,
            lastTriggerElapsedMs:state.lastTriggerElapsedMs,
            pending:state.pending?{
              id:state.pending.id,kind:state.pending.kind,
              raisedAtElapsedMs:state.pending.raisedAtElapsedMs,
              stage:state.pending.stage,counterOfferMs:state.pending.counterOfferMs,
            }:null,
            history:state.history.map(v=>({
              id:v.id,kind:v.kind,outcome:v.outcome,
            })),
          },
        }))
        :Object.entries(before.picketLedger.sessions).map(([key,state],i)=>({
          group:i+1,current:key===expectedKey,
          state:{active:state.active,
            history:state.history.map(event=>({id:event.id,kind:event.kind}))},
        }))
      return JSON.stringify({
        format:which==='negotiations'
          ?'agent-picket-all-negotiations':'agent-picket-all-symbolic-pickets',
        schemaVersion:1,groups,
      },null,2)+'\n'
    },
    forgetUnionLedger(which:'negotiations'|'pickets',expectedKey:string,
      expectedGroups:number,expectedEntries:number,expectedToken:string|null,
      expectedHostRevision?:number|null){
      return enqueue(async()=>{
        if(which!=='negotiations'&&which!=='pickets')
          throw new TypeError('Unknown union ledger erase kind')
        const before=read()
        if(!before||before.key!==expectedKey)
          throw new Error('Host Session changed or union consent is unavailable')
        const record=which==='negotiations'?before.ledger:before.picketLedger
        const groups=Object.keys(record.sessions).length
        const entries=which==='negotiations'
          ?Object.values(before.ledger.sessions).reduce((n,state)=>
            n+state.history.length+(state.pending?1:0),0)
          :Object.values(before.picketLedger.sessions).reduce((n,state)=>
            n+state.history.length,0)
        if(groups!==expectedGroups||entries!==expectedEntries
          ||(record.writeToken??null)!==expectedToken)
          throw new Error('Union archive changed; re-confirm its erasure')
        if(groups===0)return
        if(expectedToken===null
          &&(!Number.isSafeInteger(expectedHostRevision)
            ||before.view.revision!==expectedHostRevision))
          throw new Error('Legacy Host archive changed; re-confirm its erasure')
        if(!globalThis.crypto?.getRandomValues)
          throw new Error('Secure union deletion receipts unavailable')
        const bytes=new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        const writeToken=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
        const field=which==='negotiations'?'unionLedger':'unionPicketLedger'
        const serialized=JSON.stringify({schemaVersion:1,sessions:{},writeToken})
        if(activeKey!==before.key||!consent())
          throw new Error('Session or consent changed before union archive erasure')
        await scope.set(field,serialized)
        const after=read()
        const result=which==='negotiations'?after?.ledger:after?.picketLedger
        if(!after||after.key!==before.key||result?.writeToken!==writeToken
          ||Object.keys(result.sessions).length!==0)
          throw new Error('Host did not confirm the union archive was erased')
        notify()
      })
    },
    exportAllCommitteeCases(expectedKey:string){
      const before=read()
      if(!before||before.key!==expectedKey)
        throw new Error('Host Session changed or union consent is unavailable')
      const records=Object.entries(before.caseLedger.sessions)
        .filter(([,session])=>session.cases.length>0)
      if(records.length===0)throw new Error('No union cases to export')
      // Unlink downloaded groups from the actual raw and hashed Session IDs.
      // Group numbers are only positions inside THIS export, not persistent IDs.
      return JSON.stringify({
        format:'agent-picket-all-committee-cases',schemaVersion:1,
        sessions:records.map(([key,session],i)=>({
          group:i+1,current:key===before.key,
          cases:session.cases.map(c=>({
            id:c.id,kind:c.kind,stage:c.stage,outcome:c.outcome,
          })),
        })),
      },null,2)+'\n'
    },
    forgetAllCommitteeCases(expectedKey:string, expectedSessions:number,
      expectedCount:number,expectedWriteToken:string|null,
      expectedHostRevision?:number|null){
      return enqueue(async()=>{
        const before=read()
        if(!before||before.key!==expectedKey)
          throw new Error('Host Session changed or union consent is unavailable')
        const count=Object.values(before.caseLedger.sessions)
          .reduce((sum,v)=>sum+v.cases.length,0)
        if(Object.keys(before.caseLedger.sessions).length!==expectedSessions
          ||count!==expectedCount
          ||((before.caseLedger.writeToken??null)!==expectedWriteToken))
          throw new Error('Case archive changed; re-confirm full erasure')
        if(Object.keys(before.caseLedger.sessions).length===0)return
        if(expectedWriteToken===null
          &&(!Number.isSafeInteger(expectedHostRevision)
            ||before.view.revision!==expectedHostRevision))
          throw new Error('Legacy Host case archive changed; re-confirm erasure')
        if(!globalThis.crypto?.getRandomValues)
          throw new Error('Secure deletion receipts unavailable')
        const bytes=new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        const writeToken=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
        // Removing every pseudonymized Session key is intentional. This does
        // NOT erase DSH conversations, other union ledgers or raw files.
        const serialized=JSON.stringify({schemaVersion:1,sessions:{},writeToken})
        if(activeKey!==before.key||!consent())
          throw new Error('Session or consent changed before archive erasure')
        await scope.set('unionDignityCases',serialized)
        const after=read()
        if(!after||after.key!==before.key||after.caseLedger.writeToken!==writeToken
          ||Object.keys(after.caseLedger.sessions).length!==0)
          throw new Error('Host did not confirm entire case archive erasure')
        notify()
      })
    },
    forgetCommitteeCases(expectedKey:string,expectedCount:number,
      expectedWriteToken:string|null,expectedHostRevision?:number|null){
      return enqueue(async()=>{
        const before=read()
        if(!before)throw new Error('Authenticated, opted-in committee records unavailable')
        if(before.key!==expectedKey)throw new Error('Committee Session changed; re-confirm deletion')
        const prior=before.caseLedger.sessions[before.key]
        // The first confirmation applies ONLY to the exact Host archive the
        // user saw. A second tab can file/convene/close a case after the first
        // click; even if the case count is unchanged, its fresh write receipt
        // invalidates the prior authorization to erase.
        if((prior?.cases.length??0)!==expectedCount
          ||(before.caseLedger.writeToken??null)!==expectedWriteToken)
          throw new Error('Committee archive changed; re-confirm deletion')
        if(!prior?.cases.length)return // No-op is allowed only for a matching empty snapshot.
        if(expectedWriteToken===null
          &&(!Number.isSafeInteger(expectedHostRevision)
            ||before.view.revision!==expectedHostRevision))
          throw new Error('Legacy Host case archive changed; re-confirm deletion')
        const sessions=Object.fromEntries(Object.entries(before.caseLedger.sessions)
          .filter(([key])=>key!==before.key))
        if(!globalThis.crypto?.getRandomValues)throw new Error('Secure deletion receipts unavailable')
        const bytes=new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        const writeToken=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')
        const serialized=JSON.stringify({schemaVersion:1,sessions,writeToken})
        if(serialized.length>MAX_DIGNITY_CASE_BYTES)
          throw new Error('Committee record exceeds size limit')
        if(activeKey!==before.key||!consent())
          throw new Error('Session or consent changed before committee record deletion')
        await scope.set('unionDignityCases',serialized)
        const after=read()
        if(!after||after.key!==before.key||after.caseLedger.writeToken!==writeToken
          ||Object.hasOwn(after.caseLedger.sessions,before.key))
          throw new Error('Host did not confirm the committee record was deleted')
        notify()
      })
    },
    setPicket(raise: boolean,expectedKey?:string,expectedToken?:string|null,
      expectedRevision?:number|null) {
      return enqueue(async () => {
        if (typeof raise !== 'boolean') throw new TypeError('Invalid symbolic picket action')
        const before=read()
        if (!before) throw new Error('Authorized, enabled Host union settings unavailable')
        if(expectedKey!==undefined){
          const token=before.picketLedger.writeToken??null
          if(before.key!==expectedKey||token!==(expectedToken??null)
            ||(token===null&&(!Number.isSafeInteger(expectedRevision)
              ||expectedRevision!==before.view.revision)))
            throw new Error('Symbolic union action changed; review current Session')
        }
        const prior=before.picketLedger.sessions[before.key] ??
          {active:false,history:[]} as PicketActionState
        if (prior.active===raise) return prior
        const previousId=prior.history.at(-1)?.id ?? 0
        const id=previousId+1
        if (!Number.isSafeInteger(id)) throw new Error('Picket event counter exhausted')
        const kind=raise?'picket-raised' as const:'picket-lowered' as const
        const next:PicketActionState={
          active:raise,
          history:[...prior.history,{id,kind}].slice(-MAX_PICKET_HISTORY),
        }
        const entries=Object.entries(before.picketLedger.sessions)
          .filter(([key])=>key!==before.key).slice(-(MAX_PICKET_SESSIONS-1))
        const sessions=Object.fromEntries([...entries,[before.key,next]])
        if(!globalThis.crypto?.getRandomValues)throw new Error('Secure picket receipts unavailable')
        const bytes=new Uint8Array(16)
        globalThis.crypto.getRandomValues(bytes)
        const writeToken=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('')
        const serialized=JSON.stringify({schemaVersion:1,sessions,writeToken})
        if(serialized.length>MAX_PICKET_LEDGER_BYTES)throw new Error('Picket ledger capacity exceeded')
        if(activeKey!==before.key||!consent())
          throw new Error('Session or consent changed before symbolic action')
        await scope.set('unionPicketLedger',serialized)
        const after=read()
        if (!after || after.key!==before.key
          ||after.picketLedger.writeToken!==writeToken
          ||JSON.stringify(after.picketLedger.sessions[before.key])!==JSON.stringify(next))
          throw new Error('Host did not confirm symbolic picket action')
        notify()
        return next
      })
    },
    respond(id: number, choice: 'accept' | 'decline',
      expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) {
      const reviewed=expectedKey===undefined?undefined:{
        key:expectedKey,token:expectedToken??null,revision:expectedRevision}
      return enqueue(() => perform(desk => desk.respond(id, choice),reviewed))
    },
    counter(id: number, intervalMs: number,
      expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) {
      const reviewed=expectedKey===undefined?undefined:{
        key:expectedKey,token:expectedToken??null,revision:expectedRevision}
      return enqueue(() => perform(desk => desk.counter(id, intervalMs),reviewed))
    },
    resolveCounter(id: number, accepts: boolean,
      expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) {
      const reviewed=expectedKey===undefined?undefined:{
        key:expectedKey,token:expectedToken??null,revision:expectedRevision}
      return enqueue(() => perform(desk => desk.resolveCounter(id, accepts),reviewed))
    },
    dispose() {
      if (disposed) return
      disposed = true
      sessionEpoch++
      unsubscribe()
      listeners.clear()
      activeKey = null
      boundSessionId = null
    },
  }
}
