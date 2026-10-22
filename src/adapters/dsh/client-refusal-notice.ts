/** Read-only official Session-event + authenticated Host proof intersection.
 * Never trusts a generic `blocked` alone, and never resubmits user input. */
import {withRefusalNoticeDeadline} from './refusal-notice-deadline.ts'
import {REFUSAL_NOTICE_FETCH_PATH,parseRefusalNotice,
  matchRefusalToOfficialTurn,type RefusalEventWindow,
  type RefusalNoticeReceipt} from './refusal-notice-contract.ts'

/** Protocol is an admission PREREQUISITE, never a trusted Host receipt.
 * Genuine DSH Desktop dsh-app://app/ forwards authenticated /api requests
 * to its owned Host; dsh-app://shell/ and other pages do not qualify.
 * The exact versioned Host GET must separately prove a visible resend route,
 * and only a real Session event + matching Host receipt can show a refusal.
 * This remains Session-scoped: it does NOT identify a foreign submitting client. */
export function supportsVerifiedRefusalNoticeTransport(location:unknown):boolean {
  if(!location||typeof location!=='object')return false
  const view=location as {protocol?:unknown;hostname?:unknown}
  if(view.protocol==='http:'||view.protocol==='https:')return true
  return view.protocol==='dsh-app:'&&view.hostname==='app'
}

/** Prove the actual official Host GET handler is installed before an opt-in
 * ordinary-input campaign can be armed. Never sends an actual Session ID. */
export async function probeDshRefusalNoticeCapability(
  fetcher:typeof fetch=globalThis.fetch,
  timeoutMs=2_200,
):Promise<boolean>{
  try{
    return await withRefusalNoticeDeadline(async signal=>{
      const response=await fetcher(REFUSAL_NOTICE_FETCH_PATH
        +'?capability=input-discard-resend-v1',{
          method:'GET',credentials:'same-origin',headers:{accept:'application/json'},
          signal,
        })
      if(response.status!==200)return false
      const data=await response.json()
      if(data===null||typeof data!=='object'||Array.isArray(data))return false
      const witness=data as Record<string,unknown>
      return Object.keys(witness).sort().join('|')
          ==='manualResend|schemaVersion|source|visibleReceipt'
        &&witness.schemaVersion===1&&witness.source==='dsh-host-picket-refusal-v1'
        &&witness.visibleReceipt===true&&witness.manualResend===true
    },{timeoutMs})
  }catch{return false}
}

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
  /** Bounded Host GET + response body; no receipt on timeout. */
  requestTimeoutMs?:number
  /** Owns a short cancellable retry; injection makes native race tests
   * deterministic and never requires a private Host timer or hidden worker. */
  scheduleRetry?:(fn:()=>void,delayMs:number)=>()=>void
  /** Official Host and Browser run on the same device; reject stale clocks. */
  now?:()=>number
}){
  const empty=():BrowserRefusalNotice=>({state:'unverified',receipt:null})
  let current=empty(),selected:string|null=null,bound:unknown
  let probedTurn:number|null=null,epoch=0,disposed=false,seeded=false
  let trackedTurn:number|null=null,attempts=0,toastEligible=false
  let stopRetry:(()=>void)|null=null
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
  const cancelRetry=()=>{stopRetry?.();stopRetry=null}
  const schedule=options.scheduleRetry??((fn:()=>void,ms:number)=>{
    const handle=setTimeout(fn,ms)
    return ()=>clearTimeout(handle)
  })
  const reset=(next:'off'|'unverified')=>{
    epoch++
    cancelRetry()
    pending?.abort();pending=null
    current={state:next,receipt:null}
    probedTurn=null;trackedTurn=null;attempts=0;toastEligible=false
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
      if(trackedTurn!==null)reset('unverified')
      // A completed/new ordinary turn clears the old refusal, but it
      // doesn't make this an unobserved initial page load: the next refused
      // turn while still here IS eligible for one genuine new notice.
      seeded=true
      return
    }
    if(turn!==trackedTurn){
      cancelRetry()
      trackedTurn=turn
      attempts=0
      toastEligible=seeded
    }
    seeded=true
    if(turn===probedTurn||stopRetry||attempts>=3)return
    attempts++
    probedTurn=turn
    const shouldToast=toastEligible
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
        const receipt=await withRefusalNoticeDeadline(async signal=>{
          const response=await (options.fetcher??globalThis.fetch)(
            REFUSAL_NOTICE_FETCH_PATH+'?sessionKey='+key,
            {method:'GET',credentials:'same-origin',headers:{accept:'application/json'},
              signal})
          return response.ok?parseRefusalNotice(await response.json()):null
        },{signal:controller.signal,timeoutMs:options.requestTimeoutMs})
        if(!receipt||receipt.turn!==turn||!fresh(receipt)
          ||ticket!==epoch||disposed||!allowed()
          ||options.session()!==observedId
          ||options.binding(observedId)!==observedBinding
          ||latestNativeBlockedTurn(options.window(observedId))!==receipt.turn
          ||!matchRefusalToOfficialTurn(options.window(observedId),receipt))return
        current={state:'verified',receipt};notify()
        if(shouldToast){try{options.onNewVerified?.(receipt)}catch{}}
      }catch{/* Unavailable Host report is NOT proof of a union refusal. */}
      finally{
        if(pending===controller)pending=null
        // The Host may commit its metadata receipt AFTER the official
        // blocked-turn event arrives in the Browser. A single 404 must not
        // make a real refusal permanently invisible; retry at most twice.
        // No independent notice is ever believed without matching Host
        // metadata AND the complete blocked/no-model turn at retry time.
        if(ticket===epoch&&!disposed&&current.state!=='verified'
          &&attempts<3&&trackedTurn===turn&&!stopRetry&&allowed()
          &&options.session()===observedId
          &&options.binding(observedId)===observedBinding
          &&latestNativeBlockedTurn(options.window(observedId))===turn){
          // A cancelled callback may already be queued in the Browser.
          // It must NEVER clear a newer Session's retry timer.
          try{
            const ownCancel=schedule(()=>{
              if(stopRetry!==ownCancel)return
              stopRetry=null
              if(ticket!==epoch||disposed||!allowed())return
              probedTurn=null
              refresh()
            },Math.min(350*attempts,1_000))
            stopRetry=ownCancel
          }catch{/* Unavailable Browser timer cannot turn a denied proof into a strike. */}
        }
      }
    })()
  }
  return {snapshot,refresh,
    subscribe(listener:()=>void){if(disposed)return()=>{};listeners.add(listener)
      return()=>{listeners.delete(listener)}},
    dispose(){disposed=true;selected=null;bound=null;seeded=false;reset('off');listeners.clear()},
  }
}
