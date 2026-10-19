/** Host-only, bounded, ephemeral attribution for a real Picket refusal.
 * This is evidence for a later Client notice, NOT permission to reject a
 * request. Production never writes it until the separate #80 Host execution
 * and genuine user-visible notice gates have passed. */
import {createHash} from 'node:crypto'
import {REFUSAL_NOTICE_FETCH_PATH,parseRefusalNotice,
  type RefusalNoticeReceipt} from './refusal-notice-contract.ts'
import type {LifetimeHostContext} from './lifetime-work-rpc.ts'

const key=(sessionId:string)=>createHash('sha256').update(sessionId,'utf8').digest('hex')
const keyValid=(value:unknown):value is string=>
  typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
export function createVolatileRefusalNotices(now:()=>number=Date.now){
  const records=new Map<string,RefusalNoticeReceipt>()
  const maxAgeMs=30*60_000
  const record=(sessionId:string,turn:number):boolean=>{
    if(typeof sessionId!=='string'||!sessionId||sessionId.length>512
      ||!Number.isSafeInteger(turn)||turn<1)return false
    const time=now()
    if(!Number.isSafeInteger(time)||time<0)return false
    const fingerprint=key(sessionId)
    // Do not replace a visible, unresolved receipt with an older turn.
    const prior=records.get(fingerprint)
    if(prior&&prior.turn>=turn)return false
    if(records.size>=24&&!records.has(fingerprint))
      records.delete(records.keys().next().value!)
    records.set(fingerprint,{schemaVersion:1,source:'dsh-host-picket-refusal-v1',
      turn,occurredAtMs:time,outcome:'discard-manual-resend',
      containsInput:false,automaticReplay:false})
    return true
  }
  const read=(sessionKey:string):RefusalNoticeReceipt|null=>{
    if(!keyValid(sessionKey))return null
    const notice=records.get(sessionKey)
    if(!notice)return null
    const time=now()
    if(!Number.isSafeInteger(time)||time<notice.occurredAtMs
      ||time-notice.occurredAtMs>maxAgeMs){records.delete(sessionKey);return null}
    return {...notice}
  }
  return {record,read,clear:()=>records.clear()}
}

/** An authenticated official Connection GET, not a new listener/socket.
 * Query uses a browser-side SHA-256 Session fingerprint, never raw IDs.
 * The response is reconstructed from an explicit field allowlist. */
export function registerDshRefusalNoticeFetch(ctx:LifetimeHostContext,options:{
  authorized:()=>boolean
  read:(sessionKey:string)=>unknown
}):void{
  if(typeof ctx.inject!=='function'||typeof ctx.effect!=='function')return
  let stop:(()=>Promise<void>)|undefined,disposed=false
  ctx.effect(()=>()=>{disposed=true;const fn=stop;stop=undefined;if(fn)void fn()})
  ctx.inject(['connection'],child=>{
    if(disposed||stop||typeof child.connection?.fetch?.register!=='function')return
    let active=true
    try{
      const registered=child.connection.fetch.register({
        path:REFUSAL_NOTICE_FETCH_PATH,methods:['GET'],requestBody:'buffered',
        async fetch(request:Request):Promise<Response>{
          const fail=(status:number)=>Response.json({error:'unavailable'},
            {status,headers:{'cache-control':'no-store'}})
          if(disposed||!active||request.signal.aborted)return fail(503)
          try{
            const url=new URL(request.url)
            const fingerprint=url.searchParams.get('sessionKey')
            if(url.searchParams.size!==1||!keyValid(fingerprint))return fail(400)
            if(options.authorized()!==true)return fail(403)
            const notice=parseRefusalNotice(options.read(fingerprint))
            if(!notice)return fail(404)
            if(disposed||!active||request.signal.aborted||options.authorized()!==true)
              return fail(503)
            return Response.json({
              schemaVersion:1,source:'dsh-host-picket-refusal-v1',turn:notice.turn,
              occurredAtMs:notice.occurredAtMs,outcome:'discard-manual-resend',
              containsInput:false,automaticReplay:false,
            },{headers:{'cache-control':'no-store'}})
          }catch{return fail(503)}
        },
      })
      stop=registered
      child.effect?.(()=>()=>{
        active=false
        if(stop===registered)stop=undefined
        void registered()
      })
    }catch{/* Unsupported official Host: never affect model work. */}
  })
}
