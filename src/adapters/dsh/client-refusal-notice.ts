/** Read-only official Session-event + authenticated Host proof intersection.
 * Never trusts a generic `blocked` alone, and never resubmits user input. */
import {REFUSAL_NOTICE_FETCH_PATH,parseRefusalNotice,
  matchRefusalToOfficialTurn,type RefusalEventWindow,
  type RefusalNoticeReceipt} from './refusal-notice-contract.ts'

export interface BrowserRefusalNotice {
  readonly state:'off'|'unverified'|'verified'
  readonly receipt:RefusalNoticeReceipt|null
}
/** Only the latest actually-started turn may describe *the current attempt*.
 * An old blocked turn is not proof that a later successful/in-flight request
 * was refused, even if the older blocked event remains in the Host window. */
export function latestNativeBlockedTurn(window:RefusalEventWindow|undefined):number|null {
  if(!window||window.hasMore)return null
  let latestStarted:number|null=null,latestEnded:number|null=null
  let latestEndBlocked=false,previousSeq=-1
  for(const entry of window.entries){
    if(entry.type!=='event')continue
    const e=entry.event
    if(!e||!Number.isSafeInteger(e.seq)||(e.seq as number)<=previousSeq)
      return null
    previousSeq=e.seq as number
    if(e.type!=='turn/start'&&e.type!=='turn/end')continue
    const data=e.data
    if(!data||typeof data!=='object'||Array.isArray(data))return null
    const {turn,reason}=data as {turn?:unknown;reason?:{kind?:unknown}}
    if(!Number.isSafeInteger(turn)||typeof turn!=='number'||turn<1)return null
    if(e.type==='turn/start'){
      latestStarted=latestStarted===null?turn:Math.max(latestStarted,turn)
    }else if(latestEnded===null||turn>=latestEnded){
      latestEnded=turn
      latestEndBlocked=reason?.kind==='blocked'
    }
  }
  return latestStarted!==null&&latestStarted===latestEnded&&latestEndBlocked
    ?latestEnded:null
}

export function createBrowserRefusalNoticeReader(options:{
  session:()=>string|null
  binding:(sessionId:string)=>unknown
  window:(sessionId:string)=>RefusalEventWindow|undefined
  authorized:()=>boolean
  onNewVerified?:(receipt:RefusalNoticeReceipt)=>void
  digest?:(text:string)=>Promise<string>
  fetcher?:typeof fetch
  /** Official Host and Browser run on the same device; reject stale clocks. */
  now?:()=>number
}){
  const empty=():BrowserRefusalNotice=>({state:'unverified',receipt:null})
  let current=empty(),selected:string|null=null,bound:unknown
  let probedTurn:number|null=null,epoch=0,disposed=false,seeded=false
  let pending:AbortController|null=null
  const listeners=new Set<()=>void>()
  const fresh=(row:RefusalNoticeReceipt)=>{
    const now=(options.now??Date.now)()
    return Number.isSafeInteger(now)&&now>=0
      &&row.occurredAtMs<=now+5_000
      &&now-row.occurredAtMs<=30*60_000
  }
  const notify=()=>{for(const listener of listeners){try{listener()}catch{}}}
  const allowed=()=>{try{return options.authorized()===true}catch{return false}}
  const digest=options.digest??(async(id:string)=>{
    const hash=await globalThis.crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(id))
    return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')
  })
  const reset=(next:'off'|'unverified')=>{
    epoch++
    pending?.abort();pending=null
    current={state:next,receipt:null}
    probedTurn=null
    notify()
  }
  function snapshot():BrowserRefusalNotice {
    if(disposed||!allowed())return {state:'off',receipt:null}
    // Calling snapshot must never claim an old Session proof after navigating.
    if(selected!==options.session()||bound!==options.binding(selected??''))return empty()
    if(current.state==='verified'&&(!current.receipt||!fresh(current.receipt)
      ||latestNativeBlockedTurn(options.window(selected!))!==current.receipt.turn))
      return empty()
    return current
  }
  function refresh():void {
    if(disposed)return
    let session:string|null=null,binding:unknown
    try{session=options.session();binding=session?options.binding(session):null}catch{}
    if(!allowed()||!session||!binding){
      selected=null;bound=null;seeded=false;reset('off');return
    }
    if(session!==selected||binding!==bound){
      selected=session;bound=binding;seeded=false;reset('unverified')
    }
    const observed=options.window(session)
    const turn=latestNativeBlockedTurn(observed)
    if(turn===null){
      seeded=true
      if(probedTurn!==null)reset('unverified')
      return
    }
    if(turn===probedTurn)return
    const shouldToast=seeded
    seeded=true
    probedTurn=turn
    const ticket=++epoch
    pending?.abort()
    const controller=new AbortController()
    pending=controller
    const observedId=session,observedBinding=binding
    // Never turn an old proof into a verified event while the next Host query
    // is pending. The prior proof may be shown only for its matching turn.
    current=empty();notify()
    void (async()=>{
      try{
        const key=await digest(observedId)
        if(!/^[a-f0-9]{64}$/.test(key))return
        if(ticket!==epoch||disposed||!allowed()
          ||options.session()!==observedId
          ||options.binding(observedId)!==observedBinding)return
        const response=await (options.fetcher??globalThis.fetch)(
          REFUSAL_NOTICE_FETCH_PATH+'?sessionKey='+key,
          {method:'GET',credentials:'same-origin',headers:{accept:'application/json'},
            signal:controller.signal})
        if(!response.ok)return
        const receipt=parseRefusalNotice(await response.json())
        if(!receipt||receipt.turn!==turn||!fresh(receipt)
          ||ticket!==epoch||disposed||!allowed()
          ||options.session()!==observedId
          ||options.binding(observedId)!==observedBinding
          ||latestNativeBlockedTurn(options.window(observedId))!==receipt.turn
          ||!matchRefusalToOfficialTurn(options.window(observedId),receipt))return
        current={state:'verified',receipt};notify()
        if(shouldToast){try{options.onNewVerified?.(receipt)}catch{}}
      }catch{/* Unavailable Host report is NOT proof of a union refusal. */}
      finally{if(pending===controller)pending=null}
    })()
  }
  return {snapshot,refresh,
    subscribe(listener:()=>void){if(disposed)return()=>{};listeners.add(listener)
      return()=>{listeners.delete(listener)}},
    dispose(){disposed=true;selected=null;bound=null;seeded=false;reset('off');listeners.clear()},
  }
}
