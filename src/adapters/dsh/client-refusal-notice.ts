/** Read-only official Session-event + authenticated Host proof intersection.
 * Never trusts a generic `blocked` alone, and never resubmits user input. */
import {REFUSAL_NOTICE_FETCH_PATH,parseRefusalNotice,
  matchRefusalToOfficialTurn,type RefusalEventWindow,
  type RefusalNoticeReceipt} from './refusal-notice-contract.ts'

export interface BrowserRefusalNotice {
  readonly state:'off'|'unverified'|'verified'
  readonly receipt:RefusalNoticeReceipt|null
}
export function latestNativeBlockedTurn(window:RefusalEventWindow|undefined):number|null {
  if(!window||window.hasMore)return null
  let latest:number|null=null
  for(const entry of window.entries){
    if(entry.type!=='event'||entry.event?.type!=='turn/end')continue
    const value=entry.event.data
    if(!value||typeof value!=='object'||Array.isArray(value))continue
    const {turn,reason}=value as {turn?:unknown;reason?:{kind?:unknown}}
    if(reason?.kind==='blocked'&&Number.isSafeInteger(turn)
      &&typeof turn==='number'&&turn>0&&(!latest||turn>latest))latest=turn
  }
  return latest
}
export function createBrowserRefusalNoticeReader(options:{
  session:()=>string|null
  binding:(sessionId:string)=>unknown
  window:(sessionId:string)=>RefusalEventWindow|undefined
  authorized:()=>boolean
  onNewVerified?:(receipt:RefusalNoticeReceipt)=>void
  digest?:(text:string)=>Promise<string>
  fetcher?:typeof fetch
}){
  const empty=():BrowserRefusalNotice=>({state:'unverified',receipt:null})
  let current=empty(),selected:string|null=null,bound:unknown
  let probedTurn:number|null=null,epoch=0,disposed=false,seeded=false
  const listeners=new Set<()=>void>()
  const notify=()=>{for(const listener of listeners){try{listener()}catch{}}}
  const allowed=()=>{try{return options.authorized()===true}catch{return false}}
  const digest=options.digest??(async(id:string)=>{
    const hash=await globalThis.crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(id))
    return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')
  })
  const reset=(next:'off'|'unverified')=>{
    epoch++
    current={state:next,receipt:null}
    probedTurn=null
    notify()
  }
  function snapshot():BrowserRefusalNotice {
    if(disposed||!allowed())return {state:'off',receipt:null}
    // Calling snapshot must never claim an old Session proof after navigating.
    if(selected!==options.session()||bound!==options.binding(selected??''))return empty()
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
    if(turn===null){seeded=true;return}
    if(turn===probedTurn)return
    const shouldToast=seeded
    seeded=true
    probedTurn=turn
    const ticket=++epoch
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
          {method:'GET',credentials:'same-origin',headers:{accept:'application/json'}})
        if(!response.ok)return
        const receipt=parseRefusalNotice(await response.json())
        if(!receipt||receipt.turn!==turn||ticket!==epoch||disposed||!allowed()
          ||options.session()!==observedId
          ||options.binding(observedId)!==observedBinding
          ||!matchRefusalToOfficialTurn(options.window(observedId),receipt))return
        current={state:'verified',receipt};notify()
        if(shouldToast){try{options.onNewVerified?.(receipt)}catch{}}
      }catch{/* Unavailable Host report is NOT proof of a union refusal. */}
    })()
  }
  return {snapshot,refresh,
    subscribe(listener:()=>void){if(disposed)return()=>{};listeners.add(listener)
      return()=>{listeners.delete(listener)}},
    dispose(){disposed=true;selected=null;bound=null;seeded=false;reset('off');listeners.clear()},
  }
}
